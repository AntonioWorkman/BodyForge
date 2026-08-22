import type { AppSettings } from '@/domain/types';

/**
 * Settings storage.
 *
 * Settings live as key/value rows so adding one never needs a migration. This
 * module is the only place that knows the wire format, and it always returns a
 * complete `AppSettings` — an unknown or corrupt row falls back to the default
 * rather than leaving a field undefined.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  unitSystem: 'imperial',
  hapticsEnabled: true,
  motionPreference: 'full',
  respectSystemReducedMotion: true,
  defaultRestSeconds: 90,
  sessionsPerWeekTarget: 3,
  onboardingCompleted: false,
};

type SettingKey = keyof AppSettings;

export function encodeSettings(patch: Partial<AppSettings>): [string, string][] {
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, String(value)]);
}

export function decodeSettings(rows: readonly { key: string; value: string }[]): AppSettings {
  const settings: AppSettings = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    if (!isSettingKey(row.key)) continue;

    switch (row.key) {
      case 'hapticsEnabled':
      case 'respectSystemReducedMotion':
      case 'onboardingCompleted':
        settings[row.key] = row.value === 'true';
        break;

      case 'defaultRestSeconds':
      case 'sessionsPerWeekTarget': {
        const parsed = Number(row.value);
        if (Number.isFinite(parsed)) settings[row.key] = parsed;
        break;
      }

      case 'unitSystem':
        if (row.value === 'metric' || row.value === 'imperial') settings.unitSystem = row.value;
        break;

      case 'motionPreference':
        if (row.value === 'full' || row.value === 'reduced') settings.motionPreference = row.value;
        break;
    }
  }

  return settings;
}

function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key);
}
