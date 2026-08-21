import type { MeasurementKind, Prescription } from './types';

/** Formatting helpers shared by every screen so wording never diverges. */

/** `3 × 8–12 / leg`, `3 × 30–45s`, `3 × 7–10`. */
export function formatPrescription(prescription: Prescription, kind: MeasurementKind): string {
  return `${prescription.sets} × ${formatRange(prescription, kind)}`;
}

/** The range portion alone: `8–12 / leg`, `30–45s`, `7–10`. */
export function formatRange(prescription: Prescription, kind: MeasurementKind): string {
  const range =
    prescription.targetMin === prescription.targetMax
      ? `${prescription.targetMax}`
      : `${prescription.targetMin}–${prescription.targetMax}`;

  switch (kind) {
    case 'time':
      return `${range}s`;
    case 'reps-per-side':
      return `${range} / leg`;
    default:
      return range;
  }
}

/** How a single recorded value reads on its own. */
export function formatValue(value: number, kind: MeasurementKind): string {
  return kind === 'time' ? `${value}s` : `${value}`;
}

/** `mm:ss`, or `h:mm:ss` past an hour. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(remaining).padStart(2, '0');

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** `34 min`, `1 h 05 min` — for estimates rather than live timers. */
export function formatDurationLong(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours} h ${String(remaining).padStart(2, '0')} min`;
}

/** `Aug 21`, in the device locale. */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** `21 Aug 2026`, in the device locale. */
export function formatFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** `2 days ago`, `Today`, `Yesterday`. */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return `${days} days ago`;
  return formatShortDate(iso);
}

/** `+345`, `−12`, `0`. Uses a true minus sign for alignment with digits. */
export function formatDelta(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/** The current calendar day as `YYYY-MM-DD` in local time. */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
