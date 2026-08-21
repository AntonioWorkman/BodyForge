import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SettingsScreen } from '../SettingsScreen';
import { renderOverServices, renderWithServices } from '@/testing/renderWithServices';
import type { RenderedWithServices } from '@/testing/renderWithServices';
import { Text } from '@/components';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(callback, [callback]);
  },
}));

type AlertButton = { text?: string; onPress?: () => void; style?: string };

describe('Settings screen', () => {
  let harness: RenderedWithServices;
  let rendered: Awaited<ReturnType<typeof renderOverServices>> | null = null;
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    harness = await renderWithServices(() => <Text>ready</Text>, { playerName: 'Antonio' });
  });

  afterEach(async () => {
    if (rendered) await rendered.unmount();
    rendered = null;
    await harness.result.unmount();
    harness.cleanup();
    alertSpy.mockRestore();
  });

  async function open() {
    rendered = await renderOverServices(harness, <SettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-screen')).toBeTruthy());
  }

  /** Runs the button with the given label from the most recent Alert. */
  function pressAlertButton(callIndex: number, label: string) {
    const call = alertSpy.mock.calls[callIndex] as [string, string, AlertButton[]];
    const button = call[2]?.find((candidate) => candidate.text === label);
    expect(button).toBeDefined();
    button?.onPress?.();
  }

  it('shows the real player, not a sample one', async () => {
    await open();
    expect(screen.getAllByText('Antonio').length).toBeGreaterThan(0);
    expect(screen.getByText('Level 1 · Awakening · 0 quests')).toBeTruthy();
  });

  it('persists a settings change through the database', async () => {
    await open();

    await fireEvent(screen.getByLabelText('Haptics'), 'valueChange', false);
    await waitFor(async () => {
      expect((await harness.services.player.getSettings()).hapticsEnabled).toBe(false);
    });
  });

  it('changes units without rewriting stored measurements', async () => {
    await harness.services.measurements.log('bodyweight', 175, 'imperial');
    const before = await harness.services.measurements.latest('bodyweight');

    await open();
    await fireEvent.press(screen.getByLabelText('Units'));
    await waitFor(() => expect(screen.getByTestId('settings-chooser')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Kilograms · centimetres'));

    await waitFor(async () => {
      expect((await harness.services.player.getSettings()).unitSystem).toBe('metric');
    });
    expect(await harness.services.measurements.latest('bodyweight')).toEqual(before);
  });

  it('never clears data on a single tap', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Clear local data'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title] = alertSpy.mock.calls[0] as [string];
    expect(title).toBe('Clear all local data?');

    // Opening the confirmation must not have deleted anything.
    expect(await harness.services.player.getProfile()).not.toBeNull();
  });

  it('asks a second time before deleting, and cancelling keeps the data', async () => {
    await harness.services.measurements.log('waist', 32, 'imperial');
    await open();

    await fireEvent.press(screen.getByLabelText('Clear local data'));
    pressAlertButton(0, 'Delete everything');

    // A second confirmation, because this is the only irreversible action.
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
    const [secondTitle] = alertSpy.mock.calls[1] as [string];
    expect(secondTitle).toBe('Are you certain?');

    pressAlertButton(1, 'Keep my data');
    expect(await harness.services.player.getProfile()).not.toBeNull();
    expect(await harness.services.measurements.list('waist')).toHaveLength(1);
  });

  it('erases everything only once both confirmations are given', async () => {
    await harness.services.measurements.log('waist', 32, 'imperial');
    await open();

    await fireEvent.press(screen.getByLabelText('Clear local data'));
    pressAlertButton(0, 'Delete everything');
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
    pressAlertButton(1, 'Delete');

    await waitFor(async () => {
      expect(await harness.services.player.getProfile()).toBeNull();
    });
    expect(await harness.services.measurements.list()).toEqual([]);

    // The catalog survives, so the app is not left unusable.
    const plan = await harness.services.workouts.buildPlan('template-workout-a');
    expect(plan?.entries).toHaveLength(7);
  });

  it('shows no nutrition target, which the app does not calculate', async () => {
    await open();

    // Removed in review: the value was hardcoded, with no nutrition model,
    // user input or calculation behind it. Nutrition is out of scope for this
    // phase, and an invented number is worse than none.
    expect(screen.queryByText(/Protein/i)).toBeNull();
    expect(screen.queryByText(/g \/ day/)).toBeNull();
  });

  it('describes what a backup actually carries', async () => {
    await open();

    // The avatar image is not in the JSON, so the copy must not imply it is.
    expect(screen.getByText(/Your avatar image stays on this device/)).toBeTruthy();
  });

  it('states that the app is local-only', async () => {
    await open();
    expect(screen.getByText(/stored in a database on this device only/)).toBeTruthy();
  });
});
