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
      await completeSession(
        harness,
        new Date(`2026-08-0${day}T10:00:00.000Z`),
        (_id, _min, max) => max,
      );
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

  it('imports without nesting transactions, as the real driver requires', async () => {
    await seedRealData();
    const json = await harness.backup.exportToJson();

    // The test double rejects a nested BEGIN exactly as Expo SQLite does, so
    // this passing is what proves import works on a device.
    await expect(harness.backup.import(json)).resolves.toBeDefined();
  });

  it('clears without nesting transactions either', async () => {
    await seedRealData();
    await expect(harness.backup.clearAll()).resolves.toBeUndefined();
  });

  it('skips a template variation this build does not have, rather than aborting', async () => {
    await seedRealData();
    const document = JSON.parse(await harness.backup.exportToJson());
    document.templateExercises[0].variationId = 'var-from-a-newer-build';

    // The restore still succeeds; the affected template keeps its seeded default.
    await expect(harness.backup.import(JSON.stringify(document))).resolves.toBeDefined();

    const plan = await harness.workouts.buildPlan('template-workout-a');
    expect(plan?.entries).toHaveLength(7);
    expect(plan?.entries.map((entry) => entry.variation.id)).not.toContain(
      'var-from-a-newer-build',
    );
  });

  it('gives variations the backup never knew about a starting state', async () => {
    await seedRealData();
    const document = JSON.parse(await harness.backup.exportToJson());
    // An older backup that predates most of the catalog.
    document.progression = document.progression.slice(0, 2);

    await harness.backup.import(JSON.stringify(document));

    const states = await harness.repositories.progression.list();
    const variations = await harness.repositories.catalog.listVariations();
    expect(states).toHaveLength(variations.length);
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
    // The schema now requires it, so it is rejected before the structural pass.
    expect(result.errors.join(' ')).toMatch(/completedAt/);
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

  describe('uniqueness constraints', () => {
    /**
     * Each of these would be rejected by SQLite mid-import. Validation has to
     * catch them first, or a malformed document takes the player's existing
     * data down with it — clearPlayerTables runs before the inserts.
     */
    async function documentWith(mutate: (doc: Record<string, any>) => void) {
      await seedRealData();
      const doc = JSON.parse(await harness.backup.exportToJson());
      mutate(doc);
      return JSON.stringify(doc);
    }

    it('rejects duplicate session identifiers', async () => {
      const raw = await documentWith((doc) => {
        doc.sessions.push(JSON.parse(JSON.stringify(doc.sessions[0])));
      });
      const result = validateBackup(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.join(' ')).toMatch(/duplicate session identifier/);
    });

    it('rejects duplicate performance identifiers across sessions', async () => {
      const raw = await documentWith((doc) => {
        doc.sessions[1].performances[0].id = doc.sessions[0].performances[0].id;
      });
      const result = validateBackup(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.join(' ')).toMatch(/duplicate exercise identifier/);
    });

    it('rejects duplicate set identifiers', async () => {
      const raw = await documentWith((doc) => {
        const sets = doc.sessions[0].performances[0].sets;
        sets[1].id = sets[0].id;
      });
      const result = validateBackup(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.join(' ')).toMatch(/duplicate set identifier/);
    });

    it('rejects a repeated set number within one exercise', async () => {
      const raw = await documentWith((doc) => {
        const sets = doc.sessions[0].performances[0].sets;
        // Distinct ids, but the same (performanceId, setNumber) pair.
        sets[1].setNumber = sets[0].setNumber;
      });
      const result = validateBackup(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.join(' ')).toMatch(/set \d+ twice/);
    });

    it('rejects duplicate measurement identifiers', async () => {
      const raw = await documentWith((doc) => {
        doc.measurements[1].id = doc.measurements[0].id;
      });
      expect(validateBackup(raw).ok).toBe(false);
    });

    it('rejects duplicate progression entries for one variation', async () => {
      const raw = await documentWith((doc) => {
        doc.progression.push(JSON.parse(JSON.stringify(doc.progression[0])));
      });
      const result = validateBackup(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.join(' ')).toMatch(/duplicate entry for variation/);
    });

    it('rejects duplicate template-exercise identifiers', async () => {
      const raw = await documentWith((doc) => {
        doc.templateExercises.push(JSON.parse(JSON.stringify(doc.templateExercises[0])));
      });
      const result = validateBackup(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.join(' ')).toMatch(/templateExercises: duplicate/);
    });

    it('rejects malformed documents before anything is written', async () => {
      await seedRealData();
      const before = await harness.repositories.sessions.listCompleted();

      const doc = JSON.parse(await harness.backup.exportToJson());
      doc.sessions[1].performances[0].id = doc.sessions[0].performances[0].id;

      await expect(harness.backup.import(JSON.stringify(doc))).rejects.toThrow();

      // The regression this guards: reaching SQLite would have cleared the
      // player's tables before failing.
      expect(await harness.repositories.sessions.listCompleted()).toEqual(before);
      expect(await harness.repositories.player.get()).not.toBeNull();
    });

    it('still accepts a well-formed document', async () => {
      await seedRealData();
      expect(validateBackup(await harness.backup.exportToJson()).ok).toBe(true);
    });
  });

  describe('avatar portability', () => {
    it('exports no avatar path, since the image itself is not in the document', async () => {
      await seedRealData();
      await harness.player.updateAvatar('file:///picker/tmp/photo.jpg');
      expect((await harness.repositories.player.get())?.avatarUri).toMatch(/\/avatars\//);

      const document = JSON.parse(await harness.backup.exportToJson());
      expect(document.profile.avatarUri).toBeNull();
    });

    it('does not restore a stale installation-specific path', async () => {
      await seedRealData();
      await harness.player.updateAvatar('file:///picker/tmp/photo.jpg');
      const json = await harness.backup.exportToJson();

      await harness.backup.clearAll();
      await harness.backup.import(json);

      // An avatar that appears to have survived but points at a file this
      // installation does not have would be worse than none.
      expect((await harness.repositories.player.get())?.avatarUri).toBeNull();
    });

    it('discards an avatar path supplied in the document', async () => {
      await seedRealData();
      const document = JSON.parse(await harness.backup.exportToJson());

      // An older or hand-written v1 file can carry a path from another device.
      document.profile.avatarUri = 'file:///old-device/private/path/avatar.jpg';
      expect(validateBackup(JSON.stringify(document)).ok).toBe(true);

      await harness.backup.clearAll();
      await harness.backup.import(JSON.stringify(document));

      expect((await harness.repositories.player.get())?.avatarUri).toBeNull();
    });

    it('does not touch files referenced by an imported document', async () => {
      await seedRealData();
      const document = JSON.parse(await harness.backup.exportToJson());
      document.profile.avatarUri = 'file:///somebody-elses/photo.jpg';

      await harness.backup.import(JSON.stringify(document));

      // Nothing outside app-owned storage is ever deleted.
      expect(harness.avatars.removed).toEqual([]);
    });

    it('leaves everything else about the profile intact', async () => {
      await seedRealData();
      await harness.player.updateAvatar('file:///picker/tmp/photo.jpg');
      const before = await harness.repositories.player.get();

      const json = await harness.backup.exportToJson();
      await harness.backup.clearAll();
      await harness.backup.import(json);

      const after = await harness.repositories.player.get();
      expect(after).toEqual({ ...before, avatarUri: null });
    });
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
