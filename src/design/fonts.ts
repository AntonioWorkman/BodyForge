import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';

/**
 * The exact font assets the design system references. Keys must match the
 * family names in `typography.ts` — nothing else in the app names a font.
 */
export const appFontMap = {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
};

/**
 * Loads the brand fonts. The app holds its splash screen until this resolves so
 * text never renders in a system fallback first.
 */
export function useAppFonts(): { loaded: boolean; error: Error | null } {
  const [loaded, error] = useFonts(appFontMap);
  return { loaded, error: error ?? null };
}
