import { migrate } from '@/database/migrations';
import { createRepositories } from '@/database/repositories/sqlite';
import { createUnitOfWork } from '@/database/unitOfWork';
import type { RepositoryBundle } from '@/database/repositories/interfaces';
import { seedCatalog } from '@/database/seed';
import type { SqlDatabase } from '@/database/sqlDatabase';
import type { UnitOfWork } from '@/database/unitOfWork';
import { createMemoryAvatarStore } from '@/testing/memoryAvatarStore';
import type { MemoryAvatarStore } from '@/testing/memoryAvatarStore';
import { createTestDatabase } from '@/testing/nodeSqlite';

import { BackupService } from '../backupService';
import { MeasurementService } from '../measurementService';
import { PlayerService } from '../playerService';
import { ProgressionService } from '../progressionService';
import { WorkoutService } from '../workoutService';

/**
 * A fully migrated, seeded database with the real repositories and services on
 * top. Persistence tests run against genuine SQL rather than mocks.
 */
export interface TestHarness {
  db: SqlDatabase & { close: () => void };
  repositories: RepositoryBundle;
  unitOfWork: UnitOfWork;
  avatars: MemoryAvatarStore;
  player: PlayerService;
  workouts: WorkoutService;
  progression: ProgressionService;
  measurements: MeasurementService;
  backup: BackupService;
  close: () => void;
}

export async function createHarness(
  now = new Date('2026-08-01T09:00:00.000Z'),
): Promise<TestHarness> {
  const db = createTestDatabase();
  await migrate(db);
  await seedCatalog(db, now.toISOString());

  const repositories = createRepositories(db);
  const unitOfWork = createUnitOfWork(db);
  const avatars = createMemoryAvatarStore();

  return {
    db,
    repositories,
    unitOfWork,
    avatars,
    player: new PlayerService(repositories, avatars, unitOfWork),
    workouts: new WorkoutService(repositories, unitOfWork),
    progression: new ProgressionService(repositories, unitOfWork),
    measurements: new MeasurementService(repositories),
    backup: new BackupService(repositories, db, unitOfWork),
    close: () => db.close(),
  };
}

/** Creates the player, as onboarding would. */
export async function withPlayer(harness: TestHarness, name = 'Test Player'): Promise<void> {
  await harness.player.createPlayer(
    { name, avatarUri: null, unitSystem: 'imperial' },
    new Date('2026-08-01T09:00:00.000Z'),
  );
}

/**
 * Runs one complete session, logging `valueFor(entry)` on every prescribed set.
 * Returns the completion summary.
 */
export async function completeSession(
  harness: TestHarness,
  at: Date,
  valueFor: (variationId: string, targetMin: number, targetMax: number) => number,
) {
  const plan = await harness.workouts.getNextPlan();
  if (!plan) throw new Error('No plan available');

  const session = await harness.workouts.startSession(plan, at);

  for (const performance of session.performances) {
    const value = valueFor(
      performance.variationId,
      performance.prescribed.targetMin,
      performance.prescribed.targetMax,
    );
    const perSide = performance.measurementKind === 'reps-per-side';

    for (let setNumber = 1; setNumber <= performance.prescribed.sets; setNumber += 1) {
      await harness.workouts.recordSet(
        performance.id,
        setNumber,
        value,
        perSide ? value : null,
        at,
      );
    }
    await harness.workouts.markExerciseComplete(performance.id, at);
  }

  return harness.workouts.completeSession(
    session.id,
    new Date(at.getTime() + 34 * 60_000 + 18_000),
  );
}
