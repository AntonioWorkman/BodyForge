/**
 * @jest-environment node
 */
import { createRepositories } from '@/database/repositories/sqlite';
import { SessionNotActiveError } from '@/domain/errors';
import { seedCatalog } from '@/database/seed';
import { resolveLevel } from '@/domain/levels';
import { WORKOUT_TEMPLATE_EXERCISES } from '@/domain/program/templates';

import { completeSession, createHarness, withPlayer } from './harness';
import type { TestHarness } from './harness';

describe('seeded program', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(() => harness.close());

  it('seeds exactly two templates in rotation order', async () => {
    const templates = await harness.repositories.catalog.listTemplates();
    expect(templates.map((t) => t.name)).toEqual(['Workout A', 'Workout B']);
    expect(templates.map((t) => t.rotationOrder)).toEqual([0, 1]);
  });

  it('seeds Workout A exactly as prescribed', async () => {
    const plan = await harness.workouts.buildPlan('template-workout-a');
    expect(plan).not.toBeNull();
    expect(plan!.template.focus).toBe('Legs + Push');

    const names = plan!.entries.map((entry) => entry.variation.name);
    expect(names).toEqual([
      'Bulgarian Split Squat',
      'Slow Bodyweight Squat',
      'Single-Leg Glute Bridge',
      'Single-Leg Calf Raise',
      'Regular Push-Up',
      'High Incline Pike Push-Up',
      'Plank',
    ]);

    const bss = plan!.entries[0]!;
    expect(bss.prescription).toMatchObject({
      sets: 3,
      targetMin: 8,
      targetMax: 12,
      restSeconds: 120,
    });
    expect(bss.variation.measurementKind).toBe('reps-per-side');

    const plank = plan!.entries[6]!;
    expect(plank.prescription).toMatchObject({ sets: 3, targetMin: 30, targetMax: 45 });
    expect(plank.variation.measurementKind).toBe('time');
  });

  it('seeds Workout B exactly as prescribed', async () => {
    const plan = await harness.workouts.buildPlan('template-workout-b');
    expect(plan!.template.focus).toBe('Legs + Upper Body');
    expect(plan!.entries.map((entry) => entry.variation.name)).toEqual([
      'Reverse Lunge',
      'Bulgarian Split Squat',
      'Single-Leg Glute Bridge',
      'Single-Leg Calf Raise',
      'Close-Grip Push-Up',
      'High Incline Pike Push-Up',
      'Reverse Crunch',
    ]);
  });

  it('marks prescribed variations current and the rest locked', async () => {
    const states = await harness.repositories.progression.list();
    const prescribed = new Set(WORKOUT_TEMPLATE_EXERCISES.map((e) => e.variationId));

    for (const state of states) {
      expect(state.status).toBe(prescribed.has(state.variationId) ? 'current' : 'locked');
      expect(state.qualifyingSessions).toBe(0);
    }
  });

  it('seeds no training history, XP, or measurements for a new install', async () => {
    expect(await harness.repositories.sessions.countCompleted()).toBe(0);
    expect(await harness.repositories.measurements.list()).toEqual([]);
    expect(await harness.repositories.player.get()).toBeNull();
  });

  it('re-seeding does not disturb recorded data', async () => {
    await withPlayer(harness);
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

    const before = await harness.repositories.player.get();
    await seedCatalog(harness.db, new Date().toISOString());

    expect(await harness.repositories.player.get()).toEqual(before);
    expect(await harness.repositories.sessions.countCompleted()).toBe(1);
  });
});

describe('workout persistence', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('saves a completed workout with its performances and sets', async () => {
    const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

    const stored = await harness.repositories.sessions.findById(summary.session.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.sessionNumber).toBe(1);
    expect(stored?.performances).toHaveLength(7);
    expect(stored?.performances.every((p) => p.sets.length === 3)).toBe(true);
    expect(stored?.durationSeconds).toBe(34 * 60 + 18);
  });

  it('restores history across a fresh repository instance', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

    const fresh = createRepositories(harness.db);

    const sessions = await fresh.sessions.listCompleted();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.performances[0]?.sets[0]?.primaryValue).toBe(9);
  });

  it('stores left and right values independently', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(
      plan!,
      new Date('2026-08-02T10:00:00.000Z'),
    );
    const unilateral = session.performances.find((p) => p.measurementKind === 'reps-per-side')!;

    await harness.workouts.recordSet(unilateral.id, 1, 9, 7);
    const stored = await harness.repositories.sessions.findById(session.id);
    const set = stored!.performances.find((p) => p.id === unilateral.id)!.sets[0]!;

    expect(set.primaryValue).toBe(9);
    expect(set.secondaryValue).toBe(7);
  });

  it('stores a timed hold with no second side', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(
      plan!,
      new Date('2026-08-02T10:00:00.000Z'),
    );
    const timed = session.performances.find((p) => p.measurementKind === 'time')!;

    await harness.workouts.recordSet(timed.id, 1, 42, null);
    const stored = await harness.repositories.sessions.findById(session.id);
    const set = stored!.performances.find((p) => p.id === timed.id)!.sets[0]!;

    expect(set.primaryValue).toBe(42);
    expect(set.secondaryValue).toBeNull();
  });

  it('overwrites rather than duplicates when a set is re-logged', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(
      plan!,
      new Date('2026-08-02T10:00:00.000Z'),
    );
    const first = session.performances[0]!;

    await harness.workouts.recordSet(first.id, 1, 8, 8);
    await harness.workouts.recordSet(first.id, 1, 10, 10);

    const stored = await harness.repositories.sessions.findById(session.id);
    const sets = stored!.performances[0]!.sets;
    expect(sets).toHaveLength(1);
    expect(sets[0]?.primaryValue).toBe(10);
  });

  it('preserves what was prescribed at the time, even after the template changes', async () => {
    const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    const recordedPrescription = summary.session.performances[0]!.prescribed;

    // The template is later represcribed onto a harder variation.
    await harness.repositories.catalog.replaceTemplateExerciseVariation(
      'template-workout-a-e1',
      'var-bss-slow',
    );

    const stored = await harness.repositories.sessions.findById(summary.session.id);
    expect(stored!.performances[0]!.prescribed).toEqual(recordedPrescription);
    expect(stored!.performances[0]!.variationName).toBe('Bulgarian Split Squat');
  });

  it('groups every completed performance by variation in one pass', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 10);

    const grouped = await harness.repositories.sessions.listCompletedPerformancesByVariation();

    // Bulgarian Split Squat is prescribed in both workouts, so it has two.
    expect(grouped.get('var-bss-standard')).toHaveLength(2);
    // Push-ups appear in Workout A only.
    expect(grouped.get('var-push-up-regular')).toHaveLength(1);
    // Nothing untrained appears at all.
    expect(grouped.get('var-push-up-slow')).toBeUndefined();

    for (const performances of grouped.values()) {
      for (const performance of performances) {
        expect(performance.sets.length).toBeGreaterThan(0);
      }
    }
  });

  it('matches the per-variation query it replaces', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    await completeSession(harness, new Date('2026-08-04T10:00:00.000Z'), () => 11);

    const grouped = await harness.repositories.sessions.listCompletedPerformancesByVariation();
    const individually =
      await harness.repositories.sessions.listPerformancesForVariation('var-bss-standard');

    expect(grouped.get('var-bss-standard')).toEqual(individually);
  });

  it('excludes performances from sessions that were never completed', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(
      plan!,
      new Date('2026-08-02T10:00:00.000Z'),
    );
    await harness.workouts.recordSet(session.performances[0]!.id, 1, 9, 9);

    const grouped = await harness.repositories.sessions.listCompletedPerformancesByVariation();
    expect(grouped.size).toBe(0);
  });

  it('returns the most recent sessions when a limit is given, not the oldest', async () => {
    for (let index = 0; index < 4; index += 1) {
      await completeSession(harness, new Date(Date.UTC(2026, 7, 2 + index * 2, 10)), () => 9);
    }

    const all = await harness.repositories.sessions.listCompletedSummaries();
    expect(all).toHaveLength(4);

    const limited = await harness.repositories.sessions.listCompletedSummaries(2);
    expect(limited).toHaveLength(2);

    // Still chronological, but the newest two — a limit applied to an ascending
    // scan would have returned sessions 1 and 2 instead.
    expect(limited.map((s) => s.sessionNumber)).toEqual([3, 4]);
    expect(limited[1]?.completedAt).toBe(all[3]?.completedAt);
  });

  it('treats a zero or negative limit as returning nothing', async () => {
    await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    expect(await harness.repositories.sessions.listCompletedSummaries(0)).toEqual([]);
  });

  it('awards XP once and keeps the level derived from the same total', async () => {
    const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);
    expect(summary.xp.total).toBe(345);

    const profile = await harness.repositories.player.get();
    expect(profile?.totalXp).toBe(345);
    expect(resolveLevel(profile!.totalXp)).toEqual(resolveLevel(summary.totalXpAfter));
  });

  it('refuses to complete the same session twice', async () => {
    const summary = await completeSession(harness, new Date('2026-08-02T10:00:00.000Z'), () => 9);

    await expect(harness.workouts.completeSession(summary.session.id)).rejects.toBeInstanceOf(
      SessionNotActiveError,
    );

    // And the second attempt changed nothing.
    expect(await harness.repositories.sessions.countCompleted()).toBe(1);
    expect((await harness.repositories.player.get())?.totalXp).toBe(summary.xp.total);
  });
});

describe('A/B alternation across real sessions', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
    await withPlayer(harness);
  });

  afterEach(() => harness.close());

  it('alternates only when a session is actually completed', async () => {
    const names: string[] = [];

    for (let index = 0; index < 4; index += 1) {
      const plan = await harness.workouts.getNextPlan();
      names.push(plan!.template.name);
      await completeSession(harness, new Date(Date.UTC(2026, 7, 2 + index * 2, 10, 0, 0)), () => 9);
    }

    expect(names).toEqual(['Workout A', 'Workout B', 'Workout A', 'Workout B']);
  });

  it('does not move on when nothing is completed', async () => {
    const before = await harness.workouts.getNextPlan();
    const after = await harness.workouts.getNextPlan();
    expect(after!.template.id).toBe(before!.template.id);
  });

  it('does not move on when a session is abandoned', async () => {
    const plan = await harness.workouts.getNextPlan();
    const session = await harness.workouts.startSession(
      plan!,
      new Date('2026-08-02T10:00:00.000Z'),
    );
    await harness.workouts.abandonSession(session.id);

    expect((await harness.workouts.getNextPlan())!.template.name).toBe('Workout A');
  });
});
