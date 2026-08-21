import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { MainQuestScreen } from '../MainQuestScreen';
import { renderWithServices } from '@/testing/renderWithServices';
import type { RenderedWithServices } from '@/testing/renderWithServices';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

// Names must start with `mock` so Babel allows them inside a hoisted factory.
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

describe('Main Quest', () => {
  let harness: RenderedWithServices;

  beforeEach(async () => {
    mockReplace.mockClear();
    useActiveWorkoutStore.getState().clear();
    harness = await renderWithServices(() => <MainQuestScreen />);
    await waitFor(() => expect(screen.getByTestId('main-quest')).toBeTruthy());
  });

  afterEach(async () => {
    await harness.result.unmount();
    harness.cleanup();
  });

  it('opens on the first exercise of Workout A with its prescription', () => {
    expect(screen.getByText('Bulgarian Split Squat')).toBeTruthy();
    expect(screen.getByText('3 × 8–12 / leg')).toBeTruthy();
    expect(screen.getByText('1 / 7 exercises')).toBeTruthy();
  });

  it('shows left and right controls for unilateral work', () => {
    expect(screen.getByTestId('stepper-primary')).toBeTruthy();
    expect(screen.getByTestId('stepper-secondary')).toBeTruthy();
    expect(screen.getByText('Left')).toBeTruthy();
    expect(screen.getByText('Right')).toBeTruthy();
  });

  it('defaults to the bottom of the prescribed range with no history', () => {
    expect(screen.getAllByLabelText(/Left: 8/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/Right: 8/)).toHaveLength(1);
  });

  it('increments and decrements a side independently', async () => {
    await fireEvent.press(screen.getByLabelText('Increase Left'));
    await waitFor(() => expect(screen.getByLabelText('Left: 9')).toBeTruthy());
    expect(screen.getByLabelText('Right: 8')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Decrease Right'));
    await waitFor(() => expect(screen.getByLabelText('Right: 7')).toBeTruthy());
  });

  it('does not decrement below zero', async () => {
    // Awaited one at a time: each press must commit before the next, or the
    // control is still bound to the previous value.
    for (let i = 0; i < 12; i += 1) {
      await fireEvent.press(screen.getByLabelText('Decrease Left'));
    }
    expect(screen.getByLabelText('Left: 0')).toBeTruthy();
  });

  it('writes a completed set to storage immediately', async () => {
    await fireEvent.press(screen.getByLabelText('Increase Left'));
    await fireEvent.press(screen.getByTestId('complete-set'));

    await waitFor(async () => {
      const session = await harness.services.workouts.getActiveSession();
      expect(session?.performances[0]?.sets).toHaveLength(1);
      expect(session?.performances[0]?.sets[0]?.primaryValue).toBe(9);
      expect(session?.performances[0]?.sets[0]?.secondaryValue).toBe(8);
    });
  });

  it('enters the rest state after a set that is not the last', async () => {
    await fireEvent.press(screen.getByTestId('complete-set'));

    await waitFor(() => expect(screen.getByTestId('rest-state')).toBeTruthy());
    expect(useActiveWorkoutStore.getState().rest?.durationSeconds).toBe(120);
  });

  it('skipping rest returns to logging without losing the recorded set', async () => {
    await fireEvent.press(screen.getByTestId('complete-set'));
    await waitFor(() => expect(screen.getByTestId('rest-state')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('rest-skip'));

    await waitFor(() => expect(screen.queryByTestId('rest-state')).toBeNull());
    const session = await harness.services.workouts.getActiveSession();
    expect(session?.performances[0]?.sets).toHaveLength(1);
  });

  it('adds thirty seconds to a running rest period', async () => {
    await fireEvent.press(screen.getByTestId('complete-set'));
    await waitFor(() => expect(screen.getByTestId('rest-state')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('rest-extend'));
    expect(useActiveWorkoutStore.getState().rest?.durationSeconds).toBe(150);
  });

  it('shows the exercise-complete beat once every prescribed set is logged', async () => {
    for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
      await fireEvent.press(screen.getByTestId('complete-set'));
      if (setNumber < 3) {
        await waitFor(() => expect(screen.getByTestId('rest-state')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('rest-skip'));
      }
    }

    await waitFor(() => expect(screen.getByTestId('exercise-transition')).toBeTruthy());
  });

  it('moves between exercises without losing recorded data', async () => {
    await fireEvent.press(screen.getByTestId('complete-set'));
    await fireEvent.press(screen.getByTestId('rest-skip'));

    await fireEvent.press(screen.getByLabelText('Next exercise'));
    await waitFor(() => expect(screen.getByText('Slow Bodyweight Squat')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Previous exercise'));
    await waitFor(() => expect(screen.getByText('Bulgarian Split Squat')).toBeTruthy());

    const session = await harness.services.workouts.getActiveSession();
    expect(session?.performances[0]?.sets).toHaveLength(1);
  });

  it('opens the exercise list and jumps to a chosen exercise', async () => {
    await fireEvent.press(screen.getByTestId('quest-list'));
    await waitFor(() => expect(screen.getByTestId('exercise-list-sheet')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Plank'));

    await waitFor(() => expect(screen.getByText('7 / 7 exercises')).toBeTruthy());
  });

  it('shows a timed hold with a single control and no second side', async () => {
    await fireEvent.press(screen.getByTestId('quest-list'));
    await fireEvent.press(screen.getByLabelText('Plank'));

    await waitFor(() => expect(screen.getByText('3 × 30–45s')).toBeTruthy());
    expect(screen.queryByTestId('stepper-secondary')).toBeNull();
    expect(screen.getByLabelText('Hold: 30s')).toBeTruthy();
  });

  it('opens form details without leaving the exercise', async () => {
    await fireEvent.press(screen.getByTestId('quest-details'));

    await waitFor(() => expect(screen.getByTestId('exercise-detail-sheet')).toBeTruthy());
    expect(screen.getByText('Front shin close to vertical at the bottom.')).toBeTruthy();
    expect(screen.getByTestId('main-quest')).toBeTruthy();
  });

  it('leaving a quest keeps the resume position it was left at', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    // Move to the third exercise, which persists that position.
    await fireEvent.press(screen.getByLabelText('Next exercise'));
    await fireEvent.press(screen.getByLabelText('Next exercise'));

    const active = await harness.services.workouts.getActiveSession();
    await waitFor(async () => {
      expect((await harness.services.workouts.getUiState(active!.id))?.currentPosition).toBe(2);
    });

    await fireEvent.press(screen.getByTestId('quest-exit'));
    const [, , buttons] = alertSpy.mock.calls[0] as [
      string,
      string,
      { text?: string; onPress?: () => void }[],
    ];
    buttons.find((button) => button.text === 'Leave')?.onPress?.();

    // Settle first: the offending write was asynchronous, so polling with
    // waitFor would pass on its first check before the damage landed.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // The regression this guards: clearing the store used to refire the save
    // effect and overwrite the stored position with 0.
    const state = await harness.services.workouts.getUiState(active!.id);
    expect(state?.currentPosition).toBe(2);

    alertSpy.mockRestore();
  });

  it('discarding a quest leaves nothing behind to write to', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const active = await harness.services.workouts.getActiveSession();

    await fireEvent.press(screen.getByTestId('quest-exit'));
    const [, , buttons] = alertSpy.mock.calls[0] as [
      string,
      string,
      { text?: string; onPress?: () => void | Promise<void> }[],
    ];
    await buttons.find((button) => button.text === 'Discard quest')?.onPress?.();

    await waitFor(async () => {
      expect(await harness.services.workouts.getActiveSession()).toBeNull();
    });
    expect(await harness.services.workouts.getUiState(active!.id)).toBeNull();

    alertSpy.mockRestore();
  });

  it('will not finish a quest that still has sets outstanding', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    // Jump to the last exercise and complete only that one.
    await fireEvent.press(screen.getByTestId('quest-list'));
    await waitFor(() => expect(screen.getByTestId('exercise-list-sheet')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Plank'));
    await waitFor(() => expect(screen.getByText('7 / 7 exercises')).toBeTruthy());

    for (let set = 0; set < 3; set += 1) {
      await fireEvent.press(screen.getByTestId('complete-set'));
      if (screen.queryByTestId('rest-state')) {
        await fireEvent.press(screen.getByTestId('rest-skip'));
      }
    }

    await waitFor(() => expect(screen.getByTestId('quest-advance')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('quest-advance'));

    // Sent back to the first exercise that still owes sets, not to completion.
    await waitFor(() => expect(screen.getByText('1 / 7 exercises')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/quest/complete' }),
    );

    const [title, body] = alertSpy.mock.calls[0] as [string, string];
    expect(title).toBe('Sets still remaining');
    expect(body).toContain('Bulgarian Split Squat');
    expect(body).toContain('0 of 3 sets recorded');

    // And nothing was recorded as completed.
    expect(await harness.services.workouts.listCompletedSessions()).toHaveLength(0);
    alertSpy.mockRestore();
  });

  it('states plainly that there is no previous record on a first session', () => {
    expect(screen.getByText('No previous record — this session sets your baseline.')).toBeTruthy();
  });
});
