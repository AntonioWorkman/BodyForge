import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The haptic language.
 *
 * Each event maps to a deliberate, distinguishable sensation. The rules are:
 * a rep tick is barely perceptible, set completion is a light confirmation, and
 * only genuinely rare achievements get a pattern.
 */
export type HapticEvent =
  | 'repTick'
  | 'setComplete'
  | 'exerciseComplete'
  | 'restStart'
  | 'restEnding'
  | 'restComplete'
  | 'progressionUnlocked'
  | 'personalBest'
  | 'questComplete'
  | 'selection'
  | 'warning'
  | 'error';

/**
 * Whether haptics fire at all. Set from Settings at app start and on change so
 * that individual call sites stay `fire('setComplete')` with no branching.
 */
let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function areHapticsEnabled(): boolean {
  return enabled;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function impact(style: Haptics.ImpactFeedbackStyle): Promise<void> {
  await Haptics.impactAsync(style);
}

/**
 * Multi-pulse patterns. Kept short — a long buzz reads as an error on both
 * platforms regardless of intent.
 */
async function pattern(steps: readonly (readonly [Haptics.ImpactFeedbackStyle, number])[]) {
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (!step) continue;
    await impact(step[0]);
    if (step[1] > 0) await delay(step[1]);
  }
}

const Light = Haptics.ImpactFeedbackStyle.Light;
const Medium = Haptics.ImpactFeedbackStyle.Medium;
const Heavy = Haptics.ImpactFeedbackStyle.Heavy;

/**
 * Fires a haptic for a named event. Never throws and never blocks the caller —
 * a missing taptic engine must not interrupt a workout.
 */
export function fire(event: HapticEvent): void {
  if (!enabled) return;
  if (Platform.OS === 'web') return;

  void run(event).catch(() => {
    // Haptics are decorative feedback; a failure here is not worth surfacing.
  });
}

async function run(event: HapticEvent): Promise<void> {
  switch (event) {
    case 'repTick':
      return Haptics.selectionAsync();
    case 'selection':
      return Haptics.selectionAsync();
    case 'setComplete':
      return impact(Light);
    case 'exerciseComplete':
      return impact(Medium);
    case 'restStart':
      return Haptics.selectionAsync();
    case 'restEnding':
      return impact(Light);
    case 'restComplete':
      return impact(Medium);
    case 'progressionUnlocked':
      // Two deliberate beats — this is a decision the player just confirmed.
      return pattern([
        [Medium, 90],
        [Heavy, 0],
      ]);
    case 'personalBest':
      // Short distinct triple, unmistakable against set completion.
      return pattern([
        [Light, 60],
        [Light, 60],
        [Medium, 0],
      ]);
    case 'questComplete':
      // The signature. Rises, then lands.
      return pattern([
        [Light, 80],
        [Medium, 110],
        [Heavy, 0],
      ]);
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    default:
      return undefined;
  }
}

export const haptics = { fire, setHapticsEnabled, areHapticsEnabled };
