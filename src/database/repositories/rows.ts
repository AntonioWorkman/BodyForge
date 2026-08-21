import type {
  Exercise,
  ExercisePerformance,
  ExerciseVariation,
  Measurement,
  PlayerProfile,
  Prescription,
  ProgressionChain,
  ProgressionState,
  SetPerformance,
  WorkoutSession,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from '@/domain/types';

/**
 * Row shapes and mappers.
 *
 * SQLite has no arrays or booleans, so list columns are stored as JSON text and
 * decoded here. Mapping lives in one file so a column rename is a single edit.
 */

function decodeStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export const encodeStringArray = (values: readonly string[]): string => JSON.stringify(values);

// ---------------------------------------------------------------------------

export interface PlayerRow {
  id: string;
  name: string;
  avatar_uri: string | null;
  created_at: string;
  total_xp: number;
  next_template_rotation_order: number;
}

export function toPlayer(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    name: row.name,
    avatarUri: row.avatar_uri,
    createdAt: row.created_at,
    totalXp: row.total_xp,
    nextTemplateRotationOrder: row.next_template_rotation_order,
  };
}

// ---------------------------------------------------------------------------

export interface ExerciseRow {
  id: string;
  name: string;
  pattern: string;
  primary_muscles: string;
  chain_id: string | null;
}

export function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    pattern: row.pattern as Exercise['pattern'],
    primaryMuscles: decodeStringArray(row.primary_muscles) as Exercise['primaryMuscles'],
    chainId: row.chain_id,
  };
}

export interface VariationRow {
  id: string;
  exercise_id: string;
  chain_id: string;
  name: string;
  tier: number;
  previous_variation_id: string | null;
  measurement_kind: string;
  minimum_phase: string;
  execution: string;
  form_requirements: string;
  difficulty_score: number;
}

export function toVariation(row: VariationRow): ExerciseVariation {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    chainId: row.chain_id,
    name: row.name,
    tier: row.tier,
    previousVariationId: row.previous_variation_id,
    measurementKind: row.measurement_kind as ExerciseVariation['measurementKind'],
    minimumPhase: row.minimum_phase as ExerciseVariation['minimumPhase'],
    execution: row.execution,
    formRequirements: decodeStringArray(row.form_requirements),
    difficultyScore: row.difficulty_score,
  };
}

export interface ChainRow {
  id: string;
  name: string;
  variation_ids: string;
}

export function toChain(row: ChainRow): ProgressionChain {
  return { id: row.id, name: row.name, variationIds: decodeStringArray(row.variation_ids) };
}

// ---------------------------------------------------------------------------

export interface TemplateRow {
  id: string;
  name: string;
  focus: string;
  rotation_order: number;
}

export function toTemplate(row: TemplateRow): WorkoutTemplate {
  return { id: row.id, name: row.name, focus: row.focus, rotationOrder: row.rotation_order };
}

export interface PrescriptionColumns {
  sets: number;
  target_min: number;
  target_max: number;
  rest_seconds: number;
  tempo: string | null;
  cues: string;
}

export function toPrescription(row: PrescriptionColumns): Prescription {
  return {
    sets: row.sets,
    targetMin: row.target_min,
    targetMax: row.target_max,
    restSeconds: row.rest_seconds,
    tempo: row.tempo,
    cues: decodeStringArray(row.cues),
  };
}

export interface TemplateExerciseRow extends PrescriptionColumns {
  id: string;
  template_id: string;
  variation_id: string;
  position: number;
}

export function toTemplateExercise(row: TemplateExerciseRow): WorkoutTemplateExercise {
  return {
    id: row.id,
    templateId: row.template_id,
    variationId: row.variation_id,
    position: row.position,
    prescription: toPrescription(row),
  };
}

// ---------------------------------------------------------------------------

export interface SessionRow {
  id: string;
  template_id: string;
  template_name: string;
  template_focus: string;
  phase_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  xp_awarded: number | null;
  session_number: number | null;
}

export function toSession(row: SessionRow): WorkoutSession {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    templateFocus: row.template_focus,
    phaseId: row.phase_id as WorkoutSession['phaseId'],
    status: row.status as WorkoutSession['status'],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationSeconds: row.duration_seconds,
    xpAwarded: row.xp_awarded,
    sessionNumber: row.session_number,
  };
}

export interface PerformanceRow extends PrescriptionColumns {
  id: string;
  session_id: string;
  position: number;
  variation_id: string;
  exercise_name: string;
  variation_name: string;
  measurement_kind: string;
  completed_at: string | null;
}

export function toPerformance(row: PerformanceRow): ExercisePerformance {
  return {
    id: row.id,
    sessionId: row.session_id,
    position: row.position,
    variationId: row.variation_id,
    exerciseName: row.exercise_name,
    variationName: row.variation_name,
    measurementKind: row.measurement_kind as ExercisePerformance['measurementKind'],
    prescribed: toPrescription(row),
    completedAt: row.completed_at,
  };
}

export interface SetRow {
  id: string;
  performance_id: string;
  set_number: number;
  primary_value: number;
  secondary_value: number | null;
  completed_at: string;
}

export function toSet(row: SetRow): SetPerformance {
  return {
    id: row.id,
    performanceId: row.performance_id,
    setNumber: row.set_number,
    primaryValue: row.primary_value,
    secondaryValue: row.secondary_value,
    completedAt: row.completed_at,
  };
}

// ---------------------------------------------------------------------------

export interface MeasurementRow {
  id: string;
  type: string;
  value: number;
  recorded_on: string;
  created_at: string;
  note: string | null;
}

export function toMeasurement(row: MeasurementRow): Measurement {
  return {
    id: row.id,
    type: row.type as Measurement['type'],
    value: row.value,
    recordedOn: row.recorded_on,
    createdAt: row.created_at,
    note: row.note,
  };
}

export interface ProgressionStateRow {
  variation_id: string;
  status: string;
  qualifying_sessions: number;
  started_at: string | null;
  mastered_at: string | null;
  unlocked_at: string | null;
}

export function toProgressionState(row: ProgressionStateRow): ProgressionState {
  return {
    variationId: row.variation_id,
    status: row.status as ProgressionState['status'],
    qualifyingSessions: row.qualifying_sessions,
    startedAt: row.started_at,
    masteredAt: row.mastered_at,
    unlockedAt: row.unlocked_at,
  };
}
