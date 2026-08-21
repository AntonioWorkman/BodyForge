import type { LevelState } from './types';

/**
 * Level curve.
 *
 * Levels derive solely from cumulative XP — nothing else is stored, so no two
 * screens can disagree. The curve is a mild power function rounded to a
 * readable step, which keeps early levels quick and later levels meaningful
 * without the numbers becoming arbitrary.
 *
 * Tuning knobs live here and nowhere else.
 */
export const LEVEL_CURVE = {
  /** XP required to leave level 1, before rounding. */
  base: 220,
  /** Growth exponent. Above 1 means each level costs progressively more. */
  exponent: 1.1,
  /** Requirements are rounded to this step so displayed totals stay legible. */
  rounding: 25,
  /** Ceiling so the curve cannot run away over years of training. */
  maxLevel: 99,
} as const;

/**
 * XP required to advance from `level` to `level + 1`.
 * Returns `Infinity` at the level cap so progress there reads as complete.
 */
export function xpForLevel(level: number): number {
  if (level < 1) return 0;
  if (level >= LEVEL_CURVE.maxLevel) return Infinity;
  const raw = LEVEL_CURVE.base * Math.pow(level, LEVEL_CURVE.exponent);
  return Math.round(raw / LEVEL_CURVE.rounding) * LEVEL_CURVE.rounding;
}

/** Cumulative XP needed to have reached `level`. Level 1 costs nothing. */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, LEVEL_CURVE.maxLevel); l += 1) {
    total += xpForLevel(l);
  }
  return total;
}

/**
 * Resolves cumulative XP into the full level read model. This is the single
 * function every screen uses for level and XP display.
 */
export function resolveLevel(totalXp: number): LevelState {
  const safeXp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;

  let level = 1;
  let consumed = 0;

  while (level < LEVEL_CURVE.maxLevel) {
    const required = xpForLevel(level);
    if (safeXp - consumed < required) break;
    consumed += required;
    level += 1;
  }

  const xpForCurrentLevel = xpForLevel(level);
  const xpIntoLevel = safeXp - consumed;

  if (!Number.isFinite(xpForCurrentLevel)) {
    return {
      level,
      totalXp: safeXp,
      xpIntoLevel: 0,
      xpForLevel: 0,
      progress: 1,
    };
  }

  return {
    level,
    totalXp: safeXp,
    xpIntoLevel,
    xpForLevel: xpForCurrentLevel,
    progress: xpForCurrentLevel > 0 ? Math.min(1, xpIntoLevel / xpForCurrentLevel) : 0,
  };
}

/** True when awarding `gainedXp` on top of `previousTotalXp` crosses a level. */
export function didLevelUp(previousTotalXp: number, gainedXp: number): boolean {
  return resolveLevel(previousTotalXp + gainedXp).level > resolveLevel(previousTotalXp).level;
}
