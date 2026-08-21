/**
 * @jest-environment node
 */
import { WorkoutIncompleteError } from '@/domain/errors';
import { findIncompleteExercises, isSessionComplete } from '@/domain/mastery';

import { createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * A quest counts as completed only when every prescribed set is recorded.
 *
 * The workout screen allows non-linear navigation, so a player can reach the
 * final exercise without having done the earlier ones. Completing there would
 * award quest XP and advance rotation, phase and Core progression on training
 * that never happened — so the rule lives in the service, not in navigation.
 */
describe('complete-workout invariant', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  async function startQuest() {
    const plan = await harness.workouts.getNextPlan();
    return harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));
  }

  /** Records every prescribed set of one exercise. */
  async function fill(performance: {
    id: string;
    measurementKind: string;
    prescribed: { sets: number; targetMin: number };
  }) {
    const perSide = performance.measurementKind === 'reps-per-side';
    const value = performance.prescribed.targetMin;
    for (let n = 1; n <= performance.prescribed.sets; n += 1) {
      await harness.workouts.recordSet(performance.id, n, value, perSide ? value : null);
    }
  }

  it('refuses a session where only the final exercise was completed', async () => {
    const session = await startQuest();
    const last = session.performances[session.performances.length - 1]!;
    await fill(last);

    await expect(harness.workouts.completeSession(session.id)).rejects.toBeInstanceOf(
      WorkoutIncompleteError,
    );
  });

  it('refuses a session where some exercises are unfinished', async () => {
    const session = await startQuest();
    for (const performance of session.performances.slice(0, 4)) await fill(performance);

    await expect(harness.workouts.completeSession(session.id)).rejects.toBeInstanceOf(
      WorkoutIncompleteError,
    );
  });

  it('refuses a session where one exercise is short a single set', async () => {
    const session = await startQuest();
    for (const performance of session.performances) await fill(performance);
    // Undo one set of the third exercise.
    await harness.workouts.undoSet(session.performances[2]!.id, 3);

    await expect(harness.workouts.completeSession(session.id)).rejects.toBeInstanceOf(
      WorkoutIncompleteError,
    );
  });

  it('mutates nothing when it refuses', async () => {
    const session = await startQuest();
    await fill(session.performances[0]!);

    await expect(harness.workouts.completeSession(session.id)).rejects.toThrow();

    const stored = await harness.repositories.sessions.findById(session.id);
    expect(stored?.status).toBe('active');
    expect(stored?.completedAt).toBeNull();
    expect(stored?.xpAwarded).toBeNull();
    expect(stored?.sessionNumber).toBeNull();

    const profile = await harness.repositories.player.get();
    expect(profile?.totalXp).toBe(0);
    expect(profile?.nextTemplateRotationOrder).toBe(0);
    expect(await harness.repositories.sessions.countCompleted()).toBe(0);
  });

  it('does not advance phase or Core progression from an incomplete quest', async () => {
    const session = await startQuest();
    await fill(session.performances[session.performances.length - 1]!);
    await expect(harness.workouts.completeSession(session.id)).rejects.toThrow();

    const state = await harness.player.getState(new Date('2026-08-02T12:00:00.000Z'));
    expect(state?.completedSessions).toBe(0);
    expect(state?.phase.phase.id).toBe('awakening');
    expect(state?.core.stage).toBe('dormant');
    expect(state?.level.totalXp).toBe(0);
  });

  it('names what remains so the player can be sent back to it', async () => {
    const session = await startQuest();
    for (const performance of session.performances.slice(0, 2)) await fill(performance);

    await expect(harness.workouts.completeSession(session.id)).rejects.toMatchObject({
      name: 'WorkoutIncompleteError',
    });

    try {
      await harness.workouts.completeSession(session.id);
    } catch (error) {
      const incomplete = (error as WorkoutIncompleteError).incomplete;
      expect(incomplete).toHaveLength(5);
      expect(incomplete[0]?.position).toBe(2);
      expect(incomplete[0]?.variationName).toBe('Single-Leg Glute Bridge');
      expect(incomplete[0]?.setsCompleted).toBe(0);
      expect(incomplete[0]?.setsPrescribed).toBe(3);
      expect((error as WorkoutIncompleteError).firstIncompletePosition).toBe(2);
    }
  });

  it('completes normally once every exercise is finished', async () => {
    const session = await startQuest();
    for (const performance of session.performances) await fill(performance);

    const summary = await harness.workouts.completeSession(session.id);
    expect(summary.xp.total).toBe(345);
    expect(summary.completedExercises).toBe(7);
    expect(await harness.repositories.sessions.countCompleted()).toBe(1);
    expect((await harness.repositories.player.get())?.totalXp).toBe(345);
  });

  it('refuses a session with no exercises at all', async () => {
    const session = await startQuest();
    await expect(harness.workouts.completeSession(session.id)).rejects.toBeInstanceOf(
      WorkoutIncompleteError,
    );
  });
});

describe('findIncompleteExercises', () => {
  it('ignores set numbers outside the prescribed range', async () => {
    const harness = await createHarness();
    await withPlayer(harness);
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(plan!);
    const first = session.performances[0]!;

    // Three sets, but numbered beyond the prescription.
    await harness.workouts.recordSet(first.id, 4, 8, 8);
    await harness.workouts.recordSet(first.id, 5, 8, 8);
    await harness.workouts.recordSet(first.id, 6, 8, 8);

    const stored = await harness.repositories.sessions.findById(session.id);
    const incomplete = findIncompleteExercises(stored!.performances);
    expect(incomplete[0]?.position).toBe(0);
    expect(incomplete[0]?.setsCompleted).toBe(0);
    expect(isSessionComplete(stored!.performances)).toBe(false);
    harness.close();
  });

  it('treats an empty session as incomplete rather than complete', () => {
    expect(isSessionComplete([])).toBe(false);
  });
});
