import {
  RECOVERY_WINDOW_HOURS,
  advanceRotation,
  isInRecoveryWindow,
  recoveryEndsAt,
  startOfWeek,
  templateForRotation,
  upcomingRotation,
  weeklyProgress,
} from '../schedule';
import { WORKOUT_TEMPLATES } from '../program/templates';

describe('workout rotation', () => {
  it('starts a new player on Workout A', () => {
    expect(templateForRotation(WORKOUT_TEMPLATES, 0)?.name).toBe('Workout A');
  });

  it('alternates A and B sequentially', () => {
    const sequence: string[] = [];
    let rotation = 0;
    for (let i = 0; i < 6; i += 1) {
      sequence.push(templateForRotation(WORKOUT_TEMPLATES, rotation)?.name ?? '');
      rotation = advanceRotation(rotation, WORKOUT_TEMPLATES.length);
    }
    expect(sequence).toEqual([
      'Workout A',
      'Workout B',
      'Workout A',
      'Workout B',
      'Workout A',
      'Workout B',
    ]);
  });

  it('does not move the rotation when no session is completed', () => {
    const before = templateForRotation(WORKOUT_TEMPLATES, 1)?.id;
    // Days pass, nothing is completed: the same rotation position is asked for.
    const after = templateForRotation(WORKOUT_TEMPLATES, 1)?.id;
    expect(after).toBe(before);
  });

  it('wraps rather than running off the end', () => {
    expect(templateForRotation(WORKOUT_TEMPLATES, 7)?.name).toBe('Workout B');
    expect(templateForRotation(WORKOUT_TEMPLATES, -1)?.name).toBe('Workout B');
    expect(advanceRotation(1, 2)).toBe(0);
  });

  it('returns nothing when there are no templates at all', () => {
    expect(templateForRotation([], 0)).toBeNull();
    expect(upcomingRotation([], 0, 3)).toEqual([]);
  });

  it('lists what is coming next', () => {
    expect(upcomingRotation(WORKOUT_TEMPLATES, 0, 3).map((t) => t.name)).toEqual([
      'Workout A',
      'Workout B',
      'Workout A',
    ]);
  });
});

describe('recovery guidance', () => {
  const completed = '2026-08-20T18:00:00.000Z';

  it('suggests recovery shortly after a session', () => {
    expect(isInRecoveryWindow(completed, new Date('2026-08-20T22:00:00.000Z'))).toBe(true);
  });

  it('lapses once the window has passed', () => {
    const after = new Date(new Date(completed).getTime() + (RECOVERY_WINDOW_HOURS + 1) * 3_600_000);
    expect(isInRecoveryWindow(completed, after)).toBe(false);
  });

  it('does not suggest recovery to a player with no history', () => {
    expect(isInRecoveryWindow(null, new Date())).toBe(false);
    expect(recoveryEndsAt(null)).toBeNull();
  });

  it('reports when the guidance lapses', () => {
    expect(recoveryEndsAt(completed)).toBe('2026-08-21T14:00:00.000Z');
  });

  it('ignores unparseable timestamps rather than throwing', () => {
    expect(isInRecoveryWindow('not-a-date', new Date())).toBe(false);
  });
});

describe('weekly consistency', () => {
  it('counts only sessions inside the current week', () => {
    const now = new Date('2026-08-20T12:00:00');
    const monday = startOfWeek(now);
    expect(monday.getDay()).toBe(1);

    const thisWeek = new Date(monday.getTime() + 3_600_000).toISOString();
    const lastWeek = new Date(monday.getTime() - 86_400_000).toISOString();

    expect(weeklyProgress([thisWeek, lastWeek], now, 3)).toEqual({ completed: 1, target: 3 });
  });

  it('never reports a target below one', () => {
    expect(weeklyProgress([], new Date(), 0).target).toBe(1);
  });
});
