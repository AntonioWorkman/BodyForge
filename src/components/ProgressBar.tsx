import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius } from '@/design';
import { timing } from '@/motion';
import { reduceDuration, useReducedMotion } from '@/motion/useMotionPreference';

interface ProgressBarProps {
  /** 0–1. Values outside the range are clamped. */
  progress: number;
  /** Track thickness. The default is deliberately thin. */
  height?: number;
  tone?: 'accent' | 'highlight' | 'muted';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/** 0–1, with anything non-finite treated as no progress rather than as a lot. */
export function clampProgress(progress: number): number {
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
}

/**
 * A hairline progress track whose fill eases from its old value to its new one.
 *
 * The animation is React Native's own `Animated`, driven natively, and it moves
 * `scaleX` rather than a percentage width. Both details matter:
 *
 * - `useNativeDriver` hands the whole animation to the platform, so no
 *   JavaScript runs per frame. This component previously animated its width
 *   through a Reanimated worklet, which put a Hermes call on every display-link
 *   frame — the frames where the iOS post-onboarding crash aborted. Nothing
 *   here schedules JS work on that thread.
 * - `width` cannot be driven natively and re-runs layout every frame anyway.
 *   `scaleX` on an already-full-width fill is a pure compositor transform.
 *
 * `scaleX` scales about an element's centre, which on its own would make the
 * fill grow outward from the middle of the track. The fix is geometric: the
 * fill is laid out at twice the track's width and offset left by one full
 * width, which puts its centre exactly on the track's left edge. Scaling about
 * that centre extends it symmetrically, the half growing leftward is clipped by
 * the track's `overflow: hidden`, and what remains visible is a fill that grows
 * left to right. At scale s the visible span is 0 to s×width, which is the
 * definition of a progress fill.
 */
export function ProgressBar({
  progress,
  height = 3,
  tone = 'accent',
  style,
  accessibilityLabel,
  testID,
}: ProgressBarProps) {
  const clamped = clampProgress(progress);
  const reducedMotion = useReducedMotion();

  // Seeded with the first value so the bar mounts already filled rather than
  // sweeping up from zero every time a screen appears. A lazy state
  // initialiser rather than a ref: the value has to be created once and read
  // during render, and reading a ref while rendering is exactly what the React
  // Compiler rules forbid.
  const [fill] = useState(() => new Animated.Value(clamped));
  const previous = useRef(clamped);

  useEffect(() => {
    if (previous.current === clamped) return;
    previous.current = clamped;

    const animation = Animated.timing(fill, {
      toValue: clamped,
      duration: reduceDuration(timing.transition, reducedMotion),
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    });

    animation.start();
    // Interrupting mid-flight leaves the value wherever it reached; the next
    // change animates on from there rather than jumping.
    return () => animation.stop();
  }, [clamped, fill, reducedMotion]);

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
    >
      <Animated.View
        testID={testID ? `${testID}-fill` : undefined}
        pointerEvents="none"
        style={[
          styles.fill,
          {
            backgroundColor: TONE_COLORS[tone],
            borderRadius: height / 2,
            transform: [{ scaleX: fill }],
          },
        ]}
      />
    </View>
  );
}

const TONE_COLORS = {
  accent: colors.accent,
  highlight: colors.highlight,
  muted: colors.textDisabled,
} as const;

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  /**
   * Twice the track's width, offset left by one full width, so the element's
   * centre sits on the track's left edge. Everything left of that edge is
   * clipped by the track, so scaling reads as a left-to-right fill.
   */
  fill: {
    position: 'absolute',
    left: '-100%',
    top: 0,
    bottom: 0,
    width: '200%',
  },
});
