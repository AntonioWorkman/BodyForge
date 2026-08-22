import { APP_CONFIG } from '@/config/app.config';
import type { RepositoryBundle } from '@/database/repositories/interfaces';
import { computeAttributes } from '@/domain/attributes';
import { countQualifyingSessions, deriveStatus } from '@/domain/mastery';
import { coreStageForSessions, coreStageProgress } from '@/domain/coreStages';
import type { CoreStage } from '@/domain/coreStages';
import { PlayerAlreadyExistsError } from '@/domain/errors';
import { todayIsoDate } from '@/domain/format';
import { resolveLevel } from '@/domain/levels';
import { resolvePhaseState } from '@/domain/phases';
import { weeklyProgress } from '@/domain/schedule';
import type {
  AppSettings,
  AttributeValue,
  LevelState,
  PhaseState,
  PlayerProfile,
  ProgressionState,
  WorkoutSessionDetail,
} from '@/domain/types';

import type { UnitOfWork } from '@/database/unitOfWork';

import type { AvatarStore } from './avatarStore';
import { createId } from './ids';

/**
 * The player read model.
 *
 * Every screen that shows a level, XP total, phase or Core stage reads this
 * object. Nothing derives those numbers independently, so they cannot disagree
 * between screens.
 */
export interface PlayerState {
  profile: PlayerProfile;
  level: LevelState;
  phase: PhaseState;
  settings: AppSettings;
  completedSessions: number;
  core: {
    stage: CoreStage;
    stageName: string;
    stageDescription: string;
    /** Progress toward the next Core stage, 0–1. */
    stageProgress: number;
  };
  week: { completed: number; target: number };
  /** When the most recent session was completed, or null for a new player. */
  lastCompletedAt: string | null;
}

export interface CreatePlayerInput {
  name: string;
  avatarUri: string | null;
  unitSystem: AppSettings['unitSystem'];
  /** Optional starting measurements, in the player's chosen units. */
  startingBodyweightKg?: number | null;
  startingWaistCm?: number | null;
}

export class PlayerService {
  constructor(
    private readonly repositories: RepositoryBundle,
    private readonly avatars: AvatarStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * Copies a picked image into app-owned storage and returns the owned URI,
   * discarding the previous owned file. Used during onboarding, where there is
   * no profile row to update yet.
   */
  async storeAvatar(sourceUri: string, previousUri: string | null = null): Promise<string> {
    const owned = await this.avatars.save(sourceUri);
    await this.avatars.remove(previousUri);
    return owned;
  }

  /**
   * Discards an avatar copied during onboarding that no profile ever claimed.
   *
   * Only app-owned files are touched; a picker URI belongs elsewhere and is
   * left alone.
   */
  async discardStoredAvatar(uri: string | null): Promise<void> {
    await this.avatars.remove(uri);
  }

  /**
   * Replaces the player's avatar: the new image is copied into app-owned
   * storage, the profile is updated, and the previous owned file is removed.
   */
  async updateAvatar(sourceUri: string): Promise<string> {
    const profile = await this.repositories.player.get();
    const previous = profile?.avatarUri ?? null;

    // This crosses the filesystem and the database, which no transaction spans,
    // so the ordering carries the guarantee instead:
    //
    //   1. copy the new file — the old one is still referenced and intact;
    //   2. point the profile at it;
    //   3. only then remove the old file.
    //
    // If step 2 fails the copy is undone, so a failure leaves the previous
    // avatar working rather than leaking a file the app can never reach again.
    const owned = await this.avatars.save(sourceUri);

    try {
      await this.repositories.player.update({ avatarUri: owned });
    } catch (error) {
      await this.avatars.remove(owned);
      throw error;
    }

    await this.avatars.remove(previous);
    return owned;
  }

  /** Creates the single player row and finishes onboarding. */
  async createPlayer(input: CreatePlayerInput, now = new Date()): Promise<PlayerProfile> {
    const profile: PlayerProfile = {
      id: 'player',
      name: input.name.trim() || APP_CONFIG.actorNoun,
      avatarUri: input.avatarUri,
      createdAt: now.toISOString(),
      totalXp: 0,
      nextTemplateRotationOrder: 0,
    };

    // The player's local calendar date, not the UTC one. Truncating an ISO
    // string records the wrong day for anyone whose offset crosses midnight,
    // and measurement entry elsewhere already uses the local helper.
    const isoDate = todayIsoDate(now);

    // One transaction: a profile written without its settings would leave an
    // onboarded player looking un-onboarded, and the retry would then duplicate
    // the starting measurements.
    await this.unitOfWork.run(async (repos) => {
      // Checked in the same boundary as the write: onboarding must create the
      // player, never replace one. Two overlapping calls would otherwise both
      // see no player, and the second would reset the first's progress.
      const existing = await repos.player.get();
      if (existing) throw new PlayerAlreadyExistsError();

      await repos.player.create(profile);
      await repos.settings.update({
        unitSystem: input.unitSystem,
        onboardingCompleted: true,
      });

      if (input.startingBodyweightKg && input.startingBodyweightKg > 0) {
        await repos.measurements.add({
          id: createId('meas'),
          type: 'bodyweight',
          value: input.startingBodyweightKg,
          recordedOn: isoDate,
          createdAt: now.toISOString(),
          note: 'Starting measurement',
        });
      }

      if (input.startingWaistCm && input.startingWaistCm > 0) {
        await repos.measurements.add({
          id: createId('meas'),
          type: 'waist',
          value: input.startingWaistCm,
          recordedOn: isoDate,
          createdAt: now.toISOString(),
          note: 'Starting measurement',
        });
      }
    });

    return profile;
  }

  /**
   * The four attributes, computed from recorded sessions and confirmed
   * progressions. Nothing here is estimated or invented.
   */
  async getAttributes(now = new Date()): Promise<AttributeValue[]> {
    const [sessions, storedStates, variations, settings] = await Promise.all([
      this.repositories.sessions.listCompleted(),
      this.repositories.progression.list(),
      this.repositories.catalog.listVariations(),
      this.repositories.settings.get(),
    ]);

    // `ready` is derived, never stored, so it has to be resolved here — reading
    // the raw rows would leave qualified variations uncounted by Mastery.
    const progressionStates = storedStates.map((state) => ({
      ...state,
      status: deriveStatus(state),
    }));

    const variationsById = new Map(variations.map((variation) => [variation.id, variation]));

    return computeAttributes(
      {
        sessions,
        progressionStates,
        variationsById,
        sessionsPerWeekTarget: settings.sessionsPerWeekTarget,
        now,
      },
      this.progressionBefore(storedStates, sessions),
    );
  }

  /**
   * Progression as it stood before the most recent completed session: anything
   * confirmed since then is rolled back, and qualifying counts are recomputed
   * without that session. This is what makes Mastery's "recent change" real
   * rather than always zero.
   */
  private progressionBefore(
    storedStates: readonly ProgressionState[],
    sessions: readonly WorkoutSessionDetail[],
  ): ProgressionState[] {
    const priorSessions = sessions.slice(0, -1);
    const lastCompletedAt = sessions[sessions.length - 1]?.completedAt ?? null;

    return storedStates.map((state) => {
      const confirmedSince =
        state.masteredAt !== null && lastCompletedAt !== null && state.masteredAt > lastCompletedAt;

      const rolledBack: ProgressionState = confirmedSince
        ? { ...state, status: 'current', masteredAt: null }
        : state;

      const qualifyingSessions = countQualifyingSessions(
        priorSessions.flatMap((session) =>
          session.performances.filter(
            (performance) => performance.variationId === state.variationId,
          ),
        ),
      );

      const before: ProgressionState = { ...rolledBack, qualifyingSessions };
      return { ...before, status: deriveStatus(before) };
    });
  }

  async getProfile(): Promise<PlayerProfile | null> {
    return this.repositories.player.get();
  }

  async updateProfile(patch: Partial<Pick<PlayerProfile, 'name' | 'avatarUri'>>): Promise<void> {
    await this.repositories.player.update(patch);
  }

  async getSettings(): Promise<AppSettings> {
    return this.repositories.settings.get();
  }

  /** Persists a settings change and returns the complete resulting settings. */
  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return this.repositories.settings.update(patch);
  }

  /** Builds the full player read model. Returns null before onboarding. */
  async getState(now = new Date()): Promise<PlayerState | null> {
    const profile = await this.repositories.player.get();
    if (!profile) return null;

    const [settings, completedSummaries] = await Promise.all([
      this.repositories.settings.get(),
      this.repositories.sessions.listCompletedSummaries(),
    ]);

    const completedSessions = completedSummaries.length;
    const completedTimestamps = completedSummaries
      .map((session) => session.completedAt)
      .filter((value): value is string => value !== null);

    const stage = coreStageForSessions(completedSessions);

    return {
      profile,
      level: resolveLevel(profile.totalXp),
      phase: resolvePhaseState(completedSessions),
      settings,
      completedSessions,
      core: {
        stage: stage.id,
        stageName: stage.name,
        stageDescription: stage.description,
        stageProgress: coreStageProgress(completedSessions),
      },
      week: weeklyProgress(completedTimestamps, now, settings.sessionsPerWeekTarget),
      lastCompletedAt: completedTimestamps[completedTimestamps.length - 1] ?? null,
    };
  }
}
