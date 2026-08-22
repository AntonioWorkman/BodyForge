import {
  computePersonalBests,
  countImprovements,
  findNewPersonalBests,
  totalWork,
} from '../personalBests';
import { performance, session, set } from './factories';

describe('personal bests', () => {
  it('takes the highest single set, using the stronger side', () => {
    const bests = computePersonalBests([
      session({ performances: [performance({ sets: [set(1, 9, 11), set(2, 8, 8)] })] }),
    ]);
    expect(bests.get('var-bss-standard')?.bestSetValue).toBe(11);
  });

  it('ignores sessions that were never completed', () => {
    const bests = computePersonalBests([
      session({
        status: 'abandoned',
        completedAt: null,
        performances: [performance({ sets: [set(1, 50, 50)] })],
      }),
    ]);
    expect(bests.size).toBe(0);
  });

  it('does not call a first-ever performance a personal best', () => {
    const first = session({ performances: [performance({ sets: [set(1, 10, 10)] })] });
    expect(findNewPersonalBests(first, [])).toEqual([]);
  });

  it('reports a best only when the previous record is genuinely beaten', () => {
    const previous = session({
      id: 's1',
      performances: [performance({ id: 'p1', sets: [set(1, 10, 10)] })],
    });
    const equal = session({
      id: 's2',
      performances: [performance({ id: 'p2', sessionId: 's2', sets: [set(1, 10, 10)] })],
    });
    const better = session({
      id: 's3',
      performances: [performance({ id: 'p3', sessionId: 's3', sets: [set(1, 11, 11)] })],
    });

    expect(findNewPersonalBests(equal, [previous])).toEqual([]);
    expect(findNewPersonalBests(better, [previous])).toHaveLength(1);
    expect(findNewPersonalBests(better, [previous])[0]?.bestSetValue).toBe(11);
  });

  it('counts improvements by total work against the previous session', () => {
    const previous = session({
      id: 's1',
      performances: [performance({ id: 'p1', sets: [set(1, 8, 8), set(2, 8, 8)] })],
    });
    const current = session({
      id: 's2',
      performances: [
        performance({ id: 'p2', sessionId: 's2', sets: [set(1, 9, 9), set(2, 8, 8)] }),
      ],
    });

    expect(countImprovements(current, [previous])).toBe(1);
    expect(countImprovements(previous, [current])).toBe(0);
  });

  it('sums both sides when totalling unilateral work', () => {
    expect(totalWork(performance({ sets: [set(1, 9, 8)] }))).toBe(17);
    expect(totalWork(performance({ sets: [set(1, 9)] }))).toBe(9);
  });

  it('does not count an improvement with nothing to compare against', () => {
    const first = session({ performances: [performance({ sets: [set(1, 10, 10)] })] });
    expect(countImprovements(first, [])).toBe(0);
  });
});
