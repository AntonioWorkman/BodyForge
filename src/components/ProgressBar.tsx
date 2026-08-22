import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius } from '@/design';

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
 * A hairline progress track.
 *
 * The fill is laid out on the normal React render path — a plain percentage
 * width, no shared value and no UI-thread worklet.
 *
 * It used to animate its width through `useAnimatedStyle`, which put a Hermes
 * callback on every display-link frame for every bar on screen. Those frames
 * are where the iOS post-onboarding crash aborts, and a fill that eases into
 * place over 400ms is not worth a chance of taking the process down. Progress
 * still reads correctly; it simply arrives immediately.
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

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: TONE_COLORS[tone],
            borderRadius: height / 2,
            width: `${clamped * 100}%`,
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
  fill: { height: '100%' },
});
