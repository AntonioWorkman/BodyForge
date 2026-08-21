/**
 * @jest-environment node
 */
import { createRepositories } from '@/database/repositories/sqlite';
import { createUnitOfWork } from '@/database/unitOfWork';
import { PlayerAlreadyExistsError } from '@/domain/errors';
import { PlayerService } from '@/services/playerService';
import { WorkoutService } from '@/services/workoutService';
import { failOnStatement } from '@/testing/faultInjection';
import { createMemoryAvatarStore } from '@/testing/memoryAvatarStore';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * Two invariants that must hold no matter how the commands are reached:
 * at most one active quest, and exactly one player created once.
 *
 * Both were checked before the transaction opened, so two callers could each
 * see "nothing there yet" and both act.
 */
describe('at most one active quest', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  /** Rows the invariant is about, counted straight from the database. */
  async function activeCounts() {
    const sessions = await harness.db.getAllAsync<{ id: string }>(
      "SELECT id FROM workout_session WHERE status = 'active'",
    );
    const uiState = await harness.db.getAllAsync<{ session_id: string }>(
      'SELECT session_id FROM active_session_state',
    );
    return { sessions: sessions.length, uiState: uiState.length, ids: sessions.map((s) => s.id) };
  }

  it('creates one quest when two starts overlap', async () => {
    const plan = await harness.workouts.getNextPlan();

    const [first, second] = await Promise.all([
      harness.workouts.startSession(plan!),
      harness.workouts.startSession(plan!),
    ]);

    // Both callers resolve to the same quest rather than one losing its sets.
    expect(first.id).toBe(second.id);

    const counts = await activeCounts();
    expect(counts.sessions).toBe(1);
    expect(counts.uiState).toBe(1);
  });

  it('creates one quest when four starts overlap', async () => {
    const plan = await harness.workouts.getNextPlan();

    const results = await Promise.all(
      Array.from({ length: 4 }, () => harness.workouts.startSession(plan!)),
    );

    expect(new Set(results.map((session) => session.id)).size).toBe(1);
    const counts = await activeCounts();
    expect(counts.sessions).toBe(1);
    expect(counts.uiState).toBe(1);
  });

  it('returns the existing quest instead of starting another', async () => {
    const plan = await harness.workouts.getNextPlan();
    const first = await harness.workouts.startSession(plan!);
    await harness.workouts.recordSet(first.performances[0]!.id, 1, 9, 9);

    const second = await harness.workouts.startSession(plan!);

    expect(second.id).toBe(first.id);
    // The recorded set survived — a second quest would have orphaned it.
    expect(second.performances[0]?.sets).toHaveLength(1);
    expect((await activeCounts()).sessions).toBe(1);
  });

  it('rolls the session back when its UI state cannot be written', async () => {
    const injector = failOnStatement(harness.db, 'INSERT INTO active_session_state');
    const failing = new WorkoutService(
      createRepositories(injector.db),
      createUnitOfWork(injector.db),
    );

    const plan = await harness.workouts.getNextPlan();
    await expect(failing.startSession(plan!)).rejects.toThrow('injected failure');

    const counts = await activeCounts();
    expect(counts.sessions).toBe(0);
    expect(counts.uiState).toBe(0);
  });

  it('is enforced by the database, not only by the service', async () => {
    const plan = await harness.workouts.getNextPlan();
    await harness.workouts.startSession(plan!);

    // Written straight to the table, bypassing every service guard.
    await expect(
      harness.db.runAsync(
        `INSERT INTO workout_session
           (id, template_id, template_name, template_focus, phase_id, status,
            started_at, completed_at, duration_seconds, xp_awarded, session_number)
         VALUES (?, ?, ?, ?, ?, 'active', ?, NULL, NULL, NULL, NULL)`,
        [
          'sneaky',
          'template-workout-a',
          'Workout A',
          'Legs + Push',
          'awakening',
          '2026-08-02T10:00:00.000Z',
        ],
      ),
    ).rejects.toThrow();

    expect((await activeCounts()).sessions).toBe(1);
  });

  it('allows a new quest once the previous one is completed', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    expect((await activeCounts()).sessions).toBe(0);

    const plan = await harness.workouts.getNextPlan();
    const next = await harness.workouts.startSession(plan!);
    expect(next.status).toBe('active');
    expect((await activeCounts()).sessions).toBe(1);
  });

  it('allows a new quest once the previous one is abandoned', async () => {
    const plan = await harness.workouts.getNextPlan();
    const first = await harness.workouts.startSession(plan!);
    await harness.workouts.abandonSession(first.id);

    const second = await harness.workouts.startSession(plan!);
    expect(second.id).not.toBe(first.id);
    expect((await activeCounts()).sessions).toBe(1);
  });
});

describe('onboarding creates a player once', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(() => harness.close());

  const input = {
    name: 'Second',
    avatarUri: null,
    unitSystem: 'metric' as const,
    startingBodyweightKg: 70,
    startingWaistCm: 75,
  };

  it('refuses to onboard over a trained player, changing nothing', async () => {
    await harness.player.createPlayer({
      name: 'Original',
      avatarUri: null,
      unitSystem: 'imperial',
      startingBodyweightKg: 79.4,
    });
    await harness.player.updateAvatar('file:///picker/mine.jpg');
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

    const before = {
      profile: await harness.repositories.player.get(),
      settings: await harness.repositories.settings.get(),
      measurements: await harness.repositories.measurements.list(),
      sessions: await harness.repositories.sessions.listCompleted(),
      progression: await harness.repositories.progression.list(),
    };
    expect(before.profile?.totalXp).toBe(345);

    await expect(harness.player.createPlayer(input)).rejects.toBeInstanceOf(
      PlayerAlreadyExistsError,
    );

    // The regression this guards: INSERT OR REPLACE reset XP and rotation to
    // zero while leaving the completed history in place.
    expect(await harness.repositories.player.get()).toEqual(before.profile);
    expect(await harness.repositories.settings.get()).toEqual(before.settings);
    expect(await harness.repositories.measurements.list()).toEqual(before.measurements);
    expect(await harness.repositories.sessions.listCompleted()).toEqual(before.sessions);
    expect(await harness.repositories.progression.list()).toEqual(before.progression);
  });

  it('creates exactly one player when two onboardings overlap', async () => {
    const results = await Promise.allSettled([
      harness.player.createPlayer({ ...input, name: 'A' }),
      harness.player.createPlayer({ ...input, name: 'B' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(PlayerAlreadyExistsError);

    const players = await harness.db.getAllAsync<{ id: string }>('SELECT id FROM player_profile');
    expect(players).toHaveLength(1);

    // And no duplicated starting measurements from the losing attempt.
    expect(await harness.repositories.measurements.list('bodyweight')).toHaveLength(1);
    expect(await harness.repositories.measurements.list('waist')).toHaveLength(1);
    expect((await harness.repositories.settings.get()).onboardingCompleted).toBe(true);
  });

  it('creates one player when four onboardings overlap', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) => harness.player.createPlayer({ ...input, name: `P${i}` })),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await harness.repositories.measurements.list()).toHaveLength(2);
  });

  it('still allows onboarding after the data is cleared', async () => {
    await harness.player.createPlayer(input);
    await harness.backup.clearAll();

    const profile = await harness.player.createPlayer({ ...input, name: 'Fresh start' });
    expect(profile.name).toBe('Fresh start');
    expect((await harness.repositories.player.get())?.name).toBe('Fresh start');
  });

  it('rejects a duplicate at the repository level too', async () => {
    await harness.player.createPlayer(input);

    const repositories = createRepositories(harness.db);
    await expect(
      repositories.player.create({
        id: 'player',
        name: 'Direct',
        avatarUri: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        totalXp: 0,
        nextTemplateRotationOrder: 0,
      }),
    ).rejects.toThrow();

    expect((await harness.repositories.player.get())?.name).toBe('Second');
  });

  it('does not leave a player behind when onboarding is rejected midway', async () => {
    const injector = failOnStatement(harness.db, 'INSERT INTO app_settings');
    const failing = new PlayerService(
      createRepositories(injector.db),
      createMemoryAvatarStore(),
      createUnitOfWork(injector.db),
    );

    await expect(failing.createPlayer(input)).rejects.toThrow('injected failure');

    // A retry must not then hit "player already exists".
    const profile = await harness.player.createPlayer(input);
    expect(profile.name).toBe('Second');
  });
});
