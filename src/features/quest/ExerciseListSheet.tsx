import { ScrollView } from 'react-native';

import { Sheet, SheetRow } from '@/components';
import { formatPrescription } from '@/domain/format';
import type { WorkoutSessionDetail } from '@/domain/types';

/**
 * The exercise list.
 *
 * Reachable at any time so the player can jump between exercises without
 * losing anything — every set is already written to storage, so moving is
 * always safe.
 */
export function ExerciseListSheet({
  visible,
  onClose,
  session,
  currentPosition,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  session: WorkoutSessionDetail;
  currentPosition: number;
  onSelect: (position: number) => void;
}) {
  const completed = session.performances.filter(
    (performance) => performance.sets.length >= performance.prescribed.sets,
  ).length;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={session.templateName}
      subtitle={`${completed} of ${session.performances.length} exercises complete`}
      testID="exercise-list-sheet"
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {session.performances.map((performance) => {
          const done = performance.sets.length >= performance.prescribed.sets;
          return (
            <SheetRow
              key={performance.id}
              title={performance.variationName}
              detail={formatPrescription(performance.prescribed, performance.measurementKind)}
              meta={`${performance.sets.length} / ${performance.prescribed.sets}`}
              complete={done}
              active={performance.position === currentPosition}
              onPress={() => {
                onSelect(performance.position);
                onClose();
              }}
            />
          );
        })}
      </ScrollView>
    </Sheet>
  );
}
