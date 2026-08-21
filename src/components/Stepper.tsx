import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, layout, radius, spacing } from '@/design';
import { easing, timing } from '@/motion';
import { fire as fireHaptic } from '@/motion/haptics';
import { useReducedMotion } from '@/motion/useMotionPreference';

import { Glyph } from './Glyph';
import { Text } from './Text';

interface StepperProps {
  /** Column heading — "LEFT", "RIGHT", or "REPS". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Appended to the value, e.g. "s" for timed holds. */
  suffix?: string;
  /** Opens direct numeric entry, for values far from the current one. */
  onEditRequest?: () => void;
  testID?: string;
}

/**
 * The rep counter used during a workout.
 *
 * Sized for one-handed use mid-set: the controls are far larger than the
 * minimum touch target, and the value itself is tappable to type a number
 * directly rather than pressing plus twenty times.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  onEditRequest,
  testID,
}: StepperProps) {
  const bump = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const valueStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + bump.value * 0.06 }],
  }));

  const change = useCallback(
    (delta: number) => {
      const next = Math.min(max, Math.max(min, value + delta));
      if (next === value) return;

      fireHaptic('repTick');
      onChange(next);

      if (!reducedMotion) {
        bump.value = withSequence(
          withTiming(1, { duration: timing.microFast, easing: easing.emphasized }),
          withTiming(0, { duration: timing.micro, easing: easing.standard }),
        );
      }
    },
    [bump, max, min, onChange, reducedMotion, value],
  );

  return (
    <View style={styles.root} testID={testID}>
      <Text variant="overline" color="textMuted" uppercase align="center">
        {label}
      </Text>

      <Pressable
        accessibilityRole={onEditRequest ? 'button' : 'text'}
        accessibilityLabel={`${label}: ${value}${suffix ?? ''}`}
        accessibilityHint={onEditRequest ? 'Opens direct entry' : undefined}
        onPress={onEditRequest}
        disabled={!onEditRequest}
        style={styles.valuePress}
      >
        <Animated.View style={valueStyle}>
          <Text variant="displayXL" tabular align="center">
            {value}
            {suffix ? (
              <Text variant="displayMedium" color="textMuted">
                {suffix}
              </Text>
            ) : null}
          </Text>
        </Animated.View>
      </Pressable>

      <View style={styles.controls}>
        <StepperControl
          glyph="minus"
          label={`Decrease ${label}`}
          onPress={() => change(-step)}
          disabled={value <= min}
        />
        <StepperControl
          glyph="plus"
          label={`Increase ${label}`}
          onPress={() => change(step)}
          disabled={value >= max}
        />
      </View>
    </View>
  );
}

function StepperControl({
  glyph,
  label,
  onPress,
  disabled,
}: {
  glyph: 'plus' | 'minus';
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        pressed && styles.controlPressed,
        disabled && styles.controlDisabled,
      ]}
    >
      <Glyph name={glyph} size={26} color={disabled ? 'textDisabled' : 'highlight'} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', gap: spacing.sm },
  valuePress: { minHeight: 70, justifyContent: 'center' },
  controls: { flexDirection: 'row', gap: spacing.md },
  control: {
    width: layout.workoutTouchTarget,
    height: layout.workoutTouchTarget - 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  controlPressed: { backgroundColor: colors.accentSoft, borderColor: colors.borderStrong },
  controlDisabled: { borderColor: colors.borderSubtle },
});
