import { formatMeasurement, toDisplayValue, toStorageValue, unitLabel } from '../units';
import { formatDuration, formatPrescription, formatRange } from '../format';
import { prescription } from './factories';

describe('units', () => {
  it('round-trips a value through display and storage without drift', () => {
    for (const value of [60, 79.4, 175.2, 0.5]) {
      const display = toDisplayValue('bodyweight', value, 'imperial');
      expect(toStorageValue('bodyweight', display, 'imperial')).toBeCloseTo(value, 6);
    }
  });

  it('leaves metric values untouched', () => {
    expect(toDisplayValue('waist', 81.5, 'metric')).toBe(81.5);
    expect(toStorageValue('waist', 81.5, 'metric')).toBe(81.5);
  });

  it('converts the reference player correctly', () => {
    // 175 lb is about 79.4 kg; 32 in is about 81.3 cm.
    expect(toStorageValue('bodyweight', 175, 'imperial')).toBeCloseTo(79.38, 1);
    expect(toStorageValue('waist', 32, 'imperial')).toBeCloseTo(81.28, 2);
  });

  it('labels units per measurement type', () => {
    expect(unitLabel('bodyweight', 'imperial')).toBe('lb');
    expect(unitLabel('waist', 'metric')).toBe('cm');
    expect(formatMeasurement('bodyweight', 79.38, 'imperial')).toBe('175.0 lb');
  });
});

describe('formatting', () => {
  it('writes prescriptions the way the screens read them', () => {
    expect(formatPrescription(prescription(), 'reps-per-side')).toBe('3 × 8–12 / leg');
    expect(formatPrescription(prescription({ targetMin: 7, targetMax: 10 }), 'reps')).toBe(
      '3 × 7–10',
    );
    expect(formatPrescription(prescription({ targetMin: 30, targetMax: 45 }), 'time')).toBe(
      '3 × 30–45s',
    );
  });

  it('collapses a single-value range', () => {
    expect(formatRange(prescription({ targetMin: 10, targetMax: 10 }), 'reps')).toBe('10');
  });

  it('formats durations for timers and summaries', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(88)).toBe('01:28');
    expect(formatDuration(2058)).toBe('34:18');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(-5)).toBe('00:00');
  });
});
