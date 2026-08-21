import { ATTRIBUTE_RULES, computeAttributes } from '../attributes';
import { VARIATIONS_BY_ID } from '../program/catalog';
import type { AttributeId, ProgressionState, WorkoutSessionDetail } from '../types';
import { performance, prescription, session, set } from './factories';

const NOW = new Date('2026-08-21T12:00:00.000Z');

const progressionState = (overrides: Partial<ProgressionState>): ProgressionState => ({
  variationId: 'var-bss-standard',
  status: 'current',
  qualifyingSessions: 0,
  startedAt: null,
  masteredAt: null,
  unlockedAt: null,
  ...overrides,
});

function build(sessions: WorkoutSessionDetail[], states: ProgressionState[] = []) {
  return computeAttributes({
    sessions,
    progressionStates: states,
    variationsById: VARIATIONS_BY_ID,
    sessionsPerWeekTarget: 3,
    now: NOW,
  });
}

const value = (attributes: ReturnType<typeof build>, id: AttributeId) =>
  attributes.find((a) => a.id === id)!;

describe('attributes', () => {
  it('gives a brand new player zeros with no invented data', () => {
    const attributes = build([]);
    expect(attributes).toHaveLength(4);
    for (const attribute of attributes) {
      expect(attribute.value).toBe(0);
      expect(attribute.delta).toBe(0);
      expect(attribute.contributions).toEqual([]);
      expect(attribute.basis.length).toBeGreaterThan(0);
    }
  });

  it('derives strength from recorded performance against the prescription', () => {
    const attributes = build([
      session({
        completedAt: '2026-08-20T10:00:00.000Z',
        performances: [
          performance({ sets: [set(1, 12, 12), set(2, 12, 12), set(3, 12, 12)] }),
        ],
      }),
    ]);

    const strength = value(attributes, 'strength');
    expect(strength.value).toBeGreaterThan(0);
    expect(strength.contributions[0]?.detail).toContain('Best set 12');
  });

  it('scores a stronger performance higher than a weaker one', () => {
    const weak = build([
      session({ performances: [performance({ sets: [set(1, 8, 8)] })] }),
    ]);
    const strong = build([
      session({ performances: [performance({ sets: [set(1, 12, 12)] })] }),
    ]);

    expect(value(strong, 'strength').value).toBeGreaterThan(value(weak, 'strength').value);
  });

  it('does not reward reps beyond the prescribed top of range', () => {
    const atTarget = build([
      session({ performances: [performance({ sets: [set(1, 12, 12)] })] }),
    ]);
    const absurd = build([
      session({ performances: [performance({ sets: [set(1, 200, 200)] })] }),
    ]);

    expect(value(absurd, 'strength').value).toBe(value(atTarget, 'strength').value);
  });

  it('derives endurance from real recorded holds', () => {
    const attributes = build([
      session({
        performances: [
          performance({
            variationId: 'var-plank',
            variationName: 'Plank',
            measurementKind: 'time',
            prescribed: prescription({ sets: 3, targetMin: 30, targetMax: 45 }),
            sets: [set(1, 45), set(2, 45), set(3, 45)],
          }),
        ],
      }),
    ]);

    const endurance = value(attributes, 'endurance');
    expect(endurance.value).toBeGreaterThan(0);
    expect(endurance.contributions.some((c) => c.detail.includes('135s'))).toBe(true);
  });

  it('measures consistency against the target cadence, capped at full', () => {
    const dayMs = 86_400_000;
    const sessions = Array.from({ length: 12 }, (_, index) =>
      session({
        id: `session-${index}`,
        completedAt: new Date(NOW.getTime() - index * 2 * dayMs).toISOString(),
      }),
    ).reverse();

    expect(value(build(sessions), 'consistency').value).toBe(100);
  });

  it('does not punish a gap beyond scoring fewer sessions', () => {
    const sparse = [
      session({ id: 's1', completedAt: '2026-08-01T10:00:00.000Z' }),
      session({ id: 's2', completedAt: '2026-08-20T10:00:00.000Z' }),
    ];
    const consistency = value(build(sparse), 'consistency');
    expect(consistency.value).toBeGreaterThan(0);
    expect(consistency.value).toBeLessThan(100);
  });

  it('derives mastery only from confirmed and qualified progressions', () => {
    const attributes = build(
      [],
      [
        progressionState({ variationId: 'var-push-up-regular', status: 'mastered' }),
        progressionState({
          variationId: 'var-bss-standard',
          status: 'ready',
          qualifyingSessions: 2,
        }),
        progressionState({ variationId: 'var-plank', status: 'current' }),
      ],
    );

    const mastery = value(attributes, 'mastery');
    expect(mastery.value).toBe(
      ATTRIBUTE_RULES.masteryPointsPerMastered + ATTRIBUTE_RULES.masteryPointsPerReady,
    );
    expect(mastery.contributions).toHaveLength(2);
  });

  it('reports delta as the change the last session actually caused', () => {
    const first = session({
      id: 's1',
      completedAt: '2026-08-18T10:00:00.000Z',
      performances: [performance({ id: 'p1', sets: [set(1, 8, 8)] })],
    });
    const second = session({
      id: 's2',
      completedAt: '2026-08-20T10:00:00.000Z',
      performances: [performance({ id: 'p2', sessionId: 's2', sets: [set(1, 12, 12)] })],
    });

    const strength = value(build([first, second]), 'strength');
    const before = value(build([first]), 'strength');
    expect(strength.delta).toBe(strength.value - before.value);
    expect(strength.delta).toBeGreaterThan(0);
  });

  it('is deterministic for identical input', () => {
    const sessions = [session({ performances: [performance({ sets: [set(1, 10, 10)] })] })];
    expect(build(sessions)).toEqual(build(sessions));
  });

  it('every contribution names real evidence', () => {
    const attributes = build([
      session({ performances: [performance({ sets: [set(1, 10, 10), set(2, 9, 9)] })] }),
    ]);

    for (const attribute of attributes) {
      for (const contribution of attribute.contributions) {
        expect(contribution.label.length).toBeGreaterThan(0);
        expect(contribution.detail.length).toBeGreaterThan(0);
        expect(Number.isFinite(contribution.points)).toBe(true);
      }
    }
  });
});
