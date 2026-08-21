import type { CoreStage } from '@/domain/coreStages';
import { coreStageIndex } from '@/domain/coreStages';

/**
 * Core geometry.
 *
 * The Core is generated, not drawn by hand and not an image. Its silhouette is
 * a closed polygon whose vertices are derived from the stage: a dormant Core is
 * a rough, uneven shard; an ascendant one is a near-symmetrical crystal with
 * more facets and a deeper internal structure.
 *
 * Everything here is deterministic — the same stage always produces the same
 * shape, so the Core a player sees is stable between launches.
 */

export interface CoreProfile {
  /** Vertices of the outer silhouette, on the unit circle. */
  facets: number;
  /** How far vertices deviate from a perfect polygon, 0–1. */
  irregularity: number;
  /** Radius of the inner obsidian body, as a fraction of the outer shape. */
  innerScale: number;
  /** Opacity of the internal violet energy, 0–1. */
  energy: number;
  /** Opacity of the lavender rim light, 0–1. */
  rimLight: number;
  /** Number of internal structure lines drawn from centre to facet. */
  traces: number;
  /** Ambient particles orbiting the Core. */
  particles: number;
  /** Seconds for one full ambient rotation. Slower reads as heavier. */
  rotationPeriod: number;
}

const PROFILES: Record<CoreStage, CoreProfile> = {
  dormant: {
    facets: 6,
    irregularity: 0.3,
    innerScale: 0.74,
    energy: 0.14,
    rimLight: 0.22,
    traces: 0,
    particles: 0,
    rotationPeriod: 90,
  },
  awakened: {
    facets: 7,
    irregularity: 0.22,
    innerScale: 0.7,
    energy: 0.3,
    rimLight: 0.38,
    traces: 3,
    particles: 4,
    rotationPeriod: 74,
  },
  charged: {
    facets: 8,
    irregularity: 0.15,
    innerScale: 0.66,
    energy: 0.46,
    rimLight: 0.52,
    traces: 4,
    particles: 7,
    rotationPeriod: 62,
  },
  evolved: {
    facets: 10,
    irregularity: 0.09,
    innerScale: 0.62,
    energy: 0.6,
    rimLight: 0.66,
    traces: 5,
    particles: 10,
    rotationPeriod: 52,
  },
  ascendant: {
    facets: 12,
    irregularity: 0.05,
    innerScale: 0.58,
    energy: 0.74,
    rimLight: 0.8,
    traces: 6,
    particles: 13,
    rotationPeriod: 44,
  },
};

export function coreProfile(stage: CoreStage): CoreProfile {
  return PROFILES[stage];
}

/**
 * A small deterministic hash. Used instead of `Math.random` so the Core's
 * irregularity is fixed per stage and vertex rather than shimmering on every
 * render.
 */
function hash(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Builds the silhouette for a stage as points on a circle of `radius`, centred
 * at `cx`/`cy`. `progress` (0–1 toward the next stage) nudges the shape a
 * fraction of the way toward the next profile, so the Core visibly firms up as
 * a player approaches its next form.
 */
export function buildCorePolygon(
  profile: CoreProfile,
  cx: number,
  cy: number,
  radius: number,
  rotation = 0,
): Point[] {
  const points: Point[] = [];
  const step = (Math.PI * 2) / profile.facets;

  for (let index = 0; index < profile.facets; index += 1) {
    // A fixed seed per vertex keeps the silhouette stable across frames.
    const jitter = (hash(index + profile.facets * 13) - 0.5) * 2 * profile.irregularity;
    const angle = index * step + rotation - Math.PI / 2;
    const r = radius * (1 + jitter * 0.35);

    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }

  return points;
}

/** An SVG-style path string for a closed polygon. */
export function polygonPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';
  const segments = rest.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${segments.join(' ')} Z`;
}

/** Scales a polygon toward its centre — used for the inner obsidian body. */
export function scalePolygon(
  points: readonly Point[],
  cx: number,
  cy: number,
  scale: number,
): Point[] {
  return points.map((point) => ({
    x: cx + (point.x - cx) * scale,
    y: cy + (point.y - cy) * scale,
  }));
}

export interface Particle {
  /** Orbit radius as a fraction of the Core radius. */
  orbit: number;
  /** Starting angle in radians. */
  phase: number;
  /** Relative speed. Varying speeds stop the field looking like a wheel. */
  speed: number;
  size: number;
}

/** Deterministic particle field for a stage. */
export function buildParticles(profile: CoreProfile): Particle[] {
  const particles: Particle[] = [];

  for (let index = 0; index < profile.particles; index += 1) {
    const a = hash(index * 3.7 + 1);
    const b = hash(index * 7.3 + 2);
    const c = hash(index * 11.9 + 3);

    particles.push({
      orbit: 1.18 + a * 0.55,
      phase: b * Math.PI * 2,
      speed: 0.35 + c * 0.5,
      size: 1 + c * 1.6,
    });
  }

  return particles;
}

/**
 * Blends between two stages' profiles. Used when a player is partway to their
 * next Core stage so progress is visible before the threshold is crossed.
 */
export function blendProfile(stage: CoreStage, progress: number): CoreProfile {
  const index = coreStageIndex(stage);
  const stages: CoreStage[] = ['dormant', 'awakened', 'charged', 'evolved', 'ascendant'];
  const next = stages[Math.min(stages.length - 1, index + 1)];
  if (!next) return coreProfile(stage);

  const from = coreProfile(stage);
  const to = coreProfile(next);
  // Only a fraction of the way, so a stage change still reads as an event.
  const t = Math.min(1, Math.max(0, progress)) * 0.35;

  return {
    // Facet count stays integral — a half-facet has no meaning.
    facets: from.facets,
    irregularity: from.irregularity + (to.irregularity - from.irregularity) * t,
    innerScale: from.innerScale + (to.innerScale - from.innerScale) * t,
    energy: from.energy + (to.energy - from.energy) * t,
    rimLight: from.rimLight + (to.rimLight - from.rimLight) * t,
    traces: from.traces,
    particles: from.particles,
    rotationPeriod: from.rotationPeriod + (to.rotationPeriod - from.rotationPeriod) * t,
  };
}
