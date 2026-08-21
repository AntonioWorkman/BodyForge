import { useCallback, useEffect, useState } from 'react';

import type { PlayerState } from '@/services';

import { useServices } from './servicesContext';

/**
 * The player read model, loaded from the service layer.
 *
 * Every screen showing a level, XP total, phase or Core stage uses this hook,
 * so the same numbers appear everywhere. `refresh` is called after any action
 * that could change them.
 */
export function usePlayerState(): {
  state: PlayerState | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const services = useServices();
  const [state, setState] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await services.player.getState();
    setState(next);
    setLoading(false);
  }, [services]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, loading, refresh };
}
