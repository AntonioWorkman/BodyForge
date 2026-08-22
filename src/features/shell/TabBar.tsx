import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Expo Router ships its own bottom-tabs implementation; its prop types are the
// ones the navigator actually passes, so they are imported from there.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';

import { Glyph, Text } from '@/components';
import type { GlyphName } from '@/components';
import { colors, layout, spacing } from '@/design';
import { fire as fireHaptic } from '@/motion/haptics';

/**
 * The tab bar.
 *
 * Dark, translucent and low — a boundary rather than a control panel. There is
 * no floating pill and no solid block; the blurred surface lets the obsidian
 * background carry through so the app stays immersive.
 *
 * Labels are chosen to fit at their natural size on the narrowest supported
 * phone. Nothing here truncates.
 */
const TAB_GLYPHS: Record<string, GlyphName> = {
  index: 'system',
  status: 'status',
  skills: 'skills',
  history: 'history',
  settings: 'settings',
};

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.scrim} />
      <View style={styles.hairline} />

      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const label =
            typeof options?.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options?.title ?? route.name);

          return (
            <TabItem
              key={route.key}
              label={label}
              glyph={TAB_GLYPHS[route.name] ?? 'system'}
              focused={state.index === index}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (state.index !== index && !event.defaultPrevented) {
                  fireHaptic('selection');
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/**
 * One tab.
 *
 * The active marker is derived straight from `focused` on the render path. It
 * used to cross-fade through `useDerivedValue` + `useAnimatedStyle`, which ran
 * a Hermes worklet on the display-link thread for every one of the five tabs,
 * for the whole life of the shell — and the shell is mounted from the moment
 * onboarding finishes until the app is killed. Those frames are where the iOS
 * crash aborts. The underline now appears and disappears immediately.
 *
 * The marker was never the only signal: the glyph and label change colour too,
 * and `accessibilityState.selected` carries it for assistive technology.
 */
function TabItem({
  label,
  glyph,
  focused,
  onPress,
}: {
  label: string;
  glyph: GlyphName;
  focused: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={styles.item}
    >
      <Glyph name={glyph} size={21} color={focused ? 'highlight' : 'textMuted'} />
      <Text variant="micro" color={focused ? 'highlight' : 'textMuted'} numberOfLines={1}>
        {label}
      </Text>
      {focused ? <View style={styles.marker} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 6, 13, 0.62)' },
  hairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: layout.hairline,
    backgroundColor: colors.borderSubtle,
  },
  items: { flexDirection: 'row', height: layout.tabBarHeight },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: spacing.sm,
  },
  marker: {
    position: 'absolute',
    bottom: 2,
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
});
