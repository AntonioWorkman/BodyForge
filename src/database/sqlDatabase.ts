/**
 * The SQL port.
 *
 * Repositories talk to this interface, never to `expo-sqlite` directly. That
 * keeps the persistence layer testable against a real SQL engine in Node while
 * the app runs on Expo SQLite, and it means swapping the driver later touches
 * one adapter rather than every repository.
 */
export type SqlBindValue = string | number | null;

export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SqlDatabase {
  /** Runs one or more statements with no parameters and no result. */
  execAsync(source: string): Promise<void>;
  /** Runs a single parameterised statement. */
  runAsync(source: string, params?: SqlBindValue[]): Promise<SqlRunResult>;
  /** First row, or null. */
  getFirstAsync<T>(source: string, params?: SqlBindValue[]): Promise<T | null>;
  /** All rows. */
  getAllAsync<T>(source: string, params?: SqlBindValue[]): Promise<T[]>;
  /** Runs `task` inside a transaction, rolling back if it throws. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
