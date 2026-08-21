import type {
  ExercisePerformanceWithSets,
  Prescription,
  SetPerformance,
  WorkoutSessionDetail,
} from '../types';

/** Test factories. Kept out of the app bundle — imported only by tests. */

export function prescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    sets: 3,
    targetMin: 8,
    targetMax: 12,
    restSeconds: 90,
    tempo: null,
    cues: [],
    ...overrides,
  };
}

export function set(
  setNumber: number,
  primaryValue: number,
  secondaryValue: number | null = null,
): SetPerformance {
  return {
    id: `set-${setNumber}-${primaryValue}-${secondaryValue ?? 'x'}`,
    performanceId: 'perf',
    setNumber,
    primaryValue,
    secondaryValue,
    completedAt: '2026-08-01T10:00:00.000Z',
  };
}

export function performance(
  overrides: Partial<ExercisePerformanceWithSets> = {},
): ExercisePerformanceWithSets {
  return {
    id: 'perf',
    sessionId: 'session-1',
    position: 0,
    variationId: 'var-bss-standard',
    exerciseName: 'Bulgarian Split Squat',
    variationName: 'Bulgarian Split Squat',
    measurementKind: 'reps-per-side',
    prescribed: prescription(),
    completedAt: '2026-08-01T10:10:00.000Z',
    sets: [],
    ...overrides,
  };
}

export function session(overrides: Partial<WorkoutSessionDetail> = {}): WorkoutSessionDetail {
  return {
    id: 'session-1',
    templateId: 'template-workout-a',
    templateName: 'Workout A',
    templateFocus: 'Legs + Push',
    phaseId: 'awakening',
    status: 'completed',
    startedAt: '2026-08-01T10:00:00.000Z',
    completedAt: '2026-08-01T10:34:00.000Z',
    durationSeconds: 2040,
    xpAwarded: 345,
    sessionNumber: 1,
    performances: [],
    ...overrides,
  };
}
