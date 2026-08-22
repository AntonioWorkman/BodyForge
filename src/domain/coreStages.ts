/**
 * Core evolution stages.
 *
 * The Core's appearance is a deterministic function of real progress, so the
 * same player state always renders the same Core. Stages are visual only — they
 * are not training phases and unlock nothing.
 *
 * Stages advance on completed sessions rather than XP so the Core reflects
 * training done, not points accumulated.
 */
export const CORE_STAGES = ['dormant', 'awakened', 'charged', 'evolved', 'ascendant'] as const;

export type CoreStage = (typeof CORE_STAGES)[number];

interface CoreStageDefinition {
  id: CoreStage;
  name: string;
  /** Completed sessions at which this stage begins. */
  sessionsRequired: number;
  /** One line the System uses to describe the Core's condition. */
  description: string;
}

export const CORE_STAGE_DEFINITIONS: readonly CoreStageDefinition[] = [
  {
    id: 'dormant',
    name: 'Dormant',
    sessionsRequired: 0,
    description: 'No training data detected. The Core is inert.',
  },
  {
    id: 'awakened',
    name: 'Awakened',
    sessionsRequired: 1,
    description: 'First signal received. The Core has begun to respond.',
  },
  {
    id: 'charged',
    name: 'Charged',
    sessionsRequired: 8,
    description: 'Sustained input. Internal energy is holding between sessions.',
  },
  {
    id: 'evolved',
    name: 'Evolved',
    sessionsRequired: 20,
    description: 'Structure has reformed around consistent training.',
  },
  {
    id: 'ascendant',
    name: 'Ascendant',
    sessionsRequired: 36,
    description: 'Fully realised. The Core moves with its own momentum.',
  },
] as const;

/** The stage for a given number of completed sessions. */
export function coreStageForSessions(completedSessions: number): CoreStageDefinition {
  const sessions = Math.max(0, Math.floor(completedSessions));
  let current = CORE_STAGE_DEFINITIONS[0] as CoreStageDefinition;
  for (const stage of CORE_STAGE_DEFINITIONS) {
    if (sessions >= stage.sessionsRequired) current = stage;
  }
  return current;
}

/** Zero-based index of a stage, used to drive geometry in the Skia renderer. */
export function coreStageIndex(stage: CoreStage): number {
  const index = CORE_STAGES.indexOf(stage);
  return index < 0 ? 0 : index;
}

/** Progress toward the next stage, 0–1. Returns 1 at the final stage. */
export function coreStageProgress(completedSessions: number): number {
  const sessions = Math.max(0, Math.floor(completedSessions));
  const current = coreStageForSessions(sessions);
  const next = CORE_STAGE_DEFINITIONS.find(
    (stage) => stage.sessionsRequired > current.sessionsRequired,
  );
  if (!next) return 1;
  const span = next.sessionsRequired - current.sessionsRequired;
  if (span <= 0) return 1;
  return Math.min(1, (sessions - current.sessionsRequired) / span);
}
