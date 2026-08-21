import type { WorkoutTemplate } from './types';

/**
 * Workout rotation.
 *
 * Templates alternate sequentially — A, B, A, B — and the rotation only moves
 * when a session is actually completed. Missing Wednesday changes nothing: the
 * next workout is still whatever was next. Nothing here consults a weekday.
 */

/** The template whose `rotationOrder` matches the player's next position. */
export function templateForRotation(
  templates: readonly WorkoutTemplate[],
  rotationOrder: number,
): WorkoutTemplate | null {
  if (templates.length === 0) return null;
  const ordered = [...templates].sort((a, b) => a.rotationOrder - b.rotationOrder);
  const index = ((rotationOrder % ordered.length) + ordered.length) % ordered.length;
  return ordered[index] ?? null;
}

/** The rotation position after completing a session at `rotationOrder`. */
export function advanceRotation(rotationOrder: number, templateCount: number): number {
  if (templateCount <= 0) return 0;
  return (rotationOrder + 1) % templateCount;
}

/**
 * The next `count` templates in rotation order, for showing what is coming.
 */
export function upcomingRotation(
  templates: readonly WorkoutTemplate[],
  rotationOrder: number,
  count: number,
): WorkoutTemplate[] {
  const result: WorkoutTemplate[] = [];
  if (templates.length === 0) return result;
  for (let i = 0; i < count; i += 1) {
    const template = templateForRotation(templates, rotationOrder + i);
    if (template) result.push(template);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Recovery guidance
// ---------------------------------------------------------------------------

export type Directive =
  | { kind: 'first-quest'; templateId: string; templateName: string; focus: string }
  | { kind: 'quest'; templateId: string; templateName: string; focus: string }
  | { kind: 'resume'; sessionId: string; templateName: string; exerciseIndex: number; exerciseCount: number }
  | { kind: 'recovery'; suggestion: string; readyAt: string | null };

/** Hours after a session during which the System suggests recovery instead. */
export const RECOVERY_WINDOW_HOURS = 20;

export const RECOVERY_SUGGESTION = 'A 30–45 minute walk. Recovery is part of progression.';

/**
 * Whether enough time has passed since the last completed session for the next
 * one to be the recommended action. This is guidance only — the player can
 * always start a session anyway.
 */
export function isInRecoveryWindow(
  lastCompletedAt: string | null,
  now: Date,
  windowHours: number = RECOVERY_WINDOW_HOURS,
): boolean {
  if (!lastCompletedAt) return false;
  const last = new Date(lastCompletedAt).getTime();
  if (Number.isNaN(last)) return false;
  const elapsedHours = (now.getTime() - last) / 3_600_000;
  return elapsedHours < windowHours;
}

/** The instant recovery guidance lapses, or null if there is no last session. */
export function recoveryEndsAt(
  lastCompletedAt: string | null,
  windowHours: number = RECOVERY_WINDOW_HOURS,
): string | null {
  if (!lastCompletedAt) return null;
  const last = new Date(lastCompletedAt).getTime();
  if (Number.isNaN(last)) return null;
  return new Date(last + windowHours * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------
// Weekly consistency
// ---------------------------------------------------------------------------

/** Start of the ISO week (Monday, local midnight) containing `date`. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  const daysSinceMonday = (day + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

/**
 * Sessions completed in the current week against the target cadence. Used for
 * the restrained "THIS WEEK" indicator, which is informational and never a
 * streak the player can break.
 */
export function weeklyProgress(
  completedTimestamps: readonly string[],
  now: Date,
  target: number,
): { completed: number; target: number } {
  const weekStart = startOfWeek(now).getTime();
  const completed = completedTimestamps.filter((iso) => {
    const time = new Date(iso).getTime();
    return !Number.isNaN(time) && time >= weekStart && time <= now.getTime();
  }).length;
  return { completed, target: Math.max(1, target) };
}
