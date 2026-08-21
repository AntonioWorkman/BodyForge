import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { openDatabase } from '@/database/client';
import { createServices } from '@/services';
import { useSettingsStore } from '@/stores/settingsStore';

import { ServicesContext } from './servicesContext';
import type { ServicesContextValue } from './servicesContext';

type BootState =
  | { status: 'loading' }
  | { status: 'ready'; value: ServicesContextValue }
  | { status: 'error'; error: Error };

/**
 * Opens the database, migrates and seeds it, then publishes the service layer.
 *
 * Everything below this provider can assume persistence is ready, which is what
 * lets screens read data without each one guarding against an unopened
 * database.
 */
export function ServicesProvider({
  children,
  fallback,
  renderError,
  onReady,
}: {
  children: ReactNode;
  fallback: ReactNode;
  renderError: (error: Error, retry: () => void) => ReactNode;
  /** Called once persistence is open and settings are hydrated. */
  onReady?: () => void;
}) {
  const [state, setState] = useState<BootState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const hydrateSettings = useSettingsStore((store) => store.hydrate);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const handle = await openDatabase();
        const services = createServices(handle);
        const settings = await handle.repositories.settings.get();
        if (cancelled) return;

        hydrateSettings(settings);
        setState({
          status: 'ready',
          value: { services, schemaVersion: handle.schemaVersion },
        });
        onReady?.();
      } catch (error) {
        if (cancelled) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error('Database failed to open'),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // `onReady` is intentionally omitted: it fires once per boot attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, hydrateSettings]);

  const retry = useMemo(() => () => setAttempt((value) => value + 1), []);

  if (state.status === 'loading') return <>{fallback}</>;
  if (state.status === 'error') return <>{renderError(state.error, retry)}</>;

  return <ServicesContext.Provider value={state.value}>{children}</ServicesContext.Provider>;
}
