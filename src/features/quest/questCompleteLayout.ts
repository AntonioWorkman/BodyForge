import { layout } from '@/design';

/**
 * Quest Complete sizing.
 *
 * The ordinary completion — Core, title, facts, XP, next directive, and the
 * button back to System — has to fit on the phone without scrolling. Reaching
 * for "Return to System" is the last thing a player does after finishing a
 * workout, and having to scroll to find it makes a finished quest feel
 * unfinished.
 *
 * The Core is the one element large enough to decide that on its own, so its
 * size is derived from the screen rather than fixed. It was capped at 240pt,
 * which on a 852pt-tall phone pushed the button off the bottom by roughly the
 * height of the button itself.
 *
 * Exceptional completions — a level-up, personal bests, an available
 * progression, a phase advance — add sections and are allowed to scroll. They
 * are rare and worth reading; the ordinary case is neither.
 */

/** Below this, the Core stops reading as the centrepiece of the screen. */
const MIN_CORE = 140;

/** Above this it dominates, and tall phones do not need a bigger one. */
const MAX_CORE = 200;

/**
 * Share of screen height the Core may occupy. Chosen so the common modern
 * sizes — 812pt through 874pt — land in the 170s and 180s, leaving room for
 * every other block plus both safe areas.
 */
const CORE_HEIGHT_SHARE = 0.215;

export interface ScreenMetrics {
  width: number;
  height: number;
}

/**
 * The Core's diameter on Quest Complete.
 *
 * Height decides it on ordinary phones; width only takes over on unusually
 * narrow ones, where the Core would otherwise touch the gutters.
 */
export function questCompleteCoreSize({ width, height }: ScreenMetrics): number {
  const byWidth = width - layout.screenPadding * 2;
  const byHeight = Math.min(MAX_CORE, Math.max(MIN_CORE, height * CORE_HEIGHT_SHARE));
  return Math.round(Math.min(byWidth, byHeight));
}
