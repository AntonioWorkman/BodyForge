/**
 * The app's timestamp and calendar-date contract.
 *
 * Two shapes of temporal value are persisted, and they are not the same thing:
 *
 * - An **instant** — when something happened. Always `Date.toISOString()`:
 *   `YYYY-MM-DDTHH:mm:ss.sssZ`, always UTC.
 * - A **calendar date** — the day a player assigns to something, in *their*
 *   local time: `YYYY-MM-DD`. Truncating an instant would record the wrong day
 *   for anyone whose offset crosses midnight.
 *
 * Both are stored as SQLite TEXT and ordered lexicographically by every query
 * that sorts history. That only produces correct chronology while every stored
 * value has the same fixed-width shape, so the shape is a contract rather than
 * a convention — and untrusted input is checked against it before it is
 * written, never normalised into it.
 */

/** Exactly what `Date.prototype.toISOString` emits for a four-digit year. */
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True for a timestamp in the exact form this app emits.
 *
 * `Date.parse` is far too generous to use as the test: it accepts
 * `August 21, 2026`, `2026-08-21 12:34:56`, second-precision `...T12:34:56Z`,
 * and offset forms like `...+00:00` or `...-04:00`. Each of those denotes a
 * real instant, and each sorts differently as text — a backup mixing them with
 * canonical values would reorder the player's history without any value being
 * "invalid" in isolation.
 *
 * So the shape is checked first, then the value is round-tripped. The
 * round-trip is what rejects impossible components: `2026-02-30T00:00:00.000Z`
 * matches the pattern, but `Date` resolves it to March 2nd, which no longer
 * equals the input.
 */
export function isCanonicalTimestamp(value: string): boolean {
  if (!CANONICAL_TIMESTAMP.test(value)) return false;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;

  // Compared against the original string, never substituted for it: a value
  // that has to be normalised to become canonical was not canonical.
  return new Date(parsed).toISOString() === value;
}

/**
 * True for a real calendar day written as `YYYY-MM-DD`.
 *
 * A regex alone accepts `2026-02-30` and `2026-13-01`, and `Date.parse` is no
 * help — it silently rolls impossible days forward into the next month, so a
 * date that does not exist becomes a different date that does. The components
 * are therefore parsed out and round-tripped: if the date object does not come
 * back with the same year, month and day, the input named a day that isn't on
 * the calendar. Leap years need no special case; the round-trip covers them.
 */
export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // `setUTCFullYear` rather than `Date.UTC`, which maps years 0–99 into the
  // 1900s and would mis-resolve a zero-padded early year.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
