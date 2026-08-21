/**
 * @jest-environment node
 */
import { ProgressionPhaseLockedError } from '@/domain/errors';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

const atTopOfRange = (_id: string, _min: number, max: number) => max;

/**
 * Phase gating.
 *
 * Meeting the performance criteria is not the same as being allowed to
 * progress: a variation introduced in Development stays locked until the
 * player's completed training reaches that phase. The rule is enforced in the
 * service, because a disabled button is not a correctness boundary.
 *
 * The Single-Leg Glute Bridge is the case under test — it appears in both
 * workouts, so it qualifies quickly, and its successor (Single-Leg Hip Thrust)
 * is introduced in Development.
 */
describe('phase gating', () => {
  let harness: TestHarness;

  /** Completes `count` sessions with every set at the top of its range. */
  async function train(count: number) {
    for (let index = 0; index < count; index += 1) {
      await completeSession(harness, new Date(Date.UTC(2026, 7, 2 + index, 10)), atTopOfRange);
    }
  }

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('recognises the criteria while the next variation is still phase-locked', async () => {
    await train(3);

    const offer = await harness.progression.getOffer('var-glute-bridge-single-leg');
    expect(offer).not.toBeNull();
    expect(offer?.to.id).toBe('var-hip-thrust-single-leg');
    expect(offer?.qualifyingSessions).toBeGreaterThanOrEqual(2);

    // Earned, but not actionable.
    expect(offer?.phaseEligible).toBe(false);
    expect(offer?.requiredPhase).toBe('development');
  });

  it('keeps a phase-locked offer out of the actionable list', async () => {
    await train(3);

    const ready = await harness.progression.listReadyOffers();
    expect(ready.map((offer) => offer.from.id)).not.toContain('var-glute-bridge-single-leg');
    // An ungated variation qualified in the same sessions still appears.
    expect(ready.map((offer) => offer.from.id)).toContain('var-bss-standard');
  });

  it('rejects a direct confirmation before the required phase', async () => {
    await train(3);

    await expect(
      harness.progression.confirmProgression('var-glute-bridge-single-leg'),
    ).rejects.toBeInstanceOf(ProgressionPhaseLockedError);
  });

  it('mutates nothing when a phase-locked confirmation is rejected', async () => {
    await train(3);
    const xpBefore = (await harness.repositories.player.get())!.totalXp;

    await expect(
      harness.progression.confirmProgression('var-glute-bridge-single-leg'),
    ).rejects.toThrow();

    expect(
      (await harness.repositories.progression.get('var-glute-bridge-single-leg'))?.status,
    ).toBe('current');
    expect((await harness.repositories.progression.get('var-hip-thrust-single-leg'))?.status).toBe(
      'locked',
    );
    expect((await harness.repositories.player.get())?.totalXp).toBe(xpBefore);

    const plan = await harness.workouts.buildPlan('template-workout-a');
    expect(plan!.entries.map((entry) => entry.variation.id)).toContain(
      'var-glute-bridge-single-leg',
    );
  });

  it('reports the phases involved on the error', async () => {
    await train(3);

    try {
      await harness.progression.confirmProgression('var-glute-bridge-single-leg');
      throw new Error('expected rejection');
    } catch (error) {
      const locked = error as ProgressionPhaseLockedError;
      expect(locked.requiredPhase).toBe('development');
      expect(locked.currentPhase).toBe('awakening');
      expect(locked.variationName).toBe('Single-Leg Hip Thrust');
    }
  });

  it('marks the node so the tree can explain the gate', async () => {
    await train(3);

    const chains = await harness.progression.getChains();
    const glute = chains
      .flatMap((chain) => chain.nodes)
      .find((node) => node.variation.id === 'var-glute-bridge-single-leg')!;

    expect(glute.status).toBe('ready');
    expect(glute.progressionAwaitingPhase).toBe('development');

    // An ungated one that qualified alongside it carries no gate.
    const bss = chains
      .flatMap((chain) => chain.nodes)
      .find((node) => node.variation.id === 'var-bss-standard')!;
    expect(bss.status).toBe('ready');
    expect(bss.progressionAwaitingPhase).toBeNull();
  });

  it('becomes available once the player reaches the required phase', async () => {
    // Twelve completed sessions is the Development threshold.
    await train(12);

    const state = await harness.player.getState(new Date(Date.UTC(2026, 7, 20, 10)));
    expect(state?.phase.phase.id).toBe('development');

    const offer = await harness.progression.getOffer('var-glute-bridge-single-leg');
    expect(offer?.phaseEligible).toBe(true);

    const result = await harness.progression.confirmProgression('var-glute-bridge-single-leg');
    expect(result.to.id).toBe('var-hip-thrust-single-leg');
    expect((await harness.repositories.progression.get('var-hip-thrust-single-leg'))?.status).toBe(
      'current',
    );

    const chains = await harness.progression.getChains();
    const node = chains
      .flatMap((chain) => chain.nodes)
      .find((n) => n.variation.id === 'var-glute-bridge-single-leg')!;
    expect(node.progressionAwaitingPhase).toBeNull();
  });

  it('still allows an ungated progression during Awakening', async () => {
    await train(3);

    const result = await harness.progression.confirmProgression('var-bss-standard');
    expect(result.to.id).toBe('var-bss-slow');
    expect((await harness.repositories.progression.get('var-bss-slow'))?.status).toBe('current');
  });
});
