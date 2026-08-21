import { WORKOUT_TEMPLATE_EXERCISES } from '../program/templates';
import { XP_RULES, calculateSessionXp, countedSetsFor, projectedXpForPlan } from '../xp';
import { performance, prescription, set } from './factories';

const base = { sessionCompleted: true, personalBests: [], progressionsUnlocked: 0 };

describe('XP rules', () => {
  it('awards nothing for a session with no recorded work', () => {
    const result = calculateSessionXp({
      ...base,
      sessionCompleted: false,
      performances: [],
    });
    expect(result.total).toBe(0);
    expect(result.lineItems).toHaveLength(0);
  });

  it('pays for prescribed sets, the exercise, and the session', () => {
    const result = calculateSessionXp({
      ...base,
      performances: [performance({ sets: [set(1, 10, 10), set(2, 9, 9), set(3, 8, 8)] })],
    });

    expect(result.countedSets).toBe(3);
    expect(result.completedExercises).toBe(1);
    expect(result.total).toBe(
      3 * XP_RULES.perWorkingSet + XP_RULES.perExerciseCompleted + XP_RULES.workoutCompletionBonus,
    );
  });

  it('does not pay for sets beyond the prescription', () => {
    const prescribed = prescription({ sets: 3 });
    const three = calculateSessionXp({
      ...base,
      performances: [performance({ prescribed, sets: [set(1, 10), set(2, 10), set(3, 10)] })],
    });
    const six = calculateSessionXp({
      ...base,
      performances: [
        performance({
          prescribed,
          sets: [set(1, 10), set(2, 10), set(3, 10), set(4, 10), set(5, 10), set(6, 10)],
        }),
      ],
    });

    expect(six.total).toBe(three.total);
    expect(countedSetsFor(prescribed, 12)).toBe(3);
  });

  it('does not pay more for reps beyond the top of the range', () => {
    const modest = calculateSessionXp({
      ...base,
      performances: [performance({ sets: [set(1, 8, 8), set(2, 8, 8), set(3, 8, 8)] })],
    });
    const excessive = calculateSessionXp({
      ...base,
      performances: [performance({ sets: [set(1, 80, 80), set(2, 80, 80), set(3, 80, 80)] })],
    });

    expect(excessive.total).toBe(modest.total);
  });

  it('withholds the exercise bonus when the prescription is left unfinished', () => {
    const result = calculateSessionXp({
      ...base,
      sessionCompleted: false,
      performances: [performance({ sets: [set(1, 10), set(2, 10)] })],
    });

    expect(result.completedExercises).toBe(0);
    expect(result.total).toBe(2 * XP_RULES.perWorkingSet);
  });

  it('caps personal-best bonuses so one session cannot farm them', () => {
    const bests = Array.from({ length: 8 }, (_, index) => ({
      variationId: `var-${index}`,
      variationName: `Variation ${index}`,
      measurementKind: 'reps' as const,
      bestSetValue: 10,
      achievedOn: '2026-08-01T10:00:00.000Z',
      sessionId: 'session-1',
    }));

    const result = calculateSessionXp({ ...base, performances: [], personalBests: bests });
    expect(result.total).toBe(
      XP_RULES.workoutCompletionBonus +
        XP_RULES.maxPersonalBestsPerSession * XP_RULES.personalBestBonus,
    );
  });

  it('pays a bonus per confirmed progression', () => {
    const result = calculateSessionXp({ ...base, performances: [], progressionsUnlocked: 2 });
    expect(result.total).toBe(XP_RULES.workoutCompletionBonus + 2 * XP_RULES.progressionBonus);
  });

  it('projects a clean Workout A at its full base value', () => {
    const workoutA = WORKOUT_TEMPLATE_EXERCISES.filter(
      (entry) => entry.templateId === 'template-workout-a',
    );
    const prescriptions = workoutA.map((entry) => entry.prescription);

    // 21 prescribed sets across 7 exercises.
    expect(prescriptions.reduce((sum, p) => sum + p.sets, 0)).toBe(21);
    expect(projectedXpForPlan(prescriptions)).toBe(345);
  });

  it('matches the projection when the plan is actually completed cleanly', () => {
    const workoutA = WORKOUT_TEMPLATE_EXERCISES.filter(
      (entry) => entry.templateId === 'template-workout-a',
    );

    const performances = workoutA.map((entry, index) =>
      performance({
        id: `perf-${index}`,
        position: index,
        variationId: entry.variationId,
        prescribed: entry.prescription,
        sets: Array.from({ length: entry.prescription.sets }, (_, i) =>
          set(i + 1, entry.prescription.targetMin),
        ),
      }),
    );

    const result = calculateSessionXp({ ...base, performances });
    expect(result.total).toBe(projectedXpForPlan(workoutA.map((e) => e.prescription)));
  });
});
