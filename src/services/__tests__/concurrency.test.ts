/**
 * @jest-environment node
 */
import { createRepositories } from '@/database/repositories/sqlite';
import { createUnitOfWork } from '@/database/unitOfWork';
import { ProgressionNotReadyError, SessionNotActiveError } from '@/domain/errors';
import { ProgressionService } from '@/services/progressionService';
import { WorkoutService } from '@/services/workoutService';
import { failOnStatement } from '@/testing/faultInjection';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * Duplicate and concurrent commands.
 *
 * Preconditions used to be read before the transaction opened, so two callers
 * could both see an active session — or the same eligible offer — and both
 * commit. That double-awards XP, advances the rotation twice and applies
 * progression twice.
 *
 * These tests run the commands genuinely overlapped rather than sequentially.
 */
describe('duplicate completeSession', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  async function readyToComplete() {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(
      plan!,
      new Date('2026-08-02T10:00:00.000Z'),
    );

    for (const performance of session.performances) {
      const perSide = performance.measurementKind === 'reps-per-side';
      const value = performance.prescribed.targetMin;
      for (let n = 1; n <= performance.prescribed.sets; n += 1) {
        await harness.workouts.recordSet(performance.id, n, value, perSide ? value : null);
      }
    }
    return session;
  }

  /** Asserts exactly one completion took effect. */
  async function expectSingleCompletion(expectedXp: number) {
    expect(await harness.repositories.sessions.countCompleted()).toBe(1);

    const profile = await harness.repositories.player.get();
    expect(profile?.totalXp).toBe(expectedXp);
    // Rotation advanced exactly once: A → B, not A → A.
    expect(profile?.nextTemplateRotationOrder).toBe(1);

    const completed = await harness.repositories.sessions.listCompleted();
    expect(completed).toHaveLength(1);
    expect(completed[0]?.sessionNumber).toBe(1);
    expect(completed[0]?.xpAwarded).toBe(expectedXp);
  }

  it('awards once when two calls overlap', async () => {
    const session = await readyToComplete();

    const results = await Promise.allSettled([
      harness.workouts.completeSession(session.id),
      harness.workouts.completeSession(session.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SessionNotActiveError);

    await expectSingleCompletion(345);
  });

  it('awards once even with four callers at the same time', async () => {
    const session = await readyToComplete();

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => harness.workouts.completeSession(session.id)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expectSingleCompletion(345);
  });

  it('refuses the transition when the session is no longer active', async () => {
    const session = await readyToComplete();
    await harness.workouts.completeSession(session.id);

    // The conditional transition is the defence that does not depend on
    // ordering: even reached directly, a second completion updates no rows.
    const applied = await harness.repositories.sessions.complete({
      sessionId: session.id,
      completedAt: '2026-08-02T11:00:00.000Z',
      durationSeconds: 60,
      xpAwarded: 999,
      sessionNumber: 2,
    });

    expect(applied).toBe(false);
    const stored = await harness.repositories.sessions.findById(session.id);
    expect(stored?.xpAwarded).toBe(345);
    expect(stored?.sessionNumber).toBe(1);
  });

  it('serialises commands so two units of work cannot open nested transactions', async () => {
    const session = await readyToComplete();

    // One unit of work, two commands issued without awaiting the first. Without
    // serialisation the second BEGIN would land inside the first transaction.
    const first = harness.unitOfWork.run(async (repos) => {
      await repos.player.addXp(10);
      return 'first';
    });
    const second = harness.unitOfWork.run(async (repos) => {
      await repos.player.addXp(5);
      return 'second';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect((await harness.repositories.player.get())?.totalXp).toBe(15);

    // And a failing command does not poison the queue behind it.
    const failing = harness.unitOfWork.run(async () => {
      throw new Error('boom');
    });
    const after = harness.unitOfWork.run(async (repos) => repos.player.addXp(1));

    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe(16);
    expect(session.status).toBe('active');
  });

  it('still completes on retry after a genuine rollback', async () => {
    const session = await readyToComplete();

    const injector = failOnStatement(harness.db, 'total_xp = MAX(0, total_xp + ?)');
    const failing = new WorkoutService(
      createRepositories(injector.db),
      createUnitOfWork(injector.db),
    );

    await expect(failing.completeSession(session.id)).rejects.toThrow('injected failure');

    const summary = await harness.workouts.completeSession(session.id);
    expect(summary.xp.total).toBe(345);
    await expectSingleCompletion(345);
  });
});

describe('duplicate confirmProgression', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
    for (const day of [2, 4, 6]) {
      await completeSession(
        harness,
        new Date(`2026-08-0${day}T10:00:00.000Z`),
        (_id, _min, max) => max,
      );
    }
  });

  afterEach(() => harness.close());

  /** Asserts the progression was applied exactly once. */
  async function expectSingleProgression(xpBefore: number) {
    expect((await harness.repositories.progression.get('var-push-up-regular'))?.status).toBe(
      'mastered',
    );
    expect((await harness.repositories.progression.get('var-push-up-slow'))?.status).toBe(
      'current',
    );

    // Exactly one bonus.
    expect((await harness.repositories.player.get())?.totalXp).toBe(xpBefore + 100);

    // The template moved once, not twice.
    const plan = await harness.workouts.buildPlan('template-workout-a');
    const ids = plan!.entries.map((entry) => entry.variation.id);
    expect(ids).toContain('var-push-up-slow');
    expect(ids).not.toContain('var-push-up-regular');
    expect(ids.filter((id) => id === 'var-push-up-slow')).toHaveLength(1);
  }

  it('applies once when two confirmations overlap', async () => {
    const xpBefore = (await harness.repositories.player.get())!.totalXp;

    const results = await Promise.allSettled([
      harness.progression.confirmProgression('var-push-up-regular'),
      harness.progression.confirmProgression('var-push-up-regular'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ProgressionNotReadyError);

    await expectSingleProgression(xpBefore);
  });

  it('refuses the transition when the variation is no longer current', async () => {
    const xpBefore = (await harness.repositories.player.get())!.totalXp;
    await harness.progression.confirmProgression('var-push-up-regular');

    // Reached directly, the compare-and-set still refuses: the source is now
    // `mastered`, so no second bonus and no second chain move are possible.
    const applied = await harness.repositories.progression.compareAndSetStatus(
      'var-push-up-regular',
      'current',
      'mastered',
      '2026-08-10T10:00:00.000Z',
    );

    expect(applied).toBe(false);
    await expectSingleProgression(xpBefore);
  });

  it('pays the bonus once across four simultaneous confirmations', async () => {
    const xpBefore = (await harness.repositories.player.get())!.totalXp;

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        harness.progression.confirmProgression('var-push-up-regular'),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expectSingleProgression(xpBefore);
  });

  it('still confirms on retry after a genuine rollback', async () => {
    const xpBefore = (await harness.repositories.player.get())!.totalXp;

    const injector = failOnStatement(harness.db, 'total_xp = MAX(0, total_xp + ?)');
    const failing = new ProgressionService(
      createRepositories(injector.db),
      createUnitOfWork(injector.db),
    );

    await expect(failing.confirmProgression('var-push-up-regular')).rejects.toThrow(
      'injected failure',
    );

    await harness.progression.confirmProgression('var-push-up-regular');
    await expectSingleProgression(xpBefore);
  });
});
