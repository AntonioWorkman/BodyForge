import { peakSetValue } from './mastery';
import type { ExercisePerformanceWithSets, PersonalBest, WorkoutSessionDetail } from './types';

/**
 * Personal bests.
 *
 * A best is the highest single-set value recorded for a variation. For
 * unilateral work the stronger side counts, because a best is about a peak.
 * Bests are always recomputed from recorded sets, never stored as a separate
 * truth that could drift from history.
 */

/** The best recorded set per variation across the given completed sessions. */
export function computePersonalBests(
  sessions: readonly WorkoutSessionDetail[],
): Map<string, PersonalBest> {
  const bests = new Map<string, PersonalBest>();

  for (const session of sessions) {
    if (session.status !== 'completed' || !session.completedAt) continue;
    for (const performance of session.performances) {
      const best = bestSetIn(performance);
      if (best === null) continue;

      const existing = bests.get(performance.variationId);
      if (!existing || best > existing.bestSetValue) {
        bests.set(performance.variationId, {
          variationId: performance.variationId,
          variationName: performance.variationName,
          measurementKind: performance.measurementKind,
          bestSetValue: best,
          achievedOn: session.completedAt,
          sessionId: session.id,
        });
      }
    }
  }

  return bests;
}

/** Highest single-set value inside one recorded exercise, or null if empty. */
export function bestSetIn(performance: ExercisePerformanceWithSets): number | null {
  if (performance.sets.length === 0) return null;
  return performance.sets.reduce((max, set) => Math.max(max, peakSetValue(set)), 0);
}

/**
 * Bests set during `session` that beat everything before it. Used at Quest
 * Complete, where a "personal best" must mean the player genuinely exceeded
 * their own record rather than simply recording something.
 *
 * A player's very first recorded performance of a variation is not reported as
 * a personal best — there is nothing yet to beat.
 */
export function findNewPersonalBests(
  session: WorkoutSessionDetail,
  priorSessions: readonly WorkoutSessionDetail[],
): PersonalBest[] {
  const priorBests = computePersonalBests(priorSessions);
  const results: PersonalBest[] = [];

  for (const performance of session.performances) {
    const value = bestSetIn(performance);
    if (value === null) continue;

    const prior = priorBests.get(performance.variationId);
    if (!prior) continue;
    if (value <= prior.bestSetValue) continue;

    results.push({
      variationId: performance.variationId,
      variationName: performance.variationName,
      measurementKind: performance.measurementKind,
      bestSetValue: value,
      achievedOn: session.completedAt ?? session.startedAt,
      sessionId: session.id,
    });
  }

  return results;
}

/**
 * Exercises where the player beat their own previous session on the same
 * variation, by total work rather than a single set. Shown as "improvements",
 * which is a softer and more frequent signal than a personal best.
 */
export function countImprovements(
  session: WorkoutSessionDetail,
  priorSessions: readonly WorkoutSessionDetail[],
): number {
  let improvements = 0;

  for (const performance of session.performances) {
    const currentTotal = totalWork(performance);
    if (currentTotal <= 0) continue;

    const previous = findMostRecentPerformance(performance.variationId, priorSessions);
    if (!previous) continue;

    if (currentTotal > totalWork(previous)) improvements += 1;
  }

  return improvements;
}

/** Total recorded work: reps, reps summed across both sides, or seconds. */
export function totalWork(performance: ExercisePerformanceWithSets): number {
  return performance.sets.reduce(
    (sum, set) => sum + set.primaryValue + (set.secondaryValue ?? 0),
    0,
  );
}

function findMostRecentPerformance(
  variationId: string,
  sessions: readonly WorkoutSessionDetail[],
): ExercisePerformanceWithSets | null {
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    const session = sessions[i];
    if (!session || session.status !== 'completed') continue;
    const match = session.performances.find(
      (performance) => performance.variationId === variationId,
    );
    if (match && match.sets.length > 0) return match;
  }
  return null;
}
