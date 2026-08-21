/* istanbul ignore file */
import { DatabaseSync } from 'node:sqlite';

import type { SqlBindValue, SqlDatabase } from '@/database/sqlDatabase';

/**
 * A `SqlDatabase` backed by Node's built-in SQLite.
 *
 * Persistence tests run against a real SQL engine rather than a hand-written
 * fake, so migrations, constraints, upserts and joins are genuinely exercised.
 * Only tests import this.
 */
export function createTestDatabase(): SqlDatabase & { close: () => void } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  let transactionDepth = 0;

  const normalise = (params: SqlBindValue[] = []): (string | number | null)[] =>
    params.map((value) => (value === undefined ? null : value));

  return {
    close: () => db.close(),

    execAsync: async (source) => {
      db.exec(source);
    },

    runAsync: async (source, params = []) => {
      const result = db.prepare(source).run(...normalise(params));
      return {
        lastInsertRowId: Number(result.lastInsertRowid ?? 0),
        changes: Number(result.changes ?? 0),
      };
    },

    getFirstAsync: async <T>(source: string, params: SqlBindValue[] = []) => {
      const row = db.prepare(source).get(...normalise(params));
      return (row as T | undefined) ?? null;
    },

    getAllAsync: async <T>(source: string, params: SqlBindValue[] = []) =>
      db.prepare(source).all(...normalise(params)) as T[],

    withTransactionAsync: async (task) => {
      // Nested calls join the outer transaction, matching Expo SQLite.
      if (transactionDepth > 0) {
        transactionDepth += 1;
        try {
          await task();
        } finally {
          transactionDepth -= 1;
        }
        return;
      }

      transactionDepth = 1;
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        transactionDepth = 0;
      }
    },
  };
}
