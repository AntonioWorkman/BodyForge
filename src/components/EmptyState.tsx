import { StyleSheet, View } from 'react-native';

import { spacing } from '@/design';

import { Text } from './Text';

interface EmptyStateProps {
  /** Short System-voice line, e.g. "NO TRAINING DATA". */
  title: string;
  /** What the player can do about it. */
  message: string;
  testID?: string;
}

/**
 * The empty state.
 *
 * The System should read as dormant rather than broken, so empty states state
 * plainly that there is no data yet — they never fill the space with invented
 * numbers or sample charts.
 */
export function EmptyState({ title, message, testID }: EmptyStateProps) {
  return (
    <View style={styles.root} testID={testID}>
      <Text variant="systemLabel" color="textMuted" uppercase align="center">
        {title}
      </Text>
      <Text variant="body" color="textSecondary" align="center" style={styles.message}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
  message: { maxWidth: 300 },
});
