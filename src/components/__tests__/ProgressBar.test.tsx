import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';

import { ProgressBar, clampProgress } from '../ProgressBar';
import { timing } from '@/motion';

/**
 * The progress bar animates its fill natively.
 *
 * Two things are worth guarding and neither is observable the same way:
 *
 * - The *value* it reports. Clamping and `accessibilityValue` are plain render
 *   output and are asserted directly.
 * - The *animation* it starts. `useNativeDriver` hands the animation to the
 *   platform, so in Jest the JS-side value never advances — the end state
 *   cannot be read back off the rendered style. What can be checked, and what
 *   actually matters, is the animation this component asks for: the right
 *   target, the right duration, and natively driven so no JavaScript runs on
 *   the display-link frames where the iOS crash aborted.
 */
describe('ProgressBar', () => {
  const styleOf = (element: { props: { style?: unknown } }): Record<string, any> => {
    const flat = ([] as any[]).concat(element.props.style ?? []);
    return Object.assign({}, ...flat.filter(Boolean));
  };

  const scaleOf = (element: { props: { style?: unknown } }) =>
    styleOf(element).transform?.[0]?.scaleX;

  describe('clampProgress', () => {
    it.each([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [-1, 0],
      [2, 1],
      [-0.0001, 0],
      [1.0001, 1],
    ])('clamps %p to %p', (input, expected) => {
      expect(clampProgress(input)).toBe(expected);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      'treats the non-finite value %p as no progress',
      (input) => {
        expect(clampProgress(input)).toBe(0);
      },
    );
  });

  describe('reported value', () => {
    it('reports progress to assistive technology as a rounded percentage', async () => {
      const screen = await render(
        <ProgressBar progress={0.427} testID="bar" accessibilityLabel="Level progress" />,
      );
      const track = screen.getByTestId('bar');

      expect(track.props.accessibilityRole).toBe('progressbar');
      expect(track.props.accessibilityLabel).toBe('Level progress');
      expect(track.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 43 });
    });

    it.each([
      [-1, 0],
      [2, 100],
      [Number.NaN, 0],
    ])('clamps the reported value for out-of-range progress %p', async (progress, now) => {
      const screen = await render(<ProgressBar progress={progress} testID="bar" />);
      expect(screen.getByTestId('bar').props.accessibilityValue.now).toBe(now);
    });

    it('stays truthful even though the animation is native', async () => {
      // The animated value is a presentation detail the platform owns. What the
      // component *reports* is derived from the prop every render, so it is
      // right even if an animation is interrupted or never runs at all.
      const screen = await render(<ProgressBar progress={0.2} testID="bar" />);
      await screen.rerender(<ProgressBar progress={0.75} testID="bar" />);

      expect(screen.getByTestId('bar').props.accessibilityValue.now).toBe(75);
    });
  });

  describe('fill geometry', () => {
    it('mounts already at its value rather than sweeping up from zero', async () => {
      const screen = await render(<ProgressBar progress={0.6} testID="bar" />);
      expect(scaleOf(screen.getByTestId('bar-fill'))).toBe(0.6);
    });

    it.each([0, 0.25, 1])('mounts at %p exactly', async (progress) => {
      const screen = await render(<ProgressBar progress={progress} testID="bar" />);
      expect(scaleOf(screen.getByTestId('bar-fill'))).toBe(progress);
    });

    it('mounts a clamped value, never one out of range', async () => {
      const screen = await render(<ProgressBar progress={4} testID="bar" />);
      expect(scaleOf(screen.getByTestId('bar-fill'))).toBe(1);
    });

    /**
     * The fill grows left to right, not outward from the middle.
     *
     * `scaleX` scales about an element's centre, so a fill laid out to exactly
     * cover the track would expand from the centre — a visibly wrong progress
     * bar. Double width offset by one full width puts the centre on the track's
     * left edge instead. This asserts that geometry because losing it is silent:
     * the bar still animates, it just grows the wrong way.
     */
    it('anchors the fill so it grows from the left edge', async () => {
      const screen = await render(<ProgressBar progress={0.5} testID="bar" />);
      const fill = styleOf(screen.getByTestId('bar-fill'));

      expect(fill.position).toBe('absolute');
      expect(fill.left).toBe('-100%');
      expect(fill.width).toBe('200%');
    });

    it('clips the overflowing half inside the track', async () => {
      const screen = await render(<ProgressBar progress={0.5} testID="bar" />);
      expect(styleOf(screen.getByTestId('bar')).overflow).toBe('hidden');
    });
  });

  describe('the animation it starts', () => {
    let spy: jest.SpyInstance;

    beforeEach(() => {
      spy = jest.spyOn(Animated, 'timing');
    });
    afterEach(() => spy.mockRestore());

    const lastConfig = () => spy.mock.calls[spy.mock.calls.length - 1]?.[1] as any;

    it('does not animate on mount', async () => {
      await render(<ProgressBar progress={0.3} testID="bar" />);
      expect(spy).not.toHaveBeenCalled();
    });

    it('animates to the new value when progress changes', async () => {
      const screen = await render(<ProgressBar progress={0.2} testID="bar" />);
      await screen.rerender(<ProgressBar progress={0.85} testID="bar" />);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(lastConfig().toValue).toBe(0.85);
    });

    it('animates to a clamped target', async () => {
      const screen = await render(<ProgressBar progress={0.2} testID="bar" />);
      await screen.rerender(<ProgressBar progress={9} testID="bar" />);

      expect(lastConfig().toValue).toBe(1);
    });

    it('drives the animation natively, so no JS runs per frame', async () => {
      const screen = await render(<ProgressBar progress={0.2} testID="bar" />);
      await screen.rerender(<ProgressBar progress={0.6} testID="bar" />);

      expect(lastConfig().useNativeDriver).toBe(true);
    });

    it('uses a restrained transition-length duration', async () => {
      const screen = await render(<ProgressBar progress={0.2} testID="bar" />);
      await screen.rerender(<ProgressBar progress={0.6} testID="bar" />);

      expect(lastConfig().duration).toBe(timing.transition);
      expect(lastConfig().duration).toBeGreaterThanOrEqual(300);
      expect(lastConfig().duration).toBeLessThanOrEqual(450);
    });

    it('does not restart the animation when progress is unchanged', async () => {
      const screen = await render(<ProgressBar progress={0.4} testID="bar" />);
      await screen.rerender(<ProgressBar progress={0.4} testID="bar" />);
      await screen.rerender(<ProgressBar progress={0.4} testID="bar" />);

      expect(spy).not.toHaveBeenCalled();
    });

    it('animates again on each further change', async () => {
      const screen = await render(<ProgressBar progress={0.1} testID="bar" />);
      await screen.rerender(<ProgressBar progress={0.4} testID="bar" />);
      await screen.rerender(<ProgressBar progress={0.9} testID="bar" />);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(lastConfig().toValue).toBe(0.9);
    });
  });
});
