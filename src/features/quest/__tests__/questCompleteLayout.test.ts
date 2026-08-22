/**
 * @jest-environment node
 */
import { questCompleteCoreSize } from '../questCompleteLayout';

/**
 * Representative devices rather than arbitrary numbers, so a regression is
 * legible as "this breaks on the SE" instead of "185 became 190".
 */
const PHONES = {
  'iPhone SE (2nd/3rd gen)': { width: 375, height: 667 },
  'iPhone 13 mini': { width: 375, height: 812 },
  'iPhone 15/16': { width: 393, height: 852 },
  'iPhone 16 Pro': { width: 402, height: 874 },
  'iPhone 16 Pro Max': { width: 440, height: 956 },
} as const;

describe('questCompleteCoreSize', () => {
  it.each(Object.entries(PHONES))('fits within the gutters on %s', (_name, metrics) => {
    expect(questCompleteCoreSize(metrics)).toBeLessThanOrEqual(metrics.width - 40);
  });

  it.each(Object.entries(PHONES))('stays a usable size on %s', (_name, metrics) => {
    const size = questCompleteCoreSize(metrics);
    expect(size).toBeGreaterThanOrEqual(140);
    expect(size).toBeLessThanOrEqual(200);
  });

  it('lands in the intended band on a typical modern phone', () => {
    // The design target: noticeably smaller than the old 240pt cap, still the
    // clear centrepiece.
    for (const name of ['iPhone 15/16', 'iPhone 16 Pro'] as const) {
      const size = questCompleteCoreSize(PHONES[name]);
      expect(size).toBeGreaterThanOrEqual(170);
      expect(size).toBeLessThanOrEqual(190);
    }
  });

  it('is smaller on a short phone than a tall one', () => {
    expect(questCompleteCoreSize(PHONES['iPhone SE (2nd/3rd gen)'])).toBeLessThan(
      questCompleteCoreSize(PHONES['iPhone 15/16']),
    );
  });

  it('never exceeds the old fixed size on any phone', () => {
    for (const metrics of Object.values(PHONES)) {
      expect(questCompleteCoreSize(metrics)).toBeLessThan(240);
    }
  });

  it('responds to height, not only width', () => {
    const short = questCompleteCoreSize({ width: 393, height: 667 });
    const tall = questCompleteCoreSize({ width: 393, height: 956 });
    expect(short).toBeLessThan(tall);
  });

  it('lets width win on an unusually narrow screen', () => {
    // 200pt wide leaves 160pt between the gutters, below what height allows.
    expect(questCompleteCoreSize({ width: 200, height: 900 })).toBe(160);
  });

  it('never returns a fractional size', () => {
    for (const height of [667, 700, 733, 812, 844, 852, 874, 900, 956]) {
      expect(Number.isInteger(questCompleteCoreSize({ width: 393, height }))).toBe(true);
    }
  });

  it('grows monotonically with height until it caps', () => {
    let previous = 0;
    for (let height = 600; height <= 1000; height += 10) {
      const size = questCompleteCoreSize({ width: 440, height });
      expect(size).toBeGreaterThanOrEqual(previous);
      previous = size;
    }
    expect(previous).toBe(200);
  });
});
