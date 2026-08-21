import { createRepositories } from './repositories/sqlite';
import type { RepositoryBundle } from './repositories/interfaces';
import type { SqlDatabase } from './sqlDatabase';

/**
 * Transaction boundary.
 *
 * A service-level command that writes to more than one table has to be
 * all-or-nothing: a crash partway through `completeSession` must not leave a
 * session marked complete with the XP unawarded and the rotation stale.
 *
 * The ownership rule is deliberately narrow, because Expo SQLite issues a bare
 * `BEGIN` and cannot nest transactions:
 *
 * - **The unit of work owns transactions.** It is the only thing that opens
 *   one around a multi-write command.
 * - **Repositories participate, never nest.** A repository method that groups
 *   its own writes still calls `withTransactionAsync`; inside a unit of work
 *   that call joins the ambient transaction instead of starting a second one.
 * - **Outside a unit of work, nothing changes.** A repository called directly
 *   still opens and commits its own transaction, exactly as before.
 *
 * This keeps SQL confined to the repositories — a service never touches the
 * database directly, it just asks for a bundle bound to one transaction.
 */
export interface UnitOfWork {
  /**
   * Runs `work` inside a single transaction, with a repository bundle bound to
   * it. Committed if `work` resolves, rolled back entirely if it throws.
   */
  run<T>(work: (repositories: RepositoryBundle) => Promise<T>): Promise<T>;
}

/**
 * A view of the database for code already running inside a transaction.
 * Every read and write passes through unchanged; only `withTransactionAsync`
 * differs, joining the open transaction rather than opening another.
 */
function enlistIn(db: SqlDatabase): SqlDatabase {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params) => db.runAsync(source, params),
    getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    getAllAsync: (source, params) => db.getAllAsync(source, params),
    withTransactionAsync: async (task) => {
      await task();
    },
  };
}

export function createUnitOfWork(db: SqlDatabase): UnitOfWork {
  return {
    async run<T>(work: (repositories: RepositoryBundle) => Promise<T>): Promise<T> {
      const enlisted = createRepositories(enlistIn(db));

      // `withTransactionAsync` returns void, so the result is captured here and
      // read after it commits. If `work` throws, the transaction rolls back and
      // the error propagates before this is ever read.
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await work(enlisted);
      });
      return result;
    },
  };
}
