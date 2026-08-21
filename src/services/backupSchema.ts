import { z } from 'zod';

import { APP_CONFIG } from '@/config/app.config';

/**
 * Backup format.
 *
 * Imported files come from outside the app and are never trusted. Every field
 * is validated before a single row is written, and validation happens against
 * the whole document — a partially-valid backup is rejected rather than
 * partially restored.
 */

const isoTimestamp = z.string().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

const prescriptionSchema = z.object({
  sets: z.number().int().min(0).max(50),
  targetMin: z.number().min(0).max(10_000),
  targetMax: z.number().min(0).max(10_000),
  restSeconds: z.number().int().min(0).max(3_600),
  tempo: z.string().nullable(),
  cues: z.array(z.string()),
});

const setSchema = z.object({
  id: z.string().min(1),
  performanceId: z.string().min(1),
  setNumber: z.number().int().min(1).max(100),
  primaryValue: z.number().min(0).max(10_000),
  secondaryValue: z.number().min(0).max(10_000).nullable(),
  completedAt: isoTimestamp,
});

const performanceSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  position: z.number().int().min(0),
  variationId: z.string().min(1),
  exerciseName: z.string().min(1),
  variationName: z.string().min(1),
  measurementKind: z.enum(['reps', 'reps-per-side', 'time']),
  prescribed: prescriptionSchema,
  completedAt: isoTimestamp.nullable(),
  sets: z.array(setSchema),
});

const sessionSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  templateName: z.string().min(1),
  templateFocus: z.string(),
  phaseId: z.enum(['awakening', 'development', 'ascension']),
  status: z.enum(['active', 'completed', 'abandoned']),
  startedAt: isoTimestamp,
  completedAt: isoTimestamp.nullable(),
  durationSeconds: z.number().int().min(0).nullable(),
  xpAwarded: z.number().int().min(0).nullable(),
  sessionNumber: z.number().int().min(1).nullable(),
  performances: z.array(performanceSchema),
});

const measurementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['bodyweight', 'waist']),
  value: z.number().positive().max(1_000),
  recordedOn: isoDate,
  createdAt: isoTimestamp,
  note: z.string().nullable(),
});

const progressionStateSchema = z.object({
  variationId: z.string().min(1),
  status: z.enum(['locked', 'available', 'current', 'ready', 'mastered']),
  qualifyingSessions: z.number().int().min(0).max(10_000),
  startedAt: isoTimestamp.nullable(),
  masteredAt: isoTimestamp.nullable(),
  unlockedAt: isoTimestamp.nullable(),
});

const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  avatarUri: z.string().nullable(),
  createdAt: isoTimestamp,
  totalXp: z.number().int().min(0),
  nextTemplateRotationOrder: z.number().int().min(0).max(100),
});

const settingsSchema = z.object({
  unitSystem: z.enum(['metric', 'imperial']),
  hapticsEnabled: z.boolean(),
  motionPreference: z.enum(['full', 'reduced']),
  respectSystemReducedMotion: z.boolean(),
  defaultRestSeconds: z.number().int().min(0).max(600),
  sessionsPerWeekTarget: z.number().int().min(1).max(14),
  onboardingCompleted: z.boolean(),
});

const templatePrescriptionSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  variationId: z.string().min(1),
  position: z.number().int().min(0),
  prescription: prescriptionSchema,
});

export const backupSchema = z.object({
  /** Identifies the producing app so a foreign JSON file is rejected early. */
  app: z.literal(APP_CONFIG.name),
  formatVersion: z.number().int().min(1).max(APP_CONFIG.backupFormatVersion),
  exportedAt: isoTimestamp,
  profile: profileSchema,
  settings: settingsSchema,
  sessions: z.array(sessionSchema),
  measurements: z.array(measurementSchema),
  progression: z.array(progressionStateSchema),
  templateExercises: z.array(templatePrescriptionSchema),
});

export type Backup = z.infer<typeof backupSchema>;

export interface BackupValidationSuccess {
  ok: true;
  backup: Backup;
  summary: {
    sessions: number;
    measurements: number;
    exportedAt: string;
    playerName: string;
  };
}

export interface BackupValidationFailure {
  ok: false;
  /** Human-readable problems, ready to show in a confirmation dialog. */
  errors: string[];
}

export type BackupValidationResult = BackupValidationSuccess | BackupValidationFailure;

/** Parses and validates untrusted backup text. Never throws. */
export function validateBackup(raw: string): BackupValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }

  const result = backupSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`);
    return { ok: false, errors };
  }

  const backup = result.data;

  // Structural checks the schema alone cannot express.
  const structural = checkReferentialIntegrity(backup);
  if (structural.length > 0) return { ok: false, errors: structural };

  return {
    ok: true,
    backup,
    summary: {
      sessions: backup.sessions.length,
      measurements: backup.measurements.length,
      exportedAt: backup.exportedAt,
      playerName: backup.profile.name,
    },
  };
}

/**
 * Structural checks the Zod schema cannot express.
 *
 * The point is that "validated" means "importable": every uniqueness and
 * relationship rule SQLite would reject is caught here, before the destructive
 * replacement begins. A document that fails at the database instead would take
 * the player's existing data down with it.
 *
 * Constraints covered, matching the schema in `migrations/`:
 *
 * - `workout_session.id` primary key
 * - `exercise_performance.id` primary key, across all sessions
 * - `set_performance.id` primary key, across all performances
 * - `set_performance (performance_id, set_number)` unique
 * - `measurement.id` primary key
 * - `progression_state.variation_id` primary key
 * - `workout_template_exercise.id` primary key
 * - performance→session and set→performance parent references
 * - completed sessions carrying a completion time
 *
 * References to catalog variations are deliberately *not* checked: a backup may
 * legitimately predate or postdate this build's catalog, and the importer skips
 * unknown ones rather than aborting.
 */
function checkReferentialIntegrity(backup: Backup): string[] {
  const errors: string[] = [];

  /** Records an error the first time a given key is seen twice. */
  const seen = new Map<string, Set<string>>();
  const duplicate = (bucket: string, key: string): boolean => {
    const keys = seen.get(bucket) ?? new Set<string>();
    seen.set(bucket, keys);
    if (keys.has(key)) return true;
    keys.add(key);
    return false;
  };

  for (const session of backup.sessions) {
    if (duplicate('session', session.id)) {
      errors.push(`sessions: duplicate session identifier "${session.id}".`);
    }

    if (session.status === 'completed' && !session.completedAt) {
      errors.push(`sessions.${session.id}: completed session has no completion time.`);
    }

    for (const performance of session.performances) {
      if (performance.sessionId !== session.id) {
        errors.push(`sessions.${session.id}: an exercise belongs to a different session.`);
      }

      // Performance ids are unique across the whole database, not per session.
      if (duplicate('performance', performance.id)) {
        errors.push(`sessions.${session.id}: duplicate exercise identifier "${performance.id}".`);
      }

      for (const set of performance.sets) {
        if (set.performanceId !== performance.id) {
          errors.push(`sessions.${session.id}: a set belongs to a different exercise.`);
        }

        if (duplicate('set', set.id)) {
          errors.push(`sessions.${session.id}: duplicate set identifier "${set.id}".`);
        }

        // The schema also has a unique index on (performance_id, set_number).
        if (duplicate('setNumber', `${set.performanceId}#${set.setNumber}`)) {
          errors.push(
            `sessions.${session.id}: exercise "${performance.id}" has set ${set.setNumber} twice.`,
          );
        }
      }
    }
  }

  for (const measurement of backup.measurements) {
    if (duplicate('measurement', measurement.id)) {
      errors.push(`measurements: duplicate measurement identifier "${measurement.id}".`);
    }
  }

  for (const state of backup.progression) {
    if (duplicate('progression', state.variationId)) {
      errors.push(`progression: duplicate entry for variation "${state.variationId}".`);
    }
  }

  for (const entry of backup.templateExercises) {
    if (duplicate('templateExercise', entry.id)) {
      errors.push(`templateExercises: duplicate identifier "${entry.id}".`);
    }
  }

  return errors.slice(0, 8);
}
