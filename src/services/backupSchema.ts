import { z } from 'zod';

import { APP_CONFIG } from '@/config/app.config';
import { VARIATIONS_BY_ID } from '@/domain/program/catalog';
import { isCalendarDate, isCanonicalTimestamp } from '@/domain/time';

/**
 * Backup format.
 *
 * Imported files come from outside the app and are never trusted. Every field
 * is validated before a single row is written, and validation happens against
 * the whole document — a partially-valid backup is rejected rather than
 * partially restored.
 */

/**
 * A timestamp in the exact canonical form this app emits.
 *
 * "Parses" is not the bar. `Date.parse` accepts `August 21, 2026` and
 * `2026-08-21T12:34:56.789-04:00`; both name real instants, and both sort
 * differently as text than the `Date.toISOString()` values every other row
 * holds. Timestamps are stored as SQLite TEXT and history is ordered
 * lexicographically, so admitting a second spelling silently reorders the
 * player's history without any single value being wrong.
 *
 * Non-canonical input is rejected, never normalised into shape: this document
 * is untrusted, and quietly rewriting it would hide what it actually said.
 */
const isoTimestamp = z
  .string()
  .refine(isCanonicalTimestamp, 'Expected a UTC timestamp like 2026-08-21T12:34:56.789Z');

/**
 * A local calendar day. Impossible dates are rejected rather than rolled
 * forward — `2026-02-30` is not February at all once `Date` has finished with
 * it.
 */
const isoDate = z.string().refine(isCalendarDate, 'Expected a real calendar date, as YYYY-MM-DD');

const prescriptionSchema = z
  .object({
    // A recorded exercise was prescribed at least one set; zero-set
    // prescriptions are not a concept this app has.
    sets: z.number().int().min(1).max(50),
    targetMin: z.number().min(0).max(10_000),
    targetMax: z.number().min(0).max(10_000),
    restSeconds: z.number().int().min(0).max(3_600),
    tempo: z.string().nullable(),
    cues: z.array(z.string()),
  })
  .refine(
    (prescription) => prescription.targetMin <= prescription.targetMax,
    'A prescription cannot ask for more at the bottom of its range than the top',
  );

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

/**
 * Sessions in a portable backup are completed history, and nothing else.
 *
 * The format carries no `active_session_state`, so importing an active session
 * would create a phantom quest the app believes is resumable but has no
 * position for — and an abandoned session is not history worth restoring. Both
 * are rejected rather than silently reclassified.
 */
const sessionSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  templateName: z.string().min(1),
  templateFocus: z.string(),
  phaseId: z.enum(['awakening', 'development', 'ascension']),
  status: z.literal('completed', {
    message: 'A backup carries completed sessions only',
  }),
  startedAt: isoTimestamp,
  // Every completed-session field is required: null here would restore history
  // the app treats as finished but cannot describe.
  completedAt: isoTimestamp,
  durationSeconds: z.number().int().min(0),
  xpAwarded: z.number().int().min(0),
  sessionNumber: z.number().int().min(1),
  performances: z.array(performanceSchema).min(1),
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
  // `ready` is derived from qualifying sessions at read time, never stored, so
  // a document claiming it is describing a state this app does not persist.
  status: z.enum(['locked', 'available', 'current', 'mastered'], {
    message: 'Progression status must be locked, available, current or mastered',
  }),
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

  // Session numbers are the ordinal of a completed session, so they cannot
  // repeat and cannot exceed how many completed sessions the document holds.
  for (const session of backup.sessions) {
    if (duplicate('sessionNumber', String(session.sessionNumber))) {
      errors.push(`sessions: two completed sessions both numbered ${session.sessionNumber}.`);
    }
    if (session.sessionNumber > backup.sessions.length) {
      errors.push(
        `sessions.${session.id}: numbered ${session.sessionNumber} but the backup holds ${backup.sessions.length}.`,
      );
    }
    if (Date.parse(session.completedAt) < Date.parse(session.startedAt)) {
      errors.push(`sessions.${session.id}: completed before it started.`);
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

  // A chain is a ladder: exactly one variation on it is the one being trained.
  // Two `current` entries would leave the tree with two live nodes and the
  // template prescribing whichever happened to be written last.
  const currentPerChain = new Map<string, string[]>();
  for (const state of backup.progression) {
    if (state.status !== 'current') continue;
    const chainId = chainOf(state.variationId);
    if (!chainId) continue;
    const holders = currentPerChain.get(chainId) ?? [];
    holders.push(state.variationId);
    currentPerChain.set(chainId, holders);
  }

  for (const [chainId, holders] of currentPerChain) {
    if (holders.length > 1) {
      errors.push(`progression: chain "${chainId}" has ${holders.length} current variations.`);
    }
  }

  return errors.slice(0, 8);
}

/**
 * The chain a variation belongs to, or null if this build does not know it.
 *
 * Unknown variations are deliberately not an error: a backup may predate or
 * postdate this build's catalog, and the importer skips what it cannot place
 * rather than rejecting the whole document.
 */
function chainOf(variationId: string): string | null {
  return VARIATIONS_BY_ID.get(variationId)?.chainId ?? null;
}
