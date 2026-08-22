/**
 * @jest-environment node
 */
import { BackupExportInvariantError } from '@/domain/errors';
import { validateBackup } from '@/services/backupSchema';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/**
 * A backup is either faithful or a visible failure. There is no third option.
 *
 * Export previously dropped any completed session it could not narrow to the
 * portable shape, which is the worst possible behaviour for a backup: the file
 * reports success, the player has no reason to look inside it, and the missing
 * quests only surface on the day the backup is actually needed. These tests
 * corrupt durable history directly — the state the app believes is impossible
 * — and require the export to refuse rather than quietly shrink.
 */
describe('backup export integrity', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness, 'Existing');
  });

  afterEach(() => harness.close());

  /** Rewrites one column of a stored session, behind the repositories' backs. */
  const corrupt = async (sessionId: string, column: string, value: unknown) => {
    await harness.db.runAsync(`UPDATE workout_session SET ${column} = ? WHERE id = ?`, [
      value as never,
      sessionId,
    ]);
  };

  const completedIds = async () => {
    const rows = await harness.db.getAllAsync<{ id: string }>(
      "SELECT id FROM workout_session WHERE status = 'completed' ORDER BY session_number",
    );
    return rows.map((row) => row.id);
  };

  it('exports a valid completed session', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

    const backup = await harness.backup.export();
    expect(backup.sessions).toHaveLength(1);
    expect(backup.sessions[0]?.status).toBe('completed');
    expect(backup.sessions[0]?.performances.length).toBeGreaterThan(0);
  });

  it('exports every valid session, not just the first', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);
    await completeSession(harness, new Date('2026-08-06T10:00:00.000Z'), () => 11);

    const backup = await harness.backup.export();
    expect(backup.sessions).toHaveLength(3);
    expect(backup.sessions.map((s) => s.sessionNumber).sort()).toEqual([1, 2, 3]);
    expect(new Set(backup.sessions.map((s) => s.id)).size).toBe(3);
  });

  describe.each([
    ['no completion time', 'completed_at', null],
    ['no duration', 'duration_seconds', null],
    ['no XP award', 'xp_awarded', null],
    ['no quest number', 'session_number', null],
  ])('a completed session with %s', (_label, column, value) => {
    it('fails the export instead of omitting the session', async () => {
      await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
      await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);
      const [first] = await completedIds();
      await corrupt(first!, column, value);

      await expect(harness.backup.export()).rejects.toThrow(BackupExportInvariantError);
    });

    it('names the session and the reason', async () => {
      await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
      const [first] = await completedIds();
      await corrupt(first!, column, value);

      await expect(harness.backup.export()).rejects.toThrow(new RegExp(first!));
    });
  });

  it('fails the export when a completed session has no recorded exercises', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    const [first] = await completedIds();
    await harness.db.runAsync('DELETE FROM exercise_performance WHERE session_id = ?', [first!]);

    await expect(harness.backup.export()).rejects.toThrow(BackupExportInvariantError);
  });

  it('does not return a JSON document when the invariant is violated', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);
    const [first] = await completedIds();
    await corrupt(first!, 'xp_awarded', null);

    // The serialising path must fail too — a caller writing a file only ever
    // calls this one, and a partial document here is what reaches the disk.
    await expect(harness.backup.exportToJson()).rejects.toThrow(BackupExportInvariantError);
  });

  it('never produces a document that silently holds fewer quests than history does', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);
    const [first] = await completedIds();
    await corrupt(first!, 'duration_seconds', null);

    const stored = await harness.db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM workout_session WHERE status = 'completed'",
    );
    expect(stored?.count).toBe(2);

    // The old behaviour: one session exported, one dropped, no error raised.
    const result = await harness.backup.export().then(
      (backup) => ({ ok: true as const, backup }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(BackupExportInvariantError);
  });

  it('carries a message a failure dialog can show the player', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    const [first] = await completedIds();
    await corrupt(first!, 'completed_at', null);

    const error = await harness.backup.export().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(BackupExportInvariantError);
    const message = (error as Error).message;
    expect(message).toMatch(/no completion time/);
    expect(message).toMatch(/no history has been lost/);
  });

  it('still round-trips valid history through export, validate and import', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);
    await harness.measurements.log('bodyweight', 175, 'imperial');

    const json = await harness.backup.exportToJson();
    const validation = validateBackup(json);
    expect(validation.ok).toBe(true);

    const restored = await harness.backup.import(json);
    expect(restored.sessions).toBe(2);
    expect(restored.measurements).toBe(1);

    // And what came back out is the same history that went in.
    const again = await harness.backup.export();
    expect(again.sessions).toHaveLength(2);
    expect(again.sessions.map((s) => s.sessionNumber).sort()).toEqual([1, 2]);
  });
});
