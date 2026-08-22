/**
 * @jest-environment node
 */
import { blendProfile, coreProfile } from '../coreGeometry';
import type { CoreStage } from '@/domain/coreStages';

const STAGES: CoreStage[] = ['dormant', 'awakened', 'charged', 'evolved', 'ascendant'];

/**
 * The Core's motion is part of its progression language, so these assert the
 * relationships between stages rather than pinning individual numbers. Tuning a
 * value stays free; inverting the language does not.
 *
 * The one absolute is dormant's breath. It was ±1.2%, which on a physical phone
 * read as no motion at all — the Core looked switched off. A floor keeps that
 * from silently coming back.
 */
describe('Core ambient motion', () => {
  const profiles = STAGES.map((stage) => ({ stage, ...coreProfile(stage) }));

  describe('breathing is perceptible at every stage', () => {
    it.each(STAGES)('%s breathes by a visible amount', (stage) => {
      const { breathAmplitude } = coreProfile(stage);
      // Below roughly 2% the movement is not readable at arm's length.
      expect(breathAmplitude).toBeGreaterThanOrEqual(0.02);
    });

    it('breathes clearly even when dormant', () => {
      expect(coreProfile('dormant').breathAmplitude).toBeGreaterThanOrEqual(0.025);
    });

    it.each(STAGES)('%s stays restrained rather than bouncing', (stage) => {
      // Past ~6% a slow scale stops reading as breathing and starts reading as
      // a notification pulse.
      expect(coreProfile(stage).breathAmplitude).toBeLessThanOrEqual(0.06);
    });

    it.each(STAGES)('%s breathes on a slow, calm cycle', (stage) => {
      const { breathPeriod } = coreProfile(stage);
      expect(breathPeriod).toBeGreaterThanOrEqual(3);
      expect(breathPeriod).toBeLessThanOrEqual(10);
    });
  });

  describe('the progression reads as increasingly alive', () => {
    it('breathes deeper at every successive stage', () => {
      const amplitudes = profiles.map((p) => p.breathAmplitude);
      expect(amplitudes).toEqual([...amplitudes].sort((a, b) => a - b));
      expect(new Set(amplitudes).size).toBe(amplitudes.length);
    });

    it('breathes faster at every successive stage', () => {
      const periods = profiles.map((p) => p.breathPeriod);
      expect(periods).toEqual([...periods].sort((a, b) => b - a));
      expect(new Set(periods).size).toBe(periods.length);
    });

    it('rotates faster at every successive stage', () => {
      const rotations = profiles.map((p) => p.rotationPeriod);
      expect(rotations).toEqual([...rotations].sort((a, b) => b - a));
    });

    it('never makes a later stage calmer than an earlier one', () => {
      for (let i = 1; i < profiles.length; i += 1) {
        const previous = profiles[i - 1]!;
        const current = profiles[i]!;
        expect(current.breathAmplitude).toBeGreaterThan(previous.breathAmplitude);
        expect(current.breathPeriod).toBeLessThan(previous.breathPeriod);
        expect(current.rotationPeriod).toBeLessThan(previous.rotationPeriod);
      }
    });

    it('keeps dormant the slowest stage in every respect', () => {
      const dormant = coreProfile('dormant');
      for (const stage of STAGES.slice(1)) {
        const other = coreProfile(stage);
        expect(dormant.breathPeriod).toBeGreaterThan(other.breathPeriod);
        expect(dormant.rotationPeriod).toBeGreaterThan(other.rotationPeriod);
      }
    });
  });

  describe('internal drift', () => {
    it('gives even a dormant Core something moving inside it', () => {
      // Dormant used to carry no particles at all, which left breathing as the
      // single moving element.
      expect(coreProfile('dormant').particles).toBeGreaterThan(0);
    });

    it('never loses particles as the Core progresses', () => {
      const particles = profiles.map((p) => p.particles);
      expect(particles).toEqual([...particles].sort((a, b) => a - b));
    });

    it('keeps dormant the sparsest', () => {
      const dormant = coreProfile('dormant').particles;
      for (const stage of STAGES.slice(1)) {
        expect(coreProfile(stage).particles).toBeGreaterThan(dormant);
      }
    });
  });

  describe('blending toward the next stage', () => {
    it('carries the motion fields, so progress is visible before the threshold', () => {
      const at0 = blendProfile('dormant', 0);
      const at1 = blendProfile('dormant', 1);

      expect(at0.breathAmplitude).toBeCloseTo(coreProfile('dormant').breathAmplitude, 6);
      expect(at1.breathAmplitude).toBeGreaterThan(at0.breathAmplitude);
      expect(at1.breathPeriod).toBeLessThan(at0.breathPeriod);
    });

    it('never blends past the next stage, so a stage change stays an event', () => {
      const blended = blendProfile('dormant', 1);
      expect(blended.breathAmplitude).toBeLessThan(coreProfile('awakened').breathAmplitude);
      expect(blended.breathPeriod).toBeGreaterThan(coreProfile('awakened').breathPeriod);
    });

    it('stays within range for out-of-range progress', () => {
      for (const progress of [-1, 0, 0.5, 1, 2]) {
        const blended = blendProfile('charged', progress);
        expect(blended.breathAmplitude).toBeGreaterThanOrEqual(
          coreProfile('charged').breathAmplitude,
        );
        expect(blended.breathAmplitude).toBeLessThan(coreProfile('evolved').breathAmplitude);
      }
    });

    it('holds the last stage steady with nothing beyond it', () => {
      const ascendant = coreProfile('ascendant');
      const blended = blendProfile('ascendant', 1);
      expect(blended.breathAmplitude).toBeCloseTo(ascendant.breathAmplitude, 6);
      expect(blended.breathPeriod).toBeCloseTo(ascendant.breathPeriod, 6);
    });
  });

  describe('the breath curve itself', () => {
    /** The scale the Core renders at, mirroring Core.tsx's derived value. */
    const breathAt = (seconds: number, stage: CoreStage) => {
      const { breathAmplitude, breathPeriod } = coreProfile(stage);
      return 1 + Math.sin(seconds * ((Math.PI * 2) / breathPeriod)) * breathAmplitude;
    };

    it('oscillates around 1 rather than drifting away from it', () => {
      const samples = Array.from({ length: 200 }, (_, i) => breathAt(i * 0.1, 'dormant'));
      expect(Math.min(...samples)).toBeGreaterThan(1 - 0.03);
      expect(Math.max(...samples)).toBeLessThan(1 + 0.03);
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(mean).toBeCloseTo(1, 2);
    });

    it('completes a full cycle in its stated period', () => {
      const period = coreProfile('dormant').breathPeriod;
      expect(breathAt(0, 'dormant')).toBeCloseTo(1, 6);
      expect(breathAt(period / 4, 'dormant')).toBeGreaterThan(1);
      expect(breathAt(period / 2, 'dormant')).toBeCloseTo(1, 6);
      expect(breathAt((period * 3) / 4, 'dormant')).toBeLessThan(1);
      expect(breathAt(period, 'dormant')).toBeCloseTo(1, 6);
    });

    it('moves enough within a couple of seconds to be noticed', () => {
      // The stated goal: look at it for 1–2 seconds and see that it is alive.
      const start = breathAt(0, 'dormant');
      const after2s = breathAt(2, 'dormant');
      expect(Math.abs(after2s - start)).toBeGreaterThan(0.02);
    });
  });
});
