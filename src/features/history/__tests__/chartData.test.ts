/**
 * @jest-environment node
 */
import { performance, session, set } from '@/domain/__tests__/factories';

import { buildMilestones, measurementSeries, rangeStart, strengthSeries } from '../chartData';
import type { Measurement } from '@/domain/types';

const NOW = new Date('2026-08-21T12:00:00.000Z');

const measurement = (id: string, recordedOn: string, value: number): Measurement => ({
  id,
  type: 'bodyweight',
  value,
  recordedOn,
  createdAt: `${recordedOn}T09:00:00.000Z`,
  note: null,
});

describe('measurement series', () => {
  it('plots recorded points in chronological order', () => {
    const series = measurementSeries(
      [
        measurement('c', '2026-08-15', 79),
        measurement('a', '2026-08-01', 80),
        measurement('b', '2026-08-08', 79.5),
      ],
      0,
      (v) => v,
    );

    expect(series.points.map((p) => p.sourceId)).toEqual(['a', 'b', 'c']);
    expect(series.first?.value).toBe(80);
    expect(series.last?.value).toBe(79);
    expect(series.delta).toBeCloseTo(-1);
  });

  it('converts to display units without touching stored values', () => {
    const series = measurementSeries([measurement('a', '2026-08-01', 79.38)], 0, (v) =>
      Math.round(v * 2.20462),
    );
    expect(series.points[0]?.value).toBe(175);
  });

  it('excludes points outside the selected range', () => {
    const series = measurementSeries(
      [measurement('old', '2026-01-01', 82), measurement('new', '2026-08-15', 79)],
      rangeStart('30d', NOW),
      (v) => v,
    );

    expect(series.points).toHaveLength(1);
    expect(series.points[0]?.sourceId).toBe('new');
  });

  it('returns an empty, not broken, series when there is nothing to plot', () => {
    const series = measurementSeries([], 0, (v) => v);
    expect(series.points).toEqual([]);
    expect(series.first).toBeNull();
    expect(series.delta).toBe(0);
  });

  it('does not interpolate across gaps', () => {
    const series = measurementSeries(
      [measurement('a', '2026-06-01', 80), measurement('b', '2026-08-01', 78)],
      0,
      (v) => v,
    );
    expect(series.points).toHaveLength(2);
  });

  it('treats all-time as no lower bound', () => {
    expect(rangeStart('all', NOW)).toBe(0);
    expect(rangeStart('90d', NOW)).toBeLessThan(NOW.getTime());
  });
});

describe('strength series', () => {
  const sessions = [
    session({
      id: 's1',
      completedAt: '2026-08-01T10:00:00.000Z',
      performances: [
        performance({ id: 'p1', sessionId: 's1', sets: [set(1, 8, 8), set(2, 9, 7)] }),
      ],
    }),
    session({
      id: 's2',
      completedAt: '2026-08-08T10:00:00.000Z',
      performances: [
        performance({ id: 'p2', sessionId: 's2', sets: [set(1, 11, 10), set(2, 10, 10)] }),
      ],
    }),
  ];

  it('plots the best working set per session', () => {
    const series = strengthSeries(sessions, 'var-bss-standard', 0);
    // The weaker side counts, so session one peaks at 8, not 9.
    expect(series.points.map((p) => p.value)).toEqual([8, 10]);
  });

  it('skips sessions where the variation was not performed', () => {
    const series = strengthSeries(sessions, 'var-plank', 0);
    expect(series.points).toEqual([]);
  });

  it('skips sessions with no recorded sets', () => {
    const empty = session({
      id: 's3',
      completedAt: '2026-08-15T10:00:00.000Z',
      performances: [performance({ id: 'p3', sessionId: 's3', sets: [] })],
    });
    expect(strengthSeries([...sessions, empty], 'var-bss-standard', 0).points).toHaveLength(2);
  });

  it('links each point back to the session it came from', () => {
    const series = strengthSeries(sessions, 'var-bss-standard', 0);
    expect(series.points.map((p) => p.sourceId)).toEqual(['s1', 's2']);
  });
});

describe('milestones', () => {
  it('records the first completed quest', () => {
    const milestones = buildMilestones(
      [session({ id: 's1', sessionNumber: 1, completedAt: '2026-08-01T10:00:00.000Z' })],
      [],
    );
    expect(milestones).toHaveLength(1);
    expect(milestones[0]?.title).toBe('First quest completed');
  });

  it('records a phase change between consecutive sessions', () => {
    const milestones = buildMilestones(
      [
        session({
          id: 's12',
          sessionNumber: 12,
          phaseId: 'awakening',
          completedAt: '2026-08-10T10:00:00.000Z',
        }),
        session({
          id: 's13',
          sessionNumber: 13,
          phaseId: 'development',
          completedAt: '2026-08-12T10:00:00.000Z',
        }),
      ],
      [],
    );
    expect(milestones.some((m) => m.title === 'Phase advanced')).toBe(true);
  });

  it('records confirmed progressions', () => {
    const milestones = buildMilestones(
      [],
      [{ variationName: 'Slow Push-Up', masteredAt: '2026-08-14T10:00:00.000Z' }],
    );
    expect(milestones[0]).toMatchObject({
      title: 'Progression unlocked',
      detail: 'Slow Push-Up',
    });
  });

  it('returns nothing for a player with no history', () => {
    expect(buildMilestones([], [])).toEqual([]);
  });

  it('orders newest first', () => {
    const milestones = buildMilestones(
      [session({ id: 's1', sessionNumber: 1, completedAt: '2026-08-01T10:00:00.000Z' })],
      [{ variationName: 'Slow Push-Up', masteredAt: '2026-08-14T10:00:00.000Z' }],
    );
    expect(milestones[0]?.t).toBeGreaterThan(milestones[1]!.t);
  });
});
