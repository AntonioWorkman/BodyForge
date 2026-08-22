import type { ActiveSessionUiState, RepositoryBundle } from '@/database/repositories/interfaces';
import type { UnitOfWork } from '@/database/unitOfWork';
import { SessionNotActiveError, WorkoutIncompleteError } from '@/domain/errors';
import {
  MASTERY_RULES,
  countQualifyingSessions,
  findIncompleteExercises,
  isQualifyingPerformance,
} from '@/domain/mastery';
import { countImprovements, findNewPersonalBests } from '@/domain/personalBests';
import { phaseForSessionCount } from '@/domain/phases';
import { advanceRotation, templateForRotation } from '@/domain/schedule';
import { estimateDurationSeconds } from '@/domain/program/templates';
import type {
  ExercisePerformance,
  ExercisePerformanceWithSets,
  PersonalBest,
  WorkoutPlan,
  WorkoutPlanEntry,
  WorkoutSessionDetail,
} from '@/domain/types';
import { calculateSessionXp } from '@/domain/xp';
import type { XpBreakdown } from '@/domain/xp';

import { createId } from './ids';

/**
 * Workout lifecycle.
 *
 * Starting, logging and completing a session all run through here. Two rules
 * are enforced at this layer:
 *
 * - Every set is written to SQLite the moment it is logged, so an interrupted
 *   workout can be resumed from disk rather than from memory.
 * - A completed session keeps its own copy of the prescription and names, so
 *   later changes to a template never rewrite recorded history.
 */

export interface QuestCompleteSummary {
  session: WorkoutSessionDetail;
  xp: XpBreakdown;
  totalXpAfter: number;
  levelBefore: number;
  levelAfter: number;
  personalBests: PersonalBest[];
  improvements: number;
  completedExercises: number;
  totalExercises: number;
  workingSets: number;
  durationSeconds: number;
  /** Variations that became eligible for progression during this session. */
  progressionsAvailable: { variationId: string; variationName: string }[];
  phaseAdvanced: boolean;
}

export class WorkoutService {
  constructor(
    private readonly repositories: RepositoryBundle,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** The plan the player would start next, built from the live templates. */
  async getNextPlan(): Promise<WorkoutPlan | null> {
    const profile = await this.repositories.player.get();
    if (!profile) return null;

    const templates = await this.repositories.catalog.listTemplates();
    const template = templateForRotation(templates, profile.nextTemplateRotationOrder);
    if (!template) return null;

    return this.buildPlan(template.id);
  }

  /** Joins a template with its exercises and variations. */
  async buildPlan(templateId: string): Promise<WorkoutPlan | null> {
    const [templates, entries, variations, exercises] = await Promise.all([
      this.repositories.catalog.listTemplates(),
      this.repositories.catalog.listTemplateExercises(templateId),
      this.repositories.catalog.listVariations(),
      this.repositories.catalog.listExercises(),
    ]);

    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return null;

    const variationsById = new Map(variations.map((variation) => [variation.id, variation]));
    const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

    const planEntries: WorkoutPlanEntry[] = [];
    for (const entry of entries) {
      const variation = variationsById.get(entry.variationId);
      if (!variation) continue;
      const exercise = exercisesById.get(variation.exerciseId);
      if (!exercise) continue;

      planEntries.push({
        templateExerciseId: entry.id,
        position: entry.position,
        exercise,
        variation,
        prescription: entry.prescription,
      });
    }

    return { template, entries: planEntries.sort((a, b) => a.position - b.position) };
  }

  /** Rough length of a plan, for the "estimated duration" line on System. */
  estimatePlanSeconds(plan: WorkoutPlan): number {
    return estimateDurationSeconds(plan.entries.map((entry) => entry.prescription));
  }

  async getActiveSession(): Promise<WorkoutSessionDetail | null> {
    return this.repositories.sessions.findActive();
  }

  /** Every completed session with its performances, oldest first. */
  async listCompletedSessions(): Promise<WorkoutSessionDetail[]> {
    return this.repositories.sessions.listCompleted();
  }

  /**
   * Completed performances of one variation, newest first. Used to show what
   * the player did last time on the exercise in front of them.
   */
  async listVariationHistory(variationId: string): Promise<ExercisePerformanceWithSets[]> {
    return this.repositories.sessions.listPerformancesForVariation(variationId);
  }

  /**
   * The most recent completed performance of each variation in the session,
   * keyed by the current session's performance id, excluding the session
   * itself.
   */
  async loadPreviousPerformances(
    session: WorkoutSessionDetail,
  ): Promise<Record<string, ExercisePerformanceWithSets | null>> {
    const byVariation = new Map<string, ExercisePerformanceWithSets | null>();

    for (const performance of session.performances) {
      if (byVariation.has(performance.variationId)) continue;
      const history = await this.listVariationHistory(performance.variationId);
      byVariation.set(
        performance.variationId,
        history.find((record) => record.sessionId !== session.id) ?? null,
      );
    }

    return Object.fromEntries(
      session.performances.map((performance) => [
        performance.id,
        byVariation.get(performance.variationId) ?? null,
      ]),
    );
  }

  /**
   * Starts a session from the given plan. If one is already active it is
   * returned unchanged — a player can only be inside one quest at a time, and
   * silently discarding the old one would lose recorded sets.
   */
  /**
   * Starts a session from the given plan.
   *
   * At most one quest may be active at a time. That is checked inside the
   * transaction — checking first and creating afterwards let two callers both
   * see no active quest and both create one — and the database enforces it
   * independently through a unique index on active sessions.
   *
   * If a quest is already active it is returned unchanged rather than replaced:
   * discarding it would lose recorded sets.
   */
  async startSession(plan: WorkoutPlan, now = new Date()): Promise<WorkoutSessionDetail> {
    const sessionId = createId('sess');

    const created = await this.unitOfWork.run(async (repos) => {
      // Re-checked here, not before the queue: a caller that waited its turn
      // must see whatever the command ahead of it committed.
      const existing = await repos.sessions.findActive();
      if (existing) return existing;

      // Read in the same boundary so the phase reflects the committed count.
      const completedCount = await repos.sessions.countCompleted();

      const performances: ExercisePerformance[] = plan.entries.map((entry, index) => ({
        id: `${sessionId}-p${index}`,
        sessionId,
        position: index,
        variationId: entry.variation.id,
        exerciseName: entry.exercise.name,
        variationName: entry.variation.name,
        measurementKind: entry.variation.measurementKind,
        prescribed: entry.prescription,
        completedAt: null,
      }));

      await repos.sessions.create({
        session: {
          id: sessionId,
          templateId: plan.template.id,
          templateName: plan.template.name,
          templateFocus: plan.template.focus,
          phaseId: phaseForSessionCount(completedCount).id,
          status: 'active',
          startedAt: now.toISOString(),
          completedAt: null,
          durationSeconds: null,
          xpAwarded: null,
          sessionNumber: null,
        },
        performances,
      });

      // The session and its UI state are one unit: a durable session without a
      // recorded position would start the player mid-quest with none.
      await repos.sessions.saveUiState({
        sessionId,
        currentPosition: 0,
        restStartedAt: null,
        restDurationSeconds: null,
        restPausedAt: null,
        restPausedTotalMs: 0,
        updatedAt: now.toISOString(),
      });

      const session = await repos.sessions.findById(sessionId);
      if (!session) throw new Error('Session could not be created');
      return session;
    });

    return created;
  }

  /** Writes one set. Called the instant the player taps Complete Set. */
  async recordSet(
    performanceId: string,
    setNumber: number,
    primaryValue: number,
    secondaryValue: number | null,
    now = new Date(),
  ): Promise<void> {
    const recorded = await this.repositories.sessions.recordSet({
      performanceId,
      setNumber,
      primaryValue: Math.max(0, Math.round(primaryValue)),
      secondaryValue: secondaryValue === null ? null : Math.max(0, Math.round(secondaryValue)),
      completedAt: now.toISOString(),
    });

    // Refused when the exercise does not belong to the active quest. Silently
    // doing nothing would look to the player like the set was logged.
    if (!recorded) {
      throw new SessionNotActiveError(performanceId, 'not active');
    }
  }

  async undoSet(performanceId: string, setNumber: number): Promise<void> {
    await this.repositories.sessions.removeSet(performanceId, setNumber);
    await this.repositories.sessions.markPerformanceCompleted(performanceId, null);
  }

  async markExerciseComplete(performanceId: string, now = new Date()): Promise<void> {
    await this.repositories.sessions.markPerformanceCompleted(performanceId, now.toISOString());
  }

  /** Persists which exercise is on screen and the rest timer's anchor. */
  async saveUiState(state: ActiveSessionUiState): Promise<void> {
    await this.repositories.sessions.saveUiState(state);
  }

  async getUiState(sessionId: string): Promise<ActiveSessionUiState | null> {
    return this.repositories.sessions.getUiState(sessionId);
  }

  /**
   * Abandons the active session, keeping the sets that were logged.
   *
   * Its UI state goes with it: an abandoned quest is never resumable, so the
   * row would only be able to mislead a later resume. Returns false if the
   * session was not active — a completed one is never reclassified.
   */
  async abandonSession(sessionId: string): Promise<boolean> {
    return this.unitOfWork.run(async (repos) => {
      const abandoned = await repos.sessions.abandon(sessionId);
      if (abandoned) await repos.sessions.clearUiState(sessionId);
      return abandoned;
    });
  }

  /**
   * Discards a session entirely, including its recorded sets and UI state.
   *
   * Refuses a completed session: recorded history is not discardable through an
   * active-quest command.
   */
  async discardSession(sessionId: string): Promise<boolean> {
    return this.repositories.sessions.deleteSession(sessionId);
  }

  /**
   * Completes the active session: awards XP, records personal bests, updates
   * mastery counts, and advances the workout rotation.
   *
   * Progression bonuses are not awarded here. Becoming eligible is not the same
   * as progressing — the player confirms that separately, and the bonus is paid
   * at confirmation so it cannot be earned twice.
   */
  /**
   * Completes the active session: awards XP, records personal bests, updates
   * mastery counts, and advances the workout rotation.
   *
   * Two rules govern this command.
   *
   * **It is refused unless the quest is actually finished.** Completing a
   * session with sets outstanding would award quest XP and move rotation,
   * phase and Core progression on training that never happened — and the UI's
   * navigation is not the place to enforce that, since a caller can reach this
   * directly. Nothing is mutated when it is refused.
   *
   * **Every write happens in one transaction.** Marking the session complete,
   * awarding XP, advancing the rotation and refreshing mastery are one logical
   * act; a failure partway through used to leave the session permanently
   * completed with the rest stale, and unretryable.
   *
   * Progression bonuses are not awarded here. Becoming eligible is not the same
   * as progressing — the player confirms that separately, and the bonus is paid
   * at confirmation so it cannot be earned twice.
   */
  async completeSession(sessionId: string, now = new Date()): Promise<QuestCompleteSummary> {
    // Everything authoritative is read inside the transaction, so preconditions
    // and the mutation share one consistency boundary. Reading first and
    // writing afterwards let two callers both see an active session and both
    // commit — double XP, a rotation advanced twice, mastery refreshed twice.
    return this.unitOfWork.run(async (repos) => {
      const session = await repos.sessions.findById(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      if (session.status !== 'active') {
        throw new SessionNotActiveError(sessionId, session.status);
      }

      const incomplete = findIncompleteExercises(session.performances);
      if (incomplete.length > 0 || session.performances.length === 0) {
        throw new WorkoutIncompleteError(incomplete);
      }

      const [profile, priorSessions, templates] = await Promise.all([
        repos.player.get(),
        repos.sessions.listCompleted(),
        repos.catalog.listTemplates(),
      ]);
      if (!profile) throw new Error('No player profile');

      const completedAt = now.toISOString();
      const durationSeconds = Math.max(
        0,
        Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000),
      );

      const finished: WorkoutSessionDetail = {
        ...session,
        status: 'completed',
        completedAt,
        durationSeconds,
      };

      const personalBests = findNewPersonalBests(finished, priorSessions);
      const improvements = countImprovements(finished, priorSessions);

      const xp = calculateSessionXp({
        performances: session.performances,
        sessionCompleted: true,
        personalBests,
        progressionsUnlocked: 0,
      });

      // Derived from the transactional read, not from a count taken earlier.
      const sessionNumber = priorSessions.length + 1;

      // The transition itself is the guard: if the row is no longer active,
      // nothing downstream runs and the transaction commits no changes.
      const transitioned = await repos.sessions.complete({
        sessionId,
        completedAt,
        durationSeconds,
        xpAwarded: xp.total,
        sessionNumber,
      });
      if (!transitioned) {
        throw new SessionNotActiveError(sessionId, 'completed');
      }

      const totalXpAfter = await repos.player.addXp(xp.total);

      await repos.player.update({
        nextTemplateRotationOrder: advanceRotation(
          profile.nextTemplateRotationOrder,
          Math.max(1, templates.length),
        ),
      });

      // The quest is finished, so its transient UI state has nothing left to
      // describe. Removed inside the transaction: if completion rolls back, the
      // resume state must survive with it.
      await repos.sessions.clearUiState(sessionId);

      const progressionsAvailable = await this.refreshMasteryCounts(repos, session.performances);

      return {
        session: { ...finished, xpAwarded: xp.total, sessionNumber },
        xp,
        totalXpAfter,
        levelBefore: profile.totalXp,
        levelAfter: totalXpAfter,
        personalBests,
        improvements,
        completedExercises: xp.completedExercises,
        totalExercises: session.performances.length,
        workingSets: xp.countedSets,
        durationSeconds,
        progressionsAvailable,
        phaseAdvanced:
          phaseForSessionCount(sessionNumber).id !== phaseForSessionCount(sessionNumber - 1).id,
      };
    });
  }

  /**
   * Recounts qualifying sessions for each variation trained, from recorded
   * history rather than from an incrementing counter, so the count is always
   * consistent with what is actually stored.
   */
  private async refreshMasteryCounts(
    repos: RepositoryBundle,
    performances: readonly ExercisePerformanceWithSets[],
  ): Promise<{ variationId: string; variationName: string }[]> {
    const newlyEligible: { variationId: string; variationName: string }[] = [];
    const seen = new Set<string>();

    for (const performance of performances) {
      if (seen.has(performance.variationId)) continue;
      seen.add(performance.variationId);

      const history = await repos.sessions.listPerformancesForVariation(performance.variationId);
      const qualifying = countQualifyingSessions(history);

      const state = await repos.progression.get(performance.variationId);
      if (!state) continue;

      const required = MASTERY_RULES.qualifyingSessionsRequired;
      const wasEligible = state.qualifyingSessions >= required;
      await repos.progression.setQualifyingSessions(performance.variationId, qualifying);

      if (
        !wasEligible &&
        qualifying >= required &&
        state.status === 'current' &&
        isQualifyingPerformance(performance)
      ) {
        newlyEligible.push({
          variationId: performance.variationId,
          variationName: performance.variationName,
        });
      }
    }

    return newlyEligible;
  }
}
