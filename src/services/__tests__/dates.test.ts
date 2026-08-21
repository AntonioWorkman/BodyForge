/**
 * @jest-environment node
 */
import { todayIsoDate } from '@/domain/format';

import { createHarness } from './harness';

/**
 * Calendar dates are the player's local ones.
 *
 * Truncating an ISO string takes the UTC day, which is the wrong date for
 * anyone whose offset crosses midnight — a measurement logged on the evening of
 * the 5th in UTC-07:00 would be filed under the 6th.
 */
describe('starting measurement dates', () => {
  it('records the local calendar date, not the UTC one', async () => {
    // 21:30 local on 20 Aug in UTC-07:00 is already 04:30 on 21 Aug in UTC.
    const localEvening = new Date(2026, 7, 20, 21, 30, 0);
    const utcDate = localEvening.toISOString().slice(0, 10);
    const localDate = todayIsoDate(localEvening);

    const harness = await createHarness();
    await harness.player.createPlayer(
      {
        name: 'Timezone',
        avatarUri: null,
        unitSystem: 'metric',
        startingBodyweightKg: 79.4,
        startingWaistCm: 81,
      },
      localEvening,
    );

    const [bodyweight] = await harness.measurements.list('bodyweight');
    const [waist] = await harness.measurements.list('waist');

    expect(bodyweight?.recordedOn).toBe(localDate);
    expect(waist?.recordedOn).toBe(localDate);
    expect(localDate).toBe('2026-08-20');

    // Only meaningful as a regression guard where the two actually differ.
    if (utcDate !== localDate) {
      expect(bodyweight?.recordedOn).not.toBe(utcDate);
    }

    harness.close();
  });

  it('files an onboarding measurement on the same day as one logged manually', async () => {
    const at = new Date(2026, 7, 20, 23, 45, 0);

    const harness = await createHarness();
    await harness.player.createPlayer(
      { name: 'Same day', avatarUri: null, unitSystem: 'metric', startingBodyweightKg: 80 },
      at,
    );
    await harness.measurements.log('waist', 81, 'metric', {}, at);

    const [bodyweight] = await harness.measurements.list('bodyweight');
    const [waist] = await harness.measurements.list('waist');
    expect(bodyweight?.recordedOn).toBe(waist?.recordedOn);

    harness.close();
  });
});
