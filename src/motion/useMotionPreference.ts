import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';

export type MotionPreference = 'full' | 'reduced';

/**
 * Reads the operating system's Reduce Motion setting and keeps it live.
 * Exposed separately from the user's in-app preference so Settings can show
 * why motion is reduced.
 */
export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {
        // Platform did not answer; full motion is the safe default.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) =>
      setReduced(value),
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/**
 * The effective motion preference: the OS setting wins whenever the user has
 * asked the system to reduce motion, otherwise the in-app choice applies.
 */
export function useMotionPreference(): MotionPreference {
  const systemReduced = useSystemReducedMotion();
  const appPreference = useSettingsStore((s) => s.motionPreference);
  const respectSystem = useSettingsStore((s) => s.respectSystemReducedMotion);

  if (respectSystem && systemReduced) return 'reduced';
  return appPreference;
}

/** Convenience boolean for the common `reduced ? a : b` branch. */
export function useReducedMotion(): boolean {
  return useMotionPreference() === 'reduced';
}

/**
 * Scales a duration for the current motion preference. Reduced motion keeps a
 * short cross-fade rather than removing feedback entirely, which would make the
 * interface feel broken.
 */
export function reduceDuration(ms: number, reduced: boolean): number {
  if (!reduced) return ms;
  return Math.min(ms, 140);
}
