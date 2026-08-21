import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { colors, elevation, layout, radius, spacing } from '@/design';
import { timing } from '@/motion';
import { useReducedMotion } from '@/motion/useMotionPreference';

import { Glyph } from './Glyph';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Optional line under the title. */
  subtitle?: string;
  children: ReactNode;
  testID?: string;
}

/**
 * A bottom sheet.
 *
 * Used for the exercise list, progression details and measurement entry — the
 * places where a full screen change would lose the player's context. Dismissal
 * is available three ways: the close control, the scrim, and the system back
 * gesture, so nothing essential sits behind a swipe alone.
 */
export function Sheet({ visible, onClose, title, subtitle, children, testID }: SheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const entering = reducedMotion ? FadeIn.duration(timing.micro) : SlideInDown.duration(timing.interaction);
  const exiting = reducedMotion ? FadeOut.duration(timing.micro) : SlideOutDown.duration(timing.interactionFast);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root} testID={testID}>
        <Animated.View entering={FadeIn.duration(timing.interactionFast)} exiting={FadeOut} style={styles.scrimLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={styles.scrim}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          entering={entering}
          exiting={exiting}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="displaySmall">{title}</Text>
              {subtitle ? (
                <Text variant="caption" color="textMuted" style={styles.subtitle}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <IconButton name="close" onPress={onClose} accessibilityLabel="Close" tone="muted" />
          </View>

          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** A tappable row inside a sheet, for lists of exercises or options. */
export function SheetRow({
  title,
  detail,
  meta,
  onPress,
  active = false,
  complete = false,
  disabled = false,
}: {
  title: string;
  detail?: string;
  meta?: string;
  onPress?: () => void;
  active?: boolean;
  complete?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowText}>
        <Text variant="bodyStrong" color={disabled ? 'textDisabled' : active ? 'highlight' : 'text'}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" color="textMuted">
            {detail}
          </Text>
        ) : null}
      </View>

      {meta ? (
        <Text variant="captionStrong" color={complete ? 'success' : 'textMuted'} tabular>
          {meta}
        </Text>
      ) : null}
      {complete ? <Glyph name="check" size={16} color="success" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrimLayer: { ...StyleSheet.absoluteFill },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: layout.hairline,
    borderColor: colors.border,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    maxHeight: '86%',
    ...elevation.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  headerText: { flex: 1 },
  subtitle: { marginTop: spacing.xxs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minHeight: layout.minTouchTarget + 8,
  },
  rowActive: { backgroundColor: colors.accentSofter },
  rowPressed: { backgroundColor: colors.surfacePressed },
  rowText: { flex: 1, gap: spacing.xxs },
});
