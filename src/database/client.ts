import * as SQLite from 'expo-sqlite';

import { APP_CONFIG } from '@/config/app.config';

import { fromExpoDatabase } from './expoAdapter';
import { migrate } from './migrations';
import { createRepositories } from './repositories/sqlite';
import type { RepositoryBundle } from './repositories/interfaces';
import { createUnitOfWork } from './unitOfWork';
import type { UnitOfWork } from './unitOfWork';
import { seedCatalog } from './seed';
import type { SqlDatabase } from './sqlDatabase';

/**
 * Database bootstrap.
 *
 * Opening, migrating and seeding happen exactly once per app launch. The rest
 * of the app receives the repository bundle and never sees the handle.
 */
export interface DatabaseHandle {
  db: SqlDatabase;
  repositories: RepositoryBundle;
  /** Runs a multi-write command as one transaction. See `unitOfWork.ts`. */
  unitOfWork: UnitOfWork;
  schemaVersion: number;
}

let handle: DatabaseHandle | null = null;
let opening: Promise<DatabaseHandle> | null = null;

/**
 * Opens the database, applies pending migrations, and seeds reference data.
 * Concurrent callers share one initialisation.
 */
export function openDatabase(): Promise<DatabaseHandle> {
  if (handle) return Promise.resolve(handle);
  if (opening) return opening;

  const pending = (async () => {
    const native = await SQLite.openDatabaseAsync(APP_CONFIG.databaseName);
    const db = fromExpoDatabase(native);

    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const schemaVersion = await migrate(db);
    await seedCatalog(db, new Date().toISOString());

    handle = {
      db,
      repositories: createRepositories(db),
      unitOfWork: createUnitOfWork(db),
      schemaVersion,
    };
    return handle;
  })();

  // A failed open must not stay cached, or every later attempt fails with it.
  opening = pending.catch((error: unknown) => {
    opening = null;
    handle = null;
    throw error;
  });

  return opening;
}

/** The open handle, or null if the database has not finished opening. */
export function getDatabaseHandle(): DatabaseHandle | null {
  return handle;
}

/** Test and reset hook: forgets the cached handle without closing the file. */
export function resetDatabaseHandle(): void {
  handle = null;
  opening = null;
}
