import { CORE_STAGES, coreStageForSessions, coreStageIndex, coreStageProgress } from '../coreStages';

describe('core stages', () => {
  it('starts dormant for a player with no training data', () => {
    expect(coreStageForSessions(0).id).toBe('dormant');
    expect(coreStageProgress(0)).toBe(0);
  });

  it('awakens on the first completed session', () => {
    expect(coreStageForSessions(1).id).toBe('awakened');
  });

  it('advances deterministically and never regresses', () => {
    let lastIndex = -1;
    for (let sessions = 0; sessions <= 60; sessions += 1) {
      const index = coreStageIndex(coreStageForSessions(sessions).id);
      expect(index).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
    }
  });

  it('reaches every declared stage', () => {
    const reached = new Set(
      Array.from({ length: 60 }, (_, i) => coreStageForSessions(i).id),
    );
    for (const stage of CORE_STAGES) {
      expect(reached.has(stage)).toBe(true);
    }
  });

  it('reports full progress at the final stage', () => {
    expect(coreStageForSessions(200).id).toBe('ascendant');
    expect(coreStageProgress(200)).toBe(1);
  });

  it('produces the same stage for the same input every time', () => {
    expect(coreStageForSessions(13)).toEqual(coreStageForSessions(13));
  });
});
