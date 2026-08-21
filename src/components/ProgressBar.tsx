import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '@/design';
import { easing, timing } from '@/motion';
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

/**
 * A hairline progress track. Fills animate at interaction speed so XP and
 * workout progress visibly move rather than jumping.
 */
export function ProgressBar({
  progress,
  height = 3,
  tone = 'accent',
  style,
  accessibilityLabel,
  testID,
}: ProgressBarProps) {
  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const value = useSharedValue(clamped);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    value.value = withTiming(clamped, {
      duration: reduceDuration(timing.transition, reducedMotion),
      easing: easing.standard,
    });
  }, [clamped, reducedMotion, value]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: TONE_COLORS[tone], borderRadius: height / 2 },
          fillStyle,
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
  fill: { height: '100%' },
});
