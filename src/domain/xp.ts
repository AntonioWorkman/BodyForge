import type { ExercisePerformanceWithSets, PersonalBest, Prescription } from './types';

/**
 * XP rules.
 *
 * XP exists to reinforce showing up and executing the prescription — not
 * volume. Three deliberate constraints follow from that:
 *
 * - Only prescribed sets earn set XP. Extra sets earn nothing.
 * - Reps beyond the top of the prescribed range earn nothing.
 * - There is no XP anywhere outside completing real training.
 *
 * All values are collected here so the economy can be rebalanced in one edit.
 */
export const XP_RULES = {
  /** Per prescribed working set actually completed. */
  perWorkingSet: 10,
  /** Per exercise where every prescribed set was completed. */
  perExerciseCompleted: 15,
  /** Awarded once for finishing a session. */
  workoutCompletionBonus: 30,
  /** Awarded per confirmed progression to a harder variation. */
  progressionBonus: 100,
  /** Awarded per new personal best set in the session. */
  personalBestBonus: 25,
  /** Ceiling on personal-best bonuses per session, so one session cannot farm. */
  maxPersonalBestsPerSession: 3,
} as const;

export interface XpLineItem {
  id: string;
  label: string;
  detail: string;
  xp: number;
}

export interface XpBreakdown {
  lineItems: XpLineItem[];
  total: number;
  /** Prescribed sets actually completed, after clamping. */
  countedSets: number;
  /** Exercises where every prescribed set was completed. */
  completedExercises: number;
}

export interface XpAwardInput {
  performances: ExercisePerformanceWithSets[];
  /** Whether the session reached the end rather than being abandoned. */
  sessionCompleted: boolean;
  /** New personal bests recorded in this session. */
  personalBests: PersonalBest[];
  /** Variations the player confirmed progression on as part of this session. */
  progressionsUnlocked: number;
}

/** Sets that count toward XP: completed, but never more than prescribed. */
export function countedSetsFor(prescribed: Prescription, completedSetCount: number): number {
  return Math.max(0, Math.min(prescribed.sets, completedSetCount));
}

/** True when every prescribed set of the exercise was recorded. */
export function isExerciseCompleted(performance: ExercisePerformanceWithSets): boolean {
  return performance.sets.length >= performance.prescribed.sets;
}

/**
 * Computes the XP for a session, with a line-item breakdown the Quest Complete
 * screen can display verbatim. Pure — no clock, no storage, no randomness.
 */
export function calculateSessionXp(input: XpAwardInput): XpBreakdown {
  const lineItems: XpLineItem[] = [];

  let countedSets = 0;
  let completedExercises = 0;

  for (const performance of input.performances) {
    countedSets += countedSetsFor(performance.prescribed, performance.sets.length);
    if (isExerciseCompleted(performance)) completedExercises += 1;
  }

  if (countedSets > 0) {
    lineItems.push({
      id: 'working-sets',
      label: 'Working sets',
      detail: `${countedSets} prescribed ${countedSets === 1 ? 'set' : 'sets'} completed`,
      xp: countedSets * XP_RULES.perWorkingSet,
    });
  }

  if (completedExercises > 0) {
    lineItems.push({
      id: 'exercises',
      label: 'Exercises completed',
      detail: `${completedExercises} of ${input.performances.length} fully completed`,
      xp: completedExercises * XP_RULES.perExerciseCompleted,
    });
  }

  if (input.sessionCompleted) {
    lineItems.push({
      id: 'completion',
      label: 'Quest completed',
      detail: 'Session finished',
      xp: XP_RULES.workoutCompletionBonus,
    });
  }

  const countedBests = Math.min(input.personalBests.length, XP_RULES.maxPersonalBestsPerSession);
  if (countedBests > 0) {
    lineItems.push({
      id: 'personal-bests',
      label: countedBests === 1 ? 'Personal best' : 'Personal bests',
      detail: input.personalBests
        .slice(0, countedBests)
        .map((best) => best.variationName)
        .join(', '),
      xp: countedBests * XP_RULES.personalBestBonus,
    });
  }

  if (input.progressionsUnlocked > 0) {
    lineItems.push({
      id: 'progressions',
      label: 'Progression unlocked',
      detail: `${input.progressionsUnlocked} new ${
        input.progressionsUnlocked === 1 ? 'variation' : 'variations'
      }`,
      xp: input.progressionsUnlocked * XP_RULES.progressionBonus,
    });
  }

  const total = lineItems.reduce((sum, item) => sum + item.xp, 0);

  return { lineItems, total, countedSets, completedExercises };
}

/**
 * XP a fully completed plan would award with no bonuses. Used to show the
 * player what a session is worth before they start it.
 */
export function projectedXpForPlan(prescriptions: Prescription[]): number {
  const sets = prescriptions.reduce((sum, p) => sum + p.sets, 0);
  return (
    sets * XP_RULES.perWorkingSet +
    prescriptions.length * XP_RULES.perExerciseCompleted +
    XP_RULES.workoutCompletionBonus
  );
}
