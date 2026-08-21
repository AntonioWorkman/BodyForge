import type { IsoTimestamp, Measurement, WorkoutSessionDetail } from '@/domain/types';

/**
 * Chart series.
 *
 * Pure transformation from recorded rows into plottable points. Nothing is
 * smoothed, interpolated or back-filled: a gap in the data stays a gap, because
 * the point of this screen is to show what was actually recorded.
 */
export interface SeriesPoint {
  /** Epoch milliseconds — the x axis is real time, not row index. */
  t: number;
  value: number;
  /** The record this point came from, so a tap can open it. */
  sourceId: string;
  label: string;
}

export interface Series {
  points: SeriesPoint[];
  min: number;
  max: number;
  first: SeriesPoint | null;
  last: SeriesPoint | null;
  /** Change from first to last point in the range. */
  delta: number;
}

export type TimeRange = '30d' | '90d' | 'all';

export const TIME_RANGES: { id: TimeRange; label: string; days: number | null }[] = [
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

export function rangeStart(range: TimeRange, now: Date): number {
  const entry = TIME_RANGES.find((candidate) => candidate.id === range);
  if (!entry?.days) return 0;
  return now.getTime() - entry.days * 86_400_000;
}

function buildSeries(points: SeriesPoint[]): Series {
  if (points.length === 0) {
    return { points, min: 0, max: 0, first: null, last: null, delta: 0 };
  }

  const values = points.map((point) => point.value);
  const first = points[0]!;
  const last = points[points.length - 1]!;

  return {
    points,
    min: Math.min(...values),
    max: Math.max(...values),
    first,
    last,
    delta: last.value - first.value,
  };
}

/** Measurement series in the player's display units. */
export function measurementSeries(
  measurements: readonly Measurement[],
  from: number,
  convert: (metricValue: number) => number,
): Series {
  const points = measurements
    .map((measurement) => ({
      t: new Date(`${measurement.recordedOn}T12:00:00`).getTime(),
      value: convert(measurement.value),
      sourceId: measurement.id,
      label: measurement.recordedOn,
    }))
    .filter((point) => Number.isFinite(point.t) && point.t >= from)
    .sort((a, b) => a.t - b.t);

  return buildSeries(points);
}

/**
 * Best single set per session for one variation. Best set is used rather than
 * volume because it is the number the player is actually trying to move, and
 * it is comparable across sessions with different set counts.
 */
export function strengthSeries(
  sessions: readonly WorkoutSessionDetail[],
  variationId: string,
  from: number,
): Series {
  const points: SeriesPoint[] = [];

  for (const session of sessions) {
    if (!session.completedAt) continue;
    const t = new Date(session.completedAt).getTime();
    if (!Number.isFinite(t) || t < from) continue;

    const performance = session.performances.find((p) => p.variationId === variationId);
    if (!performance || performance.sets.length === 0) continue;

    const best = performance.sets.reduce(
      (max, set) =>
        Math.max(max, Math.min(set.primaryValue, set.secondaryValue ?? set.primaryValue)),
      0,
    );
    if (best <= 0) continue;

    points.push({ t, value: best, sourceId: session.id, label: session.templateName });
  }

  return buildSeries(points.sort((a, b) => a.t - b.t));
}

export interface Milestone {
  id: string;
  t: number;
  title: string;
  detail: string;
}

/** Real milestones only: progressions confirmed and phases actually entered. */
export function buildMilestones(
  sessions: readonly WorkoutSessionDetail[],
  progressions: readonly { variationName: string; masteredAt: IsoTimestamp }[],
): Milestone[] {
  const milestones: Milestone[] = [];

  for (const session of sessions) {
    if (!session.completedAt || session.sessionNumber === null) continue;
    const previousPhase = sessions.find(
      (candidate) => candidate.sessionNumber === (session.sessionNumber ?? 0) - 1,
    )?.phaseId;

    if (session.sessionNumber === 1) {
      milestones.push({
        id: `first-${session.id}`,
        t: new Date(session.completedAt).getTime(),
        title: 'First quest completed',
        detail: session.templateName,
      });
    } else if (previousPhase && previousPhase !== session.phaseId) {
      milestones.push({
        id: `phase-${session.id}`,
        t: new Date(session.completedAt).getTime(),
        title: 'Phase advanced',
        detail: session.phaseId,
      });
    }
  }

  for (const progression of progressions) {
    milestones.push({
      id: `progression-${progression.variationName}-${progression.masteredAt}`,
      t: new Date(progression.masteredAt).getTime(),
      title: 'Progression unlocked',
      detail: progression.variationName,
    });
  }

  return milestones.filter((m) => Number.isFinite(m.t)).sort((a, b) => b.t - a.t);
}
