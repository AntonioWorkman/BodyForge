import type { SQLiteDatabase } from 'expo-sqlite';

import type { SqlBindValue, SqlDatabase, SqlRunResult } from './sqlDatabase';

/**
 * Adapts an Expo SQLite handle to the `SqlDatabase` port. Expo's methods are
 * variadic overloads; wrapping them here gives repositories one stable shape.
 */
export function fromExpoDatabase(db: SQLiteDatabase): SqlDatabase {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: async (source, params: SqlBindValue[] = []): Promise<SqlRunResult> => {
      const result = await db.runAsync(source, params);
      return { lastInsertRowId: result.lastInsertRowId, changes: result.changes };
    },
    getFirstAsync: <T>(source: string, params: SqlBindValue[] = []) =>
      db.getFirstAsync<T>(source, params),
    getAllAsync: <T>(source: string, params: SqlBindValue[] = []) =>
      db.getAllAsync<T>(source, params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}
