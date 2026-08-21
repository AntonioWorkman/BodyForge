import { useCallback, useEffect, useState } from 'react';

import { formatDurationLong } from '@/domain/format';
import { RECOVERY_SUGGESTION, isInRecoveryWindow, recoveryEndsAt } from '@/domain/schedule';
import type { WorkoutPlan, WorkoutSessionDetail } from '@/domain/types';
import { useServices } from '@/providers/ServicesProvider';
import type { PlayerState } from '@/services';

/**
 * Everything the System screen needs to answer its one question: what should I
 * do now, and where am I?
 */
export type SystemDirective =
  | {
      kind: 'first-quest' | 'quest';
      plan: WorkoutPlan;
      exerciseCount: number;
      estimateLabel: string;
    }
  | {
      kind: 'resume';
      session: WorkoutSessionDetail;
      exerciseIndex: number;
      exerciseCount: number;
    }
  | {
      kind: 'recovery';
      plan: WorkoutPlan;
      exerciseCount: number;
      estimateLabel: string;
      suggestion: string;
      readyAt: string | null;
    };

export interface SystemScreenData {
  player: PlayerState | null;
  directive: SystemDirective | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSystemScreen(): SystemScreenData {
  const services = useServices();
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [directive, setDirective] = useState<SystemDirective | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const now = new Date();
    const state = await services.player.getState(now);
    setPlayer(state);

    if (!state) {
      setDirective(null);
      setLoading(false);
      return;
    }

    const active = await services.workouts.getActiveSession();
    if (active) {
      const ui = await services.workouts.getUiState(active.id);
      setDirective({
        kind: 'resume',
        session: active,
        // Fall back to the first exercise with unfinished sets if no UI state
        // was written, so a resume always lands somewhere sensible.
        exerciseIndex: ui?.currentPosition ?? firstUnfinishedPosition(active),
        exerciseCount: active.performances.length,
      });
      setLoading(false);
      return;
    }

    const plan = await services.workouts.getNextPlan();
    if (!plan) {
      setDirective(null);
      setLoading(false);
      return;
    }

    const estimateLabel = formatDurationLong(services.workouts.estimatePlanSeconds(plan));
    const exerciseCount = plan.entries.length;

    if (state.completedSessions === 0) {
      setDirective({ kind: 'first-quest', plan, exerciseCount, estimateLabel });
    } else if (isInRecoveryWindow(state.lastCompletedAt, now)) {
      setDirective({
        kind: 'recovery',
        plan,
        exerciseCount,
        estimateLabel,
        suggestion: RECOVERY_SUGGESTION,
        readyAt: recoveryEndsAt(state.lastCompletedAt),
      });
    } else {
      setDirective({ kind: 'quest', plan, exerciseCount, estimateLabel });
    }

    setLoading(false);
  }, [services]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { player, directive, loading, refresh };
}

function firstUnfinishedPosition(session: WorkoutSessionDetail): number {
  const index = session.performances.findIndex(
    (performance) => performance.sets.length < performance.prescribed.sets,
  );
  return index >= 0 ? index : 0;
}
