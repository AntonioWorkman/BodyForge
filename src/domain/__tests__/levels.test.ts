import {
  LEVEL_CURVE,
  cumulativeXpForLevel,
  didLevelUp,
  resolveLevel,
  xpForLevel,
} from '../levels';

describe('level curve', () => {
  it('starts a new player at level 1 with no progress', () => {
    const state = resolveLevel(0);
    expect(state.level).toBe(1);
    expect(state.xpIntoLevel).toBe(0);
    expect(state.progress).toBe(0);
  });

  it('increases monotonically', () => {
    for (let level = 1; level < 40; level += 1) {
      expect(xpForLevel(level + 1)).toBeGreaterThan(xpForLevel(level));
    }
  });

  it('rounds requirements to a readable step', () => {
    for (let level = 1; level < 30; level += 1) {
      expect(xpForLevel(level) % LEVEL_CURVE.rounding).toBe(0);
    }
  });

  it('levels up exactly at the requirement, not before', () => {
    const requirement = xpForLevel(1);
    expect(resolveLevel(requirement - 1).level).toBe(1);
    expect(resolveLevel(requirement).level).toBe(2);
  });

  it('splits total XP into level and remainder consistently', () => {
    const total = 1_500;
    const state = resolveLevel(total);
    expect(cumulativeXpForLevel(state.level) + state.xpIntoLevel).toBe(total);
    expect(state.xpIntoLevel).toBeLessThan(state.xpForLevel);
    expect(state.progress).toBeCloseTo(state.xpIntoLevel / state.xpForLevel);
  });

  it('is stable across the whole range it can produce', () => {
    for (let xp = 0; xp < 30_000; xp += 137) {
      const state = resolveLevel(xp);
      expect(state.totalXp).toBe(xp);
      expect(state.level).toBeGreaterThanOrEqual(1);
      expect(state.xpIntoLevel).toBeGreaterThanOrEqual(0);
      expect(cumulativeXpForLevel(state.level) + state.xpIntoLevel).toBe(xp);
    }
  });

  it('clamps at the level cap without producing NaN progress', () => {
    const state = resolveLevel(50_000_000);
    expect(state.level).toBe(LEVEL_CURVE.maxLevel);
    expect(state.progress).toBe(1);
    expect(Number.isNaN(state.xpIntoLevel)).toBe(false);
  });

  it('treats negative and non-finite XP as zero rather than throwing', () => {
    expect(resolveLevel(-500).level).toBe(1);
    expect(resolveLevel(Number.NaN).totalXp).toBe(0);
  });

  it('detects a level-up across a boundary', () => {
    const requirement = xpForLevel(1);
    expect(didLevelUp(requirement - 10, 10)).toBe(true);
    expect(didLevelUp(0, 1)).toBe(false);
  });
});
