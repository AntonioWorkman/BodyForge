import type {
  AppSettings,
  Exercise,
  ExercisePerformance,
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

/**
 * Repository contracts.
 *
 * Application services depend on these interfaces, not on SQL. Nothing above
 * this boundary knows that SQLite exists.
 */

export interface PlayerRepository {
  get(): Promise<PlayerProfile | null>;
  create(profile: PlayerProfile): Promise<void>;
  update(patch: Partial<Omit<PlayerProfile, 'id' | 'createdAt'>>): Promise<void>;
  addXp(amount: number): Promise<number>;
}

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

export interface CatalogRepository {
  listExercises(): Promise<Exercise[]>;
  listVariations(): Promise<ExerciseVariation[]>;
  listChains(): Promise<ProgressionChain[]>;
  listTemplates(): Promise<WorkoutTemplate[]>;
  listTemplateExercises(templateId?: string): Promise<WorkoutTemplateExercise[]>;
  replaceTemplateExerciseVariation(templateExerciseId: string, variationId: string): Promise<void>;
}

export interface CreateSessionInput {
  session: WorkoutSession;
  performances: ExercisePerformance[];
}

export interface RecordSetInput {
  performanceId: string;
  setNumber: number;
  primaryValue: number;
  secondaryValue: number | null;
  completedAt: string;
}

export interface CompleteSessionInput {
  sessionId: string;
  completedAt: string;
  durationSeconds: number;
  xpAwarded: number;
  sessionNumber: number;
}

export interface ActiveSessionUiState {
  sessionId: string;
  currentPosition: number;
  restStartedAt: string | null;
  restDurationSeconds: number | null;
  restPausedAt: string | null;
  /** Milliseconds the rest period has already spent paused. */
  restPausedTotalMs: number;
  updatedAt: string;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<void>;
  findActive(): Promise<WorkoutSessionDetail | null>;
  findById(sessionId: string): Promise<WorkoutSessionDetail | null>;
  listCompleted(limit?: number): Promise<WorkoutSessionDetail[]>;
  listCompletedSummaries(limit?: number): Promise<WorkoutSession[]>;
  countCompleted(): Promise<number>;
  /** Recorded performances of one variation, newest session first. */
  listPerformancesForVariation(variationId: string): Promise<ExercisePerformanceWithSets[]>;
  /**
   * Every completed performance, grouped by variation, newest session first
   * within each group. One round trip instead of one per variation.
   */
  listCompletedPerformancesByVariation(): Promise<Map<string, ExercisePerformanceWithSets[]>>;
  recordSet(input: RecordSetInput): Promise<SetPerformance>;
  removeSet(performanceId: string, setNumber: number): Promise<void>;
  markPerformanceCompleted(performanceId: string, completedAt: string | null): Promise<void>;
  /**
   * Completes a session, but only while it is still active.
   *
   * Returns false when no row made that transition — the session was already
   * completed, abandoned or deleted — so a duplicate or stale caller is
   * rejected by the database rather than by timing.
   */
  complete(input: CompleteSessionInput): Promise<boolean>;
  setStatus(sessionId: string, status: SessionStatus): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  saveUiState(state: ActiveSessionUiState): Promise<void>;
  getUiState(sessionId: string): Promise<ActiveSessionUiState | null>;
}

export interface MeasurementRepository {
  list(type?: MeasurementType): Promise<Measurement[]>;
  listSince(type: MeasurementType, since: IsoDate): Promise<Measurement[]>;
  latest(type: MeasurementType): Promise<Measurement | null>;
  add(measurement: Measurement): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ProgressionRepository {
  list(): Promise<ProgressionState[]>;
  get(variationId: string): Promise<ProgressionState | null>;
  upsert(state: ProgressionState): Promise<void>;
  setStatus(variationId: string, status: ProgressionStatus, at: string): Promise<void>;
  /**
   * Moves a variation to `next` only while it currently holds `expected`.
   *
   * Returns false if it did not, which is how a second confirmation of the same
   * progression is rejected without relying on call ordering.
   */
  compareAndSetStatus(
    variationId: string,
    expected: ProgressionStatus,
    next: ProgressionStatus,
    at: string,
  ): Promise<boolean>;
  setQualifyingSessions(variationId: string, count: number): Promise<void>;
}

/** Everything the application layer can reach. */
export interface RepositoryBundle {
  player: PlayerRepository;
  settings: SettingsRepository;
  catalog: CatalogRepository;
  sessions: SessionRepository;
  measurements: MeasurementRepository;
  progression: ProgressionRepository;
}
