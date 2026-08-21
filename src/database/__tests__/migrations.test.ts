/**
 * @jest-environment node
 */
import { LATEST_SCHEMA_VERSION, MIGRATIONS, migrate } from '../migrations';
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

  it('declares unique, ascending versions', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });
});
