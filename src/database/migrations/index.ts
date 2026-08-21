import type { SqlDatabase } from '../sqlDatabase';

/**
 * Schema migrations.
 *
 * Migrations are explicit, ordered, and never edited once released — a new
 * version is appended instead. `user_version` in SQLite tracks how far a device
 * has been migrated, so an upgrade only runs what it has not run before.
 */
export interface Migration {
  version: number;
  name: string;
  up: (db: SqlDatabase) => Promise<void>;
}

const initialSchema: Migration = {
  version: 1,
  name: 'initial-schema',
  up: async (db) => {
    await db.execAsync(`
      -- The player. A single row; the app has no accounts.
      CREATE TABLE player_profile (
        id                            TEXT PRIMARY KEY NOT NULL,
        name                          TEXT NOT NULL,
        avatar_uri                    TEXT,
        created_at                    TEXT NOT NULL,
        total_xp                      INTEGER NOT NULL DEFAULT 0,
        next_template_rotation_order  INTEGER NOT NULL DEFAULT 0
      );

      -- Key/value settings, kept as rows so adding a setting needs no migration.
      CREATE TABLE app_settings (
        key    TEXT PRIMARY KEY NOT NULL,
        value  TEXT NOT NULL
      );

      -- Movement patterns. Stable identity, independent of difficulty.
      CREATE TABLE exercise (
        id               TEXT PRIMARY KEY NOT NULL,
        name             TEXT NOT NULL,
        pattern          TEXT NOT NULL,
        primary_muscles  TEXT NOT NULL,
        chain_id         TEXT
      );

      -- Specific difficulties of a movement. These form the progression chains.
      CREATE TABLE exercise_variation (
        id                     TEXT PRIMARY KEY NOT NULL,
        exercise_id            TEXT NOT NULL REFERENCES exercise(id),
        chain_id               TEXT NOT NULL,
        name                   TEXT NOT NULL,
        tier                   INTEGER NOT NULL,
        previous_variation_id  TEXT,
        measurement_kind       TEXT NOT NULL,
        minimum_phase          TEXT NOT NULL,
        execution              TEXT NOT NULL,
        form_requirements      TEXT NOT NULL,
        difficulty_score       REAL NOT NULL
      );
      CREATE INDEX idx_variation_chain ON exercise_variation(chain_id, tier);

      CREATE TABLE progression_chain (
        id            TEXT PRIMARY KEY NOT NULL,
        name          TEXT NOT NULL,
        variation_ids TEXT NOT NULL
      );

      -- Prescription. Editing a template never touches recorded history.
      CREATE TABLE workout_template (
        id              TEXT PRIMARY KEY NOT NULL,
        name            TEXT NOT NULL,
        focus           TEXT NOT NULL,
        rotation_order  INTEGER NOT NULL
      );

      CREATE TABLE workout_template_exercise (
        id            TEXT PRIMARY KEY NOT NULL,
        template_id   TEXT NOT NULL REFERENCES workout_template(id) ON DELETE CASCADE,
        variation_id  TEXT NOT NULL REFERENCES exercise_variation(id),
        position      INTEGER NOT NULL,
        sets          INTEGER NOT NULL,
        target_min    REAL NOT NULL,
        target_max    REAL NOT NULL,
        rest_seconds  INTEGER NOT NULL,
        tempo         TEXT,
        cues          TEXT NOT NULL
      );
      CREATE INDEX idx_template_exercise ON workout_template_exercise(template_id, position);

      -- Recorded training. Snapshots template and exercise names so that
      -- renaming or represcribing later cannot rewrite what happened.
      CREATE TABLE workout_session (
        id                TEXT PRIMARY KEY NOT NULL,
        template_id       TEXT NOT NULL,
        template_name     TEXT NOT NULL,
        template_focus    TEXT NOT NULL,
        phase_id          TEXT NOT NULL,
        status            TEXT NOT NULL,
        started_at        TEXT NOT NULL,
        completed_at      TEXT,
        duration_seconds  INTEGER,
        xp_awarded        INTEGER,
        session_number    INTEGER
      );
      CREATE INDEX idx_session_status ON workout_session(status);
      CREATE INDEX idx_session_completed ON workout_session(completed_at);

      CREATE TABLE exercise_performance (
        id                TEXT PRIMARY KEY NOT NULL,
        session_id        TEXT NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
        position          INTEGER NOT NULL,
        variation_id      TEXT NOT NULL,
        exercise_name     TEXT NOT NULL,
        variation_name    TEXT NOT NULL,
        measurement_kind  TEXT NOT NULL,
        sets              INTEGER NOT NULL,
        target_min        REAL NOT NULL,
        target_max        REAL NOT NULL,
        rest_seconds      INTEGER NOT NULL,
        tempo             TEXT,
        cues              TEXT NOT NULL,
        completed_at      TEXT
      );
      CREATE INDEX idx_performance_session ON exercise_performance(session_id, position);
      CREATE INDEX idx_performance_variation ON exercise_performance(variation_id);

      CREATE TABLE set_performance (
        id               TEXT PRIMARY KEY NOT NULL,
        performance_id   TEXT NOT NULL REFERENCES exercise_performance(id) ON DELETE CASCADE,
        set_number       INTEGER NOT NULL,
        primary_value    REAL NOT NULL,
        secondary_value  REAL,
        completed_at     TEXT NOT NULL,
        UNIQUE (performance_id, set_number)
      );
      CREATE INDEX idx_set_performance ON set_performance(performance_id, set_number);

      -- Body measurements. Always stored metric.
      CREATE TABLE measurement (
        id           TEXT PRIMARY KEY NOT NULL,
        type         TEXT NOT NULL,
        value        REAL NOT NULL,
        recorded_on  TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        note         TEXT
      );
      CREATE INDEX idx_measurement_type_date ON measurement(type, recorded_on);

      -- Where each variation sits for this player.
      CREATE TABLE progression_state (
        variation_id         TEXT PRIMARY KEY NOT NULL REFERENCES exercise_variation(id),
        status               TEXT NOT NULL,
        qualifying_sessions  INTEGER NOT NULL DEFAULT 0,
        started_at           TEXT,
        mastered_at          TEXT,
        unlocked_at          TEXT
      );

      -- The in-progress session's UI state, written as the workout happens so
      -- an interrupted quest can be resumed exactly where it left off.
      CREATE TABLE active_session_state (
        session_id            TEXT PRIMARY KEY NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
        current_position      INTEGER NOT NULL DEFAULT 0,
        rest_started_at       TEXT,
        rest_duration_seconds INTEGER,
        rest_paused_at        TEXT,
        updated_at            TEXT NOT NULL
      );
    `);
  },
};

/**
 * Records how long a rest period spent paused. Without it a paused rest was
 * restored as if it had been running the whole time, so reopening the app came
 * back short by however long the player had paused for.
 */
const restPausedTotal: Migration = {
  version: 2,
  name: 'rest-paused-total',
  up: async (db) => {
    await db.execAsync(`
      ALTER TABLE active_session_state
        ADD COLUMN rest_paused_total_ms INTEGER NOT NULL DEFAULT 0;
    `);
  },
};

/**
 * At most one active quest, enforced by the database.
 *
 * The service re-checks inside its transaction, but a unique index makes the
 * impossible state impossible regardless of how the rows are written — a
 * cheaper and more durable guarantee than any amount of application logic.
 *
 * A unique index on `status` restricted to active rows means two rows can never
 * both hold `'active'`: they would collide on the same key.
 */
const singleActiveSession: Migration = {
  version: 3,
  name: 'single-active-session',
  up: async (db) => {
    // Any database that already carries more than one active session is
    // reconciled first, keeping the most recently started and abandoning the
    // rest, or the index could not be created.
    await db.execAsync(`
      UPDATE workout_session
         SET status = 'abandoned'
       WHERE status = 'active'
         AND id NOT IN (
           SELECT id FROM workout_session
            WHERE status = 'active'
            ORDER BY started_at DESC, id DESC
            LIMIT 1
         );

      DELETE FROM active_session_state
       WHERE session_id NOT IN (
         SELECT id FROM workout_session WHERE status = 'active'
       );

      CREATE UNIQUE INDEX idx_single_active_session
        ON workout_session(status)
        WHERE status = 'active';
    `);
  },
};

/** Ordered list of every migration this build knows how to apply. */
export const MIGRATIONS: readonly Migration[] = [
  initialSchema,
  restPausedTotal,
  singleActiveSession,
];

/** The schema version a fully migrated database reports. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  0,
);

/**
 * Applies every migration the database has not yet run, in order, inside a
 * transaction per migration so a failure cannot leave a half-applied schema.
 */
export async function migrate(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = row?.user_version ?? 0;

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (migration.version <= currentVersion) continue;

    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });

    currentVersion = migration.version;
  }

  return currentVersion;
}
