/**
 * @jest-environment node
 */
import { LATEST_SCHEMA_VERSION, MIGRATIONS, migrate } from '../migrations';
import type { SqlDatabase } from '../sqlDatabase';
import { createTestDatabase } from '@/testing/nodeSqlite';

describe('schema migrations', () => {
  it('brings an empty database to the latest version', async () => {
    const db = createTestDatabase();
    const version = await migrate(db);

    expect(version).toBe(LATEST_SCHEMA_VERSION);
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  it('creates every table the repositories rely on', async () => {
    const db = createTestDatabase();
    await migrate(db);

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const names = tables.map((t) => t.name);

    for (const expected of [
      'player_profile',
      'app_settings',
      'exercise',
      'exercise_variation',
      'progression_chain',
      'workout_template',
      'workout_template_exercise',
      'workout_session',
      'exercise_performance',
      'set_performance',
      'measurement',
      'progression_state',
      'active_session_state',
    ]) {
      expect(names).toContain(expected);
    }
    db.close();
  });

  it('is idempotent — running again changes nothing', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await expect(migrate(db)).resolves.toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  it('adds the paused-rest column on top of the initial schema', async () => {
    const db = createTestDatabase();
    await migrate(db);

    const columns = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM pragma_table_info('active_session_state')",
    );
    expect(columns.map((c) => c.name)).toContain('rest_paused_total_ms');
    db.close();
  });

  it('migrates a database already at version 1 without losing its rows', async () => {
    const db = createTestDatabase();
    // Apply only the first migration, as an older install would have.
    const [first] = [...MIGRATIONS].sort((a, b) => a.version - b.version);
    await first!.up(db);
    await db.execAsync(`PRAGMA user_version = ${first!.version}`);

    await db.runAsync(
      `INSERT INTO player_profile (id, name, avatar_uri, created_at, total_xp, next_template_rotation_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['player', 'Existing', null, '2026-08-01T00:00:00.000Z', 345, 1],
    );

    await expect(migrate(db)).resolves.toBe(LATEST_SCHEMA_VERSION);
    const row = await db.getFirstAsync<{ total_xp: number }>('SELECT total_xp FROM player_profile');
    expect(row?.total_xp).toBe(345);
    db.close();
  });

  /**
   * Migration 3 is not just an index. It reconciles a database that already
   * holds state the index forbids — more than one active quest — by keeping the
   * most recently started and abandoning the rest. That is deliberate
   * destructive repair on real player data, and the rule it applies decides
   * which quest a player finds waiting when they next open the app, so it is
   * pinned here rather than left to be re-derived from the SQL.
   */
  describe('migration 3: reconciling multiple active quests', () => {
    /** A database migrated only as far as version 2, as an older install is. */
    async function atVersion2() {
      const db = createTestDatabase();
      const ordered = [...MIGRATIONS].sort((a, b) => a.version - b.version);
      for (const migration of ordered.filter((m) => m.version <= 2)) {
        await migration.up(db);
        await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      }
      return db;
    }

    const addSession = async (
      db: SqlDatabase,
      id: string,
      status: string,
      startedAt: string,
      sessionNumber: number | null = null,
    ) => {
      await db.runAsync(
        `INSERT INTO workout_session
           (id, template_id, template_name, template_focus, phase_id, status,
            started_at, completed_at, duration_seconds, xp_awarded, session_number)
         VALUES (?, 'tpl', 'Push', 'upper', 'awakening', ?, ?, ?, ?, ?, ?)`,
        [
          id,
          status,
          startedAt,
          status === 'completed' ? startedAt : null,
          status === 'completed' ? 1_800 : null,
          status === 'completed' ? 120 : null,
          sessionNumber,
        ],
      );
    };

    const addUiState = async (db: SqlDatabase, sessionId: string, position: number) => {
      await db.runAsync(
        `INSERT INTO active_session_state (session_id, current_position, updated_at)
         VALUES (?, ?, '2026-08-01T00:00:00.000Z')`,
        [sessionId, position],
      );
    };

    const statuses = async (db: SqlDatabase) => {
      const rows = await db.getAllAsync<{ id: string; status: string }>(
        'SELECT id, status FROM workout_session ORDER BY id',
      );
      return Object.fromEntries(rows.map((row) => [row.id, row.status]));
    };

    const uiStateIds = async (db: SqlDatabase) => {
      const rows = await db.getAllAsync<{ session_id: string }>(
        'SELECT session_id FROM active_session_state ORDER BY session_id',
      );
      return rows.map((row) => row.session_id);
    };

    it('keeps the most recently started quest and abandons the others', async () => {
      const db = await atVersion2();
      await addSession(db, 'old', 'active', '2026-08-01T08:00:00.000Z');
      await addSession(db, 'newest', 'active', '2026-08-03T08:00:00.000Z');
      await addSession(db, 'middle', 'active', '2026-08-02T08:00:00.000Z');

      await expect(migrate(db)).resolves.toBe(LATEST_SCHEMA_VERSION);

      expect(await statuses(db)).toEqual({
        old: 'abandoned',
        middle: 'abandoned',
        newest: 'active',
      });
      db.close();
    });

    it('leaves exactly one active quest', async () => {
      const db = await atVersion2();
      await addSession(db, 'a', 'active', '2026-08-01T08:00:00.000Z');
      await addSession(db, 'b', 'active', '2026-08-02T08:00:00.000Z');
      await addSession(db, 'c', 'active', '2026-08-03T08:00:00.000Z');

      await migrate(db);

      const row = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM workout_session WHERE status = 'active'",
      );
      expect(row?.count).toBe(1);
      db.close();
    });

    it('keeps the surviving quest whole, including its exercises', async () => {
      const db = await atVersion2();
      await addSession(db, 'old', 'active', '2026-08-01T08:00:00.000Z');
      await addSession(db, 'newest', 'active', '2026-08-03T08:00:00.000Z');
      for (const sessionId of ['old', 'newest']) {
        await db.runAsync(
          `INSERT INTO exercise_performance
             (id, session_id, position, variation_id, exercise_name, variation_name,
              measurement_kind, sets, target_min, target_max, rest_seconds, tempo, cues, completed_at)
           VALUES (?, ?, 0, 'var', 'Push-up', 'Standard', 'reps', 3, 8, 12, 90, NULL, '', NULL)`,
          [`perf-${sessionId}`, sessionId],
        );
      }

      await migrate(db);

      // Reconciliation changes status; it does not delete recorded work, from
      // the survivor or from the quests it abandoned.
      const rows = await db.getAllAsync<{ session_id: string }>(
        'SELECT session_id FROM exercise_performance ORDER BY session_id',
      );
      expect(rows.map((r) => r.session_id)).toEqual(['newest', 'old']);
      db.close();
    });

    it('deletes transient state for every quest but the survivor', async () => {
      const db = await atVersion2();
      await addSession(db, 'old', 'active', '2026-08-01T08:00:00.000Z');
      await addSession(db, 'middle', 'active', '2026-08-02T08:00:00.000Z');
      await addSession(db, 'newest', 'active', '2026-08-03T08:00:00.000Z');
      await addUiState(db, 'old', 1);
      await addUiState(db, 'middle', 2);
      await addUiState(db, 'newest', 3);

      await migrate(db);

      expect(await uiStateIds(db)).toEqual(['newest']);
      const surviving = await db.getFirstAsync<{ current_position: number }>(
        'SELECT current_position FROM active_session_state WHERE session_id = ?',
        ['newest'],
      );
      // The survivor resumes where it was, not from the start.
      expect(surviving?.current_position).toBe(3);
      db.close();
    });

    it('clears transient state left behind by a non-active quest', async () => {
      const db = await atVersion2();
      await addSession(db, 'finished', 'completed', '2026-08-01T08:00:00.000Z', 1);
      await addUiState(db, 'finished', 4);

      await migrate(db);

      // No active quest at all, so nothing should still claim to be resumable.
      expect(await uiStateIds(db)).toEqual([]);
      db.close();
    });

    it('does not touch completed or already-abandoned history', async () => {
      const db = await atVersion2();
      await addSession(db, 'done-1', 'completed', '2026-07-01T08:00:00.000Z', 1);
      await addSession(db, 'done-2', 'completed', '2026-08-05T08:00:00.000Z', 2);
      await addSession(db, 'gave-up', 'abandoned', '2026-08-04T08:00:00.000Z');
      await addSession(db, 'old', 'active', '2026-08-01T08:00:00.000Z');
      await addSession(db, 'newest', 'active', '2026-08-03T08:00:00.000Z');

      await migrate(db);

      expect(await statuses(db)).toEqual({
        'done-1': 'completed',
        'done-2': 'completed',
        'gave-up': 'abandoned',
        old: 'abandoned',
        newest: 'active',
      });

      // A completed session started later than the survivor must not be the
      // one kept: the rule applies to active quests only.
      const xp = await db.getFirstAsync<{ xp_awarded: number }>(
        "SELECT xp_awarded FROM workout_session WHERE id = 'done-2'",
      );
      expect(xp?.xp_awarded).toBe(120);
      db.close();
    });

    it('breaks a started_at tie deterministically, by id', async () => {
      const sameInstant = '2026-08-02T08:00:00.000Z';

      // Insertion order must not decide the outcome, so the same three rows are
      // written in two different orders and must reconcile identically.
      for (const order of [
        ['aaa', 'mmm', 'zzz'],
        ['zzz', 'aaa', 'mmm'],
      ]) {
        const db = await atVersion2();
        for (const id of order) await addSession(db, id, 'active', sameInstant);

        await migrate(db);

        expect(await statuses(db)).toEqual({ aaa: 'abandoned', mmm: 'abandoned', zzz: 'active' });
        db.close();
      }
    });

    it('creates the partial index, which then refuses a second active quest', async () => {
      const db = await atVersion2();
      await addSession(db, 'only', 'active', '2026-08-01T08:00:00.000Z');

      await migrate(db);

      const index = await db.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_single_active_session'",
      );
      expect(index?.name).toBe('idx_single_active_session');

      // The invariant is now the database's, not the service layer's.
      await expect(addSession(db, 'second', 'active', '2026-08-09T08:00:00.000Z')).rejects.toThrow(
        /UNIQUE|constraint/i,
      );

      // And it constrains only active rows: history may hold many.
      await expect(
        addSession(db, 'done-a', 'completed', '2026-08-06T08:00:00.000Z', 1),
      ).resolves.not.toThrow();
      await expect(
        addSession(db, 'done-b', 'completed', '2026-08-07T08:00:00.000Z', 2),
      ).resolves.not.toThrow();
      db.close();
    });

    it('reports the latest version and records it', async () => {
      const db = await atVersion2();
      await addSession(db, 'a', 'active', '2026-08-01T08:00:00.000Z');
      await addSession(db, 'b', 'active', '2026-08-02T08:00:00.000Z');

      await expect(migrate(db)).resolves.toBe(LATEST_SCHEMA_VERSION);
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      expect(row?.user_version).toBe(LATEST_SCHEMA_VERSION);
      db.close();
    });

    it('is atomic — a failure leaves the database at version 2, untouched', async () => {
      const db = await atVersion2();
      await addSession(db, 'old', 'active', '2026-08-01T08:00:00.000Z');
      await addSession(db, 'newest', 'active', '2026-08-03T08:00:00.000Z');
      await addUiState(db, 'old', 1);

      // The index creation is the last statement of the migration, so failing
      // it exercises the case where reconciliation has already been applied.
      await db.execAsync(`CREATE UNIQUE INDEX idx_single_active_session ON workout_session(id);`);

      await expect(migrate(db)).rejects.toThrow();

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      expect(version?.user_version).toBe(2);
      // Neither the abandonments nor the state deletion may have survived.
      expect(await statuses(db)).toEqual({ old: 'active', newest: 'active' });
      expect(await uiStateIds(db)).toEqual(['old']);
      db.close();
    });
  });

  it('declares unique, ascending versions', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });
});
