/**
 * @jest-environment node
 */
import { createRepositories } from '@/database/repositories/sqlite';
import { createUnitOfWork } from '@/database/unitOfWork';
import { SessionNotActiveError } from '@/domain/errors';
import { WorkoutService } from '@/services/workoutService';
import { failOnStatement } from '@/testing/faultInjection';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * The session state machine, enforced below the UI.
 *
 * These repository and service methods are reachable without going through a
 * screen, so the rules live in the statements themselves:
 *
 * - **active** — recorded work and UI state may change.
 * - **completed** — immutable history; no sets, no UI state, not discardable,
 *   not reclassifiable.
 * - **abandoned** — never resumable, so no UI state and no further writes.
 */
describe('session lifecycle', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  const uiStateRows = async (sessionId: string) =>
    harness.db.getAllAsync<{ session_id: string }>(
      'SELECT session_id FROM active_session_state WHERE session_id = ?',
      [sessionId],
    );

  async function startAndFill() {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(plan!);
    for (const performance of session.performances) {
      const perSide = performance.measurementKind === 'reps-per-side';
      const value = performance.prescribed.targetMin;
      for (let n = 1; n <= performance.prescribed.sets; n += 1) {
        await harness.workouts.recordSet(performance.id, n, value, perSide ? value : null);
      }
    }
    return session;
  }

  describe('completion', () => {
    it('removes the transient UI state', async () => {
      const session = await startAndFill();
      expect(await uiStateRows(session.id)).toHaveLength(1);

      await harness.workouts.completeSession(session.id);

      expect(await uiStateRows(session.id)).toHaveLength(0);
      expect(await harness.workouts.getUiState(session.id)).toBeNull();
    });

    it('keeps the UI state when completion rolls back', async () => {
      const session = await startAndFill();

      const injector = failOnStatement(harness.db, 'total_xp = MAX(0, total_xp + ?)');
      const failing = new WorkoutService(
        createRepositories(injector.db),
        createUnitOfWork(injector.db),
      );
      await expect(failing.completeSession(session.id)).rejects.toThrow('injected failure');

      // The quest is still resumable, so its position must survive with it.
      expect(await uiStateRows(session.id)).toHaveLength(1);
      expect((await harness.repositories.sessions.findById(session.id))?.status).toBe('active');
    });

    it('rolls the whole completion back if clearing UI state fails', async () => {
      const session = await startAndFill();

      const injector = failOnStatement(harness.db, 'DELETE FROM active_session_state');
      const failing = new WorkoutService(
        createRepositories(injector.db),
        createUnitOfWork(injector.db),
      );
      await expect(failing.completeSession(session.id)).rejects.toThrow('injected failure');

      expect((await harness.repositories.sessions.findById(session.id))?.status).toBe('active');
      expect((await harness.repositories.player.get())?.totalXp).toBe(0);
      expect(await uiStateRows(session.id)).toHaveLength(1);
    });
  });

  describe('completed history is immutable', () => {
    it('refuses new sets', async () => {
      const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
      const performance = summary.session.performances[0]!;
      const before = await harness.repositories.sessions.findById(summary.session.id);

      await expect(harness.workouts.recordSet(performance.id, 1, 99, 99)).rejects.toBeInstanceOf(
        SessionNotActiveError,
      );

      expect(await harness.repositories.sessions.findById(summary.session.id)).toEqual(before);
    });

    it('refuses set removal', async () => {
      const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
      const performance = summary.session.performances[0]!;

      expect(await harness.repositories.sessions.removeSet(performance.id, 1)).toBe(false);
      const stored = await harness.repositories.sessions.findById(summary.session.id);
      expect(stored?.performances[0]?.sets).toHaveLength(3);
    });

    it('refuses to be marked complete again or reclassified', async () => {
      const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

      expect(await harness.repositories.sessions.abandon(summary.session.id)).toBe(false);
      expect((await harness.repositories.sessions.findById(summary.session.id))?.status).toBe(
        'completed',
      );
    });

    it('refuses to be discarded through the active-quest command', async () => {
      const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

      expect(await harness.workouts.discardSession(summary.session.id)).toBe(false);

      // History intact and still counted.
      expect(await harness.repositories.sessions.countCompleted()).toBe(1);
      expect(await harness.repositories.sessions.findById(summary.session.id)).not.toBeNull();
    });

    it('refuses UI state, which would never be consumable', async () => {
      const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

      const applied = await harness.repositories.sessions.saveUiState({
        sessionId: summary.session.id,
        currentPosition: 3,
        restStartedAt: null,
        restDurationSeconds: null,
        restPausedAt: null,
        restPausedTotalMs: 0,
        updatedAt: '2026-08-02T12:00:00.000Z',
      });

      expect(applied).toBe(false);
      expect(await uiStateRows(summary.session.id)).toHaveLength(0);
    });

    it('refuses an exercise-complete mark', async () => {
      const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
      const performance = summary.session.performances[0]!;

      expect(
        await harness.repositories.sessions.markPerformanceCompleted(performance.id, null),
      ).toBe(false);
    });
  });

  describe('abandoned sessions', () => {
    it('lose their UI state, since they are never resumable', async () => {
      const plan = await harness.workouts.getNextPlan();
      const session = await harness.workouts.startSession(plan!);
      expect(await uiStateRows(session.id)).toHaveLength(1);

      expect(await harness.workouts.abandonSession(session.id)).toBe(true);

      expect(await uiStateRows(session.id)).toHaveLength(0);
      expect(await harness.repositories.sessions.findActive()).toBeNull();
    });

    it('keep their recorded sets as a record of what happened', async () => {
      const plan = await harness.workouts.getNextPlan();
      const session = await harness.workouts.startSession(plan!);
      await harness.workouts.recordSet(session.performances[0]!.id, 1, 9, 9);
      await harness.workouts.abandonSession(session.id);

      const stored = await harness.repositories.sessions.findById(session.id);
      expect(stored?.status).toBe('abandoned');
      expect(stored?.performances[0]?.sets).toHaveLength(1);
    });

    it('accept no further sets', async () => {
      const plan = await harness.workouts.getNextPlan();
      const session = await harness.workouts.startSession(plan!);
      await harness.workouts.abandonSession(session.id);

      await expect(
        harness.workouts.recordSet(session.performances[0]!.id, 1, 9, 9),
      ).rejects.toBeInstanceOf(SessionNotActiveError);
    });

    it('cannot be completed', async () => {
      const session = await startAndFill();
      await harness.workouts.abandonSession(session.id);

      await expect(harness.workouts.completeSession(session.id)).rejects.toBeInstanceOf(
        SessionNotActiveError,
      );
      expect(await harness.repositories.sessions.countCompleted()).toBe(0);
      expect((await harness.repositories.player.get())?.totalXp).toBe(0);
    });

    it('cannot be abandoned twice', async () => {
      const plan = await harness.workouts.getNextPlan();
      const session = await harness.workouts.startSession(plan!);

      expect(await harness.workouts.abandonSession(session.id)).toBe(true);
      expect(await harness.workouts.abandonSession(session.id)).toBe(false);
    });
  });

  describe('discarding an active quest', () => {
    it('removes the session, its sets and its UI state', async () => {
      const plan = await harness.workouts.getNextPlan();
      const session = await harness.workouts.startSession(plan!);
      await harness.workouts.recordSet(session.performances[0]!.id, 1, 9, 9);

      expect(await harness.workouts.discardSession(session.id)).toBe(true);

      expect(await harness.repositories.sessions.findById(session.id)).toBeNull();
      expect(await uiStateRows(session.id)).toHaveLength(0);
      expect(
        await harness.db.getAllAsync<{ id: string }>('SELECT id FROM set_performance'),
      ).toEqual([]);
    });
  });
});
