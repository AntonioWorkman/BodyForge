import type { DatabaseHandle } from '@/database/client';

import { BackupService } from './backupService';
import { MeasurementService } from './measurementService';
import { PlayerService } from './playerService';
import { ProgressionService } from './progressionService';
import { WorkoutService } from './workoutService';

/**
 * The application service container.
 *
 * Screens receive this object through context and never touch repositories or
 * SQL directly.
 */
export interface AppServices {
  player: PlayerService;
  workouts: WorkoutService;
  progression: ProgressionService;
  measurements: MeasurementService;
  backup: BackupService;
}

export function createServices(handle: DatabaseHandle): AppServices {
  const { repositories, db } = handle;
  return {
    player: new PlayerService(repositories),
    workouts: new WorkoutService(repositories),
    progression: new ProgressionService(repositories),
    measurements: new MeasurementService(repositories),
    backup: new BackupService(repositories, db),
  };
}

export { PlayerService } from './playerService';
export type { PlayerState, CreatePlayerInput } from './playerService';
export { WorkoutService } from './workoutService';
export type { QuestCompleteSummary } from './workoutService';
export { ProgressionService } from './progressionService';
export type {
  ProgressionNode,
  ProgressionChainView,
  ConfirmProgressionResult,
} from './progressionService';
export { MeasurementService } from './measurementService';
export { BackupService } from './backupService';
export { validateBackup } from './backupSchema';
export type { Backup, BackupValidationResult } from './backupSchema';
export { createId } from './ids';
