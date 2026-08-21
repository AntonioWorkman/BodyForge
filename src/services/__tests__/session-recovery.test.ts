/**
 * @jest-environment node
 */
import { createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

describe('active workout recovery', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('finds the active session after the app is restarted', async () => {
    const plan = await harness.workouts.getNextPlan();
    const started = await harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));

    await harness.workouts.recordSet(started.performances[0]!.id, 1, 9, 9);
    await harness.workouts.recordSet(started.performances[0]!.id, 2, 8, 8);

    // A fresh service over the same database stands in for a relaunch.
    const { WorkoutService } = await jest.requireActual<
      typeof import('../workoutService')
    >('../workoutService');
    const fresh = new WorkoutService(harness.repositories);

    const recovered = await fresh.getActiveSession();
    expect(recovered?.id).toBe(started.id);
    expect(recovered?.performances[0]?.sets).toHaveLength(2);
    expect(recovered?.performances[0]?.sets[1]?.primaryValue).toBe(8);
  });

  it('persists each set as it is logged, not at the end', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));

    await harness.workouts.recordSet(session.performances[0]!.id, 1, 10, 10);

    const stored = await harness.repositories.sessions.findActive();
    expect(stored?.status).toBe('active');
    expect(stored?.performances[0]?.sets).toHaveLength(1);
  });

  it('restores which exercise was on screen and the rest timer anchor', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));

    await harness.workouts.saveUiState({
      sessionId: session.id,
      currentPosition: 3,
      restStartedAt: '2026-08-02T10:20:00.000Z',
      restDurationSeconds: 90,
      restPausedAt: null,
      updatedAt: '2026-08-02T10:20:00.000Z',
    });

    const state = await harness.workouts.getUiState(session.id);
    expect(state).toMatchObject({
      currentPosition: 3,
      restStartedAt: '2026-08-02T10:20:00.000Z',
      restDurationSeconds: 90,
    });
  });

  it('never starts a second session while one is active', async () => {
    const plan = await harness.workouts.getNextPlan();
    const first = await harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));
    const second = await harness.workouts.startSession(plan!, new Date('2026-08-02T11:00:00.000Z'));

    expect(second.id).toBe(first.id);
    expect(second.startedAt).toBe(first.startedAt);
  });

  it('undoing a set removes it from storage', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));
    const performance = session.performances[0]!;

    await harness.workouts.recordSet(performance.id, 1, 9, 9);
    await harness.workouts.undoSet(performance.id, 1);

    const stored = await harness.repositories.sessions.findActive();
    expect(stored?.performances[0]?.sets).toHaveLength(0);
  });

  it('discarding a session removes it and its sets entirely', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));
    await harness.workouts.recordSet(session.performances[0]!.id, 1, 9, 9);

    await harness.workouts.discardSession(session.id);

    expect(await harness.repositories.sessions.findActive()).toBeNull();
    expect(await harness.repositories.sessions.findById(session.id)).toBeNull();
    const orphanSets = await harness.db.getAllAsync<{ id: string }>(
      'SELECT id FROM set_performance',
    );
    expect(orphanSets).toEqual([]);
  });

  it('an abandoned session keeps its sets but leaves no active quest', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));
    await harness.workouts.recordSet(session.performances[0]!.id, 1, 9, 9);
    await harness.workouts.abandonSession(session.id);

    expect(await harness.repositories.sessions.findActive()).toBeNull();
    const stored = await harness.repositories.sessions.findById(session.id);
    expect(stored?.status).toBe('abandoned');
    expect(stored?.performances[0]?.sets).toHaveLength(1);
  });

  it('an abandoned session is excluded from history and XP', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(plan!, new Date('2026-08-02T10:00:00.000Z'));
    await harness.workouts.recordSet(session.performances[0]!.id, 1, 9, 9);
    await harness.workouts.abandonSession(session.id);

    expect(await harness.repositories.sessions.countCompleted()).toBe(0);
    expect((await harness.repositories.player.get())?.totalXp).toBe(0);
  });
});

describe('measurement persistence', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('stores imperial input as metric and reads it back unchanged', async () => {
    const logged = await harness.measurements.log('bodyweight', 175, 'imperial');
    expect(logged.value).toBeCloseTo(79.38, 1);

    const stored = await harness.measurements.latest('bodyweight');
    expect(stored?.value).toBeCloseTo(79.38, 1);
  });

  it('keeps bodyweight and waist series separate', async () => {
    await harness.measurements.log('bodyweight', 175, 'imperial');
    await harness.measurements.log('waist', 32, 'imperial');

    expect(await harness.measurements.list('bodyweight')).toHaveLength(1);
    expect(await harness.measurements.list('waist')).toHaveLength(1);
    expect(await harness.measurements.list()).toHaveLength(2);
  });

  it('returns the most recent entry as latest', async () => {
    await harness.measurements.log(
      'bodyweight',
      175,
      'imperial',
      { recordedOn: '2026-08-01' },
      new Date('2026-08-01T09:00:00.000Z'),
    );
    await harness.measurements.log(
      'bodyweight',
      173,
      'imperial',
      { recordedOn: '2026-08-15' },
      new Date('2026-08-15T09:00:00.000Z'),
    );

    const latest = await harness.measurements.latest('bodyweight');
    expect(latest?.recordedOn).toBe('2026-08-15');
  });

  it('rejects a value that is not a positive number', async () => {
    await expect(harness.measurements.log('waist', 0, 'metric')).rejects.toThrow();
    await expect(harness.measurements.log('waist', Number.NaN, 'metric')).rejects.toThrow();
  });

  it('records optional starting measurements during onboarding only when given', async () => {
    const fresh = await createHarness();
    await fresh.player.createPlayer({
      name: 'Player',
      avatarUri: null,
      unitSystem: 'metric',
      startingBodyweightKg: 79.4,
      startingWaistCm: null,
    });

    expect(await fresh.measurements.list('bodyweight')).toHaveLength(1);
    expect(await fresh.measurements.list('waist')).toHaveLength(0);
    fresh.close();
  });

  it('deletes a measurement without touching the rest', async () => {
    const first = await harness.measurements.log('waist', 32, 'imperial');
    await harness.measurements.log('waist', 31.5, 'imperial');

    await harness.measurements.remove(first.id);
    const remaining = await harness.measurements.list('waist');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).not.toBe(first.id);
  });
});
