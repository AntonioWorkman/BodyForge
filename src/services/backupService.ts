import { APP_CONFIG } from '@/config/app.config';
import type { RepositoryBundle } from '@/database/repositories/interfaces';
import type { SqlDatabase } from '@/database/sqlDatabase';
import type { UnitOfWork } from '@/database/unitOfWork';
import { encodeStringArray } from '@/database/repositories/rows';
import { seedCatalog, seedProgressionStates } from '@/database/seed';
import { recomputeMasteryWith } from './progressionService';

import type { ProgressionState, WorkoutSessionDetail } from '@/domain/types';

import type { Backup, BackupValidationResult } from './backupSchema';
import { validateBackup } from './backupSchema';

/**
 * Local backup.
 *
 * Export produces a portable JSON document of everything the player created.
 * Reference data — the movement catalog and chain definitions — is deliberately
 * excluded: it ships with the app and re-seeds on import, so a backup stays
 * small and never restores a stale catalog over a newer one.
 *
 * Import is all-or-nothing. The document is fully validated first, then the
 * player's tables are replaced inside a single transaction.
 */
export class BackupService {
  constructor(
    private readonly repositories: RepositoryBundle,
    private readonly db: SqlDatabase,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** Builds the backup document. */
  async export(now = new Date()): Promise<Backup> {
    const [profile, settings, sessions, measurements, progression, templateExercises] =
      await Promise.all([
        this.repositories.player.get(),
        this.repositories.settings.get(),
        this.repositories.sessions.listCompleted(),
        this.repositories.measurements.list(),
        this.repositories.progression.list(),
        this.repositories.catalog.listTemplateExercises(),
      ]);

    if (!profile) throw new Error('There is no player to export yet.');

    return {
      app: APP_CONFIG.name,
      formatVersion: APP_CONFIG.backupFormatVersion,
      exportedAt: now.toISOString(),
      // The avatar is a path into this installation's private storage. A JSON
      // backup carries no image data, so exporting the path would restore a
      // reference to a file that does not exist on the other device — an
      // avatar that appears to have survived but is broken. It is dropped
      // instead, and the player can set a new one.
      profile: { ...profile, avatarUri: null },
      settings,
      sessions: sessions.flatMap(toBackupSession),
      measurements,
      progression: progression.map(toBackupProgression),
      templateExercises,
    };
  }

  /** Export serialised for writing to a file. */
  async exportToJson(now = new Date()): Promise<string> {
    return JSON.stringify(await this.export(now), null, 2);
  }

  /** Suggested filename, stable enough to sort chronologically. */
  suggestFileName(now = new Date()): string {
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${APP_CONFIG.name.toLowerCase()}-backup-${stamp}.json`;
  }

  /** Validates untrusted backup text without writing anything. */
  validate(raw: string): BackupValidationResult {
    return validateBackup(raw);
  }

  /**
   * Replaces all player data with the contents of a validated backup.
   * Validation runs again here so this can never be called with unchecked text.
   */
  async import(raw: string, now = new Date()): Promise<{ sessions: number; measurements: number }> {
    const result = validateBackup(raw);
    if (!result.ok) {
      throw new Error(`This backup could not be imported:\n${result.errors.join('\n')}`);
    }

    const backup = result.backup;

    // The catalog is refreshed first, outside the transaction. It has to happen
    // before the restore so foreign keys have targets, and it cannot happen
    // inside it: `seedCatalog` opens its own transaction, and Expo SQLite
    // issues a bare BEGIN that fails when nested.
    // Step 1, outside the restore: refresh reference data. The catalog is not
    // player data — it ships with the app, re-seeds idempotently, and must be
    // present before player rows can reference it. Failing here changes
    // nothing the player owns.
    await seedCatalog(this.db, now.toISOString());

    const knownVariations = await this.db.getAllAsync<{ id: string }>(
      'SELECT id FROM exercise_variation',
    );
    const known = new Set(knownVariations.map((row) => row.id));

    // Step 2: the destructive replacement, as one transaction. Everything a
    // successful restore requires happens inside it — including progression
    // reconstruction, which used to run after the commit. A failure there left
    // the old data already deleted while the UI reported "Import failed".
    await this.unitOfWork.run(async (repos, db) => {
      await this.clearPlayerTables(db);

      await db.runAsync(
        `INSERT INTO player_profile
           (id, name, avatar_uri, created_at, total_xp, next_template_rotation_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'player',
          backup.profile.name,
          // Always null, whatever the document holds. The format carries no
          // image data, so any path in it belongs to another installation —
          // restoring it would present a broken reference as a surviving
          // avatar. Older or hand-written v1 files can still contain one.
          null,
          backup.profile.createdAt,
          backup.profile.totalXp,
          backup.profile.nextTemplateRotationOrder,
        ],
      );

      for (const [key, value] of Object.entries(backup.settings)) {
        await db.runAsync('INSERT INTO app_settings (key, value) VALUES (?, ?)', [
          key,
          String(value),
        ]);
      }

      for (const session of backup.sessions) {
        await db.runAsync(
          `INSERT INTO workout_session
             (id, template_id, template_name, template_focus, phase_id, status,
              started_at, completed_at, duration_seconds, xp_awarded, session_number)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            session.id,
            session.templateId,
            session.templateName,
            session.templateFocus,
            session.phaseId,
            session.status,
            session.startedAt,
            session.completedAt,
            session.durationSeconds,
            session.xpAwarded,
            session.sessionNumber,
          ],
        );

        for (const performance of session.performances) {
          await db.runAsync(
            `INSERT INTO exercise_performance
               (id, session_id, position, variation_id, exercise_name, variation_name,
                measurement_kind, sets, target_min, target_max, rest_seconds, tempo, cues, completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              performance.id,
              performance.sessionId,
              performance.position,
              performance.variationId,
              performance.exerciseName,
              performance.variationName,
              performance.measurementKind,
              performance.prescribed.sets,
              performance.prescribed.targetMin,
              performance.prescribed.targetMax,
              performance.prescribed.restSeconds,
              performance.prescribed.tempo,
              encodeStringArray(performance.prescribed.cues),
              performance.completedAt,
            ],
          );

          for (const set of performance.sets) {
            await db.runAsync(
              `INSERT INTO set_performance
                 (id, performance_id, set_number, primary_value, secondary_value, completed_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                set.id,
                set.performanceId,
                set.setNumber,
                set.primaryValue,
                set.secondaryValue,
                set.completedAt,
              ],
            );
          }
        }
      }

      for (const measurement of backup.measurements) {
        await db.runAsync(
          `INSERT INTO measurement (id, type, value, recorded_on, created_at, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            measurement.id,
            measurement.type,
            measurement.value,
            measurement.recordedOn,
            measurement.createdAt,
            measurement.note,
          ],
        );
      }

      await db.runAsync('DELETE FROM progression_state', []);

      for (const state of backup.progression) {
        if (!known.has(state.variationId)) continue;
        await db.runAsync(
          `INSERT INTO progression_state
             (variation_id, status, qualifying_sessions, started_at, mastered_at, unlocked_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            state.variationId,
            state.status,
            state.qualifyingSessions,
            state.startedAt,
            state.masteredAt,
            state.unlockedAt,
          ],
        );
      }

      for (const entry of backup.templateExercises) {
        // Skipped rather than written blind: an unknown variation would fail
        // the foreign key and abort the whole restore. The template keeps the
        // freshly seeded default instead.
        if (!known.has(entry.variationId)) continue;
        await db.runAsync('UPDATE workout_template_exercise SET variation_id = ? WHERE id = ?', [
          entry.variationId,
          entry.id,
        ]);
      }
      // A backup can predate variations this build knows about; those get
      // their starting state now that the restored rows are in place.
      await seedProgressionStates(db, now.toISOString());

      // Qualifying counts are recomputed from the sessions actually restored
      // rather than trusted from the document, and inside this transaction so
      // a restore never commits with derived state left stale.
      await recomputeMasteryWith(repos);
    });

    return { sessions: backup.sessions.length, measurements: backup.measurements.length };
  }

  /**
   * Erases everything the player created and returns the app to a first-launch
   * state. Reference data is re-seeded so the app remains usable afterwards.
   */
  /**
   * Erases everything the player created and returns the app to a first-launch
   * state.
   *
   * The catalog re-seed is part of the operation, not a follow-up. It used to
   * run after the deletion committed, so a failure there left the data already
   * gone while the UI reported that nothing had changed. Rebuilding reference
   * data is deterministic local work, so folding it in costs nothing and makes
   * the reset genuinely all-or-nothing: either the app comes back usable, or
   * the player still has everything.
   */
  async clearAll(now = new Date()): Promise<void> {
    await this.unitOfWork.run(async (_repos, db) => {
      await this.clearPlayerTables(db);
      await db.runAsync('DELETE FROM progression_state', []);

      // Joins the ambient transaction rather than opening its own, and restores
      // the catalog plus a starting progression state for every variation.
      await seedCatalog(db, now.toISOString());
    });
  }

  private async clearPlayerTables(db: SqlDatabase): Promise<void> {
    for (const table of [
      'set_performance',
      'exercise_performance',
      'active_session_state',
      'workout_session',
      'measurement',
      'app_settings',
      'player_profile',
    ]) {
      await db.runAsync(`DELETE FROM ${table}`, []);
    }
  }
}

/**
 * Narrows a stored session to the completed shape a backup carries.
 *
 * The format is completed history only, and the compiler will not take that on
 * trust: anything without its completion fields is dropped rather than exported
 * as a record the importer would then reject.
 */
function toBackupSession(session: WorkoutSessionDetail): Backup['sessions'] {
  if (
    session.status !== 'completed' ||
    session.completedAt === null ||
    session.durationSeconds === null ||
    session.xpAwarded === null ||
    session.sessionNumber === null ||
    session.performances.length === 0
  ) {
    return [];
  }

  return [
    {
      ...session,
      status: 'completed',
      completedAt: session.completedAt,
      durationSeconds: session.durationSeconds,
      xpAwarded: session.xpAwarded,
      sessionNumber: session.sessionNumber,
    },
  ];
}

/**
 * Narrows a stored progression row to the statuses a backup may carry.
 *
 * `ready` is derived at read time and never persisted, so it cannot reach a
 * document from storage — but the type allows it, and a `ready` value in a file
 * would describe a state the app does not have. It maps back to `current`,
 * which is what it is underneath.
 */
function toBackupProgression(state: ProgressionState): Backup['progression'][number] {
  return { ...state, status: state.status === 'ready' ? 'current' : state.status };
}
