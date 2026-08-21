import { PHASES, phaseForSessionCount, resolvePhaseState, willAdvancePhase } from '../phases';

describe('training phases', () => {
  it('starts every player in Awakening', () => {
    expect(phaseForSessionCount(0).id).toBe('awakening');
  });

  it('advances only on completed sessions', () => {
    expect(phaseForSessionCount(11).id).toBe('awakening');
    expect(phaseForSessionCount(12).id).toBe('development');
    expect(phaseForSessionCount(23).id).toBe('development');
    expect(phaseForSessionCount(24).id).toBe('ascension');
  });

  it('never regresses as sessions accumulate', () => {
    let lastOrder = -1;
    for (let sessions = 0; sessions <= 80; sessions += 1) {
      const order = phaseForSessionCount(sessions).order;
      expect(order).toBeGreaterThanOrEqual(lastOrder);
      lastOrder = order;
    }
  });

  it('stays in the final phase indefinitely', () => {
    expect(phaseForSessionCount(500).id).toBe('ascension');
    expect(resolvePhaseState(500).nextPhase).toBeNull();
    expect(resolvePhaseState(500).progress).toBe(1);
  });

  it('reports progress through the current phase', () => {
    const state = resolvePhaseState(6);
    expect(state.phase.id).toBe('awakening');
    expect(state.sessionsIntoPhase).toBe(6);
    expect(state.sessionsInPhase).toBe(12);
    expect(state.progress).toBeCloseTo(0.5);
  });

  it('shows an empty, not broken, state for a brand new player', () => {
    const state = resolvePhaseState(0);
    expect(state.completedSessions).toBe(0);
    expect(state.progress).toBe(0);
    expect(state.nextPhase?.id).toBe('development');
  });

  it('flags the session that will cross a phase boundary', () => {
    expect(willAdvancePhase(10)).toBe(false);
    expect(willAdvancePhase(11)).toBe(true);
    expect(willAdvancePhase(23)).toBe(true);
  });

  it('treats negative session counts as zero', () => {
    expect(phaseForSessionCount(-5).id).toBe('awakening');
  });

  it('declares phases in ascending order with no gaps', () => {
    PHASES.forEach((phase, index) => {
      expect(phase.order).toBe(index);
    });
  });
});
