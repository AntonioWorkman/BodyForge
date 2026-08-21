import { effectiveSetValue } from './mastery';
import type {
  AttributeContribution,
  AttributeId,
  AttributeValue,
  ExercisePerformanceWithSets,
  ExerciseVariation,
  ProgressionState,
  WorkoutSessionDetail,
} from './types';

/**
 * Attributes.
 *
 * Every number here is derived from something the player actually recorded.
 * There is no jump height, no squat-depth score, no estimate of anything the
 * phone cannot observe. Each attribute exposes the contributions that produced
 * it so the breakdown screen can name the real sessions behind the value.
 *
 * These are System scores, not physiological measurements — the `basis` string
 * on each attribute says so in the UI.
 */
export const ATTRIBUTE_RULES = {
  /** Weeks of history the Consistency score is measured over. */
  consistencyWindowWeeks: 4,
  /** Points per second of isometric hold, before rounding. */
  endurancePointsPerHoldSecond: 0.2,
  /** Points available for holding performance on final sets. */
  enduranceRetentionPoints: 30,
  /** Points per variation the player has progressed past. */
  masteryPointsPerMastered: 10,
  /** Points per variation currently qualified and awaiting confirmation. */
  masteryPointsPerReady: 3,
  /** Sessions considered "recent" when scoring current strength. */
  strengthRecentSessions: 6,
} as const;

export interface AttributeInput {
  /** Completed sessions only, ascending by completion time. */
  sessions: readonly WorkoutSessionDetail[];
  progressionStates: readonly ProgressionState[];
  variationsById: ReadonlyMap<string, ExerciseVariation>;
  sessionsPerWeekTarget: number;
  now: Date;
}

const ATTRIBUTE_META: Record<AttributeId, { name: string; basis: string }> = {
  strength: {
    name: 'Strength',
    basis:
      'Derived from the difficulty of the variations you train and how you perform against their prescribed range. Not a measure of force output.',
  },
  endurance: {
    name: 'Endurance',
    basis:
      'Derived from recorded isometric holds and how well you hold performance on your final sets. Not a cardiovascular measurement.',
  },
  consistency: {
    name: 'Consistency',
    basis: `Completed sessions over the last ${ATTRIBUTE_RULES.consistencyWindowWeeks} weeks against your target cadence. Missing a session lowers nothing else.`,
  },
  mastery: {
    name: 'Mastery',
    basis:
      'Variations you have confirmed progression past, plus those currently qualified. Confirmed by you, never assumed by the app.',
  },
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** All performances across the given sessions, newest session first. */
function performancesByVariation(
  sessions: readonly WorkoutSessionDetail[],
): Map<string, { performance: ExercisePerformanceWithSets; session: WorkoutSessionDetail }[]> {
  const map = new Map<
    string,
    { performance: ExercisePerformanceWithSets; session: WorkoutSessionDetail }[]
  >();
  for (const session of [...sessions].reverse()) {
    for (const performance of session.performances) {
      const list = map.get(performance.variationId) ?? [];
      list.push({ performance, session });
      map.set(performance.variationId, list);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

function computeStrength(input: AttributeInput): {
  value: number;
  contributions: AttributeContribution[];
} {
  const contributions: AttributeContribution[] = [];
  const recent = input.sessions.slice(-ATTRIBUTE_RULES.strengthRecentSessions);
  const byVariation = performancesByVariation(recent);

  let total = 0;

  // Difficulty already banked: everything the player has progressed past.
  for (const state of input.progressionStates) {
    if (state.status !== 'mastered') continue;
    const variation = input.variationsById.get(state.variationId);
    if (!variation) continue;
    const points = variation.difficultyScore;
    total += points;
    contributions.push({
      label: variation.name,
      detail: `Progressed past${state.masteredAt ? ` on ${formatDate(state.masteredAt)}` : ''}`,
      points,
    });
  }

  // Current work, scored by how close recent performance is to the top of range.
  for (const [variationId, entries] of byVariation) {
    const variation = input.variationsById.get(variationId);
    if (!variation) continue;

    const state = input.progressionStates.find((s) => s.variationId === variationId);
    if (state?.status === 'mastered') continue;

    let bestValue = 0;
    let bestTarget = 0;
    let bestOn: string | null = null;

    for (const { performance, session } of entries) {
      for (const set of performance.sets) {
        const value = effectiveSetValue(set);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = performance.prescribed.targetMax;
          bestOn = session.completedAt;
        }
      }
    }

    if (bestValue <= 0 || bestTarget <= 0) continue;

    const achievement = clamp01(bestValue / bestTarget);
    const points = Math.round(variation.difficultyScore * achievement * 10) / 10;
    if (points <= 0) continue;

    total += points;
    const unit =
      variation.measurementKind === 'time'
        ? 's'
        : variation.measurementKind === 'reps-per-side'
          ? ' / side'
          : '';
    contributions.push({
      label: variation.name,
      detail: `Best set ${bestValue}${unit} against a ${bestTarget}${unit} target${
        bestOn ? ` · ${formatDate(bestOn)}` : ''
      }`,
      points,
    });
  }

  return {
    value: Math.round(total),
    contributions: contributions.sort((a, b) => b.points - a.points),
  };
}

// ---------------------------------------------------------------------------
// Endurance
// ---------------------------------------------------------------------------

function computeEndurance(input: AttributeInput): {
  value: number;
  contributions: AttributeContribution[];
} {
  const contributions: AttributeContribution[] = [];
  const recent = input.sessions.slice(-ATTRIBUTE_RULES.strengthRecentSessions);
  const byVariation = performancesByVariation(recent);

  let total = 0;

  // Isometric holds: real recorded seconds.
  for (const [variationId, entries] of byVariation) {
    const variation = input.variationsById.get(variationId);
    if (!variation || variation.measurementKind !== 'time') continue;

    let bestTotalSeconds = 0;
    let bestSetCount = 0;
    let bestOn: string | null = null;

    for (const { performance, session } of entries) {
      const seconds = performance.sets.reduce((sum, set) => sum + effectiveSetValue(set), 0);
      if (seconds > bestTotalSeconds) {
        bestTotalSeconds = seconds;
        bestSetCount = performance.sets.length;
        bestOn = session.completedAt;
      }
    }

    if (bestTotalSeconds <= 0) continue;
    const points =
      Math.round(bestTotalSeconds * ATTRIBUTE_RULES.endurancePointsPerHoldSecond * 10) / 10;
    total += points;
    contributions.push({
      label: variation.name,
      detail: `${bestSetCount} sets totalling ${bestTotalSeconds}s${bestOn ? ` · ${formatDate(bestOn)}` : ''}`,
      points,
    });
  }

  // Final-set retention: how much of the prescribed range survives to the end.
  const retentions: number[] = [];
  let exerciseCount = 0;
  for (const session of recent) {
    for (const performance of session.performances) {
      const { prescribed, sets } = performance;
      if (sets.length === 0) continue;
      const span = prescribed.targetMax - prescribed.targetMin;
      const lastSet = [...sets].sort((a, b) => a.setNumber - b.setNumber)[sets.length - 1];
      if (!lastSet) continue;
      const value = effectiveSetValue(lastSet);
      const retention =
        span > 0 ? clamp01((value - prescribed.targetMin) / span) : value > 0 ? 1 : 0;
      retentions.push(retention);
      exerciseCount += 1;
    }
  }

  if (retentions.length > 0) {
    const mean = retentions.reduce((sum, r) => sum + r, 0) / retentions.length;
    const points = Math.round(mean * ATTRIBUTE_RULES.enduranceRetentionPoints * 10) / 10;
    total += points;
    contributions.push({
      label: 'Final-set performance',
      detail: `Held ${Math.round(mean * 100)}% of the prescribed range on final sets across ${exerciseCount} recorded ${
        exerciseCount === 1 ? 'exercise' : 'exercises'
      }`,
      points,
    });
  }

  return {
    value: Math.round(total),
    contributions: contributions.sort((a, b) => b.points - a.points),
  };
}

// ---------------------------------------------------------------------------
// Consistency
// ---------------------------------------------------------------------------

function computeConsistency(input: AttributeInput): {
  value: number;
  contributions: AttributeContribution[];
} {
  const windowMs = ATTRIBUTE_RULES.consistencyWindowWeeks * 7 * 24 * 3_600_000;
  const cutoff = input.now.getTime() - windowMs;

  const inWindow = input.sessions.filter((session) => {
    if (!session.completedAt) return false;
    const time = new Date(session.completedAt).getTime();
    return !Number.isNaN(time) && time >= cutoff && time <= input.now.getTime();
  });

  const firstSession = input.sessions[0];
  const firstTime = firstSession?.completedAt ? new Date(firstSession.completedAt).getTime() : null;

  // Players with a short history are measured against the weeks they have
  // actually been training, not against four weeks of assumed absence.
  const elapsedWeeks =
    firstTime !== null
      ? Math.min(
          ATTRIBUTE_RULES.consistencyWindowWeeks,
          Math.max(1, (input.now.getTime() - Math.max(firstTime, cutoff)) / (7 * 24 * 3_600_000)),
        )
      : 0;

  if (elapsedWeeks === 0) {
    return { value: 0, contributions: [] };
  }

  const target = Math.max(1, input.sessionsPerWeekTarget) * elapsedWeeks;
  const ratio = clamp01(inWindow.length / target);
  const value = Math.round(ratio * 100);

  return {
    value,
    contributions: [
      {
        label: 'Sessions completed',
        detail: `${inWindow.length} completed in the last ${
          Math.round(elapsedWeeks * 10) / 10
        } ${elapsedWeeks === 1 ? 'week' : 'weeks'} against a target of ${
          Math.round(target * 10) / 10
        }`,
        points: value,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mastery
// ---------------------------------------------------------------------------

function computeMastery(input: AttributeInput): {
  value: number;
  contributions: AttributeContribution[];
} {
  const contributions: AttributeContribution[] = [];
  let total = 0;

  for (const state of input.progressionStates) {
    const variation = input.variationsById.get(state.variationId);
    if (!variation) continue;

    if (state.status === 'mastered') {
      total += ATTRIBUTE_RULES.masteryPointsPerMastered;
      contributions.push({
        label: variation.name,
        detail: `Progression confirmed${state.masteredAt ? ` on ${formatDate(state.masteredAt)}` : ''}`,
        points: ATTRIBUTE_RULES.masteryPointsPerMastered,
      });
    } else if (state.status === 'ready') {
      total += ATTRIBUTE_RULES.masteryPointsPerReady;
      contributions.push({
        label: variation.name,
        detail: `${state.qualifyingSessions} qualifying sessions · ready to progress`,
        points: ATTRIBUTE_RULES.masteryPointsPerReady,
      });
    }
  }

  return { value: total, contributions: contributions.sort((a, b) => b.points - a.points) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const COMPUTERS: Record<
  AttributeId,
  (input: AttributeInput) => { value: number; contributions: AttributeContribution[] }
> = {
  strength: computeStrength,
  endurance: computeEndurance,
  consistency: computeConsistency,
  mastery: computeMastery,
};

export const ATTRIBUTE_IDS: readonly AttributeId[] = [
  'strength',
  'endurance',
  'consistency',
  'mastery',
];

/**
 * Computes all four attributes. `delta` is the change attributable to the most
 * recent completed session: the same calculation run without that session,
 * subtracted from the full result. That makes "recent change" literal rather
 * than an invented trend.
 */
export function computeAttributes(input: AttributeInput): AttributeValue[] {
  const previousInput: AttributeInput = { ...input, sessions: input.sessions.slice(0, -1) };

  return ATTRIBUTE_IDS.map((id) => {
    const compute = COMPUTERS[id];
    const current = compute(input);
    const previous = input.sessions.length > 0 ? compute(previousInput) : { value: 0 };
    const meta = ATTRIBUTE_META[id];

    return {
      id,
      name: meta.name,
      value: current.value,
      delta: current.value - previous.value,
      contributions: current.contributions,
      basis: meta.basis,
    };
  });
}
