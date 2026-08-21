import { APP_CONFIG } from '@/config/app.config';
import type { RepositoryBundle } from '@/database/repositories/interfaces';
import { coreStageForSessions, coreStageProgress } from '@/domain/coreStages';
import type { CoreStage } from '@/domain/coreStages';
import { resolveLevel } from '@/domain/levels';
import { resolvePhaseState } from '@/domain/phases';
import { weeklyProgress } from '@/domain/schedule';
import type { AppSettings, LevelState, PhaseState, PlayerProfile } from '@/domain/types';

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
  constructor(private readonly repositories: RepositoryBundle) {}

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

    await this.repositories.player.create(profile);
    await this.repositories.settings.update({
      unitSystem: input.unitSystem,
      onboardingCompleted: true,
    });

    const isoDate = now.toISOString().slice(0, 10);

    if (input.startingBodyweightKg && input.startingBodyweightKg > 0) {
      await this.repositories.measurements.add({
        id: createId('meas'),
        type: 'bodyweight',
        value: input.startingBodyweightKg,
        recordedOn: isoDate,
        createdAt: now.toISOString(),
        note: 'Starting measurement',
      });
    }

    if (input.startingWaistCm && input.startingWaistCm > 0) {
      await this.repositories.measurements.add({
        id: createId('meas'),
        type: 'waist',
        value: input.startingWaistCm,
        recordedOn: isoDate,
        createdAt: now.toISOString(),
        note: 'Starting measurement',
      });
    }

    return profile;
  }

  async getProfile(): Promise<PlayerProfile | null> {
    return this.repositories.player.get();
  }

  async updateProfile(patch: Partial<Pick<PlayerProfile, 'name' | 'avatarUri'>>): Promise<void> {
    await this.repositories.player.update(patch);
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
