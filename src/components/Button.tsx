import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, layout, radius, spacing } from '@/design';
import { easing, timing } from '@/motion';
import { fire as fireHaptic } from '@/motion/haptics';
import type { HapticEvent } from '@/motion/haptics';
import { useReducedMotion } from '@/motion/useMotionPreference';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'regular' | 'large';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Haptic fired on press. Omit for controls that should stay silent. */
  haptic?: HapticEvent | null;
  /** Supporting line rendered under the label, e.g. quest progress. */
  detail?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The app's button.
 *
 * Press feedback is a small scale and a fill shift — micro-level motion, under
 * 180 ms. Only `primary` uses a solid violet fill, which is what keeps the
 * primary action on each screen unmistakable.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  disabled = false,
  haptic = 'selection',
  detail,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const pressed = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : 1 - pressed.value * 0.02 }],
    opacity: 1 - pressed.value * 0.12,
  }));

  const handlePressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: timing.microFast, easing: easing.standard });
  }, [pressed]);

  const handlePressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: timing.microSlow, easing: easing.standard });
  }, [pressed]);

  const handlePress = useCallback(() => {
    if (haptic) fireHaptic(haptic);
    onPress();
  }, [haptic, onPress]);

  const palette = VARIANTS[variant];

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.base,
        size === 'large' ? styles.large : styles.regular,
        {
          backgroundColor: disabled ? colors.surface : palette.background,
          borderColor: disabled ? colors.borderSubtle : palette.border,
        },
        animatedStyle,
        style,
      ]}
    >
      <View style={styles.content}>
        <Text
          variant="action"
          uppercase
          align="center"
          color={disabled ? 'textDisabled' : palette.text}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            variant="caption"
            align="center"
            color={disabled ? 'textDisabled' : palette.detail}
            style={styles.detail}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const VARIANTS = {
  primary: {
    background: colors.accent,
    border: colors.accent,
    text: 'textOnAccent',
    detail: 'textOnAccent',
  },
  secondary: {
    background: 'transparent',
    border: colors.borderStrong,
    text: 'highlight',
    detail: 'textSecondary',
  },
  ghost: {
    background: 'transparent',
    border: 'transparent',
    text: 'textSecondary',
    detail: 'textMuted',
  },
  danger: {
    background: colors.dangerSoft,
    border: colors.danger,
    text: 'danger',
    detail: 'textSecondary',
  },
} as const satisfies Record<
  ButtonVariant,
  { background: string; border: string; text: Parameters<typeof Text>[0]['color']; detail: Parameters<typeof Text>[0]['color'] }
>;

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regular: {
    minHeight: layout.minTouchTarget + 4,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  large: {
    minHeight: 58,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  content: { alignItems: 'center', justifyContent: 'center' },
  detail: { marginTop: spacing.xxs },
});
