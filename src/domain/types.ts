/**
 * Domain model.
 *
 * Two rules shape these types:
 *
 * 1. Exercise identity is separate from prescription. An `Exercise` is a
 *    movement pattern, an `ExerciseVariation` is a specific difficulty of that
 *    pattern, and a `WorkoutTemplateExercise` is how a template asks you to
 *    perform one on a given day.
 * 2. History is immutable. A completed `ExercisePerformance` carries its own
 *    copy of what was prescribed, so editing a template later never rewrites
 *    what actually happened.
 */

/** ISO-8601 instant, always UTC. */
export type IsoTimestamp = string;
/** Calendar day in the player's local time, `YYYY-MM-DD`. */
export type IsoDate = string;

// ---------------------------------------------------------------------------
// Progression phases
// ---------------------------------------------------------------------------

export const PHASE_IDS = ['awakening', 'development', 'ascension'] as const;
export type PhaseId = (typeof PHASE_IDS)[number];

export interface PhaseDefinition {
  id: PhaseId;
  name: string;
  order: number;
  /** Cumulative completed strength sessions required to enter this phase. */
  sessionsRequired: number;
  /** One-line statement of what the phase is for. */
  purpose: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

export type MuscleGroup =
  | 'quads'
  | 'glutes'
  | 'hamstrings'
  | 'calves'
  | 'chest'
  | 'shoulders'
  | 'triceps'
  | 'back'
  | 'core';

export type MovementPattern = 'squat' | 'hinge' | 'lunge' | 'push' | 'vertical-push' | 'brace';

/** A movement pattern the player trains. Stable identity across variations. */
export interface Exercise {
  id: string;
  name: string;
  pattern: MovementPattern;
  primaryMuscles: MuscleGroup[];
  /** Chain this movement belongs to, if it participates in progression. */
  chainId: string | null;
}

/** How a set's work is counted. Drives both the logging UI and XP maths. */
export type MeasurementKind =
  | 'reps'
  /** Reps performed independently per side; both values are recorded. */
  | 'reps-per-side'
  /** An isometric hold measured in seconds. */
  | 'time';

/**
 * A specific difficulty of an `Exercise`. Variations form the progression
 * chains — each one names the variation it evolves from.
 */
export interface ExerciseVariation {
  id: string;
  exerciseId: string;
  chainId: string;
  name: string;
  /** Position within its chain, starting at 0. */
  tier: number;
  /** The variation immediately below this one, or null for a chain entry. */
  previousVariationId: string | null;
  measurementKind: MeasurementKind;
  /** Earliest phase in which this variation may become available. */
  minimumPhase: PhaseId;
  /** Short description of how the movement is performed. */
  execution: string;
  /** The technique standard the player confirms before progressing. */
  formRequirements: string[];
  /** Relative difficulty within the chain, used for the Strength attribute. */
  difficultyScore: number;
}

export interface ProgressionChain {
  id: string;
  name: string;
  /** Ordered variation ids, easiest first. */
  variationIds: string[];
}

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

/** What a template asks for on one exercise. */
export interface Prescription {
  sets: number;
  /** Bottom of the working range (reps, reps per side, or seconds). */
  targetMin: number;
  /** Top of the working range. Mastery is measured against this value. */
  targetMax: number;
  restSeconds: number;
  /** Optional tempo or execution note surfaced during the workout. */
  tempo: string | null;
  /** Form cues shown behind the details control, not permanently on screen. */
  cues: string[];
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  /** e.g. "Legs + Push". */
  focus: string;
  /** Position in the rotation. Templates cycle in ascending order. */
  rotationOrder: number;
}

export interface WorkoutTemplateExercise {
  id: string;
  templateId: string;
  variationId: string;
  /** Order within the template, starting at 0. */
  position: number;
  prescription: Prescription;
}

/** A template joined with its exercises, ready to start a session from. */
export interface WorkoutPlan {
  template: WorkoutTemplate;
  entries: WorkoutPlanEntry[];
}

export interface WorkoutPlanEntry {
  templateExerciseId: string;
  position: number;
  exercise: Exercise;
  variation: ExerciseVariation;
  prescription: Prescription;
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface WorkoutSession {
  id: string;
  templateId: string;
  /** Snapshot: the template's name at the time of the session. */
  templateName: string;
  templateFocus: string;
  phaseId: PhaseId;
  status: SessionStatus;
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp | null;
  /** Wall-clock seconds between start and completion. */
  durationSeconds: number | null;
  /** XP awarded when the session was completed. Null while active. */
  xpAwarded: number | null;
  /** Ordinal among completed strength sessions, assigned on completion. */
  sessionNumber: number | null;
}

/** One exercise within a session, carrying its prescription at that time. */
export interface ExercisePerformance {
  id: string;
  sessionId: string;
  position: number;
  variationId: string;
  /** Snapshot: names at the time, so renames never rewrite history. */
  exerciseName: string;
  variationName: string;
  measurementKind: MeasurementKind;
  /** Snapshot of what was asked for. */
  prescribed: Prescription;
  completedAt: IsoTimestamp | null;
}

/**
 * One set. `primaryValue` is reps, reps on the left side, or seconds depending
 * on the performance's `measurementKind`; `secondaryValue` is the right side
 * for unilateral work and null otherwise.
 */
export interface SetPerformance {
  id: string;
  performanceId: string;
  setNumber: number;
  primaryValue: number;
  secondaryValue: number | null;
  completedAt: IsoTimestamp;
}

/** A performance with its recorded sets attached. */
export interface ExercisePerformanceWithSets extends ExercisePerformance {
  sets: SetPerformance[];
}

/** A session with everything recorded under it. */
export interface WorkoutSessionDetail extends WorkoutSession {
  performances: ExercisePerformanceWithSets[];
}

// ---------------------------------------------------------------------------
// Body measurements
// ---------------------------------------------------------------------------

export type MeasurementType = 'bodyweight' | 'waist';

/** Units the player can choose between. Storage is always metric. */
export type UnitSystem = 'metric' | 'imperial';

export interface Measurement {
  id: string;
  type: MeasurementType;
  /** Always metric: kilograms for bodyweight, centimetres for waist. */
  value: number;
  recordedOn: IsoDate;
  createdAt: IsoTimestamp;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Progression state
// ---------------------------------------------------------------------------

export type ProgressionStatus =
  /** Not reachable yet — an earlier variation in the chain is unmastered. */
  | 'locked'
  /** Reachable and unlocked, but not the variation currently prescribed. */
  | 'available'
  /** The variation the player is training right now. */
  | 'current'
  /** Qualified for progression, awaiting the player's confirmation. */
  | 'ready'
  /** Progressed past — the player has moved to a harder variation. */
  | 'mastered';

export interface ProgressionState {
  variationId: string;
  status: ProgressionStatus;
  /** Completed sessions in which every prescribed set hit the top of range. */
  qualifyingSessions: number;
  /** When the variation first became the player's current work. */
  startedAt: IsoTimestamp | null;
  /** When the player confirmed progression past this variation. */
  masteredAt: IsoTimestamp | null;
  /** When this variation became available to train. */
  unlockedAt: IsoTimestamp | null;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  id: string;
  name: string;
  /** Local file URI for an avatar the player chose. Never uploaded. */
  avatarUri: string | null;
  createdAt: IsoTimestamp;
  /** Cumulative XP. Level is always derived from this, never stored. */
  totalXp: number;
  /** Which template comes next in the rotation. */
  nextTemplateRotationOrder: number;
}

export interface AppSettings {
  unitSystem: UnitSystem;
  hapticsEnabled: boolean;
  motionPreference: 'full' | 'reduced';
  respectSystemReducedMotion: boolean;
  /** Fallback rest duration when a prescription does not specify one. */
  defaultRestSeconds: number;
  /** The cadence the Consistency attribute is measured against. */
  sessionsPerWeekTarget: number;
  onboardingCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Derived read models
// ---------------------------------------------------------------------------

export interface LevelState {
  level: number;
  totalXp: number;
  /** XP accumulated within the current level. */
  xpIntoLevel: number;
  /** XP required to move from the current level to the next. */
  xpForLevel: number;
  /** 0–1 progress through the current level. */
  progress: number;
}

export interface PhaseState {
  phase: PhaseDefinition;
  completedSessions: number;
  /** Sessions completed within the current phase. */
  sessionsIntoPhase: number;
  /** Sessions the current phase spans, or null for the final phase. */
  sessionsInPhase: number | null;
  /** 0–1 progress through the phase, or 1 once the final phase is reached. */
  progress: number;
  nextPhase: PhaseDefinition | null;
}

export type AttributeId = 'strength' | 'endurance' | 'consistency' | 'mastery';

export interface AttributeContribution {
  /** What produced this contribution, in the player's language. */
  label: string;
  /** The real, recorded evidence behind it. */
  detail: string;
  points: number;
}

export interface AttributeValue {
  id: AttributeId;
  name: string;
  value: number;
  /** Change over the trailing comparison window. */
  delta: number;
  /** How the value was derived, from real records only. */
  contributions: AttributeContribution[];
  /** Plain-language statement of what this score is and is not. */
  basis: string;
}

export interface PersonalBest {
  variationId: string;
  variationName: string;
  measurementKind: MeasurementKind;
  /** Best single-set value achieved (per side for unilateral work). */
  bestSetValue: number;
  achievedOn: IsoTimestamp;
  sessionId: string;
}
