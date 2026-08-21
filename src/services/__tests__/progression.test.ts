/**
 * @jest-environment node
 */
import { XP_RULES } from '@/domain/xp';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

/** Trains every movement at the top of its prescribed range. */
const atTopOfRange = (_id: string, _min: number, max: number) => max;
/** Trains every movement at the bottom of its prescribed range. */
const atBottomOfRange = (_id: string, min: number) => min;

describe('progression qualification', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('does not offer progression from ordinary training', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), atBottomOfRange);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), atBottomOfRange);
    await completeSession(harness, new Date('2026-08-06T10:00:00.000Z'), atBottomOfRange);

    expect(await harness.progression.listReadyOffers()).toEqual([]);
    expect(await harness.progression.getOffer('var-bss-standard')).toBeNull();
  });

  it('does not offer progression after a single strong session', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), atTopOfRange);
    expect(await harness.progression.getOffer('var-push-up-regular')).toBeNull();
  });

  it('offers progression after two qualifying sessions on the same variation', async () => {
    // Push-ups appear in Workout A only, so two A sessions are needed.
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), atTopOfRange);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), atTopOfRange);
    await completeSession(harness, new Date('2026-08-06T10:00:00.000Z'), atTopOfRange);

    const offer = await harness.progression.getOffer('var-push-up-regular');
    expect(offer?.to.name).toBe('Slow Push-Up');
    expect(offer?.formRequirements.length).toBeGreaterThan(0);
  });

  it('does not unlock anything until the player confirms', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), atTopOfRange);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), atTopOfRange);
    await completeSession(harness, new Date('2026-08-06T10:00:00.000Z'), atTopOfRange);

    const next = await harness.repositories.progression.get('var-push-up-slow');
    expect(next?.status).toBe('locked');

    const plan = await harness.workouts.buildPlan('template-workout-a');
    expect(plan!.entries.map((e) => e.variation.id)).toContain('var-push-up-regular');
  });

  it('progresses the chain and the template when confirmed', async () => {
    for (const day of [2, 4, 6]) {
      await completeSession(harness, new Date(`2026-08-0${day}T10:00:00.000Z`), atTopOfRange);
    }

    const xpBefore = (await harness.repositories.player.get())!.totalXp;
    const result = await harness.progression.confirmProgression('var-push-up-regular');

    expect(result.to.id).toBe('var-push-up-slow');
    expect(result.xpAwarded).toBe(XP_RULES.progressionBonus);
    expect(result.totalXpAfter).toBe(xpBefore + XP_RULES.progressionBonus);

    expect((await harness.repositories.progression.get('var-push-up-regular'))?.status).toBe(
      'mastered',
    );
    expect((await harness.repositories.progression.get('var-push-up-slow'))?.status).toBe(
      'current',
    );

    const plan = await harness.workouts.buildPlan('template-workout-a');
    expect(plan!.entries.map((e) => e.variation.id)).toContain('var-push-up-slow');
    expect(plan!.entries.map((e) => e.variation.id)).not.toContain('var-push-up-regular');
  });

  it('leaves recorded history naming the variation actually performed', async () => {
    for (const day of [2, 4, 6]) {
      await completeSession(harness, new Date(`2026-08-0${day}T10:00:00.000Z`), atTopOfRange);
    }
    await harness.progression.confirmProgression('var-push-up-regular');

    const sessions = await harness.repositories.sessions.listCompleted();
    const names = sessions
      .flatMap((session) => session.performances)
      .filter((p) => p.variationId === 'var-push-up-regular')
      .map((p) => p.variationName);

    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set(['Regular Push-Up']));
  });

  it('refuses to confirm a progression that was never offered', async () => {
    await expect(harness.progression.confirmProgression('var-bss-standard')).rejects.toThrow(
      /not ready/,
    );
  });

  it('cannot be confirmed twice', async () => {
    for (const day of [2, 4, 6]) {
      await completeSession(harness, new Date(`2026-08-0${day}T10:00:00.000Z`), atTopOfRange);
    }
    await harness.progression.confirmProgression('var-push-up-regular');
    await expect(harness.progression.confirmProgression('var-push-up-regular')).rejects.toThrow();
  });

  it('counts a qualified variation toward Mastery, not just a confirmed one', async () => {
    for (const day of [2, 4, 6]) {
      await completeSession(harness, new Date(`2026-08-0${day}T10:00:00.000Z`), atTopOfRange);
    }

    // Ready, not yet confirmed — Mastery must still reflect it.
    const attributes = await harness.player.getAttributes();
    const mastery = attributes.find((a) => a.id === 'mastery')!;
    expect(mastery.value).toBeGreaterThan(0);
    expect(mastery.contributions.some((c) => c.detail.includes('ready to progress'))).toBe(true);
  });

  it('reports a Mastery delta in the session a progression is confirmed', async () => {
    for (const day of [2, 4, 6]) {
      await completeSession(harness, new Date(`2026-08-0${day}T10:00:00.000Z`), atTopOfRange);
    }

    const before = (await harness.player.getAttributes()).find((a) => a.id === 'mastery')!;
    await harness.progression.confirmProgression('var-push-up-regular');
    const after = (await harness.player.getAttributes()).find((a) => a.id === 'mastery')!;

    expect(after.value).toBeGreaterThan(before.value);
    expect(after.contributions.some((c) => c.detail.includes('Progression confirmed'))).toBe(true);

    // The regression this guards: the delta used to be structurally zero, so
    // Status read "No change" even in the session a progression was confirmed.
    // It measures change since the last completed quest — which covers both the
    // confirmation and any variation that became ready during that quest — so
    // it is larger than the confirmation alone, not equal to it.
    expect(after.delta).toBeGreaterThan(0);
    expect(after.delta).toBeGreaterThanOrEqual(after.value - before.value);
  });

  it('reports no Mastery delta when nothing was confirmed', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), atBottomOfRange);
    const mastery = (await harness.player.getAttributes()).find((a) => a.id === 'mastery')!;
    expect(mastery.delta).toBe(0);
  });

  it('exposes the chain view with a single current node per chain', async () => {
    const chains = await harness.progression.getChains();
    expect(chains.length).toBeGreaterThan(0);

    const pushChain = chains.find((c) => c.chain.id === 'chain-push-up')!;
    expect(pushChain.nodes.map((n) => n.status)).toEqual([
      'current',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(pushChain.currentIndex).toBe(0);
  });

  it('marks nodes above the player phase as phase gated', async () => {
    const chains = await harness.progression.getChains();
    const pushChain = chains.find((c) => c.chain.id === 'chain-push-up')!;
    const archer = pushChain.nodes.find((n) => n.variation.id === 'var-push-up-archer')!;
    expect(archer.phaseGated).toBe(true);
  });
});

describe('phase progression through real training', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('stays in Awakening until twelve sessions are completed', async () => {
    for (let index = 0; index < 11; index += 1) {
      await completeSession(harness, new Date(Date.UTC(2026, 7, 2 + index, 10)), atBottomOfRange);
    }

    let state = await harness.player.getState(new Date(Date.UTC(2026, 7, 14, 10)));
    expect(state!.phase.phase.id).toBe('awakening');

    await completeSession(harness, new Date(Date.UTC(2026, 7, 14, 10)), atBottomOfRange);
    state = await harness.player.getState(new Date(Date.UTC(2026, 7, 15, 10)));
    expect(state!.phase.phase.id).toBe('development');
  });

  it('does not advance a phase just because time passed', async () => {
    await completeSession(harness, new Date(Date.UTC(2026, 7, 2, 10)), atBottomOfRange);
    const state = await harness.player.getState(new Date(Date.UTC(2027, 7, 2, 10)));
    expect(state!.phase.phase.id).toBe('awakening');
    expect(state!.completedSessions).toBe(1);
  });
});
