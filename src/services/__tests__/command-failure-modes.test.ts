/**
 * @jest-environment node
 */
import { createRepositories } from '@/database/repositories/sqlite';
import { createUnitOfWork } from '@/database/unitOfWork';
import { PlayerService } from '@/services/playerService';
import { WorkoutService } from '@/services/workoutService';
import { failOnStatement } from '@/testing/faultInjection';
import { createMemoryAvatarStore } from '@/testing/memoryAvatarStore';

import { createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * Failure behaviour of the remaining multi-write commands.
 *
 * Each was classified rather than blanket-wrapped: onboarding and session
 * creation are database-only and must be atomic; the avatar update crosses the
 * filesystem, which no transaction spans, so it relies on ordering and a
 * compensating delete instead.
 */
describe('onboarding is atomic', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(() => harness.close());

  function playerServiceFailingAt(match: string | RegExp) {
    const injector = failOnStatement(harness.db, match);
    return new PlayerService(
      createRepositories(injector.db),
      createMemoryAvatarStore(),
      createUnitOfWork(injector.db),
    );
  }

  it('creates no half-onboarded player when settings cannot be written', async () => {
    const failing = playerServiceFailingAt('INSERT INTO app_settings');

    await expect(
      failing.createPlayer({
        name: 'Half',
        avatarUri: null,
        unitSystem: 'metric',
        startingBodyweightKg: 80,
      }),
    ).rejects.toThrow('injected failure');

    // No profile without settings: the app would otherwise treat an onboarded
    // player as un-onboarded and send them round again.
    expect(await harness.repositories.player.get()).toBeNull();
    expect(await harness.repositories.settings.get()).toMatchObject({
      onboardingCompleted: false,
    });
    expect(await harness.repositories.measurements.list()).toEqual([]);
  });

  it('records no starting measurements when onboarding fails partway', async () => {
    const failing = playerServiceFailingAt('INSERT INTO measurement');

    await expect(
      failing.createPlayer({
        name: 'Half',
        avatarUri: null,
        unitSystem: 'imperial',
        startingBodyweightKg: 80,
        startingWaistCm: 81,
      }),
    ).rejects.toThrow('injected failure');

    expect(await harness.repositories.player.get()).toBeNull();
    expect(await harness.repositories.measurements.list()).toEqual([]);
  });

  it('does not duplicate measurements when onboarding is retried', async () => {
    const failing = playerServiceFailingAt('INSERT INTO app_settings');
    await expect(
      failing.createPlayer({
        name: 'Retry',
        avatarUri: null,
        unitSystem: 'metric',
        startingBodyweightKg: 80,
      }),
    ).rejects.toThrow();

    await harness.player.createPlayer({
      name: 'Retry',
      avatarUri: null,
      unitSystem: 'metric',
      startingBodyweightKg: 80,
    });

    expect(await harness.repositories.measurements.list('bodyweight')).toHaveLength(1);
    expect((await harness.repositories.settings.get()).onboardingCompleted).toBe(true);
  });
});

describe('session creation is atomic', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('leaves no session behind when its UI state cannot be written', async () => {
    const injector = failOnStatement(harness.db, 'INSERT INTO active_session_state');
    const failing = new WorkoutService(
      createRepositories(injector.db),
      createUnitOfWork(injector.db),
    );

    const plan = await harness.workouts.getNextPlan();
    await expect(failing.startSession(plan!)).rejects.toThrow('injected failure');

    expect(await harness.repositories.sessions.findActive()).toBeNull();

    // And starting again afterwards works normally.
    const session = await harness.workouts.startSession(plan!);
    expect(session.performances).toHaveLength(7);
    expect(await harness.workouts.getUiState(session.id)).not.toBeNull();
  });
});

describe('avatar update crosses the filesystem', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('undoes the copied file when the profile cannot be updated', async () => {
    const first = await harness.player.updateAvatar('file:///picker/one.jpg');

    const injector = failOnStatement(harness.db, 'UPDATE player_profile SET avatar_uri');
    const avatars = createMemoryAvatarStore();
    const failing = new PlayerService(
      createRepositories(injector.db),
      avatars,
      createUnitOfWork(injector.db),
    );

    await expect(failing.updateAvatar('file:///picker/two.jpg')).rejects.toThrow(
      'injected failure',
    );

    // The orphan is cleaned up rather than left where nothing can reach it.
    expect(avatars.stored).toEqual([]);
    expect(avatars.removed).toHaveLength(1);

    // And the previous avatar still works.
    expect((await harness.repositories.player.get())?.avatarUri).toBe(first);
    expect(harness.avatars.stored).toContain(first);
  });

  it('never removes the old file before the profile points at the new one', async () => {
    const first = await harness.player.updateAvatar('file:///picker/one.jpg');
    expect(harness.avatars.stored).toEqual([first]);

    const second = await harness.player.updateAvatar('file:///picker/two.jpg');

    // Ordering guarantee: the removal of the old file happens last, so at no
    // point does the profile reference a file that has already been deleted.
    expect(harness.avatars.removed).toEqual([first]);
    expect(harness.avatars.stored).toEqual([second]);
    expect((await harness.repositories.player.get())?.avatarUri).toBe(second);
  });
});
