/**
 * @jest-environment node
 */
import { performance, prescription, set } from '@/domain/__tests__/factories';

import {
  defaultDraftFor,
  restProgress,
  restSecondsRemaining,
  useActiveWorkoutStore,
} from '../activeWorkoutStore';

const START = 1_000_000;

describe('rest timer', () => {
  beforeEach(() => {
    useActiveWorkoutStore.getState().clear();
  });

  it('counts down from wall-clock time, not from ticks', () => {
    useActiveWorkoutStore.getState().startRest(90, START);
    const { rest } = useActiveWorkoutStore.getState();

    expect(restSecondsRemaining(rest, START)).toBe(90);
    expect(restSecondsRemaining(rest, START + 30_000)).toBe(60);
    expect(restSecondsRemaining(rest, START + 89_000)).toBe(1);
  });

  it('is accurate after a long gap, as if the app had been backgrounded', () => {
    useActiveWorkoutStore.getState().startRest(90, START);
    const { rest } = useActiveWorkoutStore.getState();

    // The app was away for five minutes; the timer must not be five minutes behind.
    expect(restSecondsRemaining(rest, START + 300_000)).toBe(0);
  });

  it('never goes negative', () => {
    useActiveWorkoutStore.getState().startRest(60, START);
    const { rest } = useActiveWorkoutStore.getState();
    expect(restSecondsRemaining(rest, START + 10_000_000)).toBe(0);
    expect(restProgress(rest, START + 10_000_000)).toBe(1);
  });

  it('freezes while paused and resumes from where it stopped', () => {
    const store = useActiveWorkoutStore.getState();
    store.startRest(90, START);
    store.pauseRest(START + 30_000);

    let rest = useActiveWorkoutStore.getState().rest;
    // A minute passes while paused: still 60 seconds left.
    expect(restSecondsRemaining(rest, START + 90_000)).toBe(60);

    useActiveWorkoutStore.getState().resumeRest(START + 90_000);
    rest = useActiveWorkoutStore.getState().rest;
    expect(restSecondsRemaining(rest, START + 100_000)).toBe(50);
  });

  it('ignores a second pause or a resume that was never paused', () => {
    const store = useActiveWorkoutStore.getState();
    store.startRest(90, START);
    store.resumeRest(START + 5_000);
    expect(useActiveWorkoutStore.getState().rest?.pausedTotalMs).toBe(0);

    store.pauseRest(START + 10_000);
    store.pauseRest(START + 20_000);
    expect(useActiveWorkoutStore.getState().rest?.pausedAt).toBe(START + 10_000);
  });

  it('adds thirty seconds without restarting the period', () => {
    const store = useActiveWorkoutStore.getState();
    store.startRest(90, START);
    store.extendRest(30);

    const rest = useActiveWorkoutStore.getState().rest;
    expect(restSecondsRemaining(rest, START + 30_000)).toBe(90);
  });

  it('reports progress from zero to one across the period', () => {
    useActiveWorkoutStore.getState().startRest(100, START);
    const { rest } = useActiveWorkoutStore.getState();

    expect(restProgress(rest, START)).toBe(0);
    expect(restProgress(rest, START + 50_000)).toBeCloseTo(0.5);
    expect(restProgress(rest, START + 100_000)).toBe(1);
  });

  it('returns to logging when rest ends', () => {
    const store = useActiveWorkoutStore.getState();
    store.startRest(90, START);
    expect(useActiveWorkoutStore.getState().phase).toBe('resting');

    store.endRest();
    expect(useActiveWorkoutStore.getState().phase).toBe('logging');
    expect(useActiveWorkoutStore.getState().rest).toBeNull();
  });

  it('restores an in-flight rest period after a relaunch', () => {
    useActiveWorkoutStore.getState().restoreRest({
      startedAt: START,
      durationSeconds: 90,
      pausedAt: null,
      pausedTotalMs: 0,
    });

    const state = useActiveWorkoutStore.getState();
    expect(state.phase).toBe('resting');
    expect(restSecondsRemaining(state.rest, START + 45_000)).toBe(45);
  });

  it('treats a missing rest period as finished', () => {
    expect(restSecondsRemaining(null)).toBe(0);
    expect(restProgress(null)).toBe(1);
  });
});

describe('default stepper values', () => {
  it('starts a first-ever exercise at the bottom of the prescribed range', () => {
    const current = performance({ prescribed: prescription({ targetMin: 8, targetMax: 12 }) });
    expect(defaultDraftFor(current, null, 1)).toEqual({ primary: 8, secondary: 8 });
  });

  it('uses the matching set from the previous session when there is one', () => {
    const previous = performance({ sets: [set(1, 11, 10), set(2, 9, 9)] });
    const current = performance({ sets: [] });

    expect(defaultDraftFor(current, previous, 1)).toEqual({ primary: 11, secondary: 10 });
    expect(defaultDraftFor(current, previous, 2)).toEqual({ primary: 9, secondary: 9 });
  });

  it('carries the last logged set forward within the same session', () => {
    const current = performance({ sets: [set(1, 10, 10)] });
    expect(defaultDraftFor(current, null, 2)).toEqual({ primary: 10, secondary: 10 });
  });

  it('omits a second side for bilateral and timed work', () => {
    const reps = performance({ measurementKind: 'reps', sets: [] });
    expect(defaultDraftFor(reps, null, 1).secondary).toBeNull();

    const hold = performance({
      measurementKind: 'time',
      prescribed: prescription({ targetMin: 30, targetMax: 45 }),
      sets: [],
    });
    expect(defaultDraftFor(hold, null, 1)).toEqual({ primary: 30, secondary: null });
  });
});
