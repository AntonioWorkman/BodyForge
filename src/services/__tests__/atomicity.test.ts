/**
 * @jest-environment node
 */
import { createRepositories } from '@/database/repositories/sqlite';
import { createUnitOfWork } from '@/database/unitOfWork';
import { resolveLevel } from '@/domain/levels';
import { ProgressionService } from '@/services/progressionService';
import { WorkoutService } from '@/services/workoutService';
import { failOnStatement } from '@/testing/faultInjection';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * Atomicity.
 *
 * completeSession and confirmProgression each write to several tables. A crash
 * partway through used to leave the player split — a session marked complete
 * with the XP unawarded and the rotation stale, or a chain moved with the bonus
 * unpaid — and neither was retryable.
 *
 * These tests make the failure happen deliberately and assert that nothing
 * survived it.
 */
describe('completeSession atomicity', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  /** Starts a session and records every prescribed set, ready to complete. */
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

  /** A workout service whose writes fail once `match` is reached. */
  function servicesFailingAt(match: string | RegExp) {
    const injector = failOnStatement(harness.db, match);
    const repositories = createRepositories(injector.db);
    return new WorkoutService(repositories, createUnitOfWork(injector.db));
  }

  it('rolls back the completed status when awarding XP fails', async () => {
    const session = await readyToComplete();
    const failing = servicesFailingAt('total_xp = MAX(0, total_xp + ?)');

    await expect(failing.completeSession(session.id)).rejects.toThrow('injected failure');

    const stored = await harness.repositories.sessions.findById(session.id);
    expect(stored?.status).toBe('active');
    expect(stored?.completedAt).toBeNull();
    expect(stored?.xpAwarded).toBeNull();
    expect(stored?.sessionNumber).toBeNull();
    expect((await harness.repositories.player.get())?.totalXp).toBe(0);
  });

  it('rolls back XP and status when advancing the rotation fails', async () => {
    const session = await readyToComplete();
    const failing = servicesFailingAt('next_template_rotation_order = ?');

    await expect(failing.completeSession(session.id)).rejects.toThrow('injected failure');

    const profile = await harness.repositories.player.get();
    expect(profile?.totalXp).toBe(0);
    expect(profile?.nextTemplateRotationOrder).toBe(0);
    expect((await harness.repositories.sessions.findById(session.id))?.status).toBe('active');
    expect(await harness.repositories.sessions.countCompleted()).toBe(0);
  });

  it('rolls back everything when refreshing mastery fails', async () => {
    const session = await readyToComplete();
    const failing = servicesFailingAt('UPDATE progression_state SET qualifying_sessions');

    await expect(failing.completeSession(session.id)).rejects.toThrow('injected failure');

    expect((await harness.repositories.sessions.findById(session.id))?.status).toBe('active');
    expect((await harness.repositories.player.get())?.totalXp).toBe(0);
    const states = await harness.repositories.progression.list();
    expect(states.every((state) => state.qualifyingSessions === 0)).toBe(true);
  });

  it('leaves the session completable again after a rolled-back attempt', async () => {
    const session = await readyToComplete();
    const failing = servicesFailingAt('total_xp = MAX(0, total_xp + ?)');
    await expect(failing.completeSession(session.id)).rejects.toThrow();

    // The regression this guards: the session used to be left permanently
    // completed, so retrying failed with "already been completed".
    const summary = await harness.workouts.completeSession(session.id);
    expect(summary.xp.total).toBe(345);
    expect((await harness.repositories.player.get())?.totalXp).toBe(345);
    expect(await harness.repositories.sessions.countCompleted()).toBe(1);
  });

  it('commits every write together on success', async () => {
    const session = await readyToComplete();
    const summary = await harness.workouts.completeSession(session.id);

    const stored = await harness.repositories.sessions.findById(session.id);
    const profile = await harness.repositories.player.get();

    expect(stored?.status).toBe('completed');
    expect(stored?.xpAwarded).toBe(summary.xp.total);
    expect(profile?.totalXp).toBe(summary.xp.total);
    expect(profile?.nextTemplateRotationOrder).toBe(1);
    expect(resolveLevel(profile!.totalXp)).toEqual(resolveLevel(summary.totalXpAfter));
  });
});

describe('confirmProgression atomicity', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
    // Three sessions at the top of range qualify the push-up, and take the
    // player far enough that the next variation is not phase-gated.
    for (const day of [2, 4, 6]) {
      await completeSession(
        harness,
        new Date(`2026-08-0${day}T10:00:00.000Z`),
        (_id, _min, max) => max,
      );
    }
  });

  afterEach(() => harness.close());

  function servicesFailingAt(match: string | RegExp) {
    const injector = failOnStatement(harness.db, match);
    const repositories = createRepositories(injector.db);
    return new ProgressionService(repositories, createUnitOfWork(injector.db));
  }

  it('rolls back the mastered status when the next variation cannot be written', async () => {
    const failing = servicesFailingAt('INSERT INTO progression_state');

    await expect(failing.confirmProgression('var-push-up-regular')).rejects.toThrow(
      'injected failure',
    );

    expect((await harness.repositories.progression.get('var-push-up-regular'))?.status).toBe(
      'current',
    );
    expect((await harness.repositories.progression.get('var-push-up-slow'))?.status).toBe('locked');
  });

  it('rolls back the chain when the template update fails', async () => {
    const before = await harness.workouts.buildPlan('template-workout-a');
    const failing = servicesFailingAt('UPDATE workout_template_exercise SET variation_id');

    await expect(failing.confirmProgression('var-push-up-regular')).rejects.toThrow(
      'injected failure',
    );

    const after = await harness.workouts.buildPlan('template-workout-a');
    expect(after!.entries.map((entry) => entry.variation.id)).toEqual(
      before!.entries.map((entry) => entry.variation.id),
    );
    expect((await harness.repositories.progression.get('var-push-up-regular'))?.status).toBe(
      'current',
    );
  });

  it('rolls back the whole progression when the bonus cannot be paid', async () => {
    const xpBefore = (await harness.repositories.player.get())!.totalXp;
    const failing = servicesFailingAt('total_xp = MAX(0, total_xp + ?)');

    await expect(failing.confirmProgression('var-push-up-regular')).rejects.toThrow(
      'injected failure',
    );

    expect((await harness.repositories.player.get())?.totalXp).toBe(xpBefore);
    expect((await harness.repositories.progression.get('var-push-up-regular'))?.status).toBe(
      'current',
    );
    expect((await harness.repositories.progression.get('var-push-up-slow'))?.status).toBe('locked');

    const plan = await harness.workouts.buildPlan('template-workout-a');
    expect(plan!.entries.map((entry) => entry.variation.id)).toContain('var-push-up-regular');
  });

  it('remains confirmable after a rolled-back attempt', async () => {
    const failing = servicesFailingAt('total_xp = MAX(0, total_xp + ?)');
    await expect(failing.confirmProgression('var-push-up-regular')).rejects.toThrow();

    const result = await harness.progression.confirmProgression('var-push-up-regular');
    expect(result.to.id).toBe('var-push-up-slow');
    expect((await harness.repositories.progression.get('var-push-up-regular'))?.status).toBe(
      'mastered',
    );
  });
});
