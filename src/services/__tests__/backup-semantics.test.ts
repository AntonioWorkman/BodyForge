/**
 * @jest-environment node
 */
import { validateBackup } from '@/services/backupSchema';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * A backup is untrusted input, and "SQLite would accept this" is not the same
 * as "this is valid BodyForge state".
 *
 * Every document here is structurally insertable and semantically impossible.
 * Each must be rejected before the import clears the player's tables.
 */
describe('backup semantic validation', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness, 'Existing');
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);
    await harness.measurements.log('bodyweight', 175, 'imperial');
  });

  afterEach(() => harness.close());

  /** A valid export, mutated into something hostile. */
  async function hostile(mutate: (doc: Record<string, any>) => void) {
    const doc = JSON.parse(await harness.backup.exportToJson());
    mutate(doc);
    return JSON.stringify(doc);
  }

  const rejects = (raw: string, pattern?: RegExp) => {
    const result = validateBackup(raw);
    expect(result.ok).toBe(false);
    if (!result.ok && pattern) expect(result.errors.join(' ')).toMatch(pattern);
  };

  describe('session lifecycle', () => {
    it('rejects an active session, which would become a phantom quest', async () => {
      // The format carries no active_session_state, so a restored active
      // session is resumable with no position to resume from.
      rejects(await hostile((d) => (d.sessions[0].status = 'active')), /completed sessions only/);
    });

    it('rejects an abandoned session', async () => {
      rejects(await hostile((d) => (d.sessions[0].status = 'abandoned')));
    });

    it('rejects a completed session with no session number', async () => {
      rejects(await hostile((d) => (d.sessions[0].sessionNumber = null)), /sessionNumber/);
    });

    it('rejects a completed session with no XP recorded', async () => {
      rejects(await hostile((d) => (d.sessions[0].xpAwarded = null)), /xpAwarded/);
    });

    it('rejects a completed session with no duration', async () => {
      rejects(await hostile((d) => (d.sessions[0].durationSeconds = null)), /durationSeconds/);
    });

    it('rejects a completed session with no exercises', async () => {
      rejects(await hostile((d) => (d.sessions[0].performances = [])));
    });

    it('rejects duplicate session numbers', async () => {
      rejects(
        await hostile((d) => (d.sessions[1].sessionNumber = d.sessions[0].sessionNumber)),
        /both numbered/,
      );
    });

    it('rejects a session number beyond the history it claims', async () => {
      rejects(await hostile((d) => (d.sessions[0].sessionNumber = 99)), /but the backup holds/);
    });

    it('rejects a session that finished before it started', async () => {
      rejects(
        await hostile((d) => (d.sessions[0].completedAt = '2020-01-01T00:00:00.000Z')),
        /completed before it started/,
      );
    });
  });

  describe('timestamps', () => {
    it('rejects an unparseable timestamp rather than carrying it into sorting', async () => {
      rejects(await hostile((d) => (d.sessions[0].completedAt = 'yesterday-ish')));
    });

    it('rejects a date-shaped string that is not a real date', async () => {
      rejects(await hostile((d) => (d.measurements[0].recordedOn = '2026-13-45')));
    });

    it('rejects an empty timestamp', async () => {
      rejects(await hostile((d) => (d.sessions[0].startedAt = '')));
    });
  });

  describe('prescriptions', () => {
    it('rejects a range whose bottom exceeds its top', async () => {
      rejects(
        await hostile((d) => {
          d.sessions[0].performances[0].prescribed.targetMin = 20;
          d.sessions[0].performances[0].prescribed.targetMax = 5;
        }),
      );
    });

    it('rejects a recorded exercise prescribed zero sets', async () => {
      rejects(await hostile((d) => (d.sessions[0].performances[0].prescribed.sets = 0)));
    });
  });

  describe('progression', () => {
    it('rejects a stored ready status, which the app derives rather than saves', async () => {
      rejects(await hostile((d) => (d.progression[0].status = 'ready')), /locked, available/);
    });

    it('rejects two current variations in one chain', async () => {
      rejects(
        await hostile((d) => {
          for (const state of d.progression) {
            if (['var-push-up-regular', 'var-push-up-slow'].includes(state.variationId)) {
              state.status = 'current';
            }
          }
        }),
        /current variations/,
      );
    });

    it('still accepts one current per chain', async () => {
      const doc = JSON.parse(await harness.backup.exportToJson());
      expect(validateBackup(JSON.stringify(doc)).ok).toBe(true);
    });

    it('still tolerates a variation this build does not know', async () => {
      // Forward and backward compatibility is deliberate: unknown catalog
      // entries are skipped on import, not treated as a corrupt document.
      const raw = await hostile((d) => (d.progression[0].variationId = 'var-from-a-newer-build'));
      expect(validateBackup(raw).ok).toBe(true);
    });
  });

  describe('nothing is written before rejection', () => {
    it('leaves the existing player untouched when a hostile import is refused', async () => {
      const before = {
        profile: await harness.repositories.player.get(),
        sessions: await harness.repositories.sessions.listCompleted(),
        measurements: await harness.repositories.measurements.list(),
      };

      const raw = await hostile((d) => (d.sessions[0].status = 'active'));
      await expect(harness.backup.import(raw)).rejects.toThrow();

      expect(await harness.repositories.player.get()).toEqual(before.profile);
      expect(await harness.repositories.sessions.listCompleted()).toEqual(before.sessions);
      expect(await harness.repositories.measurements.list()).toEqual(before.measurements);
    });

    it('cannot restore an active quest through a backup', async () => {
      const raw = await hostile((d) => (d.sessions[0].status = 'active'));
      await expect(harness.backup.import(raw)).rejects.toThrow();

      expect(await harness.repositories.sessions.findActive()).toBeNull();
    });
  });

  describe('a real export still round-trips', () => {
    it('validates and imports cleanly', async () => {
      const json = await harness.backup.exportToJson();
      expect(validateBackup(json).ok).toBe(true);

      await harness.backup.clearAll();
      const result = await harness.backup.import(json);
      expect(result.sessions).toBe(2);
      expect(await harness.repositories.sessions.countCompleted()).toBe(2);
    });
  });
});
