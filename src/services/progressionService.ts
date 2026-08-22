import type { RepositoryBundle } from '@/database/repositories/interfaces';
import {
  buildProgressionOffer,
  countQualifyingSessions,
  deriveStatus,
  masteryProgress,
  phaseRank,
} from '@/domain/mastery';
import type { ProgressionOffer } from '@/domain/mastery';
import type { UnitOfWork } from '@/database/unitOfWork';
import { ProgressionNotReadyError, ProgressionPhaseLockedError } from '@/domain/errors';
import { phaseForSessionCount } from '@/domain/phases';
import type {
  ExerciseVariation,
  PhaseId,
  ProgressionChain,
  ProgressionState,
  ProgressionStatus,
} from '@/domain/types';
import { XP_RULES } from '@/domain/xp';

/**
 * Progression.
 *
 * The app never unlocks a harder movement on its own. It notices that the
 * criteria are met, presents the technique standard, and waits for the player
 * to confirm. Confirmation is what moves the chain forward and pays the bonus.
 */

export interface ProgressionNode {
  variation: ExerciseVariation;
  status: ProgressionStatus;
  qualifyingSessions: number;
  /** 0–1 toward the qualifying-session requirement. */
  masteryProgress: number;
  /** Best set recorded on this variation, or null if never trained. */
  bestRecorded: number | null;
  /** Sessions in which this variation has been recorded. */
  sessionsRecorded: number;
  masteredAt: string | null;
  unlockedAt: string | null;
  /** True when the player's phase has not yet reached this variation. */
  phaseGated: boolean;
  /**
   * Set when the player has met the criteria to progress past this variation
   * but the next one is gated behind a later phase. The criteria are earned;
   * the gate is not about performance, so the UI says so rather than going
   * quiet.
   */
  progressionAwaitingPhase: PhaseId | null;
}

export interface ProgressionChainView {
  chain: ProgressionChain;
  nodes: ProgressionNode[];
  /** Index of the node the player is currently training, or -1. */
  currentIndex: number;
}

export interface ConfirmProgressionResult {
  from: ExerciseVariation;
  to: ExerciseVariation;
  xpAwarded: number;
  totalXpAfter: number;
}

export class ProgressionService {
  constructor(
    private readonly repositories: RepositoryBundle,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** The whole tree, ready for the Skills screen to lay out. */
  async getChains(): Promise<ProgressionChainView[]> {
    const [chains, variations, states, completedCount, historyByVariation] = await Promise.all([
      this.repositories.catalog.listChains(),
      this.repositories.catalog.listVariations(),
      this.repositories.progression.list(),
      this.repositories.sessions.countCompleted(),
      // Fetched once for the whole tree; querying per variation turned this
      // into forty round trips and left the screen empty for seconds.
      this.repositories.sessions.listCompletedPerformancesByVariation(),
    ]);

    const currentPhase = phaseForSessionCount(completedCount);
    const stateByVariation = new Map(states.map((state) => [state.variationId, state]));
    const variationsByChain = new Map<string, ExerciseVariation[]>();

    for (const variation of variations) {
      const list = variationsByChain.get(variation.chainId) ?? [];
      list.push(variation);
      variationsByChain.set(variation.chainId, list);
    }

    const views: ProgressionChainView[] = [];

    for (const chain of chains) {
      const chainVariations = (variationsByChain.get(chain.id) ?? []).sort(
        (a, b) => a.tier - b.tier,
      );

      const nodes: ProgressionNode[] = [];
      for (const [index, variation] of chainVariations.entries()) {
        const state = stateByVariation.get(variation.id) ?? fallbackState(variation.id);
        const history = historyByVariation.get(variation.id) ?? [];

        let best: number | null = null;
        for (const performance of history) {
          for (const set of performance.sets) {
            const value = Math.max(set.primaryValue, set.secondaryValue ?? set.primaryValue);
            best = best === null ? value : Math.max(best, value);
          }
        }

        // A variation whose criteria are met but whose successor is gated: the
        // node stays `ready`, and this records why it cannot be acted on.
        const derived = deriveStatus(state);
        const next = chainVariations[index + 1];
        const progressionAwaitingPhase =
          derived === 'ready' &&
          next !== undefined &&
          phaseRank(next.minimumPhase) > currentPhase.order
            ? next.minimumPhase
            : null;

        nodes.push({
          variation,
          status: derived,
          progressionAwaitingPhase,
          qualifyingSessions: state.qualifyingSessions,
          masteryProgress: masteryProgress(state.qualifyingSessions),
          bestRecorded: best,
          sessionsRecorded: new Set(history.map((p) => p.sessionId)).size,
          masteredAt: state.masteredAt,
          unlockedAt: state.unlockedAt,
          phaseGated: phaseOrder(variation.minimumPhase) > currentPhase.order,
        });
      }

      views.push({
        chain,
        nodes,
        currentIndex: nodes.findIndex(
          (node) => node.status === 'current' || node.status === 'ready',
        ),
      });
    }

    return views;
  }

  /** The progression offer for a variation, or null if not yet qualified. */
  /**
   * The progression offer for a variation, or null if not yet qualified.
   *
   * An offer that is earned but phase-gated is still returned, with
   * `phaseEligible: false` — the player has met the criteria and should be told
   * so, they simply cannot act on it yet.
   */
  async getOffer(variationId: string): Promise<ProgressionOffer | null> {
    const [variations, state, completedCount] = await Promise.all([
      this.repositories.catalog.listVariations(),
      this.repositories.progression.get(variationId),
      this.repositories.sessions.countCompleted(),
    ]);
    if (!state) return null;

    const variation = variations.find((candidate) => candidate.id === variationId);
    if (!variation) return null;

    const chainVariations = variations
      .filter((candidate) => candidate.chainId === variation.chainId)
      .sort((a, b) => a.tier - b.tier);

    return buildProgressionOffer(
      variation,
      state,
      chainVariations,
      phaseForSessionCount(completedCount).id,
    );
  }

  /**
   * Variations the player can act on now. Phase-gated offers are excluded —
   * they are surfaced on the Skills tree instead, where the reason is shown.
   */
  async listReadyOffers(): Promise<ProgressionOffer[]> {
    const states = await this.repositories.progression.list();
    const offers: ProgressionOffer[] = [];

    for (const state of states) {
      if (deriveStatus(state) !== 'ready') continue;
      const offer = await this.getOffer(state.variationId);
      if (offer?.phaseEligible) offers.push(offer);
    }

    return offers;
  }

  /**
   * Applies a progression the player has confirmed: the old variation becomes
   * mastered, the next becomes current, and every template that prescribed the
   * old one now prescribes the new one. Recorded history is untouched.
   */
  /**
   * Applies a progression the player has confirmed: the old variation becomes
   * mastered, the next becomes current, every template that prescribed the old
   * one now prescribes the new one, and the bonus is paid. Recorded history is
   * untouched.
   *
   * Phase eligibility is re-checked here rather than trusted from the UI — a
   * disabled button is not a correctness boundary, and this is reachable
   * directly.
   *
   * All four writes happen in one transaction: a failure partway through used
   * to be able to leave one variation mastered with nothing current, or the
   * chain moved with the bonus unpaid.
   */
  async confirmProgression(
    variationId: string,
    now = new Date(),
  ): Promise<ConfirmProgressionResult> {
    const timestamp = now.toISOString();

    // Eligibility is re-established inside the transaction. Deciding first and
    // writing afterwards let two confirmations act on the same stale offer,
    // paying the bonus twice and moving the chain twice.
    return this.unitOfWork.run(async (repos) => {
      const offer = await buildOfferFrom(repos, variationId);
      if (!offer) {
        throw new ProgressionNotReadyError(variationId);
      }

      if (!offer.phaseEligible) {
        const completedCount = await repos.sessions.countCompleted();
        throw new ProgressionPhaseLockedError(
          offer.to.name,
          offer.requiredPhase,
          phaseForSessionCount(completedCount).id,
        );
      }

      // The transition is the guard: the source must still be `current`. A
      // second confirmation finds it `mastered` and changes nothing.
      const claimed = await repos.progression.compareAndSetStatus(
        offer.from.id,
        'current',
        'mastered',
        timestamp,
      );
      if (!claimed) {
        throw new ProgressionNotReadyError(variationId);
      }

      await repos.progression.upsert({
        variationId: offer.to.id,
        status: 'current',
        qualifyingSessions: 0,
        startedAt: timestamp,
        masteredAt: null,
        unlockedAt: timestamp,
      });

      const templateExercises = await repos.catalog.listTemplateExercises();
      for (const entry of templateExercises) {
        if (entry.variationId !== offer.from.id) continue;
        await repos.catalog.replaceTemplateExerciseVariation(entry.id, offer.to.id);
      }

      const totalXpAfter = await repos.player.addXp(XP_RULES.progressionBonus);

      return {
        from: offer.from,
        to: offer.to,
        xpAwarded: XP_RULES.progressionBonus,
        totalXpAfter,
      };
    });
  }

  /**
   * Recomputes every variation's qualifying-session count from recorded
   * history. Used after an import, where stored counts cannot be trusted.
   */
  async recomputeAllMastery(): Promise<void> {
    await this.unitOfWork.run((repos) => recomputeMasteryWith(repos));
  }
}

function fallbackState(variationId: string): ProgressionState {
  return {
    variationId,
    status: 'locked',
    qualifyingSessions: 0,
    startedAt: null,
    masteredAt: null,
    unlockedAt: null,
  };
}

function phaseOrder(phase: PhaseId): number {
  return phase === 'awakening' ? 0 : phase === 'development' ? 1 : 2;
}

/**
 * Builds the offer for a variation from whichever repository bundle is given.
 *
 * Shared by `getOffer` and by `confirmProgression`, which re-derives it inside
 * the transaction so the decision and the mutation see the same state — every
 * precondition (still current, still qualified, same successor, phase reached)
 * is re-established rather than carried in from an earlier read.
 */
async function buildOfferFrom(
  repos: RepositoryBundle,
  variationId: string,
): Promise<ProgressionOffer | null> {
  const [variations, state, completedCount] = await Promise.all([
    repos.catalog.listVariations(),
    repos.progression.get(variationId),
    repos.sessions.countCompleted(),
  ]);
  if (!state) return null;

  const variation = variations.find((candidate) => candidate.id === variationId);
  if (!variation) return null;

  const chainVariations = variations
    .filter((candidate) => candidate.chainId === variation.chainId)
    .sort((a, b) => a.tier - b.tier);

  return buildProgressionOffer(
    variation,
    state,
    chainVariations,
    phaseForSessionCount(completedCount).id,
  );
}

/**
 * Recomputes every variation's qualifying-session count from recorded history.
 *
 * Takes a repository bundle so a restore can run it inside the same
 * transaction that replaced the history — the counts have to reflect the
 * sessions actually restored, and a backup's stored counts are not trusted.
 */
export async function recomputeMasteryWith(repos: RepositoryBundle): Promise<void> {
  const [states, historyByVariation] = await Promise.all([
    repos.progression.list(),
    repos.sessions.listCompletedPerformancesByVariation(),
  ]);

  for (const state of states) {
    const history = historyByVariation.get(state.variationId) ?? [];
    await repos.progression.setQualifyingSessions(
      state.variationId,
      countQualifyingSessions(history),
    );
  }
}
