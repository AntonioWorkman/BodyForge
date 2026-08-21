/**
 * Spacing, radii, and structural constants.
 *
 * Spacing is a 4pt scale. Screens lean on `screenPadding` and generous vertical
 * rhythm rather than nesting cards inside cards.
 */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  massive: 56,
} as const;

export type SpacingToken = keyof typeof spacing;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const layout = {
  /** Horizontal gutter for every full-width screen. */
  screenPadding: 20,
  /** Minimum touch target per platform accessibility guidance. */
  minTouchTarget: 44,
  /** Comfortable one-handed target for in-workout controls. */
  workoutTouchTarget: 64,
  /** Height of the tab bar content, excluding the bottom safe-area inset. */
  tabBarHeight: 56,
  /** Hairline width that survives on high-density screens. */
  hairline: 1,
} as const;

/**
 * The app is intentionally card-light. When a surface is genuinely warranted
 * these presets keep it consistent instead of every screen inventing one.
 */
export const elevation = {
  /** No shadow at all — the default. Depth comes from value, not blur. */
  flat: {},
  /** Sheets and modals only. */
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
} as const;
