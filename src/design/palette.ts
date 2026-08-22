/**
 * BodyForge palette.
 *
 * Three brand colors carry all identity. Everything else is a neutral derived
 * from the obsidian base — deliberately narrow so violet stays meaningful.
 * V1 is dark-only; there is no light token set to fall back to.
 */

/** Obsidian Black — the primary environment. */
const OBSIDIAN = '#08060D';
/** Royal Violet — actions, energy, active state, progression. */
const ROYAL_VIOLET = '#7C3AED';
/** Spectral Lavender — illumination, milestones, elevated state. */
const SPECTRAL_LAVENDER = '#C4A7FF';

export const palette = {
  obsidian: OBSIDIAN,
  royalViolet: ROYAL_VIOLET,
  spectralLavender: SPECTRAL_LAVENDER,
} as const;

export const colors = {
  // Environment ------------------------------------------------------------
  /** Page background. */
  background: OBSIDIAN,
  /** One step above the background — used sparingly for grouped content. */
  surface: '#100D18',
  /** Two steps above — modals, sheets, the few elevated panels. */
  surfaceRaised: '#171322',
  /** Pressed/held state for interactive surfaces. */
  surfacePressed: '#1D1829',

  // Lines ------------------------------------------------------------------
  /** Default hairline. Most structure in this app is a line, not a card. */
  border: 'rgba(196, 167, 255, 0.12)',
  /** Stronger hairline for focused or active containers. */
  borderStrong: 'rgba(196, 167, 255, 0.26)',
  /** Nearly invisible divider used inside dense lists. */
  borderSubtle: 'rgba(196, 167, 255, 0.07)',

  // Text -------------------------------------------------------------------
  /** Primary reading color. Not pure white — pure white glares on obsidian. */
  text: '#F2EFF8',
  /** Secondary copy, supporting details. */
  textSecondary: '#A29CB4',
  /** Labels, meta, timestamps. */
  textMuted: '#6E6880',
  /** Disabled controls. */
  textDisabled: '#453F53',
  /** Text placed on a violet fill. */
  textOnAccent: '#0B0710',

  // Brand ------------------------------------------------------------------
  accent: ROYAL_VIOLET,
  accentBright: '#8B5CF6',
  accentDim: '#5B2BB5',
  /** Violet at low alpha for fills that must not glow. */
  accentSoft: 'rgba(124, 58, 237, 0.16)',
  accentSofter: 'rgba(124, 58, 237, 0.08)',
  highlight: SPECTRAL_LAVENDER,
  highlightSoft: 'rgba(196, 167, 255, 0.14)',

  // Semantic ---------------------------------------------------------------
  /** Positive/completed. Kept desaturated so it reads as part of the world. */
  success: '#4ADE80',
  successSoft: 'rgba(74, 222, 128, 0.14)',
  /** Destructive actions only. */
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  /** Attention without alarm. */
  caution: '#FBBF24',

  // Scrims -----------------------------------------------------------------
  scrim: 'rgba(8, 6, 13, 0.86)',
  scrimLight: 'rgba(8, 6, 13, 0.55)',
} as const;

export type ColorToken = keyof typeof colors;
