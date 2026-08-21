import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInRight, FadeOut, FadeOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  EmptyState,
  Glyph,
  IconButton,
  ProgressBar,
  Screen,
  Stepper,
  Text,
} from '@/components';
import { colors, layout, spacing } from '@/design';
import { formatRange } from '@/domain/format';
import type { ExercisePerformanceWithSets } from '@/domain/types';
import { timing } from '@/motion';
import { fire as fireHaptic } from '@/motion/haptics';
import { useReducedMotion } from '@/motion/useMotionPreference';
import { useServices } from '@/providers/servicesContext';
import { defaultDraftFor, useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

import { ExerciseDetailSheet } from './ExerciseDetailSheet';
import { ExerciseListSheet } from './ExerciseListSheet';
import { ExerciseTransition } from './ExerciseTransition';
import { PreviousPerformance } from './PreviousPerformance';
import { RestState } from './RestState';
import { SetProgressTrack } from './SetProgressTrack';
import { useQuestSession } from './useQuestSession';

/**
 * Main Quest.
 *
 * One exercise fills the screen. There is no player dashboard, no XP preview
 * and no permanent timer card competing with the work — those belong either to
 * System or to the completion sequence.
 *
 * Every set is written to storage the moment it is completed, so navigating
 * between exercises, backgrounding the app or killing it never loses data.
 */
export function MainQuestScreen() {
  const services = useServices();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ templateId?: string }>();

  const { session, previousByPerformance, loading, error, reload } = useQuestSession(
    params.templateId,
  );

  const position = useActiveWorkoutStore((store) => store.currentPosition);
  const setPosition = useActiveWorkoutStore((store) => store.setPosition);
  const phase = useActiveWorkoutStore((store) => store.phase);
  const setPhase = useActiveWorkoutStore((store) => store.setPhase);
  const drafts = useActiveWorkoutStore((store) => store.drafts);
  const setDraft = useActiveWorkoutStore((store) => store.setDraft);
  const startRest = useActiveWorkoutStore((store) => store.startRest);
  const endRest = useActiveWorkoutStore((store) => store.endRest);
  const rest = useActiveWorkoutStore((store) => store.rest);
  const clearWorkout = useActiveWorkoutStore((store) => store.clear);

  const [listVisible, setListVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [executionNotes, setExecutionNotes] = useState<Record<string, string>>({});

  const performance = session?.performances[position] ?? null;
  const previous = performance ? (previousByPerformance[performance.id] ?? null) : null;

  const completedSets = performance?.sets.length ?? 0;
  const targetSets = performance?.prescribed.sets ?? 0;
  const currentSet = Math.min(completedSets + 1, targetSets);
  const exerciseDone = performance !== null && completedSets >= targetSets;

  // Execution notes come from the catalog rather than the recorded snapshot,
  // because they describe how to do the movement today.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const variations = await services.progression.getChains();
      if (cancelled) return;
      const notes: Record<string, string> = {};
      for (const chain of variations) {
        for (const node of chain.nodes) notes[node.variation.id] = node.variation.execution;
      }
      setExecutionNotes(notes);
    })();
    return () => {
      cancelled = true;
    };
  }, [services]);

  // The draft the steppers are bound to, seeded from last session's values.
  const draft = useMemo(() => {
    if (!performance) return null;
    return drafts[performance.id] ?? defaultDraftFor(performance, previous, currentSet);
  }, [currentSet, drafts, performance, previous]);

  // Persist the on-screen position and any running rest period, so a relaunch
  // resumes exactly here.
  useEffect(() => {
    if (!session) return;
    void services.workouts.saveUiState({
      sessionId: session.id,
      currentPosition: position,
      restStartedAt: rest ? new Date(rest.startedAt).toISOString() : null,
      restDurationSeconds: rest?.durationSeconds ?? null,
      restPausedAt: rest?.pausedAt ? new Date(rest.pausedAt).toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
  }, [position, rest, services, session]);

  const goToPosition = useCallback(
    (next: number) => {
      if (!session) return;
      const clamped = Math.min(session.performances.length - 1, Math.max(0, next));
      if (clamped === position) return;
      fireHaptic('selection');
      setPosition(clamped);
      setPhase('logging');
    },
    [position, session, setPhase, setPosition],
  );

  const completeSet = useCallback(async () => {
    if (!session || !performance || !draft || exerciseDone) return;

    await services.workouts.recordSet(performance.id, currentSet, draft.primary, draft.secondary);

    if (currentSet >= targetSets) {
      await services.workouts.markExerciseComplete(performance.id);
      fireHaptic('exerciseComplete');
      await reload();
      setPhase('exercise-complete');
      return;
    }

    fireHaptic('setComplete');
    await reload();

    // Seed the next set from what was just logged.
    setDraft(performance.id, draft);
    startRest(performance.prescribed.restSeconds);
  }, [
    currentSet,
    draft,
    exerciseDone,
    performance,
    reload,
    services,
    session,
    setDraft,
    setPhase,
    startRest,
    targetSets,
  ]);

  const advanceAfterExercise = useCallback(async () => {
    if (!session) return;
    const isLastExercise = position >= session.performances.length - 1;

    if (isLastExercise) {
      setPhase('finishing');
      router.replace({ pathname: '/quest/complete', params: { sessionId: session.id } });
      return;
    }

    setPosition(position + 1);
    setPhase('logging');
    // Rest between exercises uses the prescription of the exercise just
    // finished, which is the work the player is actually recovering from.
    startRest(session.performances[position]?.prescribed.restSeconds ?? 90);
  }, [position, router, session, setPhase, setPosition, startRest]);

  const confirmExit = useCallback(() => {
    if (!session) return;
    Alert.alert(
      'Leave this quest?',
      'Everything you have logged is already saved. You can resume from System at any time.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          onPress: () => {
            clearWorkout();
            router.replace('/(tabs)');
          },
        },
        {
          text: 'Discard quest',
          style: 'destructive',
          onPress: async () => {
            await services.workouts.discardSession(session.id);
            clearWorkout();
            router.replace('/(tabs)');
          },
        },
      ],
    );
  }, [clearWorkout, router, services, session]);

  // Swiping between exercises. The header arrows do the same job visibly.
  const swipe = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-18, 18])
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationX < -60) goToPosition(position + 1);
      else if (event.translationX > 60) goToPosition(position - 1);
    });

  if (loading) return <Screen testID="quest-loading" />;

  if (error || !session || !performance || !draft) {
    return (
      <Screen>
        <EmptyState
          title="Quest unavailable"
          message={error ?? 'This quest could not be loaded.'}
        />
        <Button label="Back to System" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  const perSide = performance.measurementKind === 'reps-per-side';
  const suffix = performance.measurementKind === 'time' ? 's' : '';
  const totalTargetSets = session.performances.reduce((sum, p) => sum + p.prescribed.sets, 0);
  const totalCompletedSets = session.performances.reduce((sum, p) => sum + p.sets.length, 0);

  return (
    <View style={styles.root}>
      <Screen scroll padded testID="main-quest">
        {/* Header ---------------------------------------------------------- */}
        <View style={styles.header}>
          <IconButton
            name="close"
            onPress={confirmExit}
            accessibilityLabel="Leave quest"
            tone="muted"
            testID="quest-exit"
          />
          <View style={styles.headerCenter}>
            <Text variant="systemLabel" color="highlight" uppercase tabular>
              Quest {String(position + 1).padStart(2, '0')}
            </Text>
          </View>
          <IconButton
            name="list"
            onPress={() => setListVisible(true)}
            accessibilityLabel="Exercise list"
            tone="muted"
            testID="quest-list"
          />
        </View>

        <View style={styles.progress}>
          <ProgressBar
            progress={totalCompletedSets / Math.max(1, totalTargetSets)}
            accessibilityLabel={`${totalCompletedSets} of ${totalTargetSets} sets complete`}
          />
          <Text variant="caption" color="textMuted" tabular align="right">
            {position + 1} / {session.performances.length} exercises
          </Text>
        </View>

        {/* The exercise ---------------------------------------------------- */}
        <GestureDetector gesture={swipe}>
          <Animated.View
            key={performance.id}
            entering={
              reducedMotion
                ? FadeIn.duration(timing.micro)
                : FadeInRight.duration(timing.transition)
            }
            exiting={
              reducedMotion
                ? FadeOut.duration(timing.micro)
                : FadeOutLeft.duration(timing.transitionFast)
            }
            style={styles.exercise}
          >
            <View style={styles.exerciseHeader}>
              <Text variant="displayLarge" style={styles.exerciseName}>
                {performance.variationName}
              </Text>
              <View style={styles.prescriptionRow}>
                <Text variant="bodyStrong" color="highlight" tabular>
                  {performance.prescribed.sets} ×{' '}
                  {formatRange(performance.prescribed, performance.measurementKind)}
                </Text>
                <IconButton
                  name="info"
                  size={18}
                  onPress={() => setDetailVisible(true)}
                  accessibilityLabel="Form and tempo details"
                  tone="muted"
                  testID="quest-details"
                />
              </View>
            </View>

            <SetProgressTrack
              totalSets={targetSets}
              completedValues={completedValuesFor(performance)}
              currentSet={currentSet}
              suffix={suffix}
            />

            <PreviousPerformance
              previous={previous}
              measurementKind={performance.measurementKind}
            />

            {/* Today ------------------------------------------------------- */}
            {exerciseDone ? (
              <View style={styles.doneBlock}>
                <Glyph name="check" size={26} color="success" strokeWidth={2} />
                <Text variant="displaySmall" color="success" align="center">
                  Exercise complete
                </Text>
              </View>
            ) : (
              <View style={styles.today}>
                <Text variant="systemLabel" color="textMuted" uppercase>
                  Today · Set {currentSet}
                </Text>

                <View style={styles.steppers}>
                  <Stepper
                    label={
                      perSide ? 'Left' : performance.measurementKind === 'time' ? 'Hold' : 'Reps'
                    }
                    value={draft.primary}
                    suffix={perSide ? undefined : suffix || undefined}
                    step={performance.measurementKind === 'time' ? 5 : 1}
                    onChange={(value) => setDraft(performance.id, { ...draft, primary: value })}
                    testID="stepper-primary"
                  />
                  {perSide ? (
                    <Stepper
                      label="Right"
                      value={draft.secondary ?? draft.primary}
                      onChange={(value) => setDraft(performance.id, { ...draft, secondary: value })}
                      testID="stepper-secondary"
                    />
                  ) : null}
                </View>
              </View>
            )}
          </Animated.View>
        </GestureDetector>

        {/* Navigation between exercises ------------------------------------ */}
        <View style={styles.navRow}>
          <IconButton
            name="chevron-left"
            onPress={() => goToPosition(position - 1)}
            accessibilityLabel="Previous exercise"
            disabled={position === 0}
            tone="muted"
          />
          <Text variant="caption" color="textMuted">
            Swipe or use the arrows to move between exercises
          </Text>
          <IconButton
            name="chevron-right"
            onPress={() => goToPosition(position + 1)}
            accessibilityLabel="Next exercise"
            disabled={position >= session.performances.length - 1}
            tone="muted"
          />
        </View>
      </Screen>

      {/* Primary action ---------------------------------------------------- */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.lg }]}>
        {exerciseDone ? (
          <Button
            label={position >= session.performances.length - 1 ? 'Complete quest' : 'Next exercise'}
            onPress={advanceAfterExercise}
            size="large"
            haptic="setComplete"
            testID="quest-advance"
          />
        ) : (
          <>
            <Button
              label="Complete set"
              onPress={completeSet}
              size="large"
              haptic={null}
              testID="complete-set"
            />
            <Text variant="caption" color="textMuted" align="center" style={styles.restNote}>
              Next rest · {formatRestLabel(performance.prescribed.restSeconds)}
            </Text>
          </>
        )}
      </View>

      {/* Overlays ---------------------------------------------------------- */}
      {phase === 'resting' && rest ? (
        <RestState
          nextExerciseName={performance.variationName}
          nextSetLabel={`Set ${currentSet} of ${targetSets}`}
          onSkip={endRest}
          onComplete={endRest}
        />
      ) : null}

      {phase === 'exercise-complete' ? (
        <ExerciseTransition
          exerciseName={performance.variationName}
          isFinalExercise={position >= session.performances.length - 1}
          onDone={advanceAfterExercise}
        />
      ) : null}

      <ExerciseListSheet
        visible={listVisible}
        onClose={() => setListVisible(false)}
        session={session}
        currentPosition={position}
        onSelect={goToPosition}
      />

      <ExerciseDetailSheet
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        performance={performance}
        execution={executionNotes[performance.variationId] ?? null}
      />
    </View>
  );
}

/** Recorded values per set, for the set track. */
function completedValuesFor(performance: ExercisePerformanceWithSets): (string | null)[] {
  const values: (string | null)[] = Array.from({ length: performance.prescribed.sets }, () => null);

  for (const set of performance.sets) {
    const index = set.setNumber - 1;
    if (index < 0 || index >= values.length) continue;
    values[index] =
      set.secondaryValue !== null && set.secondaryValue !== set.primaryValue
        ? `${set.primaryValue}/${set.secondaryValue}`
        : `${set.primaryValue}`;
  }

  return values;
}

function formatRestLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { flex: 1, alignItems: 'center' },
  progress: { marginTop: spacing.md, gap: spacing.xs },
  exercise: { marginTop: spacing.xxl, gap: spacing.xxl },
  exerciseHeader: { gap: spacing.sm },
  exerciseName: { letterSpacing: -1.4 },
  prescriptionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  today: { gap: spacing.lg },
  steppers: { flexDirection: 'row', gap: spacing.lg },
  doneBlock: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
  navRow: {
    marginTop: spacing.xxxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  actionBar: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  restNote: { marginTop: spacing.xxs },
});
