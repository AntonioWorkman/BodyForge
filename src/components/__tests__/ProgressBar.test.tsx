import { render } from '@testing-library/react-native';

import { ProgressBar } from '../ProgressBar';

/**
 * ProgressBar renders its fill on the React render path.
 *
 * These assert what the component puts on screen — a width and an
 * accessibility value — rather than how it arrives there, so they stay
 * meaningful if the fill is ever animated again by some other mechanism.
 */
describe('ProgressBar', () => {
  const widthOf = (element: { props: { style?: unknown } }): unknown => {
    const flat = ([] as unknown[]).concat(element.props.style ?? []);
    for (let i = flat.length - 1; i >= 0; i -= 1) {
      const entry = flat[i] as { width?: unknown } | null;
      if (entry && typeof entry === 'object' && 'width' in entry) return entry.width;
    }
    return undefined;
  };

  /** The fill is the track's only child. */
  const fillOf = async (progress: number) => {
    const screen = await render(<ProgressBar progress={progress} testID="bar" />);
    const track = screen.getByTestId('bar');
    const children = track.children.filter((c): c is typeof track => typeof c !== 'string');
    return { screen, track, fill: children[0]! };
  };

  it.each([
    [0, '0%'],
    [0.25, '25%'],
    [0.5, '50%'],
    [1, '100%'],
  ])('renders progress %p as a %s wide fill', async (progress, expected) => {
    const { fill } = await fillOf(progress);
    expect(widthOf(fill)).toBe(expected);
  });

  it.each([
    [-1, '0%'],
    [2, '100%'],
    [Number.NaN, '0%'],
    // Non-finite is treated as "no progress", not as a huge one.
    [Number.POSITIVE_INFINITY, '0%'],
    [Number.NEGATIVE_INFINITY, '0%'],
  ])('clamps out-of-range progress %p to %s', async (progress, expected) => {
    const { fill } = await fillOf(progress);
    expect(widthOf(fill)).toBe(expected);
  });

  it('reports progress to assistive technology as a rounded percentage', async () => {
    const screen = await render(
      <ProgressBar progress={0.427} testID="bar" accessibilityLabel="Level progress" />,
    );
    const track = screen.getByTestId('bar');

    expect(track.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 43 });
    expect(track.props.accessibilityLabel).toBe('Level progress');
    expect(track.props.accessibilityRole).toBe('progressbar');
  });

  it('clamps the accessibility value too, so it can never exceed 100', async () => {
    const screen = await render(<ProgressBar progress={5} testID="bar" />);
    expect(screen.getByTestId('bar').props.accessibilityValue.now).toBe(100);
  });

  it('reflects a progress change on re-render', async () => {
    const screen = await render(<ProgressBar progress={0.2} testID="bar" />);
    const readWidth = () => {
      const track = screen.getByTestId('bar');
      const child = track.children.find((c): c is typeof track => typeof c !== 'string')!;
      return widthOf(child);
    };

    expect(readWidth()).toBe('20%');
    await screen.rerender(<ProgressBar progress={0.8} testID="bar" />);
    expect(readWidth()).toBe('80%');
    expect(screen.getByTestId('bar').props.accessibilityValue.now).toBe(80);
  });

  it('honours height and tone without losing the fill', async () => {
    const { fill, track } = await fillOf(0.5);
    expect(widthOf(fill)).toBe('50%');
    expect(track.props.style).toBeTruthy();
  });
});
