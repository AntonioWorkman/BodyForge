import { StyleSheet, View } from 'react-native';

import { SectionLabel, Text } from '@/components';
import { colors, layout, spacing } from '@/design';
import type { ExercisePerformanceWithSets, MeasurementKind } from '@/domain/types';
import { formatShortDate } from '@/domain/format';

/**
 * What the player did last time on this exercise.
 *
 * A small table rather than a chart: during a set, the only useful question is
 * "what did I hit last time on set two?", and a number answers it faster than
 * anything else can.
 */
export function PreviousPerformance({
  previous,
  measurementKind,
}: {
  previous: ExercisePerformanceWithSets | null;
  measurementKind: MeasurementKind;
}) {
  if (!previous || previous.sets.length === 0) {
    return (
      <View style={styles.root}>
        <SectionLabel tone="plain">Previous</SectionLabel>
        <Text variant="caption" color="textMuted">
          No previous record — this session sets your baseline.
        </Text>
      </View>
    );
  }

  const perSide = measurementKind === 'reps-per-side';
  const suffix = measurementKind === 'time' ? 's' : '';
  const sets = [...previous.sets].sort((a, b) => a.setNumber - b.setNumber);

  return (
    <View style={styles.root}>
      <SectionLabel
        tone="plain"
        trailing={previous.completedAt ? formatShortDate(previous.completedAt) : undefined}
      >
        Previous
      </SectionLabel>

      {perSide ? (
        <View style={styles.headerRow}>
          <View style={styles.setColumn} />
          <Text variant="overline" color="textMuted" uppercase align="center" style={styles.valueColumn}>
            Left
          </Text>
          <Text variant="overline" color="textMuted" uppercase align="center" style={styles.valueColumn}>
            Right
          </Text>
        </View>
      ) : null}

      {sets.map((set) => (
        <View key={set.setNumber} style={styles.row}>
          <Text variant="caption" color="textMuted" tabular style={styles.setColumn}>
            {set.setNumber}
          </Text>
          <Text variant="captionStrong" color="textSecondary" tabular align="center" style={styles.valueColumn}>
            {set.primaryValue}
            {suffix}
          </Text>
          {perSide ? (
            <Text
              variant="captionStrong"
              color="textSecondary"
              tabular
              align="center"
              style={styles.valueColumn}
            >
              {set.secondaryValue ?? set.primaryValue}
              {suffix}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  setColumn: { width: 24 },
  valueColumn: { flex: 1 },
});
