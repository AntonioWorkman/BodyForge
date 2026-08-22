/**
 * @jest-environment node
 */
import { createRepositories } from '@/database/repositories/sqlite';
import { createUnitOfWork } from '@/database/unitOfWork';
import { BackupService } from '@/services/backupService';
import { failOnStatement } from '@/testing/faultInjection';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * A restore that reports failure must leave the existing player untouched.
 *
 * Import clears the player's tables before inserting, so anything required by a
 * successful restore has to be inside that boundary. Progression
 * reconstruction and the mastery recompute used to run after the commit — a
 * failure there destroyed the old data while the UI said "Import failed".
 */
describe('restore atomicity', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(() => harness.close());

  /** Player A: the data that must survive a failed restore. */
  async function seedExistingPlayer() {
    await withPlayer(harness, 'Player A');
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);
    await harness.measurements.log('bodyweight', 175, 'imperial');

    return {
      profile: await harness.repositories.player.get(),
      sessions: await harness.repositories.sessions.listCompleted(),
      measurements: await harness.repositories.measurements.list(),
      progression: await harness.repositories.progression.list(),
      settings: await harness.repositories.settings.get(),
    };
  }

  /** A valid backup for a different player, taken from a separate database. */
  async function backupForOtherPlayer() {
    const other = await createHarness();
    await withPlayer(other, 'Player B');
    await completeSession(other, new Date('2026-07-01T10:00:00.000Z'), (_id, _min, max) => max);
    const json = await other.backup.exportToJson();
    other.close();
    return json;
  }

  function backupFailingAt(match: string | RegExp) {
    const injector = failOnStatement(harness.db, match);
    const repositories = createRepositories(injector.db);
    return new BackupService(repositories, injector.db, createUnitOfWork(injector.db));
  }

  it('keeps the existing player when progression reconstruction fails', async () => {
    const before = await seedExistingPlayer();
    const json = await backupForOtherPlayer();

    // The latest required step inside the restore.
    const failing = backupFailingAt('UPDATE progression_state SET qualifying_sessions');
    await expect(failing.import(json)).rejects.toThrow('injected failure');

    expect(await harness.repositories.player.get()).toEqual(before.profile);
    expect(await harness.repositories.sessions.listCompleted()).toEqual(before.sessions);
    expect(await harness.repositories.measurements.list()).toEqual(before.measurements);
    expect(await harness.repositories.progression.list()).toEqual(before.progression);
    expect(await harness.repositories.settings.get()).toEqual(before.settings);
  });

  it('keeps the existing player when seeding progression states fails', async () => {
    const before = await seedExistingPlayer();
    const json = await backupForOtherPlayer();

    const failing = backupFailingAt('INSERT INTO progression_state');
    await expect(failing.import(json)).rejects.toThrow('injected failure');

    expect(await harness.repositories.player.get()).toEqual(before.profile);
    expect(await harness.repositories.sessions.listCompleted()).toEqual(before.sessions);
  });

  it('keeps the existing player when inserting restored sessions fails', async () => {
    const before = await seedExistingPlayer();
    const json = await backupForOtherPlayer();

    const failing = backupFailingAt('INSERT INTO workout_session');
    await expect(failing.import(json)).rejects.toThrow('injected failure');

    expect(await harness.repositories.player.get()).toEqual(before.profile);
    expect(await harness.repositories.sessions.listCompleted()).toEqual(before.sessions);
    expect(await harness.repositories.measurements.list()).toEqual(before.measurements);
  });

  it('leaves the app usable after a failed restore', async () => {
    await seedExistingPlayer();
    const json = await backupForOtherPlayer();

    const failing = backupFailingAt('UPDATE progression_state SET qualifying_sessions');
    await expect(failing.import(json)).rejects.toThrow();

    // Still able to train: the catalog and the active rotation survived.
    const plan = await harness.workouts.getNextPlan();
    expect(plan?.entries).toHaveLength(7);
    const session = await harness.workouts.startSession(plan!);
    expect(session.performances).toHaveLength(7);
  });

  it('recomputes mastery from the restored history, not the document', async () => {
    await withPlayer(harness, 'Player A');

    // A backup whose stored qualifying counts contradict its own sessions.
    const other = await createHarness();
    await withPlayer(other, 'Player B');
    await completeSession(other, new Date('2026-07-01T10:00:00.000Z'), (_id, min) => min);
    const document = JSON.parse(await other.backup.exportToJson());
    other.close();

    for (const state of document.progression) {
      state.qualifyingSessions = 99;
    }

    await harness.backup.import(JSON.stringify(document));

    // Bottom-of-range training qualifies nothing, whatever the file claimed.
    const states = await harness.repositories.progression.list();
    expect(states.every((state) => state.qualifyingSessions === 0)).toBe(true);
    expect(await harness.progression.listReadyOffers()).toEqual([]);
  });

  it('recomputes mastery high enough to be actionable when history warrants it', async () => {
    await withPlayer(harness, 'Player A');

    const other = await createHarness();
    await withPlayer(other, 'Player B');
    for (const day of [1, 3, 5]) {
      await completeSession(
        other,
        new Date(`2026-07-0${day}T10:00:00.000Z`),
        (_id, _min, max) => max,
      );
    }
    const json = await other.backup.exportToJson();
    other.close();

    await harness.backup.import(json);

    const state = await harness.repositories.progression.get('var-push-up-regular');
    expect(state?.qualifyingSessions).toBeGreaterThanOrEqual(2);
    const offer = await harness.progression.getOffer('var-push-up-regular');
    expect(offer?.to.id).toBe('var-push-up-slow');
  });

  describe('reset', () => {
    it('keeps everything when the catalog rebuild fails', async () => {
      const before = await seedExistingPlayer();

      // The last required step of the reset. It used to run after the deletion
      // committed, so failing here destroyed the data while the UI said
      // "Your data has not been changed."
      const failing = backupFailingAt('INSERT INTO exercise_variation');
      await expect(failing.clearAll()).rejects.toThrow('injected failure');

      expect(await harness.repositories.player.get()).toEqual(before.profile);
      expect(await harness.repositories.sessions.listCompleted()).toEqual(before.sessions);
      expect(await harness.repositories.measurements.list()).toEqual(before.measurements);
      expect(await harness.repositories.progression.list()).toEqual(before.progression);
    });

    it('keeps everything when clearing player tables fails', async () => {
      const before = await seedExistingPlayer();

      const failing = backupFailingAt('DELETE FROM measurement');
      await expect(failing.clearAll()).rejects.toThrow('injected failure');

      expect(await harness.repositories.player.get()).toEqual(before.profile);
      expect(await harness.repositories.measurements.list()).toEqual(before.measurements);
    });

    it('leaves a usable first-launch state when it succeeds', async () => {
      await seedExistingPlayer();
      await harness.backup.clearAll();

      expect(await harness.repositories.player.get()).toBeNull();
      expect(await harness.repositories.sessions.countCompleted()).toBe(0);
      expect(await harness.repositories.measurements.list()).toEqual([]);

      // Reference data is back, so onboarding and training work immediately.
      const templates = await harness.repositories.catalog.listTemplates();
      expect(templates).toHaveLength(2);
      const states = await harness.repositories.progression.list();
      expect(states.filter((state) => state.status === 'current').length).toBeGreaterThan(0);

      await harness.player.createPlayer({
        name: 'Fresh',
        avatarUri: null,
        unitSystem: 'metric',
      });
      const plan = await harness.workouts.getNextPlan();
      expect(plan?.entries).toHaveLength(7);
    });
  });

  it('completes the whole restore when nothing fails', async () => {
    await seedExistingPlayer();
    const json = await backupForOtherPlayer();

    const result = await harness.backup.import(json);
    expect(result.sessions).toBe(1);

    const profile = await harness.repositories.player.get();
    expect(profile?.name).toBe('Player B');
    expect(await harness.repositories.sessions.countCompleted()).toBe(1);
    expect(await harness.repositories.measurements.list()).toEqual([]);
  });
});
