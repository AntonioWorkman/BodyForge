import { create } from 'zustand';

import type { ExercisePerformanceWithSets, WorkoutSessionDetail } from '@/domain/types';

/**
 * Active workout UI state.
 *
 * Transient only: which exercise is on screen, the values currently dialled
 * into the steppers, and the rest timer's anchor. Everything durable — the
 * recorded sets themselves — lives in SQLite and is written the instant a set
 * is completed. This store is never the source of truth for training data.
 *
 * The rest timer stores the wall-clock instant it started rather than a
 * countdown, so backgrounding the app, navigating away, or a dropped frame
 * cannot make it drift.
 */

export type QuestPhase = 'logging' | 'resting' | 'exercise-complete' | 'finishing';

export interface DraftValues {
  primary: number;
  secondary: number | null;
}

interface RestState {
  /** When the rest period began, as epoch milliseconds. */
  startedAt: number;
  durationSeconds: number;
  /** When the timer was paused, or null if running. */
  pausedAt: number | null;
  /** Milliseconds already spent paused, subtracted from elapsed time. */
  pausedTotalMs: number;
}

interface ActiveWorkoutStore {
  sessionId: string | null;
  currentPosition: number;
  phase: QuestPhase;
  /** Draft stepper values, keyed by performance id. */
  drafts: Record<string, DraftValues>;
  rest: RestState | null;

  begin: (session: WorkoutSessionDetail, position: number) => void;
  clear: () => void;
  setPosition: (position: number) => void;
  setPhase: (phase: QuestPhase) => void;
  setDraft: (performanceId: string, values: DraftValues) => void;

  startRest: (durationSeconds: number, at?: number) => void;
  extendRest: (seconds: number) => void;
  pauseRest: (at?: number) => void;
  resumeRest: (at?: number) => void;
  endRest: () => void;
  /** Restores a rest period that was in flight when the app was last closed. */
  restoreRest: (rest: RestState | null) => void;
}

const initialState = {
  sessionId: null,
  currentPosition: 0,
  phase: 'logging' as QuestPhase,
  drafts: {} as Record<string, DraftValues>,
  rest: null as RestState | null,
};

export const useActiveWorkoutStore = create<ActiveWorkoutStore>((set, get) => ({
  ...initialState,

  begin: (session, position) =>
    set({
      sessionId: session.id,
      currentPosition: position,
      phase: 'logging',
      drafts: {},
      rest: null,
    }),

  clear: () => set({ ...initialState, drafts: {} }),

  setPosition: (currentPosition) => set({ currentPosition }),
  setPhase: (phase) => set({ phase }),

  setDraft: (performanceId, values) =>
    set((state) => ({ drafts: { ...state.drafts, [performanceId]: values } })),

  startRest: (durationSeconds, at = Date.now()) =>
    set({
      phase: 'resting',
      rest: { startedAt: at, durationSeconds, pausedAt: null, pausedTotalMs: 0 },
    }),

  extendRest: (seconds) => {
    const { rest } = get();
    if (!rest) return;
    set({ rest: { ...rest, durationSeconds: rest.durationSeconds + seconds } });
  },

  pauseRest: (at = Date.now()) => {
    const { rest } = get();
    if (!rest || rest.pausedAt !== null) return;
    set({ rest: { ...rest, pausedAt: at } });
  },

  resumeRest: (at = Date.now()) => {
    const { rest } = get();
    if (!rest || rest.pausedAt === null) return;
    set({
      rest: {
        ...rest,
        pausedAt: null,
        pausedTotalMs: rest.pausedTotalMs + (at - rest.pausedAt),
      },
    });
  },

  endRest: () => set({ rest: null, phase: 'logging' }),

  restoreRest: (rest) => set({ rest, phase: rest ? 'resting' : 'logging' }),
}));

/**
 * Seconds left in a rest period, computed from timestamps rather than counted
 * down. Returns 0 once the period has elapsed.
 */
export function restSecondsRemaining(rest: RestState | null, now = Date.now()): number {
  if (!rest) return 0;
  const reference = rest.pausedAt ?? now;
  const elapsedMs = reference - rest.startedAt - rest.pausedTotalMs;
  const remainingMs = rest.durationSeconds * 1000 - elapsedMs;
  return Math.max(0, remainingMs / 1000);
}

/** Rest progress from 0 (just started) to 1 (elapsed). */
export function restProgress(rest: RestState | null, now = Date.now()): number {
  if (!rest || rest.durationSeconds <= 0) return 1;
  const remaining = restSecondsRemaining(rest, now);
  return Math.min(1, Math.max(0, 1 - remaining / rest.durationSeconds));
}

/** Default stepper values for a set: last session's, else the bottom of range. */
export function defaultDraftFor(
  performance: ExercisePerformanceWithSets,
  previous: ExercisePerformanceWithSets | null,
  setNumber: number,
): DraftValues {
  const perSide = performance.measurementKind === 'reps-per-side';

  const previousSet = previous?.sets.find((set) => set.setNumber === setNumber);
  if (previousSet) {
    return {
      primary: previousSet.primaryValue,
      secondary: perSide ? (previousSet.secondaryValue ?? previousSet.primaryValue) : null,
    };
  }

  // Within this session, carry the previous set forward — it is nearly always
  // the closest guess and saves the player adjusting from zero.
  const lastLogged = [...performance.sets].sort((a, b) => b.setNumber - a.setNumber)[0];
  if (lastLogged) {
    return {
      primary: lastLogged.primaryValue,
      secondary: perSide ? (lastLogged.secondaryValue ?? lastLogged.primaryValue) : null,
    };
  }

  const base = performance.prescribed.targetMin;
  return { primary: base, secondary: perSide ? base : null };
}
