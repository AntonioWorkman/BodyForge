import { StyleSheet, Text as RNText } from 'react-native';
import type { TextProps as RNTextProps, TextStyle } from 'react-native';

import { colors, textVariants } from '@/design';
import type { ColorToken, TextVariant } from '@/design';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** A palette token. Raw color strings are deliberately not accepted. */
  color?: ColorToken;
  /** Uppercases the content. Used by System labels, which are tracked wide. */
  uppercase?: boolean;
  align?: TextStyle['textAlign'];
  /** Fixed-width digits so counters and timers do not shift as they change. */
  tabular?: boolean;
}

/**
 * The only text component in the app.
 *
 * Every size, weight and family comes from a named variant, so no screen can
 * invent its own type scale. Font scaling is capped rather than disabled: text
 * still grows for players who need it, but a 200% setting cannot break a
 * one-handed workout layout.
 */
export function Text({
  variant = 'body',
  color = 'text',
  uppercase = false,
  align,
  tabular = false,
  style,
  children,
  ...rest
}: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[
        textVariants[variant],
        { color: colors[color] },
        uppercase && styles.uppercase,
        tabular && styles.tabular,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  uppercase: { textTransform: 'uppercase' },
  tabular: { fontVariant: ['tabular-nums'] },
});
