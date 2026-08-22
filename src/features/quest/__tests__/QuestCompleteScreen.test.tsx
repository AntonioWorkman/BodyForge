import { screen, waitFor } from '@testing-library/react-native';

import { QuestCompleteScreen } from '../QuestCompleteScreen';
import { renderOverServices, renderWithServices } from '@/testing/renderWithServices';
import type { RenderedWithServices } from '@/testing/renderWithServices';
import type { AppServices } from '@/services';
import { Text } from '@/components';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

const mockReplace = jest.fn();
let mockSessionId = '';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useLocalSearchParams: () => ({ sessionId: mockSessionId }),
}));

/** Starts a session and logs every prescribed set at `value`. */
async function logFullSession(services: AppServices, value: (min: number, max: number) => number) {
  const plan = await services.workouts.getNextPlan();
  const session = await services.workouts.startSession(plan!);

  for (const performance of session.performances) {
    const perSide = performance.measurementKind === 'reps-per-side';
    const amount = value(performance.prescribed.targetMin, performance.prescribed.targetMax);
    for (let n = 1; n <= performance.prescribed.sets; n += 1) {
      await services.workouts.recordSet(performance.id, n, amount, perSide ? amount : null);
    }
    await services.workouts.markExerciseComplete(performance.id);
  }

  return session;
}

describe('Quest Complete', () => {
  let harness: RenderedWithServices;
  let completeScreen: Awaited<ReturnType<typeof renderOverServices>> | null = null;

  beforeEach(async () => {
    mockReplace.mockClear();
    useActiveWorkoutStore.getState().clear();
    // A placeholder first render gives the test a harness whose database the
    // completion screen is then rendered over.
    harness = await renderWithServices(() => <Text>ready</Text>);
  });

  afterEach(async () => {
    if (completeScreen) await completeScreen.unmount();
    completeScreen = null;
    await harness.result.unmount();
    harness.cleanup();
  });

  async function openCompletion(sessionId: string) {
    mockSessionId = sessionId;
    completeScreen = await renderOverServices(harness, <QuestCompleteScreen />);
    await waitFor(() => expect(screen.getByTestId('quest-complete')).toBeTruthy());
  }

  it('saves the session automatically and reports the recorded totals', async () => {
    const session = await logFullSession(harness.services, (min) => min);
    await openCompletion(session.id);

    expect(screen.getByText('QUEST COMPLETE')).toBeTruthy();
    expect(screen.getByText('7 / 7')).toBeTruthy();
    expect(screen.getByText('21')).toBeTruthy();

    const stored = await harness.services.workouts.listCompletedSessions();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe('completed');
  });

  it('awards exactly the XP the rules produce, with its breakdown', async () => {
    const session = await logFullSession(harness.services, (min) => min);
    await openCompletion(session.id);

    expect(screen.getByText('+345 XP')).toBeTruthy();
    expect(screen.getByText('Working sets')).toBeTruthy();
    expect(screen.getByText('Exercises completed')).toBeTruthy();
    expect(screen.getByText('Quest completed')).toBeTruthy();

    const profile = await harness.services.player.getProfile();
    expect(profile?.totalXp).toBe(345);
  });

  it('does not claim a personal best on a first-ever session', async () => {
    const session = await logFullSession(harness.services, (_min, max) => max);
    await openCompletion(session.id);

    expect(screen.queryByText('Personal best')).toBeNull();
    expect(screen.queryByText(/improvement/)).toBeNull();
  });

  it('advances the rotation so the next directive is the other workout', async () => {
    const session = await logFullSession(harness.services, (min) => min);
    await openCompletion(session.id);

    await waitFor(() => expect(screen.getByText(/Workout B/)).toBeTruthy());
    const next = await harness.services.workouts.getNextPlan();
    expect(next?.template.name).toBe('Workout B');
  });

  it('directs the player to recovery rather than straight back to training', async () => {
    const session = await logFullSession(harness.services, (min) => min);
    await openCompletion(session.id);

    expect(screen.getByText('Next directive')).toBeTruthy();
    expect(screen.getByText('Recovery')).toBeTruthy();
  });

  it('reports progression availability only when the criteria are met', async () => {
    const first = await logFullSession(harness.services, (_min, max) => max);
    await openCompletion(first.id);
    expect(screen.queryByText('Progression available')).toBeNull();
    await completeScreen!.unmount();
    completeScreen = null;

    // Workout B intervenes, then a second Workout A qualifies the push-up.
    const second = await logFullSession(harness.services, (_min, max) => max);
    await harness.services.workouts.completeSession(second.id);
    const third = await logFullSession(harness.services, (_min, max) => max);

    await openCompletion(third.id);
    await waitFor(() => expect(screen.getByText('Progression available')).toBeTruthy());
    expect(screen.getByText('Regular Push-Up')).toBeTruthy();
  });

  it('refuses to record the same session twice', async () => {
    const session = await logFullSession(harness.services, (min) => min);
    await harness.services.workouts.completeSession(session.id);

    mockSessionId = session.id;
    completeScreen = await renderOverServices(harness, <QuestCompleteScreen />);

    await waitFor(() => expect(screen.getByText('Nothing to record')).toBeTruthy());
    expect(await harness.services.workouts.listCompletedSessions()).toHaveLength(1);
  });
});
