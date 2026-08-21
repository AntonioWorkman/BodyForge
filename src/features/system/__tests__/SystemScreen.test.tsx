import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SystemScreen } from '../SystemScreen';
import { renderOverServices, renderWithServices } from '@/testing/renderWithServices';
import type { RenderedWithServices } from '@/testing/renderWithServices';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(callback, [callback]);
  },
}));

describe('System screen', () => {
  let harness: RenderedWithServices;

  beforeEach(() => {
    mockPush.mockClear();
  });

  afterEach(async () => {
    await harness.result.unmount();
    harness.cleanup();
  });

  async function open(name = 'Test Player') {
    harness = await renderWithServices(() => <SystemScreen />, { playerName: name });
    await waitFor(() => expect(screen.getByTestId('system-screen')).toBeTruthy());
  }

  it('opens a brand new player at level 1 with no invented data', async () => {
    await open('Ada');

    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('LVL 01')).toBeTruthy();
    // Rendered as-is; the tracked capitals come from a text transform.
    expect(screen.getByText('Awakening')).toBeTruthy();
    expect(screen.getByText('No training data detected.')).toBeTruthy();
  });

  it('shows the Core in its dormant state before any training', async () => {
    await open();
    expect(screen.getByTestId('system-core')).toBeTruthy();
    expect(screen.getByLabelText('The Core, dormant')).toBeTruthy();
    expect(screen.getByText('Dormant')).toBeTruthy();
  });

  it('directs a new player to their first quest', async () => {
    await open();

    expect(screen.getByText('Workout A')).toBeTruthy();
    expect(screen.getByText('Legs + Push')).toBeTruthy();
    expect(screen.getByText(/7 exercises/)).toBeTruthy();
    expect(screen.getByTestId('begin-quest')).toBeTruthy();
  });

  it('starts XP at zero and derives the bar from the same total', async () => {
    await open();
    expect(screen.getByText('0 / 225 XP')).toBeTruthy();
    expect(screen.getByText('0 total')).toBeTruthy();
  });

  it('offers to resume, with progress, when a quest is already in flight', async () => {
    harness = await renderWithServices(() => <SystemScreen />);
    await waitFor(() => expect(screen.getByTestId('system-screen')).toBeTruthy());

    // Start a quest and log a set, then reopen System over the same database.
    const plan = await harness.services.workouts.getNextPlan();
    const session = await harness.services.workouts.startSession(plan!);
    await harness.services.workouts.recordSet(session.performances[0]!.id, 1, 9, 9);
    await harness.services.workouts.saveUiState({
      sessionId: session.id,
      currentPosition: 2,
      restStartedAt: null,
      restDurationSeconds: null,
      restPausedAt: null,
      updatedAt: new Date().toISOString(),
    });

    await harness.result.unmount();
    harness.result = await renderOverServices(harness, <SystemScreen />);

    await waitFor(() => expect(screen.getByTestId('resume-quest')).toBeTruthy());
    expect(screen.getByText('In progress · Exercise 3 of 7')).toBeTruthy();
    expect(screen.queryByTestId('begin-quest')).toBeNull();
  });

  it('navigates into the quest when the directive is pressed', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin-quest'));

    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/quest/active' }));
  });

  it('shows weekly consistency against the target with nothing completed', async () => {
    await open();
    expect(screen.getByLabelText('0 of 3 sessions completed this week')).toBeTruthy();
  });
});
