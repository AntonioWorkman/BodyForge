export { MotionLevel, duration, timing, easing, spring, stagger } from './motion';
export type { MotionLevelName } from './motion';
export {
  useMotionPreference,
  useReducedMotion,
  useSystemReducedMotion,
  reduceDuration,
} from './useMotionPreference';
export type { MotionPreference } from './useMotionPreference';
export { haptics, fire as fireHaptic, setHapticsEnabled } from './haptics';
export type { HapticEvent } from './haptics';
