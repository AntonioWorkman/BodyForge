import { Easing } from 'react-native-reanimated';

/**
 * The motion language.
 *
 * Every animation in the app picks a level here rather than choosing its own
 * timing. The hierarchy is what keeps the app from feeling like everything is
 * equally important: micro motion is nearly invisible, milestone motion is rare.
 */
export const MotionLevel = {
  /** Taps, counters, toggles. */
  micro: 'micro',
  /** Set actions, sheets, controls. */
  interaction: 'interaction',
  /** Exercise and screen changes. */
  transition: 'transition',
  /** Exercise completion. */
  reward: 'reward',
  /** Personal best, level-up, quest complete. */
  milestone: 'milestone',
  /** The Core's continuous idle life. */
  ambient: 'ambient',
} as const;

export type MotionLevelName = (typeof MotionLevel)[keyof typeof MotionLevel];

/** Canonical durations in milliseconds, one per motion level. */
export const duration: Record<MotionLevelName, number> = {
  micro: 120,
  interaction: 260,
  transition: 400,
  reward: 700,
  milestone: 1400,
  ambient: 6000,
};

/** Finer-grained durations for cases that need a specific point in a band. */
export const timing = {
  microFast: 80,
  micro: 120,
  microSlow: 180,
  interactionFast: 180,
  interaction: 260,
  interactionSlow: 350,
  transitionFast: 300,
  transition: 400,
  transitionSlow: 500,
  rewardFast: 500,
  reward: 700,
  rewardSlow: 900,
  milestoneFast: 1000,
  milestone: 1400,
  milestoneSlow: 2000,
} as const;

/**
 * Easing curves. `standard` covers most movement; `emphasized` is for motion
 * that should feel driven rather than merely animated.
 */
export const easing = {
  standard: Easing.bezier(0.32, 0.72, 0, 1),
  emphasized: Easing.bezier(0.2, 0.9, 0.1, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  linear: Easing.linear,
} as const;

/** Spring presets for gesture-driven and physical-feeling movement. */
export const spring = {
  /** Snappy, minimal overshoot — controls and counters. */
  crisp: { damping: 22, stiffness: 320, mass: 0.7 },
  /** Default for sheets and layout changes. */
  standard: { damping: 20, stiffness: 180, mass: 1 },
  /** Slower and heavier — the Core reacting to touch. */
  weighty: { damping: 26, stiffness: 110, mass: 1.4 },
} as const;

/** Stagger step for lists revealing in sequence. */
export const stagger = {
  tight: 40,
  standard: 70,
  loose: 110,
} as const;
