import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import { migrate } from '@/database/migrations';
import { createRepositories } from '@/database/repositories/sqlite';
import { createUnitOfWork } from '@/database/unitOfWork';
import { seedCatalog } from '@/database/seed';
import { resolveLevel } from '@/domain/levels';
import { ServicesContext } from '@/providers/servicesContext';
import { createServices } from '@/services';
import type { AppServices } from '@/services';
import { StatusScreen } from '@/features/status/StatusScreen';
import { SystemScreen } from '@/features/system/SystemScreen';
import { useSettingsStore } from '@/stores/settingsStore';
import { createTestDatabase } from '@/testing/nodeSqlite';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(callback, [callback]);
  },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * One source of truth.
 *
 * The reference prototype showed a different level and XP total on different
 * screens. These tests exist so that cannot come back: System and Status are
 * rendered over the same database and their numbers must match each other and
 * the stored total exactly.
 */
describe('cross-screen data consistency', () => {
  let services: AppServices;
  let db: ReturnType<typeof createTestDatabase>;

  beforeEach(async () => {
    db = createTestDatabase();
    await migrate(db);
    await seedCatalog(db, '2026-08-01T09:00:00.000Z');

    const repositories = createRepositories(db);
    services = createServices({
      db,
      repositories,
      unitOfWork: createUnitOfWork(db),
      schemaVersion: 1,
    });

    await services.player.createPlayer({
      name: 'Consistency',
      avatarUri: null,
      unitSystem: 'imperial',
    });
    useSettingsStore.getState().hydrate(await repositories.settings.get());
  });

  afterEach(() => db.close());

  function renderScreen(ui: ReactElement) {
    return render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ServicesContext.Provider value={{ services, schemaVersion: 1 }}>
          {ui}
        </ServicesContext.Provider>
      </SafeAreaProvider>,
    );
  }

  async function completeOneSession() {
    const plan = await services.workouts.getNextPlan();
    const session = await services.workouts.startSession(plan!);

    for (const performance of session.performances) {
      const perSide = performance.measurementKind === 'reps-per-side';
      for (let n = 1; n <= performance.prescribed.sets; n += 1) {
        await services.workouts.recordSet(
          performance.id,
          n,
          performance.prescribed.targetMin,
          perSide ? performance.prescribed.targetMin : null,
        );
      }
    }

    return services.workouts.completeSession(session.id);
  }

  it('reports the same level and XP on System and Status', async () => {
    const summary = await completeOneSession();
    const level = resolveLevel(summary.totalXpAfter);

    const system = await renderScreen(<SystemScreen />);
    await waitFor(() => expect(screen.getByTestId('system-screen')).toBeTruthy());
    expect(screen.getByText(`LVL ${String(level.level).padStart(2, '0')}`)).toBeTruthy();
    expect(screen.getByText(`${level.xpIntoLevel} / ${level.xpForLevel} XP`)).toBeTruthy();
    expect(screen.getByText(`${level.totalXp} total`)).toBeTruthy();
    await system.unmount();

    const status = await renderScreen(<StatusScreen />);
    await waitFor(() => expect(screen.getByTestId('status-screen')).toBeTruthy());
    expect(screen.getByText(String(level.level).padStart(2, '0'))).toBeTruthy();
    expect(screen.getByText(`${level.xpIntoLevel} / ${level.xpForLevel} XP`)).toBeTruthy();
    expect(screen.getByText(`${level.totalXp} total`)).toBeTruthy();
    await status.unmount();
  });

  it('reports the same phase on both screens', async () => {
    await completeOneSession();

    const system = await renderScreen(<SystemScreen />);
    await waitFor(() => expect(screen.getByTestId('system-screen')).toBeTruthy());
    expect(screen.getAllByText('Awakening').length).toBeGreaterThan(0);
    await system.unmount();

    const status = await renderScreen(<StatusScreen />);
    await waitFor(() => expect(screen.getByTestId('status-screen')).toBeTruthy());
    expect(screen.getAllByText(/Awakening/).length).toBeGreaterThan(0);
    await status.unmount();
  });

  it('derives level from the stored total rather than a separate counter', async () => {
    const summary = await completeOneSession();
    const stored = await services.player.getProfile();

    expect(stored?.totalXp).toBe(summary.xp.total);
    expect(resolveLevel(stored!.totalXp)).toEqual(resolveLevel(summary.totalXpAfter));

    const state = await services.player.getState();
    expect(state?.level).toEqual(resolveLevel(stored!.totalXp));
  });

  it('shows a brand new player zeroes everywhere, never a sample player', async () => {
    const system = await renderScreen(<SystemScreen />);
    await waitFor(() => expect(screen.getByTestId('system-screen')).toBeTruthy());

    expect(screen.getByText('LVL 01')).toBeTruthy();
    expect(screen.getByText('0 total')).toBeTruthy();
    expect(screen.queryByText(/Alex Rivera/)).toBeNull();
    await system.unmount();

    const status = await renderScreen(<StatusScreen />);
    await waitFor(() => expect(screen.getByTestId('status-screen')).toBeTruthy());
    expect(screen.getByText('No training data detected')).toBeTruthy();
    await status.unmount();
  });
});
