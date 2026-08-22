import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';

import { TabBar } from '../TabBar';
import { fire as fireHaptic } from '@/motion/haptics';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const inSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>
);

jest.mock('@/motion/haptics', () => ({
  ...jest.requireActual('@/motion/haptics'),
  fire: jest.fn(),
}));

/**
 * The tab bar drives navigation for the whole post-onboarding shell, so these
 * cover what it does rather than how it is styled: which tab reports itself
 * selected, whether pressing navigates, and whether pressing the tab you are
 * already on stays put.
 */
describe('TabBar', () => {
  const ROUTES = ['index', 'status', 'skills', 'history', 'settings'] as const;
  const LABELS: Record<string, string> = {
    index: 'System',
    status: 'Status',
    skills: 'Skills',
    history: 'History',
    settings: 'Settings',
  };

  function makeProps(activeIndex: number) {
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const navigate = jest.fn();

    const routes = ROUTES.map((name, i) => ({ key: `${name}-${i}`, name }));
    const descriptors = Object.fromEntries(
      routes.map((route) => [route.key, { options: { title: LABELS[route.name] } }]),
    );

    const props = {
      state: { index: activeIndex, routes },
      descriptors,
      navigation: { emit, navigate },
    } as unknown as BottomTabBarProps;

    return { props, emit, navigate };
  }

  beforeEach(() => jest.clearAllMocks());

  it('renders every tab with its label', async () => {
    const { props } = makeProps(0);
    const screen = await render(inSafeArea(<TabBar {...props} />));

    for (const name of ROUTES) {
      expect(screen.getByLabelText(LABELS[name]!)).toBeTruthy();
    }
  });

  it.each([0, 1, 2, 3, 4])('marks only tab %i as selected when it is active', async (active) => {
    const { props } = makeProps(active);
    const screen = await render(inSafeArea(<TabBar {...props} />));

    ROUTES.forEach((name, index) => {
      const tab = screen.getByLabelText(LABELS[name]!);
      expect(tab.props.accessibilityState.selected).toBe(index === active);
    });
  });

  it('shows exactly one active marker, on the focused tab', async () => {
    const { props } = makeProps(2);
    const screen = await render(inSafeArea(<TabBar {...props} />));

    // The marker is the focused tab's extra child; unfocused tabs render
    // glyph + label only.
    const childCounts = ROUTES.map(
      (name) =>
        screen.getByLabelText(LABELS[name]!).children.filter((c) => typeof c !== 'string').length,
    );

    const focusedCount = childCounts[2]!;
    childCounts.forEach((count, index) => {
      if (index === 2) return;
      expect(count).toBeLessThan(focusedCount);
    });
  });

  it('navigates when a different tab is pressed, and fires a haptic', async () => {
    const { props, navigate } = makeProps(0);
    const screen = await render(inSafeArea(<TabBar {...props} />));

    await fireEvent.press(screen.getByLabelText('Skills'));

    expect(navigate).toHaveBeenCalledWith('skills');
    expect(fireHaptic).toHaveBeenCalledWith('selection');
  });

  it('does not navigate or fire a haptic when the active tab is pressed', async () => {
    const { props, navigate } = makeProps(1);
    const screen = await render(inSafeArea(<TabBar {...props} />));

    await fireEvent.press(screen.getByLabelText('Status'));

    expect(navigate).not.toHaveBeenCalled();
    expect(fireHaptic).not.toHaveBeenCalled();
  });

  it('emits a preventable tabPress before navigating', async () => {
    const { props, emit } = makeProps(0);
    const screen = await render(inSafeArea(<TabBar {...props} />));

    await fireEvent.press(screen.getByLabelText('History'));

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', canPreventDefault: true }),
    );
  });

  it('respects a prevented tabPress', async () => {
    const { props, navigate } = makeProps(0);
    (props.navigation.emit as unknown as jest.Mock).mockReturnValue({ defaultPrevented: true });

    const screen = await render(inSafeArea(<TabBar {...props} />));
    await fireEvent.press(screen.getByLabelText('Settings'));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('moves the marker when the active tab changes', async () => {
    const first = makeProps(0);
    const screen = await render(inSafeArea(<TabBar {...first.props} />));
    expect(screen.getByLabelText('System').props.accessibilityState.selected).toBe(true);

    const second = makeProps(3);
    await screen.rerender(inSafeArea(<TabBar {...second.props} />));

    expect(screen.getByLabelText('System').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText('History').props.accessibilityState.selected).toBe(true);
  });
});
