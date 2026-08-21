import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExercisePerformanceWithSets, WorkoutSessionDetail } from '@/domain/types';
import { useServices } from '@/providers/servicesContext';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

/**
 * Loads or starts the quest, and keeps its persisted state in step with the UI.
 *
 * Two things are written continuously rather than at the end: every completed
 * set, and the position/rest anchor. Between them, an interrupted quest can be
 * resumed exactly where it stopped, including a rest period that was running
 * when the app went away.
 */
export interface QuestSessionState {
  session: WorkoutSessionDetail | null;
  /** The same variation's most recent completed performance, per performance id. */
  previousByPerformance: Record<string, ExercisePerformanceWithSets | null>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useQuestSession(templateId: string | undefined): QuestSessionState {
  const services = useServices();
  const beginStore = useActiveWorkoutStore((store) => store.begin);
  const restoreRest = useActiveWorkoutStore((store) => store.restoreRest);

  const [session, setSession] = useState<WorkoutSessionDetail | null>(null);
  const [previousByPerformance, setPrevious] = useState<
    Record<string, ExercisePerformanceWithSets | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialised = useRef(false);

  const load = useCallback(
    async (allowStart: boolean) => {
      try {
        let active = await services.workouts.getActiveSession();

        if (!active && allowStart) {
          const plan = templateId
            ? await services.workouts.buildPlan(templateId)
            : await services.workouts.getNextPlan();

          if (!plan) {
            setError('No workout is available to start.');
            setLoading(false);
            return;
          }
          active = await services.workouts.startSession(plan);
        }

        if (!active) {
          setError('This quest is no longer active.');
          setLoading(false);
          return;
        }

        const ui = await services.workouts.getUiState(active.id);

        // Resume where the player left off, or at the first unfinished exercise.
        const position =
          ui?.currentPosition ??
          Math.max(
            0,
            active.performances.findIndex((p) => p.sets.length < p.prescribed.sets),
          );

        if (!initialised.current) {
          beginStore(active, position);

          // A rest period that was in flight is restored from its stored anchor,
          // so the remaining time is correct however long the app was closed.
          if (ui?.restStartedAt && ui.restDurationSeconds) {
            const startedAt = new Date(ui.restStartedAt).getTime();
            const pausedAt = ui.restPausedAt ? new Date(ui.restPausedAt).getTime() : null;
            const elapsed = (pausedAt ?? Date.now()) - startedAt;

            if (elapsed < ui.restDurationSeconds * 1000) {
              restoreRest({
                startedAt,
                durationSeconds: ui.restDurationSeconds,
                pausedAt,
                pausedTotalMs: 0,
              });
            }
          }
          initialised.current = true;
        }

        setSession(active);
        setPrevious(await services.workouts.loadPreviousPerformances(active));
        setError(null);
      } catch {
        setError('This quest could not be loaded.');
      } finally {
        setLoading(false);
      }
    },
    [beginStore, restoreRest, services, templateId],
  );

  useEffect(() => {
    // Loading from SQLite on mount is exactly the external-system
    // synchronisation effects exist for; the state writes happen after the
    // awaited read, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(true);
  }, [load]);

  const reload = useCallback(() => load(false), [load]);

  return { session, previousByPerformance, loading, error, reload };
}
