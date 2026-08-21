import type { MeasurementType, UnitSystem } from './types';

/**
 * Units.
 *
 * Storage is always metric — kilograms and centimetres. Conversion happens only
 * at the display and input edges, so a player switching units never rewrites
 * their history.
 */

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

/** Suffix shown next to a value for the given measurement and unit system. */
export function unitLabel(type: MeasurementType, system: UnitSystem): string {
  if (type === 'bodyweight') return system === 'metric' ? 'kg' : 'lb';
  return system === 'metric' ? 'cm' : 'in';
}

/** Converts a stored metric value into the player's chosen unit. */
export function toDisplayValue(
  type: MeasurementType,
  metricValue: number,
  system: UnitSystem,
): number {
  if (system === 'metric') return metricValue;
  return type === 'bodyweight' ? kgToLb(metricValue) : cmToIn(metricValue);
}

/** Converts a value the player typed back into the metric storage value. */
export function toStorageValue(
  type: MeasurementType,
  displayValue: number,
  system: UnitSystem,
): number {
  if (system === 'metric') return displayValue;
  return type === 'bodyweight' ? lbToKg(displayValue) : inToCm(displayValue);
}

/** Display value rounded to the precision that unit is normally read at. */
export function formatMeasurement(
  type: MeasurementType,
  metricValue: number,
  system: UnitSystem,
): string {
  const value = toDisplayValue(type, metricValue, system);
  const decimals = type === 'bodyweight' ? 1 : 1;
  return `${value.toFixed(decimals)} ${unitLabel(type, system)}`;
}

/** Sensible increment for a stepper in the player's units, in metric terms. */
export function measurementStep(type: MeasurementType, system: UnitSystem): number {
  if (system === 'metric') return type === 'bodyweight' ? 0.1 : 0.1;
  return type === 'bodyweight' ? lbToKg(0.2) : inToCm(0.1);
}
