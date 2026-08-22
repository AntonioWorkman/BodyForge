/* istanbul ignore file */
import type { SqlBindValue, SqlDatabase } from '@/database/sqlDatabase';

/**
 * Wraps a database so a chosen statement fails.
 *
 * Atomicity cannot be proven by happy-path tests: the question is what remains
 * on disk when a command dies halfway through. This makes that failure happen
 * on demand, at a named statement, so a test can assert that nothing survived.
 */
export interface FaultInjector {
  db: SqlDatabase;
  /** Statements the wrapped database has been asked to run. */
  readonly executed: string[];
}

export function failOnStatement(
  base: SqlDatabase,
  /** Substring or pattern identifying the statement that should throw. */
  match: string | RegExp,
  message = 'injected failure',
): FaultInjector {
  const executed: string[] = [];

  const matches = (source: string) =>
    typeof match === 'string' ? source.includes(match) : match.test(source);

  const guard = (source: string) => {
    executed.push(source);
    if (matches(source)) throw new Error(message);
  };

  return {
    executed,
    db: {
      execAsync: async (source) => {
        // Transaction control statements must still work, or the rollback the
        // test is checking for could never run.
        if (!/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(source)) guard(source);
        return base.execAsync(source);
      },
      runAsync: async (source: string, params?: SqlBindValue[]) => {
        guard(source);
        return base.runAsync(source, params);
      },
      getFirstAsync: (source, params) => base.getFirstAsync(source, params),
      getAllAsync: (source, params) => base.getAllAsync(source, params),
      withTransactionAsync: (task) => base.withTransactionAsync(task),
    },
  };
}
