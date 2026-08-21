import type {
  AppSettings,
  Exercise,
  ExercisePerformanceWithSets,
  ExerciseVariation,
  IsoDate,
  Measurement,
  MeasurementType,
  PlayerProfile,
  ProgressionChain,
  ProgressionState,
  ProgressionStatus,
  SessionStatus,
  SetPerformance,
  WorkoutSession,
  WorkoutSessionDetail,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from '@/domain/types';

import type { SqlDatabase } from '../sqlDatabase';
import {
  encodeStringArray,
  toChain,
  toExercise,
  toMeasurement,
  toPerformance,
  toPlayer,
  toProgressionState,
  toSession,
  toSet,
  toTemplate,
  toTemplateExercise,
  toVariation,
} from './rows';
import type {
  ChainRow,
  ExerciseRow,
  MeasurementRow,
  PerformanceRow,
  PlayerRow,
  ProgressionStateRow,
  SessionRow,
  SetRow,
  TemplateExerciseRow,
  TemplateRow,
  VariationRow,
} from './rows';
import type {
  ActiveSessionUiState,
  CatalogRepository,
  CompleteSessionInput,
  CreateSessionInput,
  MeasurementRepository,
  PlayerRepository,
  ProgressionRepository,
  RecordSetInput,
  RepositoryBundle,
  SessionRepository,
  SettingsRepository,
} from './interfaces';
import { DEFAULT_SETTINGS, decodeSettings, encodeSettings } from '../settingsCodec';

/**
 * SQLite implementations of the repository contracts.
 *
 * These are the only files in the app that write SQL. Everything here is a
 * direct translation of a repository method into statements — no domain rules,
 * no derived values.
 */

const PLAYER_ID = 'player';

class SqlitePlayerRepository implements PlayerRepository {
  constructor(private readonly db: SqlDatabase) {}

  async get(): Promise<PlayerProfile | null> {
    const row = await this.db.getFirstAsync<PlayerRow>(
      'SELECT * FROM player_profile WHERE id = ?',
      [PLAYER_ID],
    );
    return row ? toPlayer(row) : null;
  }

  async create(profile: PlayerProfile): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO player_profile
         (id, name, avatar_uri, created_at, total_xp, next_template_rotation_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        PLAYER_ID,
        profile.name,
        profile.avatarUri,
        profile.createdAt,
        profile.totalXp,
        profile.nextTemplateRotationOrder,
      ],
    );
  }

  async update(patch: Partial<Omit<PlayerProfile, 'id' | 'createdAt'>>): Promise<void> {
    const columns: Record<string, string> = {
      name: 'name',
      avatarUri: 'avatar_uri',
      totalXp: 'total_xp',
      nextTemplateRotationOrder: 'next_template_rotation_order',
    };

    const assignments: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, column] of Object.entries(columns)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      values.push(value as string | number | null);
    }

    if (assignments.length === 0) return;
    values.push(PLAYER_ID);
    await this.db.runAsync(
      `UPDATE player_profile SET ${assignments.join(', ')} WHERE id = ?`,
      values,
    );
  }

  async addXp(amount: number): Promise<number> {
    await this.db.runAsync(
      'UPDATE player_profile SET total_xp = MAX(0, total_xp + ?) WHERE id = ?',
      [Math.round(amount), PLAYER_ID],
    );
    const row = await this.db.getFirstAsync<{ total_xp: number }>(
      'SELECT total_xp FROM player_profile WHERE id = ?',
      [PLAYER_ID],
    );
    return row?.total_xp ?? 0;
  }
}

class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async get(): Promise<AppSettings> {
    const rows = await this.db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM app_settings',
    );
    return decodeSettings(rows);
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const entries = encodeSettings(patch);
    await this.db.withTransactionAsync(async () => {
      for (const [key, value] of entries) {
        await this.db.runAsync(
          'INSERT INTO app_settings (key, value) VALUES (?, ?) ' +
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, value],
        );
      }
    });
    return this.get();
  }
}

class SqliteCatalogRepository implements CatalogRepository {
  constructor(private readonly db: SqlDatabase) {}

  async listExercises(): Promise<Exercise[]> {
    const rows = await this.db.getAllAsync<ExerciseRow>('SELECT * FROM exercise ORDER BY name');
    return rows.map(toExercise);
  }

  async listVariations(): Promise<ExerciseVariation[]> {
    const rows = await this.db.getAllAsync<VariationRow>(
      'SELECT * FROM exercise_variation ORDER BY chain_id, tier',
    );
    return rows.map(toVariation);
  }

  async listChains(): Promise<ProgressionChain[]> {
    const rows = await this.db.getAllAsync<ChainRow>(
      'SELECT * FROM progression_chain ORDER BY name',
    );
    return rows.map(toChain);
  }

  async listTemplates(): Promise<WorkoutTemplate[]> {
    const rows = await this.db.getAllAsync<TemplateRow>(
      'SELECT * FROM workout_template ORDER BY rotation_order',
    );
    return rows.map(toTemplate);
  }

  async listTemplateExercises(templateId?: string): Promise<WorkoutTemplateExercise[]> {
    const rows = templateId
      ? await this.db.getAllAsync<TemplateExerciseRow>(
          'SELECT * FROM workout_template_exercise WHERE template_id = ? ORDER BY position',
          [templateId],
        )
      : await this.db.getAllAsync<TemplateExerciseRow>(
          'SELECT * FROM workout_template_exercise ORDER BY template_id, position',
        );
    return rows.map(toTemplateExercise);
  }

  async replaceTemplateExerciseVariation(
    templateExerciseId: string,
    variationId: string,
  ): Promise<void> {
    await this.db.runAsync('UPDATE workout_template_exercise SET variation_id = ? WHERE id = ?', [
      variationId,
      templateExerciseId,
    ]);
  }
}

class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: SqlDatabase) {}

  async create({ session, performances }: CreateSessionInput): Promise<void> {
    await this.db.withTransactionAsync(async () => {
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

      for (const performance of performances) {
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
      }
    });
  }

  private async hydrate(sessions: WorkoutSession[]): Promise<WorkoutSessionDetail[]> {
    if (sessions.length === 0) return [];

    const ids = sessions.map((session) => session.id);
    const placeholders = ids.map(() => '?').join(', ');

    const performanceRows = await this.db.getAllAsync<PerformanceRow>(
      `SELECT * FROM exercise_performance WHERE session_id IN (${placeholders}) ORDER BY position`,
      ids,
    );
    const performanceIds = performanceRows.map((row) => row.id);

    const setRows =
      performanceIds.length > 0
        ? await this.db.getAllAsync<SetRow>(
            `SELECT * FROM set_performance WHERE performance_id IN (${performanceIds
              .map(() => '?')
              .join(', ')}) ORDER BY set_number`,
            performanceIds,
          )
        : [];

    const setsByPerformance = new Map<string, SetPerformance[]>();
    for (const row of setRows) {
      const list = setsByPerformance.get(row.performance_id) ?? [];
      list.push(toSet(row));
      setsByPerformance.set(row.performance_id, list);
    }

    const performancesBySession = new Map<string, ExercisePerformanceWithSets[]>();
    for (const row of performanceRows) {
      const list = performancesBySession.get(row.session_id) ?? [];
      list.push({ ...toPerformance(row), sets: setsByPerformance.get(row.id) ?? [] });
      performancesBySession.set(row.session_id, list);
    }

    return sessions.map((session) => ({
      ...session,
      performances: performancesBySession.get(session.id) ?? [],
    }));
  }

  async findActive(): Promise<WorkoutSessionDetail | null> {
    const row = await this.db.getFirstAsync<SessionRow>(
      "SELECT * FROM workout_session WHERE status = 'active' ORDER BY started_at DESC LIMIT 1",
    );
    if (!row) return null;
    const [detail] = await this.hydrate([toSession(row)]);
    return detail ?? null;
  }

  async findById(sessionId: string): Promise<WorkoutSessionDetail | null> {
    const row = await this.db.getFirstAsync<SessionRow>(
      'SELECT * FROM workout_session WHERE id = ?',
      [sessionId],
    );
    if (!row) return null;
    const [detail] = await this.hydrate([toSession(row)]);
    return detail ?? null;
  }

  async listCompleted(limit?: number): Promise<WorkoutSessionDetail[]> {
    const summaries = await this.listCompletedSummaries(limit);
    return this.hydrate(summaries);
  }

  async listCompletedSummaries(limit?: number): Promise<WorkoutSession[]> {
    const sql =
      "SELECT * FROM workout_session WHERE status = 'completed' ORDER BY completed_at ASC" +
      (limit ? ' LIMIT ?' : '');
    const rows = limit
      ? await this.db.getAllAsync<SessionRow>(sql, [limit])
      : await this.db.getAllAsync<SessionRow>(sql);
    return rows.map(toSession);
  }

  async countCompleted(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM workout_session WHERE status = 'completed'",
    );
    return row?.count ?? 0;
  }

  async listPerformancesForVariation(variationId: string): Promise<ExercisePerformanceWithSets[]> {
    const rows = await this.db.getAllAsync<PerformanceRow>(
      `SELECT p.* FROM exercise_performance p
         JOIN workout_session s ON s.id = p.session_id
        WHERE p.variation_id = ? AND s.status = 'completed'
        ORDER BY s.completed_at DESC`,
      [variationId],
    );
    if (rows.length === 0) return [];

    const setRows = await this.db.getAllAsync<SetRow>(
      `SELECT * FROM set_performance WHERE performance_id IN (${rows
        .map(() => '?')
        .join(', ')}) ORDER BY set_number`,
      rows.map((row) => row.id),
    );

    const setsByPerformance = new Map<string, SetPerformance[]>();
    for (const row of setRows) {
      const list = setsByPerformance.get(row.performance_id) ?? [];
      list.push(toSet(row));
      setsByPerformance.set(row.performance_id, list);
    }

    return rows.map((row) => ({
      ...toPerformance(row),
      sets: setsByPerformance.get(row.id) ?? [],
    }));
  }

  async listCompletedPerformancesByVariation(): Promise<
    Map<string, ExercisePerformanceWithSets[]>
  > {
    const rows = await this.db.getAllAsync<PerformanceRow>(
      `SELECT p.* FROM exercise_performance p
         JOIN workout_session s ON s.id = p.session_id
        WHERE s.status = 'completed'
        ORDER BY s.completed_at DESC, p.position ASC`,
    );

    const grouped = new Map<string, ExercisePerformanceWithSets[]>();
    if (rows.length === 0) return grouped;

    const setRows = await this.db.getAllAsync<SetRow>(
      'SELECT * FROM set_performance ORDER BY set_number',
    );

    const setsByPerformance = new Map<string, SetPerformance[]>();
    for (const row of setRows) {
      const list = setsByPerformance.get(row.performance_id) ?? [];
      list.push(toSet(row));
      setsByPerformance.set(row.performance_id, list);
    }

    for (const row of rows) {
      const performance: ExercisePerformanceWithSets = {
        ...toPerformance(row),
        sets: setsByPerformance.get(row.id) ?? [],
      };
      const list = grouped.get(row.variation_id) ?? [];
      list.push(performance);
      grouped.set(row.variation_id, list);
    }

    return grouped;
  }

  async recordSet(input: RecordSetInput): Promise<SetPerformance> {
    const id = `${input.performanceId}-s${input.setNumber}`;
    await this.db.runAsync(
      `INSERT INTO set_performance
         (id, performance_id, set_number, primary_value, secondary_value, completed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(performance_id, set_number) DO UPDATE SET
         primary_value = excluded.primary_value,
         secondary_value = excluded.secondary_value,
         completed_at = excluded.completed_at`,
      [
        id,
        input.performanceId,
        input.setNumber,
        input.primaryValue,
        input.secondaryValue,
        input.completedAt,
      ],
    );

    return {
      id,
      performanceId: input.performanceId,
      setNumber: input.setNumber,
      primaryValue: input.primaryValue,
      secondaryValue: input.secondaryValue,
      completedAt: input.completedAt,
    };
  }

  async removeSet(performanceId: string, setNumber: number): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM set_performance WHERE performance_id = ? AND set_number = ?',
      [performanceId, setNumber],
    );
  }

  async markPerformanceCompleted(performanceId: string, completedAt: string | null): Promise<void> {
    await this.db.runAsync('UPDATE exercise_performance SET completed_at = ? WHERE id = ?', [
      completedAt,
      performanceId,
    ]);
  }

  async complete(input: CompleteSessionInput): Promise<void> {
    await this.db.runAsync(
      `UPDATE workout_session
          SET status = 'completed', completed_at = ?, duration_seconds = ?,
              xp_awarded = ?, session_number = ?
        WHERE id = ?`,
      [
        input.completedAt,
        input.durationSeconds,
        input.xpAwarded,
        input.sessionNumber,
        input.sessionId,
      ],
    );
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    await this.db.runAsync('UPDATE workout_session SET status = ? WHERE id = ?', [
      status,
      sessionId,
    ]);
  }

  async deleteSession(sessionId: string): Promise<void> {
    // Child rows are removed explicitly because foreign keys are not enforced
    // by default on every SQLite build the app may run against.
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `DELETE FROM set_performance WHERE performance_id IN
           (SELECT id FROM exercise_performance WHERE session_id = ?)`,
        [sessionId],
      );
      await this.db.runAsync('DELETE FROM exercise_performance WHERE session_id = ?', [sessionId]);
      await this.db.runAsync('DELETE FROM active_session_state WHERE session_id = ?', [sessionId]);
      await this.db.runAsync('DELETE FROM workout_session WHERE id = ?', [sessionId]);
    });
  }

  async saveUiState(state: ActiveSessionUiState): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO active_session_state
         (session_id, current_position, rest_started_at, rest_duration_seconds, rest_paused_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         current_position = excluded.current_position,
         rest_started_at = excluded.rest_started_at,
         rest_duration_seconds = excluded.rest_duration_seconds,
         rest_paused_at = excluded.rest_paused_at,
         updated_at = excluded.updated_at`,
      [
        state.sessionId,
        state.currentPosition,
        state.restStartedAt,
        state.restDurationSeconds,
        state.restPausedAt,
        state.updatedAt,
      ],
    );
  }

  async getUiState(sessionId: string): Promise<ActiveSessionUiState | null> {
    const row = await this.db.getFirstAsync<{
      session_id: string;
      current_position: number;
      rest_started_at: string | null;
      rest_duration_seconds: number | null;
      rest_paused_at: string | null;
      updated_at: string;
    }>('SELECT * FROM active_session_state WHERE session_id = ?', [sessionId]);

    if (!row) return null;
    return {
      sessionId: row.session_id,
      currentPosition: row.current_position,
      restStartedAt: row.rest_started_at,
      restDurationSeconds: row.rest_duration_seconds,
      restPausedAt: row.rest_paused_at,
      updatedAt: row.updated_at,
    };
  }
}

class SqliteMeasurementRepository implements MeasurementRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(type?: MeasurementType): Promise<Measurement[]> {
    const rows = type
      ? await this.db.getAllAsync<MeasurementRow>(
          'SELECT * FROM measurement WHERE type = ? ORDER BY recorded_on ASC, created_at ASC',
          [type],
        )
      : await this.db.getAllAsync<MeasurementRow>(
          'SELECT * FROM measurement ORDER BY recorded_on ASC, created_at ASC',
        );
    return rows.map(toMeasurement);
  }

  async listSince(type: MeasurementType, since: IsoDate): Promise<Measurement[]> {
    const rows = await this.db.getAllAsync<MeasurementRow>(
      'SELECT * FROM measurement WHERE type = ? AND recorded_on >= ? ORDER BY recorded_on ASC',
      [type, since],
    );
    return rows.map(toMeasurement);
  }

  async latest(type: MeasurementType): Promise<Measurement | null> {
    const row = await this.db.getFirstAsync<MeasurementRow>(
      'SELECT * FROM measurement WHERE type = ? ORDER BY recorded_on DESC, created_at DESC LIMIT 1',
      [type],
    );
    return row ? toMeasurement(row) : null;
  }

  async add(measurement: Measurement): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO measurement (id, type, value, recorded_on, created_at, note)
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

  async remove(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM measurement WHERE id = ?', [id]);
  }
}

class SqliteProgressionRepository implements ProgressionRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(): Promise<ProgressionState[]> {
    const rows = await this.db.getAllAsync<ProgressionStateRow>('SELECT * FROM progression_state');
    return rows.map(toProgressionState);
  }

  async get(variationId: string): Promise<ProgressionState | null> {
    const row = await this.db.getFirstAsync<ProgressionStateRow>(
      'SELECT * FROM progression_state WHERE variation_id = ?',
      [variationId],
    );
    return row ? toProgressionState(row) : null;
  }

  async upsert(state: ProgressionState): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO progression_state
         (variation_id, status, qualifying_sessions, started_at, mastered_at, unlocked_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(variation_id) DO UPDATE SET
         status = excluded.status,
         qualifying_sessions = excluded.qualifying_sessions,
         started_at = excluded.started_at,
         mastered_at = excluded.mastered_at,
         unlocked_at = excluded.unlocked_at`,
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

  async setStatus(variationId: string, status: ProgressionStatus, at: string): Promise<void> {
    const existing = await this.get(variationId);
    const next: ProgressionState = {
      variationId,
      status,
      qualifyingSessions: existing?.qualifyingSessions ?? 0,
      startedAt: status === 'current' ? (existing?.startedAt ?? at) : (existing?.startedAt ?? null),
      masteredAt: status === 'mastered' ? at : (existing?.masteredAt ?? null),
      unlockedAt: existing?.unlockedAt ?? (status === 'locked' ? null : at),
    };
    await this.upsert(next);
  }

  async setQualifyingSessions(variationId: string, count: number): Promise<void> {
    await this.db.runAsync(
      'UPDATE progression_state SET qualifying_sessions = ? WHERE variation_id = ?',
      [count, variationId],
    );
  }
}

/** Builds the full repository set over one database handle. */
export function createRepositories(db: SqlDatabase): RepositoryBundle {
  return {
    player: new SqlitePlayerRepository(db),
    settings: new SqliteSettingsRepository(db),
    catalog: new SqliteCatalogRepository(db),
    sessions: new SqliteSessionRepository(db),
    measurements: new SqliteMeasurementRepository(db),
    progression: new SqliteProgressionRepository(db),
  };
}

export { DEFAULT_SETTINGS };
