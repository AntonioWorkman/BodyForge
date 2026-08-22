import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, layout, spacing } from '@/design';

import { Text } from './Text';

interface SectionLabelProps {
  children: string;
  /** Optional value shown at the far right, e.g. "2 / 7". */
  trailing?: string;
  /**
   * `system` uses the System voice — tracked Space Grotesk, violet-tinted.
   * `plain` is the functional equivalent for Settings and History.
   */
  tone?: 'system' | 'plain';
  /** Draws a hairline that runs to the end of the row. */
  rule?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The small tracked label that opens a section — "MAIN DIRECTIVE", "THIS WEEK".
 * It carries most of the app's structure, which is why it is a component
 * rather than an ad-hoc `<Text>` in every screen.
 */
export function SectionLabel({
  children,
  trailing,
  tone = 'system',
  rule = false,
  style,
}: SectionLabelProps) {
  return (
    <View style={[styles.row, style]}>
      <Text
        variant={tone === 'system' ? 'systemLabel' : 'overline'}
        color={tone === 'system' ? 'highlight' : 'textMuted'}
        uppercase
      >
        {children}
      </Text>
      {rule ? <View style={styles.rule} /> : null}
      {trailing ? (
        <Text variant="overline" color="textMuted" uppercase tabular>
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rule: {
    flex: 1,
    height: layout.hairline,
    backgroundColor: colors.borderSubtle,
  },
});
