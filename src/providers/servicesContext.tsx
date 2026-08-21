import { createContext, useContext } from 'react';

import type { AppServices } from '@/services';

/**
 * The service context.
 *
 * Kept separate from `ServicesProvider` so that consuming a service does not
 * pull in the database client — and with it the native SQLite module — which
 * lets screens be rendered in tests over an in-process database.
 */
export interface ServicesContextValue {
  services: AppServices;
  /** Schema version the database reported after migrating. */
  schemaVersion: number;
}

export const ServicesContext = createContext<ServicesContextValue | null>(null);

export function useServices(): AppServices {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServices must be used inside ServicesProvider');
  }
  return context.services;
}

export function useSchemaVersion(): number {
  return useContext(ServicesContext)?.schemaVersion ?? 0;
}
