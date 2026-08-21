import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Glyph, Text } from '@/components';
import { colors, layout, spacing } from '@/design';
import { fire as fireHaptic } from '@/motion/haptics';

/**
 * Settings rows.
 *
 * Deliberately ordinary. Settings is the one screen in the app that should feel
 * completely familiar — the System's voice belongs on System and Main Quest.
 */
export function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="body" color={disabled ? 'textDisabled' : 'text'}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>

      <Switch
        value={value}
        onValueChange={(next) => {
          fireHaptic('selection');
          onChange(next);
        }}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: colors.surfaceRaised, true: colors.accentDim }}
        thumbColor={value ? colors.highlight : colors.textMuted}
      />
    </View>
  );
}

export function ActionRow({
  label,
  description,
  value,
  onPress,
  destructive = false,
}: {
  label: string;
  description?: string;
  /** Current value shown at the right, for rows that open a chooser. */
  value?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text variant="body" color={destructive ? 'danger' : 'text'}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text variant="captionStrong" color="textMuted">
          {value}
        </Text>
      ) : null}
      <Glyph name="chevron-right" size={16} color={destructive ? 'danger' : 'textMuted'} />
    </Pressable>
  );
}

export function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="body" style={styles.text}>
        {label}
      </Text>
      <Text variant="captionStrong" color="textMuted">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: layout.minTouchTarget + 8,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  text: { flex: 1, gap: spacing.xxs },
});
