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

  it('declares unique, ascending versions', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });
});
