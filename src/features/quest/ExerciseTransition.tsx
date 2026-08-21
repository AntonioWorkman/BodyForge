import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Glyph, Text } from '@/components';
import { colors, spacing } from '@/design';
import { easing, timing } from '@/motion';
import { reduceDuration, useReducedMotion } from '@/motion/useMotionPreference';

/**
 * Exercise completion.
 *
 * A short reward-level beat — around 700 ms — then straight on. Deliberately
 * not a celebration: this fires seven times per session, and anything larger
 * would wear out within a week.
 */
export function ExerciseTransition({
  exerciseName,
  isFinalExercise,
  onDone,
}: {
  exerciseName: string;
  isFinalExercise: boolean;
  onDone: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const duration = reduceDuration(timing.reward, reducedMotion);

  const mark = useSharedValue(0);

  useEffect(() => {
    mark.value = withSequence(
      withTiming(1, { duration: duration * 0.4, easing: easing.emphasized }),
      withDelay(duration * 0.4, withTiming(1, { duration: 0 })),
    );

    const id = setTimeout(onDone, duration);
    return () => clearTimeout(id);
  }, [duration, mark, onDone]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: reducedMotion ? 1 : 0.85 + mark.value * 0.15 }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(timing.interactionFast)}
      exiting={FadeOut.duration(timing.interactionFast)}
      style={styles.root}
      testID="exercise-transition"
    >
      <Animated.View style={[styles.mark, markStyle]}>
        <Glyph name="check" size={40} color="highlight" strokeWidth={2} />
      </Animated.View>

      <View style={styles.text}>
        <Text variant="systemLabel" color="highlight" uppercase align="center">
          Complete
        </Text>
        <Text variant="displaySmall" align="center">
          {exerciseName}
        </Text>
        <Text variant="caption" color="textMuted" align="center">
          {isFinalExercise ? 'Final exercise' : 'Advancing'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  mark: { alignItems: 'center', justifyContent: 'center' },
  text: { alignItems: 'center', gap: spacing.xxs },
});
