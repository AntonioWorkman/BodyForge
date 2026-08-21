import type { PhaseId } from './types';

/**
 * Domain errors.
 *
 * These represent rules the application refuses to break, not failures. They
 * are thrown by services so a caller — the UI, or another service — can react
 * to the specific reason rather than parsing a message.
 */

/** One exercise that still owes sets, for telling the player what remains. */
export interface IncompleteExercise {
  /** Position within the session, zero-based. */
  position: number;
  variationName: string;
  setsCompleted: number;
  setsPrescribed: number;
}

/**
 * A session cannot be completed while prescribed sets are missing. Completing
 * it would award quest XP, advance the rotation and move phase and Core
 * progression on work that was never done.
 */
export class WorkoutIncompleteError extends Error {
  override readonly name = 'WorkoutIncompleteError';

  constructor(readonly incomplete: IncompleteExercise[]) {
    super(
      `This quest still has ${incomplete.length} ${
        incomplete.length === 1 ? 'exercise' : 'exercises'
      } with sets remaining.`,
    );
  }

  /** The exercise the player should be returned to. */
  get firstIncompletePosition(): number {
    return this.incomplete[0]?.position ?? 0;
  }
}

/**
 * The next variation is not reachable in the player's current phase. Mastery
 * criteria may well be satisfied — this is about the training phase gate, not
 * about performance.
 */
export class ProgressionPhaseLockedError extends Error {
  override readonly name = 'ProgressionPhaseLockedError';

  constructor(
    readonly variationName: string,
    readonly requiredPhase: PhaseId,
    readonly currentPhase: PhaseId,
  ) {
    super(`${variationName} is not available until the ${requiredPhase} phase.`);
  }
}

/** The variation has not met the criteria to be progressed past. */
export class ProgressionNotReadyError extends Error {
  override readonly name = 'ProgressionNotReadyError';

  constructor(readonly variationId: string) {
    super('This variation is not ready to progress.');
  }
}

/**
 * The session is not in a state that can be completed — already completed,
 * abandoned, or completed by a concurrent caller between read and write.
 */
export class SessionNotActiveError extends Error {
  override readonly name = 'SessionNotActiveError';

  constructor(
    readonly sessionId: string,
    readonly status: string,
  ) {
    super(`This quest is no longer active (${status}).`);
  }
}
