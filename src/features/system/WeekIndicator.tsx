import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, spacing } from '@/design';

/**
 * Weekly training consistency.
 *
 * Filled marks for completed sessions, hollow for the remainder of the target.
 * Deliberately not a streak: there is nothing to break, and an unfilled mark
 * carries no penalty.
 */
export function WeekIndicator({ completed, target }: { completed: number; target: number }) {
  const marks = Math.max(target, completed);

  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={`${completed} of ${target} sessions completed this week`}
    >
      {Array.from({ length: marks }, (_, index) => (
        <View key={index} style={[styles.mark, index < completed && styles.markFilled]} />
      ))}
      {completed > target ? (
        <Text variant="caption" color="textMuted" style={styles.extra}>
          +{completed - target} beyond target
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  markFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  extra: { marginLeft: spacing.xs },
});
