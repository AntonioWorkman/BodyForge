/* istanbul ignore file */
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { migrate } from '@/database/migrations';
import { createRepositories } from '@/database/repositories/sqlite';
import { seedCatalog } from '@/database/seed';
import type { SqlDatabase } from '@/database/sqlDatabase';
import { createServices } from '@/services';
import type { AppServices } from '@/services';
import { useSettingsStore } from '@/stores/settingsStore';
import { createTestDatabase } from '@/testing/nodeSqlite';

import { TestServicesProvider } from './TestServicesProvider';

/**
 * Renders a component over a real, migrated, seeded database.
 *
 * Component tests exercise the same service layer the app uses, so a passing
 * test means the screen works against genuine persistence rather than against
 * a mock that happens to agree with it.
 */
export interface RenderedWithServices {
  services: AppServices;
  db: SqlDatabase & { close: () => void };
  result: Awaited<ReturnType<typeof render>>;
  cleanup: () => void;
}

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export async function renderWithServices(
  ui: (services: AppServices) => ReactElement,
  options: { playerName?: string } = {},
): Promise<RenderedWithServices> {
  const db = createTestDatabase();
  await migrate(db);
  await seedCatalog(db, new Date('2026-08-01T09:00:00.000Z').toISOString());

  const repositories = createRepositories(db);
  const services = createServices({ db, repositories, schemaVersion: 1 });

  await services.player.createPlayer({
    name: options.playerName ?? 'Test Player',
    avatarUri: null,
    unitSystem: 'imperial',
  });

  useSettingsStore.getState().hydrate(await repositories.settings.get());

  const result = await render(ui(services), { wrapper: wrapperFor(services) });

  return { services, db, result, cleanup: () => db.close() };
}

/**
 * Renders another screen over an existing harness's database, which is how a
 * test reproduces navigating between screens or relaunching the app.
 */
export async function renderOverServices(
  harness: RenderedWithServices,
  ui: ReactElement,
): Promise<Awaited<ReturnType<typeof render>>> {
  return render(ui, { wrapper: wrapperFor(harness.services) });
}

function wrapperFor(services: AppServices) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <TestServicesProvider services={services}>{children}</TestServicesProvider>
      </SafeAreaProvider>
    );
  };
}
