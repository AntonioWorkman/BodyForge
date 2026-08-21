import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SkillsScreen } from '../SkillsScreen';
import { renderOverServices, renderWithServices } from '@/testing/renderWithServices';
import type { RenderedWithServices } from '@/testing/renderWithServices';
import type { AppServices } from '@/services';
import { Text } from '@/components';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(callback, [callback]);
  },
}));

/** Completes a session with every set at the top of its prescribed range. */
async function qualifyingSession(services: AppServices) {
  const plan = await services.workouts.getNextPlan();
  const session = await services.workouts.startSession(plan!);

  for (const performance of session.performances) {
    const perSide = performance.measurementKind === 'reps-per-side';
    const top = performance.prescribed.targetMax;
    for (let n = 1; n <= performance.prescribed.sets; n += 1) {
      await services.workouts.recordSet(performance.id, n, top, perSide ? top : null);
    }
  }
  await services.workouts.completeSession(session.id);
}

describe('Skills screen', () => {
  let harness: RenderedWithServices;
  let rendered: Awaited<ReturnType<typeof renderOverServices>> | null = null;
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    harness = await renderWithServices(() => <Text>ready</Text>);
  });

  afterEach(async () => {
    if (rendered) await rendered.unmount();
    rendered = null;
    await harness.result.unmount();
    harness.cleanup();
    alertSpy.mockRestore();
  });

  async function open() {
    rendered = await renderOverServices(harness, <SkillsScreen />);
    await waitFor(() => expect(screen.getByTestId('skills-screen')).toBeTruthy());
  }

  it('shows the entry variation of each chain as current and the rest locked', async () => {
    await open();

    await waitFor(() => expect(screen.getByTestId('skill-node-var-push-up-regular')).toBeTruthy());
    expect(screen.getByLabelText('Regular Push-Up, Current')).toBeTruthy();
    expect(screen.getByLabelText('Slow Push-Up, Locked')).toBeTruthy();
  });

  it('does not offer progression from ordinary training', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('skill-node-var-push-up-regular')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Regular Push-Up, Current'));
    await waitFor(() => expect(screen.getByTestId('skill-node-sheet')).toBeTruthy());

    expect(
      screen.getByText(
        '0 of 2 qualifying sessions — every prescribed set at the top of the range.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('confirm-progression')).toBeNull();
  });

  it('marks a variation ready once the criteria are met', async () => {
    // Push-ups appear in Workout A only, so three sessions give two qualifying.
    await qualifyingSession(harness.services);
    await qualifyingSession(harness.services);
    await qualifyingSession(harness.services);

    await open();
    await waitFor(() =>
      expect(screen.getByLabelText('Regular Push-Up, Ready to progress')).toBeTruthy(),
    );
  });

  it('shows the technique standard and requires confirmation before unlocking', async () => {
    await qualifyingSession(harness.services);
    await qualifyingSession(harness.services);
    await qualifyingSession(harness.services);

    await open();
    await waitFor(() =>
      expect(screen.getByLabelText('Regular Push-Up, Ready to progress')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByLabelText('Regular Push-Up, Ready to progress'));
    await waitFor(() => expect(screen.getByTestId('skill-node-sheet')).toBeTruthy());

    expect(screen.getByText('Technique standard')).toBeTruthy();
    expect(screen.getByText('Full range: chest within a fist of the floor')).toBeTruthy();
    expect(screen.getByTestId('confirm-progression')).toBeTruthy();

    // Nothing has changed yet — the button only opens a confirmation.
    expect((await harness.services.progression.getOffer('var-push-up-regular'))?.to.name).toBe(
      'Slow Push-Up',
    );
    const state = await harness.services.progression.getChains();
    const push = state.find((chain) => chain.chain.id === 'chain-push-up')!;
    expect(push.nodes[1]?.status).toBe('locked');
  });

  it('asks for explicit confirmation rather than unlocking on tap', async () => {
    await qualifyingSession(harness.services);
    await qualifyingSession(harness.services);
    await qualifyingSession(harness.services);

    await open();
    await waitFor(() =>
      expect(screen.getByLabelText('Regular Push-Up, Ready to progress')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByLabelText('Regular Push-Up, Ready to progress'));
    await waitFor(() => expect(screen.getByTestId('confirm-progression')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('confirm-progression'));

    expect(alertSpy).toHaveBeenCalled();
    const [title] = alertSpy.mock.calls[0] as [string];
    expect(title).toBe('Confirm progression');
  });

  it('states that a locked variation cannot be trained yet', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('skill-node-var-push-up-slow')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Slow Push-Up, Locked'));
    await waitFor(() => expect(screen.getByTestId('skill-node-sheet')).toBeTruthy());

    expect(screen.getByText('Locked — master the variation before this one')).toBeTruthy();
    expect(screen.queryByTestId('confirm-progression')).toBeNull();
  });

  it('filters the tree by phase', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('skill-node-var-push-up-regular')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Filter: Ascension'));
    await waitFor(() => expect(screen.queryByTestId('skill-node-var-push-up-regular')).toBeNull());
    expect(screen.getByTestId('skill-node-var-push-up-archer')).toBeTruthy();
  });
});
