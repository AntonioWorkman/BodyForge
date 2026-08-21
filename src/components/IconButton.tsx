import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, layout, radius } from '@/design';
import { fire as fireHaptic } from '@/motion/haptics';
import type { HapticEvent } from '@/motion/haptics';

import { Glyph } from './Glyph';
import type { GlyphName } from './Glyph';

interface IconButtonProps {
  name: GlyphName;
  onPress: () => void;
  /** Required — icon-only controls have no visible text to announce. */
  accessibilityLabel: string;
  size?: number;
  tone?: 'default' | 'accent' | 'muted';
  haptic?: HapticEvent | null;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** An icon-only control at a guaranteed-tappable size. */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  size = 22,
  tone = 'default',
  haptic = 'selection',
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        if (haptic) fireHaptic(haptic);
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Glyph
        name={name}
        size={size}
        color={disabled ? 'textDisabled' : TONE_COLORS[tone]}
      />
    </Pressable>
  );
}

const TONE_COLORS = {
  default: 'text',
  accent: 'highlight',
  muted: 'textMuted',
} as const;

const styles = StyleSheet.create({
  base: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  disabled: { opacity: 0.5 },
});
