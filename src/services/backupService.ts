import { APP_CONFIG } from '@/config/app.config';
import type { RepositoryBundle } from '@/database/repositories/interfaces';
import type { SqlDatabase } from '@/database/sqlDatabase';
import { encodeStringArray } from '@/database/repositories/rows';
import { seedCatalog } from '@/database/seed';

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
      profile,
      settings,
      sessions,
      measurements,
      progression,
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

    await this.db.withTransactionAsync(async () => {
      await this.clearPlayerTables();

      await this.db.runAsync(
        `INSERT INTO player_profile
           (id, name, avatar_uri, created_at, total_xp, next_template_rotation_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'player',
          backup.profile.name,
          backup.profile.avatarUri,
          backup.profile.createdAt,
          backup.profile.totalXp,
          backup.profile.nextTemplateRotationOrder,
        ],
      );

      for (const [key, value] of Object.entries(backup.settings)) {
        await this.db.runAsync('INSERT INTO app_settings (key, value) VALUES (?, ?)', [
          key,
          String(value),
        ]);
      }

      for (const session of backup.sessions) {
        await this.db.runAsync(
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
          await this.db.runAsync(
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
            await this.db.runAsync(
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
        await this.db.runAsync(
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

      // The catalog is re-seeded before progression rows so that a backup made
      // on an older build cannot reference a variation this build lacks.
      await seedCatalog(this.db, now.toISOString());
      await this.db.runAsync('DELETE FROM progression_state', []);

      const knownVariations = await this.db.getAllAsync<{ id: string }>(
        'SELECT id FROM exercise_variation',
      );
      const known = new Set(knownVariations.map((row) => row.id));

      for (const state of backup.progression) {
        if (!known.has(state.variationId)) continue;
        await this.db.runAsync(
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
        await this.db.runAsync(
          'UPDATE workout_template_exercise SET variation_id = ? WHERE id = ?',
          [entry.variationId, entry.id],
        );
      }
    });

    return { sessions: backup.sessions.length, measurements: backup.measurements.length };
  }

  /**
   * Erases everything the player created and returns the app to a first-launch
   * state. Reference data is re-seeded so the app remains usable afterwards.
   */
  async clearAll(now = new Date()): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.clearPlayerTables();
      await this.db.runAsync('DELETE FROM progression_state', []);
    });
    await seedCatalog(this.db, now.toISOString());
  }

  private async clearPlayerTables(): Promise<void> {
    for (const table of [
      'set_performance',
      'exercise_performance',
      'active_session_state',
      'workout_session',
      'measurement',
      'app_settings',
      'player_profile',
    ]) {
      await this.db.runAsync(`DELETE FROM ${table}`, []);
    }
  }
}
