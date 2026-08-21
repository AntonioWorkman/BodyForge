import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/design';

interface ScreenProps {
  children?: ReactNode;
  /** Wraps content in a scroll view. Off for screens that must not scroll. */
  scroll?: boolean;
  /** Applies the standard horizontal gutter. */
  padded?: boolean;
  /** Extra bottom space so content clears the tab bar. */
  tabBarInset?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The page frame: obsidian background, safe-area handling on all four edges,
 * and the standard gutter. Screens compose their own hierarchy inside it
 * rather than each one re-deriving insets.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  tabBarInset = false,
  contentContainerStyle,
  style,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const paddingBottom = tabBarInset
    ? insets.bottom + layout.tabBarHeight + spacing.xl
    : insets.bottom + spacing.lg;

  const content = [
    padded ? styles.padded : null,
    { paddingTop: insets.top + spacing.md, paddingBottom },
    contentContainerStyle,
  ];

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={[styles.root, style]}
        contentContainerStyle={content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View testID={testID} style={[styles.root, ...content, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: layout.screenPadding },
});
