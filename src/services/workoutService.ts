import type { ActiveSessionUiState, RepositoryBundle } from '@/database/repositories/interfaces';
import { MASTERY_RULES, countQualifyingSessions, isQualifyingPerformance } from '@/domain/mastery';
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
  constructor(private readonly repositories: RepositoryBundle) {}

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
  async startSession(plan: WorkoutPlan, now = new Date()): Promise<WorkoutSessionDetail> {
    const existing = await this.repositories.sessions.findActive();
    if (existing) return existing;

    const completedCount = await this.repositories.sessions.countCompleted();
    const sessionId = createId('sess');

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

    await this.repositories.sessions.create({
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

    await this.repositories.sessions.saveUiState({
      sessionId,
      currentPosition: 0,
      restStartedAt: null,
      restDurationSeconds: null,
      restPausedAt: null,
      restPausedTotalMs: 0,
      updatedAt: now.toISOString(),
    });

    const created = await this.repositories.sessions.findById(sessionId);
    if (!created) throw new Error('Session could not be created');
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
    await this.repositories.sessions.recordSet({
      performanceId,
      setNumber,
      primaryValue: Math.max(0, Math.round(primaryValue)),
      secondaryValue: secondaryValue === null ? null : Math.max(0, Math.round(secondaryValue)),
      completedAt: now.toISOString(),
    });
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

  /** Abandons an active session, keeping the sets that were logged. */
  async abandonSession(sessionId: string): Promise<void> {
    await this.repositories.sessions.setStatus(sessionId, 'abandoned');
  }

  /** Discards an active session entirely, including its recorded sets. */
  async discardSession(sessionId: string): Promise<void> {
    await this.repositories.sessions.deleteSession(sessionId);
  }

  /**
   * Completes the active session: awards XP, records personal bests, updates
   * mastery counts, and advances the workout rotation.
   *
   * Progression bonuses are not awarded here. Becoming eligible is not the same
   * as progressing — the player confirms that separately, and the bonus is paid
   * at confirmation so it cannot be earned twice.
   */
  async completeSession(sessionId: string, now = new Date()): Promise<QuestCompleteSummary> {
    const session = await this.repositories.sessions.findById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status === 'completed') {
      throw new Error('Session has already been completed');
    }

    const [profile, priorSessions, templates] = await Promise.all([
      this.repositories.player.get(),
      this.repositories.sessions.listCompleted(),
      this.repositories.catalog.listTemplates(),
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

    const sessionNumber = priorSessions.length + 1;

    await this.repositories.sessions.complete({
      sessionId,
      completedAt,
      durationSeconds,
      xpAwarded: xp.total,
      sessionNumber,
    });

    const totalXpAfter = await this.repositories.player.addXp(xp.total);
    await this.repositories.player.update({
      nextTemplateRotationOrder: advanceRotation(
        profile.nextTemplateRotationOrder,
        Math.max(1, templates.length),
      ),
    });

    const progressionsAvailable = await this.refreshMasteryCounts(session.performances);

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
  }

  /**
   * Recounts qualifying sessions for each variation trained, from recorded
   * history rather than from an incrementing counter, so the count is always
   * consistent with what is actually stored.
   */
  private async refreshMasteryCounts(
    performances: readonly ExercisePerformanceWithSets[],
  ): Promise<{ variationId: string; variationName: string }[]> {
    const newlyEligible: { variationId: string; variationName: string }[] = [];
    const seen = new Set<string>();

    for (const performance of performances) {
      if (seen.has(performance.variationId)) continue;
      seen.add(performance.variationId);

      const history = await this.repositories.sessions.listPerformancesForVariation(
        performance.variationId,
      );
      const qualifying = countQualifyingSessions(history);

      const state = await this.repositories.progression.get(performance.variationId);
      if (!state) continue;

      const required = MASTERY_RULES.qualifyingSessionsRequired;
      const wasEligible = state.qualifyingSessions >= required;
      await this.repositories.progression.setQualifyingSessions(
        performance.variationId,
        qualifying,
      );

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
