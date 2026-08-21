import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Glyph, Text } from '@/components';
import { colors, layout, radius, spacing } from '@/design';
import type { ProgressionStatus } from '@/domain/types';
import { easing } from '@/motion';
import { useReducedMotion } from '@/motion/useMotionPreference';
import type { ProgressionNode } from '@/services';

/**
 * One node in the tree.
 *
 * State is never carried by colour alone: locked nodes show a lock glyph and a
 * dashed border, mastered nodes show a check, and the current node is the only
 * one that carries a label. That keeps the tree readable without colour vision.
 */
const STATUS_LABEL: Record<ProgressionStatus, string> = {
  locked: 'Locked',
  available: 'Available',
  current: 'Current',
  ready: 'Ready to progress',
  mastered: 'Mastered',
};

export function SkillNode({
  node,
  width,
  height,
  onPress,
}: {
  node: ProgressionNode;
  width: number;
  height: number;
  onPress: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const isCurrent = node.status === 'current' || node.status === 'ready';

  // The single ambient animation in the tree, on the one node the player is
  // actually training. Anything more would make the screen restless.
  useEffect(() => {
    if (!isCurrent || reducedMotion) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: easing.standard }),
        withTiming(0, { duration: 2200, easing: easing.standard }),
      ),
      -1,
      false,
    );
  }, [isCurrent, pulse, reducedMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.4,
  }));

  const locked = node.status === 'locked';
  const mastered = node.status === 'mastered';
  const ready = node.status === 'ready';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${node.variation.name}, ${STATUS_LABEL[node.status]}`}
      accessibilityHint="Opens progression details"
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        { width, height },
        locked && styles.locked,
        isCurrent && styles.current,
        mastered && styles.mastered,
        pressed && styles.pressed,
      ]}
      testID={`skill-node-${node.variation.id}`}
    >
      {isCurrent ? <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" /> : null}

      <View style={styles.header}>
        {locked ? <Glyph name="locked" size={13} color="textDisabled" /> : null}
        {mastered ? <Glyph name="check" size={13} color="success" strokeWidth={2} /> : null}
        <Text
          variant="micro"
          uppercase
          color={ready ? 'highlight' : mastered ? 'success' : locked ? 'textDisabled' : 'textMuted'}
          numberOfLines={1}
        >
          {STATUS_LABEL[node.status]}
        </Text>
      </View>

      <Text variant="captionStrong" color={locked ? 'textDisabled' : 'text'} numberOfLines={2}>
        {node.variation.name}
      </Text>

      {node.bestRecorded !== null && !locked ? (
        <Text variant="micro" color="textMuted" tabular>
          Best {node.bestRecorded}
          {node.variation.measurementKind === 'time' ? 's' : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  locked: {
    borderStyle: 'dashed',
    borderColor: colors.borderSubtle,
    backgroundColor: 'transparent',
  },
  current: { borderColor: colors.accent, backgroundColor: colors.accentSofter },
  mastered: { borderColor: colors.borderSubtle, backgroundColor: colors.surface },
  pressed: { backgroundColor: colors.surfacePressed },
  glow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.accentSoft,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
