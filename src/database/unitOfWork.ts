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
 *
 * ## Ordering, and why not `withExclusiveTransactionAsync`
 *
 * The app holds one Expo SQLite connection, and `withTransactionAsync` issues a
 * bare `BEGIN` on it. Two commands that interleave would therefore either nest
 * (`BEGIN` inside `BEGIN`, which fails) or commit against each other's
 * uncommitted state. Expo's own documentation points at
 * `withExclusiveTransactionAsync` for ordering — but that opens a second
 * connection and throws outright on web, which this project supports.
 *
 * So `run` serialises instead: commands queue and execute one at a time, giving
 * the same ordering guarantee on every platform. The queue is keyed on the
 * *connection*, not on the unit-of-work instance — SQLite's constraint is one
 * open transaction per connection, so two units of work over the same handle
 * must share a queue or they can still collide.
 *
 * Serialisation alone is not relied on for correctness. Commands also assert
 * their preconditions as conditional state transitions inside the transaction,
 * so a stale or duplicate caller is rejected by the database rather than by
 * timing.
 */
export interface UnitOfWork {
  /**
   * Runs `work` inside a single transaction, with a repository bundle bound to
   * it. Committed if `work` resolves, rolled back entirely if it throws.
   *
   * The enlisted connection is passed alongside for the one case repositories
   * cannot express — bulk restore, which writes rows the app never creates
   * through normal commands. Ordinary services take only the bundle.
   */
  run<T>(work: (repositories: RepositoryBundle, db: SqlDatabase) => Promise<T>): Promise<T>;
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

/**
 * Tail of the pending-command chain, per connection.
 *
 * Keyed on the database rather than held per unit of work: the constraint being
 * honoured is SQLite's — one open transaction per connection — so every unit of
 * work over the same handle has to queue behind the same tail.
 */
const queues = new WeakMap<SqlDatabase, Promise<unknown>>();

export function createUnitOfWork(db: SqlDatabase): UnitOfWork {
  const enlistedDb = enlistIn(db);
  const enlisted = createRepositories(enlistedDb);

  return {
    run<T>(work: (repositories: RepositoryBundle, db: SqlDatabase) => Promise<T>): Promise<T> {
      const runExclusively = async (): Promise<T> => {
        // `withTransactionAsync` returns void, so the result is captured here
        // and read after it commits. If `work` throws, the transaction rolls
        // back and the error propagates before this is ever read.
        let result!: T;
        await db.withTransactionAsync(async () => {
          result = await work(enlisted, enlistedDb);
        });
        return result;
      };

      // A failed command must not poison the queue for the commands behind it,
      // so the chain swallows the rejection while the caller still sees it.
      const tail = queues.get(db) ?? Promise.resolve();
      const scheduled = tail.then(runExclusively, runExclusively);
      queues.set(
        db,
        scheduled.catch(() => undefined),
      );
      return scheduled;
    },
  };
}
