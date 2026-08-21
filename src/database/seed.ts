import {
  EXERCISES,
  EXERCISE_VARIATIONS,
  PROGRESSION_CHAINS,
} from '@/domain/program/catalog';
import { WORKOUT_TEMPLATES, WORKOUT_TEMPLATE_EXERCISES } from '@/domain/program/templates';
import type { ProgressionState } from '@/domain/types';

import { encodeStringArray } from './repositories/rows';
import type { SqlDatabase } from './sqlDatabase';

/**
 * Seeds the catalog and the starting program.
 *
 * This writes reference data only — movements, variations, chains, templates
 * and their prescriptions. It never writes training history, measurements, XP
 * or anything else that would make a new player look like they had trained.
 *
 * Seeding is idempotent: re-running it refreshes reference rows without
 * touching anything the player has recorded.
 */
export async function seedCatalog(db: SqlDatabase, now: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const exercise of EXERCISES) {
      await db.runAsync(
        `INSERT INTO exercise (id, name, pattern, primary_muscles, chain_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           pattern = excluded.pattern,
           primary_muscles = excluded.primary_muscles,
           chain_id = excluded.chain_id`,
        [
          exercise.id,
          exercise.name,
          exercise.pattern,
          encodeStringArray(exercise.primaryMuscles),
          exercise.chainId,
        ],
      );
    }

    for (const variation of EXERCISE_VARIATIONS) {
      await db.runAsync(
        `INSERT INTO exercise_variation
           (id, exercise_id, chain_id, name, tier, previous_variation_id,
            measurement_kind, minimum_phase, execution, form_requirements, difficulty_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           tier = excluded.tier,
           previous_variation_id = excluded.previous_variation_id,
           measurement_kind = excluded.measurement_kind,
           minimum_phase = excluded.minimum_phase,
           execution = excluded.execution,
           form_requirements = excluded.form_requirements,
           difficulty_score = excluded.difficulty_score`,
        [
          variation.id,
          variation.exerciseId,
          variation.chainId,
          variation.name,
          variation.tier,
          variation.previousVariationId,
          variation.measurementKind,
          variation.minimumPhase,
          variation.execution,
          encodeStringArray(variation.formRequirements),
          variation.difficultyScore,
        ],
      );
    }

    for (const chain of PROGRESSION_CHAINS) {
      await db.runAsync(
        `INSERT INTO progression_chain (id, name, variation_ids)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           variation_ids = excluded.variation_ids`,
        [chain.id, chain.name, encodeStringArray(chain.variationIds)],
      );
    }

    for (const template of WORKOUT_TEMPLATES) {
      await db.runAsync(
        `INSERT INTO workout_template (id, name, focus, rotation_order)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           focus = excluded.focus,
           rotation_order = excluded.rotation_order`,
        [template.id, template.name, template.focus, template.rotationOrder],
      );
    }

    for (const entry of WORKOUT_TEMPLATE_EXERCISES) {
      // `variation_id` is deliberately not overwritten on conflict: once the
      // player progresses a movement, the template points at the harder
      // variation and re-seeding must not undo that.
      await db.runAsync(
        `INSERT INTO workout_template_exercise
           (id, template_id, variation_id, position, sets, target_min, target_max,
            rest_seconds, tempo, cues)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           position = excluded.position,
           sets = excluded.sets,
           target_min = excluded.target_min,
           target_max = excluded.target_max,
           rest_seconds = excluded.rest_seconds,
           tempo = excluded.tempo,
           cues = excluded.cues`,
        [
          entry.id,
          entry.templateId,
          entry.variationId,
          entry.position,
          entry.prescription.sets,
          entry.prescription.targetMin,
          entry.prescription.targetMax,
          entry.prescription.restSeconds,
          entry.prescription.tempo,
          encodeStringArray(entry.prescription.cues),
        ],
      );
    }

    await seedProgressionStates(db, now);
  });
}

/**
 * Establishes the starting progression state: every variation the initial
 * program prescribes is `current`, the rest of each chain is `locked`.
 * Existing rows are left untouched so a player's progress survives re-seeding.
 */
async function seedProgressionStates(db: SqlDatabase, now: string): Promise<void> {
  const prescribedVariationIds = new Set(
    WORKOUT_TEMPLATE_EXERCISES.map((entry) => entry.variationId),
  );

  const existing = await db.getAllAsync<{ variation_id: string }>(
    'SELECT variation_id FROM progression_state',
  );
  const known = new Set(existing.map((row) => row.variation_id));

  for (const variation of EXERCISE_VARIATIONS) {
    if (known.has(variation.id)) continue;

    const isPrescribed = prescribedVariationIds.has(variation.id);
    const state: ProgressionState = {
      variationId: variation.id,
      status: isPrescribed ? 'current' : 'locked',
      qualifyingSessions: 0,
      startedAt: isPrescribed ? now : null,
      masteredAt: null,
      unlockedAt: isPrescribed ? now : null,
    };

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
}
