import {
  MASTERY_RULES,
  buildProgressionOffer,
  countQualifyingSessions,
  deriveStatus,
  effectiveSetValue,
  isQualifyingPerformance,
  masteryProgress,
  meetsProgressionCriteria,
} from '../mastery';
import { variationsInChain, VARIATIONS_BY_ID } from '../program/catalog';
import type { ProgressionState } from '../types';
import { performance, prescription, set } from './factories';

const state = (overrides: Partial<ProgressionState> = {}): ProgressionState => ({
  variationId: 'var-bss-standard',
  status: 'current',
  qualifyingSessions: 0,
  startedAt: '2026-08-01T10:00:00.000Z',
  masteredAt: null,
  unlockedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
});

describe('qualifying performance', () => {
  it('requires every prescribed set to reach the top of the range', () => {
    const top = performance({ sets: [set(1, 12, 12), set(2, 12, 12), set(3, 12, 12)] });
    expect(isQualifyingPerformance(top)).toBe(true);
  });

  it('rejects a session where one set falls short', () => {
    const nearly = performance({ sets: [set(1, 12, 12), set(2, 12, 12), set(3, 11, 12)] });
    expect(isQualifyingPerformance(nearly)).toBe(false);
  });

  it('uses the weaker side for unilateral work', () => {
    expect(effectiveSetValue(set(1, 12, 8))).toBe(8);
    const lopsided = performance({ sets: [set(1, 12, 8), set(2, 12, 12), set(3, 12, 12)] });
    expect(isQualifyingPerformance(lopsided)).toBe(false);
  });

  it('rejects an exercise that was not fully completed', () => {
    const partial = performance({ sets: [set(1, 12, 12), set(2, 12, 12)] });
    expect(isQualifyingPerformance(partial)).toBe(false);
  });

  it('does not count extra sets as making up for a short one', () => {
    const padded = performance({
      sets: [set(1, 8, 8), set(2, 12, 12), set(3, 12, 12), set(4, 12, 12)],
    });
    expect(isQualifyingPerformance(padded)).toBe(false);
  });

  it('handles timed holds the same way', () => {
    const plank = performance({
      measurementKind: 'time',
      prescribed: prescription({ sets: 3, targetMin: 30, targetMax: 45 }),
      sets: [set(1, 45), set(2, 45), set(3, 45)],
    });
    expect(isQualifyingPerformance(plank)).toBe(true);
  });
});

describe('progression criteria', () => {
  it('requires more than a single strong session', () => {
    expect(MASTERY_RULES.qualifyingSessionsRequired).toBeGreaterThan(1);
    expect(meetsProgressionCriteria(1)).toBe(false);
    expect(meetsProgressionCriteria(MASTERY_RULES.qualifyingSessionsRequired)).toBe(true);
  });

  it('counts distinct sessions, not repeated performances', () => {
    const qualifying = [set(1, 12, 12), set(2, 12, 12), set(3, 12, 12)];
    const count = countQualifyingSessions([
      performance({ sessionId: 'a', sets: qualifying }),
      performance({ sessionId: 'a', sets: qualifying }),
      performance({ sessionId: 'b', sets: qualifying }),
    ]);
    expect(count).toBe(2);
  });

  it('reports progress toward the requirement', () => {
    expect(masteryProgress(0)).toBe(0);
    expect(masteryProgress(1)).toBeCloseTo(0.5);
    expect(masteryProgress(9)).toBe(1);
  });
});

describe('derived status', () => {
  it('marks a qualified current variation as ready, not unlocked', () => {
    expect(deriveStatus(state({ qualifyingSessions: 2 }))).toBe('ready');
  });

  it('leaves an unqualified variation as current', () => {
    expect(deriveStatus(state({ qualifyingSessions: 1 }))).toBe('current');
  });

  it('never resurrects a mastered or locked variation', () => {
    expect(deriveStatus(state({ status: 'mastered', qualifyingSessions: 9 }))).toBe('mastered');
    expect(deriveStatus(state({ status: 'locked', qualifyingSessions: 9 }))).toBe('locked');
  });
});

describe('progression offers', () => {
  const chain = variationsInChain('chain-bulgarian-split-squat');
  const current = VARIATIONS_BY_ID.get('var-bss-standard')!;

  it('offers nothing before the criteria are met', () => {
    expect(buildProgressionOffer(current, state({ qualifyingSessions: 1 }), chain)).toBeNull();
  });

  it('offers the next variation up once qualified', () => {
    const offer = buildProgressionOffer(current, state({ qualifyingSessions: 2 }), chain);
    expect(offer?.to.id).toBe('var-bss-slow');
    expect(offer?.formRequirements.length).toBeGreaterThan(0);
  });

  it('offers nothing at the top of a chain', () => {
    const top = chain[chain.length - 1]!;
    const offer = buildProgressionOffer(
      top,
      state({ variationId: top.id, qualifyingSessions: 5 }),
      chain,
    );
    expect(offer).toBeNull();
  });

  it('does not re-offer a variation already progressed past', () => {
    const offer = buildProgressionOffer(
      current,
      state({ status: 'mastered', qualifyingSessions: 5 }),
      chain,
    );
    expect(offer).toBeNull();
  });
});
