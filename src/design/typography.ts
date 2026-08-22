/**
 * Type system.
 *
 * Space Grotesk carries System voice — display numbers, quest titles, milestone
 * messaging. Inter carries everything functional. Font families are referenced
 * by these constants only; see `src/design/fonts.ts` for loading.
 */

export const fontFamily = {
  displayRegular: 'SpaceGrotesk_400Regular',
  displayMedium: 'SpaceGrotesk_500Medium',
  displayBold: 'SpaceGrotesk_700Bold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

export type FontFamilyToken = keyof typeof fontFamily;

/**
 * Named text roles. Every piece of text in the app should map to one of these
 * rather than inventing a local size/weight pair.
 */
export const textVariants = {
  /** Level numbers, timer digits — the largest thing on a screen. */
  displayXL: {
    fontFamily: fontFamily.displayBold,
    fontSize: 64,
    lineHeight: 66,
    letterSpacing: -2,
  },
  /** Exercise name on Main Quest, QUEST COMPLETE. */
  displayLarge: {
    fontFamily: fontFamily.displayBold,
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.2,
  },
  /** Section-leading display text, workout name. */
  displayMedium: {
    fontFamily: fontFamily.displayBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  /** Card/screen titles in System voice. */
  displaySmall: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  /** Major statistic values inside dense layouts. */
  numeric: {
    fontFamily: fontFamily.displayBold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.8,
  },
  /** Small tracked System label — "MAIN DIRECTIVE", "THIS WEEK". */
  systemLabel: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2.4,
  },
  /** Same role as systemLabel but for the functional half of the app. */
  overline: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.6,
  },
  bodyLarge: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 17,
    lineHeight: 25,
    letterSpacing: 0,
  },
  body: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  captionStrong: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  /** Button text and other controls. */
  action: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.8,
  },
  /** Tab bar and other minimal labels. */
  micro: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.4,
  },
} as const;

export type TextVariant = keyof typeof textVariants;
