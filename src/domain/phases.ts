import type { PhaseDefinition, PhaseId, PhaseState } from './types';

/**
 * Training phases.
 *
 * Phases advance on completed strength sessions, never on the calendar. A
 * player who trains three times a week reaches Development in about four weeks;
 * a player who takes two weeks off reaches it at exactly the same session
 * count. There is no decay and no penalty for missing sessions.
 */
export const PHASES: readonly PhaseDefinition[] = [
  {
    id: 'awakening',
    name: 'Awakening',
    order: 0,
    sessionsRequired: 0,
    purpose: 'Establish your baseline.',
    description:
      'Learn the movements, build consistency, and record honest baseline performance. Nothing here is meant to be maximal.',
  },
  {
    id: 'development',
    name: 'Development',
    order: 1,
    sessionsRequired: 12,
    purpose: 'Outperform your previous sessions.',
    description:
      'Build working capacity by beating what you recorded last time, and approach the requirements for harder variations.',
  },
  {
    id: 'ascension',
    name: 'Ascension',
    order: 2,
    sessionsRequired: 24,
    purpose: 'Move into harder variations.',
    description:
      'Progress into more demanding movements where you have met the mastery criteria — on your judgement, not automatically.',
  },
] as const;

const PHASE_BY_ID = new Map<PhaseId, PhaseDefinition>(PHASES.map((phase) => [phase.id, phase]));

export function getPhase(id: PhaseId): PhaseDefinition {
  const phase = PHASE_BY_ID.get(id);
  if (!phase) throw new Error(`Unknown phase: ${id}`);
  return phase;
}

/** The phase a player is in after completing `completedSessions` sessions. */
export function phaseForSessionCount(completedSessions: number): PhaseDefinition {
  const sessions = Math.max(0, Math.floor(completedSessions));
  let current = PHASES[0] as PhaseDefinition;
  for (const phase of PHASES) {
    if (sessions >= phase.sessionsRequired) current = phase;
  }
  return current;
}

/** Full phase read model, including progress toward the next phase. */
export function resolvePhaseState(completedSessions: number): PhaseState {
  const sessions = Math.max(0, Math.floor(completedSessions));
  const phase = phaseForSessionCount(sessions);
  const nextPhase = PHASES.find((candidate) => candidate.order === phase.order + 1) ?? null;

  const sessionsIntoPhase = sessions - phase.sessionsRequired;
  const sessionsInPhase = nextPhase ? nextPhase.sessionsRequired - phase.sessionsRequired : null;

  const progress =
    sessionsInPhase && sessionsInPhase > 0 ? Math.min(1, sessionsIntoPhase / sessionsInPhase) : 1;

  return {
    phase,
    completedSessions: sessions,
    sessionsIntoPhase,
    sessionsInPhase,
    progress,
    nextPhase,
  };
}

/** True when completing one more session moves the player into a new phase. */
export function willAdvancePhase(completedSessionsBefore: number): boolean {
  return (
    phaseForSessionCount(completedSessionsBefore + 1).id !==
    phaseForSessionCount(completedSessionsBefore).id
  );
}

/** Phases at or below `phaseId`, i.e. everything the player has reached. */
export function phasesUpTo(phaseId: PhaseId): PhaseDefinition[] {
  const target = getPhase(phaseId);
  return PHASES.filter((phase) => phase.order <= target.order);
}
