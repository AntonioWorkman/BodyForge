import { create } from 'zustand';

import { DEFAULT_SETTINGS } from '@/database/settingsCodec';
import type { AppSettings } from '@/domain/types';
import { setHapticsEnabled } from '@/motion/haptics';

/**
 * Settings mirror.
 *
 * SQLite remains the source of truth; this store exists so that motion and
 * haptics can be read synchronously from deep inside render and worklet code
 * without every component awaiting the database. It is hydrated once at
 * startup and written through on every change.
 */
interface SettingsStore extends AppSettings {
  hydrated: boolean;
  hydrate: (settings: AppSettings) => void;
  apply: (patch: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: (settings) => {
    setHapticsEnabled(settings.hapticsEnabled);
    set({ ...settings, hydrated: true });
  },

  apply: (patch) => {
    if (patch.hapticsEnabled !== undefined) setHapticsEnabled(patch.hapticsEnabled);
    set(patch);
  },
}));

/** Non-reactive read, for callbacks and imperative code. */
export function currentSettings(): AppSettings {
  const { hydrated: _hydrated, hydrate: _hydrate, apply: _apply, ...settings } = useSettingsStore.getState();
  return settings;
}
