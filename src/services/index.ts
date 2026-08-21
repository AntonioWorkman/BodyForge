import type { DatabaseHandle } from '@/database/client';

import { createAvatarStore } from './avatarStore';
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
  const { repositories, db, unitOfWork } = handle;
  return {
    player: new PlayerService(repositories, createAvatarStore()),
    workouts: new WorkoutService(repositories, unitOfWork),
    progression: new ProgressionService(repositories, unitOfWork),
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
export { createAvatarStore } from './avatarStore';
export type { AvatarStore } from './avatarStore';
export { validateBackup } from './backupSchema';
export type { Backup, BackupValidationResult } from './backupSchema';
export { createId } from './ids';
