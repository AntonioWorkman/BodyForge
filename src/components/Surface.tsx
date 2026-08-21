import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, layout, radius, spacing } from '@/design';

interface SurfaceProps {
  children: ReactNode;
  /**
   * `line` is the default: a bordered region with no fill, which is how most
   * grouping in this app is done. `raised` is reserved for the few places that
   * genuinely need to sit above the page.
   */
  tone?: 'line' | 'raised' | 'accent';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A grouped region.
 *
 * Used sparingly. Most hierarchy in BodyForge comes from space and type, not
 * from nesting cards — this exists for the cases where a boundary is genuinely
 * load-bearing.
 */
export function Surface({ children, tone = 'line', padded = true, style, testID }: SurfaceProps) {
  return (
    <View
      testID={testID}
      style={[styles.base, TONES[tone], padded && styles.padded, style]}
    >
      {children}
    </View>
  );
}

const TONES = StyleSheet.create({
  line: { borderColor: colors.border, backgroundColor: 'transparent' },
  raised: { borderColor: colors.borderSubtle, backgroundColor: colors.surface },
  accent: { borderColor: colors.borderStrong, backgroundColor: colors.accentSofter },
});

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, borderWidth: layout.hairline },
  padded: { padding: spacing.lg },
});
