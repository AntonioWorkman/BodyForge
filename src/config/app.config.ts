/**
 * Central application identity.
 *
 * Everything user-visible that names the product reads from here so the app can
 * be renamed in one place. `app.json` carries the native/store-level name and is
 * kept in sync manually — it cannot import TypeScript.
 */
export const APP_CONFIG = {
  /** Display name used across the UI. */
  name: 'BodyForge',
  /** Short form for tight spaces (tab bars, badges). */
  shortName: 'BodyForge',
  /** The in-world name for the progression engine. */
  systemName: 'System',
  /** How the app refers to the user. */
  actorNoun: 'Player',
  /** Name of the training session concept. */
  sessionNoun: 'Quest',
  version: '1.0.0',
  /** Schema version written into exported backups. */
  backupFormatVersion: 1,
  /** Bundle-level storage identity. */
  databaseName: 'bodyforge.db',
} as const;

export type AppConfig = typeof APP_CONFIG;
