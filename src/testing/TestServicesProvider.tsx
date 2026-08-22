/* istanbul ignore file */
import type { ReactNode } from 'react';

import { ServicesContext } from '@/providers/servicesContext';
import type { AppServices } from '@/services';

/**
 * Publishes a ready-made service bundle without booting the real database
 * client, which needs a native SQLite module Jest does not have.
 */
export function TestServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return (
    <ServicesContext.Provider value={{ services, schemaVersion: 1 }}>
      {children}
    </ServicesContext.Provider>
  );
}
