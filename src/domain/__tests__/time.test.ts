import { isCalendarDate, isCanonicalTimestamp } from '../time';

/**
 * The timestamp and calendar-date contract.
 *
 * Both validators exist because `Date.parse` is not a validator: it accepts
 * several spellings of the same instant and silently rolls impossible days
 * into real ones. Values are stored as SQLite TEXT and ordered
 * lexicographically, so a second accepted spelling reorders history and a
 * rolled-forward day lands on the wrong date permanently.
 */
describe('isCanonicalTimestamp', () => {
  it('accepts exactly what Date.toISOString emits', () => {
    expect(isCanonicalTimestamp('2026-08-21T12:34:56.789Z')).toBe(true);
    expect(isCanonicalTimestamp('2026-01-01T00:00:00.000Z')).toBe(true);
    expect(isCanonicalTimestamp('2026-12-31T23:59:59.999Z')).toBe(true);
  });

  it('accepts every timestamp the app itself produces', () => {
    for (const ms of [0, 1, 1_755_000_000_000, Date.now()]) {
      expect(isCanonicalTimestamp(new Date(ms).toISOString())).toBe(true);
    }
  });

  it.each([
    ['a human-readable date', 'August 21, 2026'],
    ['a space separator instead of T', '2026-08-21 12:34:56'],
    ['second precision, no milliseconds', '2026-08-21T12:34:56Z'],
    ['a zero UTC offset spelled out', '2026-08-21T12:34:56.789+00:00'],
    ['a non-UTC offset', '2026-08-21T12:34:56.789-04:00'],
    ['no zone at all', '2026-08-21T12:34:56.789'],
    ['a lowercase zone marker', '2026-08-21T12:34:56.789z'],
    ['sub-millisecond precision', '2026-08-21T12:34:56.789123Z'],
    ['a date with no time', '2026-08-21'],
    ['an empty string', ''],
    ['leading whitespace', ' 2026-08-21T12:34:56.789Z'],
    ['trailing whitespace', '2026-08-21T12:34:56.789Z '],
  ])('rejects %s', (_label, value) => {
    expect(isCanonicalTimestamp(value)).toBe(false);
  });

  it.each([
    ['a day that is not in the month', '2026-02-30T00:00:00.000Z'],
    ['a thirteenth month', '2026-13-01T00:00:00.000Z'],
    ['a zeroth month', '2026-00-01T00:00:00.000Z'],
    ['an hour past midnight', '2026-08-21T24:00:00.000Z'],
    ['a minute past the hour', '2026-08-21T12:60:00.000Z'],
    ['February 29th in a common year', '2026-02-29T00:00:00.000Z'],
  ])('rejects impossible components: %s', (_label, value) => {
    expect(isCanonicalTimestamp(value)).toBe(false);
  });

  it('never normalises — a value only passes as written', () => {
    // These all denote the same instant. Exactly one is canonical, and the
    // validator returns a verdict on the string rather than the instant.
    const spellings = [
      '2026-08-21T12:34:56.000Z',
      '2026-08-21T12:34:56Z',
      '2026-08-21T08:34:56.000-04:00',
    ];
    const instants = spellings.map((s) => Date.parse(s));
    expect(new Set(instants).size).toBe(1);
    expect(spellings.filter(isCanonicalTimestamp)).toEqual(['2026-08-21T12:34:56.000Z']);
  });
});

describe('isCalendarDate', () => {
  it.each(['2026-08-21', '2028-02-29', '2000-02-29', '2026-01-01', '2026-12-31'])(
    'accepts %s',
    (value) => {
      expect(isCalendarDate(value)).toBe(true);
    },
  );

  it.each([
    ['February 29th in a common year', '2026-02-29'],
    ['February 30th', '2026-02-30'],
    ['April 31st', '2026-04-31'],
    ['a thirteenth month', '2026-13-01'],
    ['a zeroth month', '2026-00-12'],
    ['a zeroth day', '2026-08-00'],
    ['a 32nd day', '2026-08-32'],
    ['a century year that is not a leap year', '1900-02-29'],
  ])('rejects %s', (_label, value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  it.each([
    ['an unpadded month', '2026-8-21'],
    ['an unpadded day', '2026-08-1'],
    ['slashes', '2026/08/21'],
    ['a two-digit year', '26-08-21'],
    ['a timestamp', '2026-08-21T00:00:00.000Z'],
    ['an empty string', ''],
    ['trailing whitespace', '2026-08-21 '],
  ])('rejects %s as the wrong shape', (_label, value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  it('does not mistake an early zero-padded year for a 1900s one', () => {
    // `Date.UTC(26, ...)` means 1926, which would make this round-trip wrongly.
    expect(isCalendarDate('0026-08-21')).toBe(true);
    expect(isCalendarDate('0026-02-30')).toBe(false);
  });

  it('agrees with the helper the app records days with', () => {
    const { todayIsoDate } = jest.requireActual<typeof import('../format')>('../format');
    for (const at of [new Date('2026-02-28T23:30:00.000Z'), new Date('2028-02-29T12:00:00.000Z')]) {
      expect(isCalendarDate(todayIsoDate(at))).toBe(true);
    }
  });
});
