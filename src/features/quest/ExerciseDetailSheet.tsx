import { ScrollView, StyleSheet, View } from 'react-native';

import { SectionLabel, Sheet, Text } from '@/components';
import { spacing } from '@/design';
import { formatPrescription } from '@/domain/format';
import type { ExercisePerformanceWithSets } from '@/domain/types';

/**
 * Form cues and execution notes for the current exercise.
 *
 * Kept behind a control rather than printed permanently on the logging screen:
 * useful the first few sessions, clutter thereafter.
 */
export function ExerciseDetailSheet({
  visible,
  onClose,
  performance,
  execution,
}: {
  visible: boolean;
  onClose: () => void;
  performance: ExercisePerformanceWithSets;
  execution: string | null;
}) {
  const { prescribed } = performance;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={performance.variationName}
      subtitle={formatPrescription(prescribed, performance.measurementKind)}
      testID="exercise-detail-sheet"
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {execution ? (
          <View style={styles.section}>
            <SectionLabel tone="plain">Execution</SectionLabel>
            <Text variant="body" color="textSecondary">
              {execution}
            </Text>
          </View>
        ) : null}

        {prescribed.tempo ? (
          <View style={styles.section}>
            <SectionLabel tone="plain">Tempo</SectionLabel>
            <Text variant="body" color="textSecondary">
              {prescribed.tempo}
            </Text>
          </View>
        ) : null}

        {prescribed.cues.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel tone="plain">Form</SectionLabel>
            {prescribed.cues.map((cue) => (
              <View key={cue} style={styles.cue}>
                <Text variant="body" color="textMuted">
                  ·
                </Text>
                <Text variant="body" color="textSecondary" style={styles.cueText}>
                  {cue}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLabel tone="plain">Rest</SectionLabel>
          <Text variant="body" color="textSecondary">
            {prescribed.restSeconds} seconds between sets.
          </Text>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginBottom: spacing.xl },
  cue: { flexDirection: 'row', gap: spacing.sm },
  cueText: { flex: 1 },
});
