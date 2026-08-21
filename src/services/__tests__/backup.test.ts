/**
 * @jest-environment node
 */
import { APP_CONFIG } from '@/config/app.config';

import { validateBackup } from '../backupSchema';
import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

describe('backup export and import', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness, 'Recorded Player');
  });

  afterEach(() => harness.close());

  async function seedRealData() {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);
    await harness.measurements.log('bodyweight', 175, 'imperial');
    await harness.measurements.log('waist', 32, 'imperial');
  }

  it('exports a document that validates against its own schema', async () => {
    await seedRealData();
    const json = await harness.backup.exportToJson();
    const result = validateBackup(json);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.sessions).toBe(2);
    expect(result.summary.measurements).toBe(2);
    expect(result.summary.playerName).toBe('Recorded Player');
  });

  it('round-trips every recorded value', async () => {
    await seedRealData();
    const json = await harness.backup.exportToJson();

    const before = {
      profile: await harness.repositories.player.get(),
      sessions: await harness.repositories.sessions.listCompleted(),
      measurements: await harness.repositories.measurements.list(),
      settings: await harness.repositories.settings.get(),
    };

    await harness.backup.clearAll();
    expect(await harness.repositories.player.get()).toBeNull();

    await harness.backup.import(json);

    expect(await harness.repositories.player.get()).toEqual(before.profile);
    expect(await harness.repositories.sessions.listCompleted()).toEqual(before.sessions);
    expect(await harness.repositories.measurements.list()).toEqual(before.measurements);
    expect(await harness.repositories.settings.get()).toEqual(before.settings);
  });

  it('restores a progressed template rather than resetting it', async () => {
    for (const day of [2, 4, 6]) {
      await completeSession(harness, new Date(`2026-08-0${day}T10:00:00.000Z`), (_id, _min, max) => max);
    }
    await harness.progression.confirmProgression('var-push-up-regular');

    const json = await harness.backup.exportToJson();
    await harness.backup.clearAll();
    await harness.backup.import(json);

    const plan = await harness.workouts.buildPlan('template-workout-a');
    expect(plan!.entries.map((e) => e.variation.id)).toContain('var-push-up-slow');
    expect((await harness.repositories.progression.get('var-push-up-regular'))?.status).toBe(
      'mastered',
    );
  });

  it('rejects text that is not JSON', () => {
    const result = validateBackup('not json at all');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/not valid JSON/);
  });

  it('rejects a document from a different application', () => {
    const result = validateBackup(JSON.stringify({ app: 'SomethingElse', formatVersion: 1 }));
    expect(result.ok).toBe(false);
  });

  it('rejects a document from a newer format version', async () => {
    await seedRealData();
    const document = JSON.parse(await harness.backup.exportToJson());
    document.formatVersion = APP_CONFIG.backupFormatVersion + 1;

    expect(validateBackup(JSON.stringify(document)).ok).toBe(false);
  });

  it('rejects a document with structurally impossible data', async () => {
    await seedRealData();
    const document = JSON.parse(await harness.backup.exportToJson());
    document.sessions[0].performances[0].sets[0].primaryValue = -5;

    const result = validateBackup(JSON.stringify(document));
    expect(result.ok).toBe(false);
  });

  it('rejects a completed session with no completion time', async () => {
    await seedRealData();
    const document = JSON.parse(await harness.backup.exportToJson());
    document.sessions[0].completedAt = null;

    const result = validateBackup(JSON.stringify(document));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/completion time/);
  });

  it('rejects sets that claim to belong to another exercise', async () => {
    await seedRealData();
    const document = JSON.parse(await harness.backup.exportToJson());
    document.sessions[0].performances[0].sets[0].performanceId = 'someone-else';

    const result = validateBackup(JSON.stringify(document));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/different exercise/);
  });

  it('writes nothing when an import is rejected', async () => {
    await seedRealData();
    const before = await harness.repositories.sessions.listCompleted();

    await expect(harness.backup.import('{"app":"Nope"}')).rejects.toThrow();
    expect(await harness.repositories.sessions.listCompleted()).toEqual(before);
  });

  it('leaves the app usable after clearing all data', async () => {
    await seedRealData();
    await harness.backup.clearAll();

    expect(await harness.repositories.player.get()).toBeNull();
    expect(await harness.repositories.sessions.countCompleted()).toBe(0);
    expect(await harness.repositories.measurements.list()).toEqual([]);

    // The catalog survives so the app is not left broken.
    const templates = await harness.repositories.catalog.listTemplates();
    expect(templates).toHaveLength(2);
    const states = await harness.repositories.progression.list();
    expect(states.filter((s) => s.status === 'current').length).toBeGreaterThan(0);
  });

  it('suggests a filename that sorts chronologically', () => {
    const name = harness.backup.suggestFileName(new Date('2026-08-21T09:05:00.000Z'));
    expect(name).toBe('bodyforge-backup-2026-08-21T09-05-00.json');
  });
});
