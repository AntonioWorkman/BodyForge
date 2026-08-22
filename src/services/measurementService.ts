import type { RepositoryBundle } from '@/database/repositories/interfaces';
import { todayIsoDate } from '@/domain/format';
import { isCalendarDate } from '@/domain/time';
import type { Measurement, MeasurementType, UnitSystem } from '@/domain/types';
import { toStorageValue } from '@/domain/units';

import { createId } from './ids';

/**
 * Body measurements.
 *
 * Bodyweight and waist only. Values arrive in whatever units the player has
 * chosen and are normalised to metric before storage, so switching units never
 * rewrites history.
 */
export class MeasurementService {
  constructor(private readonly repositories: RepositoryBundle) {}

  /** Logs a measurement given in the player's display units. */
  async log(
    type: MeasurementType,
    displayValue: number,
    system: UnitSystem,
    options: { recordedOn?: string; note?: string | null } = {},
    now = new Date(),
  ): Promise<Measurement> {
    if (!Number.isFinite(displayValue) || displayValue <= 0) {
      throw new Error('Measurement must be a positive number');
    }

    // `recordedOn` is the one field a caller may supply, and it is written
    // straight to a column that history and charts order lexicographically. A
    // malformed or impossible day would sort into the wrong place forever, so
    // it is checked here rather than trusted — the same contract backup import
    // enforces on the way in.
    const recordedOn = options.recordedOn ?? todayIsoDate(now);
    if (!isCalendarDate(recordedOn)) {
      throw new Error(`"${recordedOn}" is not a real calendar date (expected YYYY-MM-DD).`);
    }

    const measurement: Measurement = {
      id: createId('meas'),
      type,
      value: toStorageValue(type, displayValue, system),
      recordedOn,
      createdAt: now.toISOString(),
      note: options.note ?? null,
    };

    await this.repositories.measurements.add(measurement);
    return measurement;
  }

  async list(type?: MeasurementType): Promise<Measurement[]> {
    return this.repositories.measurements.list(type);
  }

  async latest(type: MeasurementType): Promise<Measurement | null> {
    return this.repositories.measurements.latest(type);
  }

  async remove(id: string): Promise<void> {
    await this.repositories.measurements.remove(id);
  }

  /** Measurements recorded within the trailing `days` window. */
  async listRecent(type: MeasurementType, days: number, now = new Date()): Promise<Measurement[]> {
    const since = new Date(now.getTime() - days * 86_400_000);
    return this.repositories.measurements.listSince(type, todayIsoDate(since));
  }
}
