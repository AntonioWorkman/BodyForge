import type {
  ExercisePerformanceWithSets,
  ExerciseVariation,
  ProgressionState,
  ProgressionStatus,
  SetPerformance,
} from './types';

/**
 * Mastery and progression.
 *
 * The app cannot see the player's form, so it never decides on its own that a
 * harder movement is safe. What it can do is notice that the prescription has
 * stopped being challenging, say so, show the technique standard for the next
 * variation, and let the player confirm. That confirmation is the unlock.
 */
export const MASTERY_RULES = {
  /**
   * Sessions in which every prescribed set reached the top of the range before
   * the variation is marked ready to progress.
   */
  qualifyingSessionsRequired: 2,
} as const;

/** The value that counts for a set: the weaker side, for unilateral work. */
export function effectiveSetValue(set: SetPerformance): number {
  if (set.secondaryValue === null) return set.primaryValue;
  return Math.min(set.primaryValue, set.secondaryValue);
}

/** The best value in a set — used for personal bests, where the peak matters. */
export function peakSetValue(set: SetPerformance): number {
  if (set.secondaryValue === null) return set.primaryValue;
  return Math.max(set.primaryValue, set.secondaryValue);
}

/**
 * Whether a single recorded exercise qualifies as a mastery session: every
 * prescribed set was completed and every one reached the top of the range. For
 * unilateral work both sides must reach it — the weaker side is what counts.
 */
export function isQualifyingPerformance(performance: ExercisePerformanceWithSets): boolean {
  const { prescribed, sets } = performance;
  if (sets.length < prescribed.sets) return false;

  const working = [...sets].sort((a, b) => a.setNumber - b.setNumber).slice(0, prescribed.sets);
  if (working.length < prescribed.sets) return false;

  return working.every((set) => effectiveSetValue(set) >= prescribed.targetMax);
}

/** Counts qualifying sessions across a variation's recorded history. */
export function countQualifyingSessions(
  performances: readonly ExercisePerformanceWithSets[],
): number {
  const qualifyingSessionIds = new Set<string>();
  for (const performance of performances) {
    if (isQualifyingPerformance(performance)) qualifyingSessionIds.add(performance.sessionId);
  }
  return qualifyingSessionIds.size;
}

/** Whether the variation has met the criteria to be offered as progressable. */
export function meetsProgressionCriteria(qualifyingSessions: number): boolean {
  return qualifyingSessions >= MASTERY_RULES.qualifyingSessionsRequired;
}

/** How close the player is to the criteria, 0–1, for a progress indicator. */
export function masteryProgress(qualifyingSessions: number): number {
  return Math.min(1, qualifyingSessions / MASTERY_RULES.qualifyingSessionsRequired);
}

/**
 * The status a variation should display, given its stored state and whether it
 * meets the criteria. `ready` is derived rather than stored so the moment the
 * criteria are met — or stop being met after data changes — the UI agrees.
 */
export function deriveStatus(state: ProgressionState): ProgressionStatus {
  if (state.status === 'mastered') return 'mastered';
  if (state.status === 'locked') return 'locked';
  if (state.status === 'current' && meetsProgressionCriteria(state.qualifyingSessions)) {
    return 'ready';
  }
  return state.status;
}

export interface ProgressionOffer {
  /** The variation the player has qualified on. */
  from: ExerciseVariation;
  /** The variation that would become current. */
  to: ExerciseVariation;
  /** Technique standard the player is asked to confirm. */
  formRequirements: string[];
  qualifyingSessions: number;
}

/**
 * Builds the progression offer for a variation, or null when the player has
 * not qualified or there is nothing harder in the chain.
 */
export function buildProgressionOffer(
  current: ExerciseVariation,
  state: ProgressionState,
  chainVariations: readonly ExerciseVariation[],
): ProgressionOffer | null {
  if (!meetsProgressionCriteria(state.qualifyingSessions)) return null;
  if (state.status === 'mastered') return null;

  const next = chainVariations
    .filter((variation) => variation.tier > current.tier)
    .sort((a, b) => a.tier - b.tier)[0];

  if (!next) return null;

  return {
    from: current,
    to: next,
    formRequirements: next.formRequirements,
    qualifyingSessions: state.qualifyingSessions,
  };
}
