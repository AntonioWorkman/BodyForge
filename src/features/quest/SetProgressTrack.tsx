import { StyleSheet, View } from 'react-native';

import { Glyph, Text } from '@/components';
import { colors, layout, radius, spacing } from '@/design';

/**
 * Which sets of the current exercise are done.
 *
 * Completed sets show a check and their recorded value, so a glance confirms
 * what was logged without opening anything. Status is carried by shape and
 * text, not by colour alone.
 */
export function SetProgressTrack({
  totalSets,
  completedValues,
  currentSet,
  suffix,
}: {
  totalSets: number;
  /** Recorded value per completed set, indexed from set 1. */
  completedValues: (string | null)[];
  currentSet: number;
  suffix?: string;
}) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Set ${currentSet} of ${totalSets}`}
    >
      {Array.from({ length: totalSets }, (_, index) => {
        const setNumber = index + 1;
        const value = completedValues[index] ?? null;
        const done = value !== null;
        const active = !done && setNumber === currentSet;

        return (
          <View
            key={setNumber}
            style={[styles.cell, active && styles.cellActive, done && styles.cellDone]}
          >
            {done ? (
              <>
                <Glyph name="check" size={13} color="success" strokeWidth={2} />
                <Text variant="micro" color="textSecondary" tabular>
                  {value}
                  {suffix}
                </Text>
              </>
            ) : (
              <Text variant="micro" color={active ? 'highlight' : 'textDisabled'} uppercase>
                Set {setNumber}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: layout.hairline,
    borderColor: colors.borderSubtle,
  },
  cellActive: { borderColor: colors.borderStrong, backgroundColor: colors.accentSofter },
  cellDone: { borderColor: colors.borderSubtle, backgroundColor: colors.surface },
});
