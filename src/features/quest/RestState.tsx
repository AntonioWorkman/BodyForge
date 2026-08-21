import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button, SectionLabel, Text } from '@/components';
import { colors, palette, spacing } from '@/design';
import { formatDuration } from '@/domain/format';
import { timing } from '@/motion';
import { fire as fireHaptic } from '@/motion/haptics';
import { useReducedMotion } from '@/motion/useMotionPreference';
import { restSecondsRemaining, useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

/**
 * The rest state.
 *
 * Rest takes over the screen rather than living in a permanent card. The
 * remaining time is drawn as a thin violet line around the perimeter, so the
 * player can read roughly how long is left from across a room without focusing
 * on small digits.
 *
 * Time comes from timestamps, so navigating away or backgrounding the app
 * leaves the countdown correct.
 */
interface RestStateProps {
  nextExerciseName: string;
  nextSetLabel: string;
  onSkip: () => void;
  onComplete: () => void;
}

/** Remaining seconds at which the perimeter intensifies. */
const FINAL_STRETCH_SECONDS = 10;

export function RestState({ nextExerciseName, nextSetLabel, onSkip, onComplete }: RestStateProps) {
  const rest = useActiveWorkoutStore((store) => store.rest);
  const pauseRest = useActiveWorkoutStore((store) => store.pauseRest);
  const resumeRest = useActiveWorkoutStore((store) => store.resumeRest);
  const extendRest = useActiveWorkoutStore((store) => store.extendRest);

  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const [remaining, setRemaining] = useState(() => Math.ceil(restSecondsRemaining(rest)));
  const paused = rest?.pausedAt !== null && rest?.pausedAt !== undefined;

  // Haptics fire from the tick rather than from a render effect, so each one
  // happens exactly once as the timer crosses its threshold.
  const warned = useRef(false);
  const finished = useRef(false);

  // A display tick only: the value is always recomputed from the stored anchor,
  // so a dropped or delayed tick cannot make the timer drift. State is written
  // only when the displayed second actually changes, which keeps this to one
  // re-render per second rather than five.
  useEffect(() => {
    const tick = () => {
      const next = Math.ceil(restSecondsRemaining(rest));

      if (!warned.current && next > 0 && next <= FINAL_STRETCH_SECONDS) {
        warned.current = true;
        fireHaptic('restEnding');
      }

      if (!finished.current && next <= 0 && rest) {
        finished.current = true;
        fireHaptic('restComplete');
        onComplete();
        return;
      }

      setRemaining((current) => (next === current ? current : next));
    };

    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [onComplete, rest]);

  const total = rest?.durationSeconds ?? 1;
  const progress = Math.min(1, Math.max(0, 1 - remaining / total));
  const finalStretch = remaining <= FINAL_STRETCH_SECONDS && remaining > 0;

  const perimeter = useMemo(() => buildPerimeterPath(width, height), [width, height]);

  return (
    <Animated.View
      entering={FadeIn.duration(reducedMotion ? timing.micro : timing.transition)}
      exiting={FadeOut.duration(timing.interactionFast)}
      style={styles.root}
      testID="rest-state"
    >
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* The full track, barely visible — it exists to show where time runs. */}
        <Path
          path={perimeter}
          style="stroke"
          strokeWidth={2}
          color={withAlpha(palette.royalViolet, 0.16)}
        />
        {/* Elapsed time, drawn as the line closing around the screen. */}
        <Path
          path={perimeter}
          style="stroke"
          strokeWidth={finalStretch ? 4 : 2.5}
          strokeCap="round"
          color={withAlpha(
            finalStretch ? palette.spectralLavender : palette.royalViolet,
            finalStretch ? 0.95 : 0.7,
          )}
          start={0}
          end={progress}
        />
      </Canvas>

      <View style={styles.content}>
        <SectionLabel>{paused ? 'Rest · paused' : 'Rest'}</SectionLabel>

        <Text
          variant="displayXL"
          tabular
          align="center"
          color={finalStretch ? 'highlight' : 'text'}
          style={styles.clock}
          accessibilityLabel={`${remaining} seconds remaining`}
        >
          {formatDuration(remaining)}
        </Text>

        <View style={styles.next}>
          <Text variant="overline" color="textMuted" uppercase align="center">
            Next
          </Text>
          <Text variant="displaySmall" align="center">
            {nextExerciseName}
          </Text>
          <Text variant="caption" color="textSecondary" align="center">
            {nextSetLabel}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <Button
            label="+30 sec"
            variant="secondary"
            onPress={() => extendRest(30)}
            style={styles.control}
            testID="rest-extend"
          />
          <Button
            label={paused ? 'Resume' : 'Pause'}
            variant="secondary"
            onPress={() => (paused ? resumeRest() : pauseRest())}
            style={styles.control}
            testID="rest-pause"
          />
        </View>
        <Button label="Skip rest" variant="ghost" onPress={onSkip} testID="rest-skip" />
      </View>
    </Animated.View>
  );
}

/**
 * A rounded-rectangle path just inside the screen edge, starting at top centre
 * so the line closes symmetrically as time runs out.
 */
function buildPerimeterPath(width: number, height: number) {
  const inset = 3;
  const radius = 44;
  const path = Skia.Path.Make();

  const left = inset;
  const right = width - inset;
  const top = inset;
  const bottom = height - inset;
  const midX = width / 2;

  path.moveTo(midX, top);
  path.lineTo(right - radius, top);
  path.quadTo(right, top, right, top + radius);
  path.lineTo(right, bottom - radius);
  path.quadTo(right, bottom, right - radius, bottom);
  path.lineTo(left + radius, bottom);
  path.quadTo(left, bottom, left, bottom - radius);
  path.lineTo(left, top + radius);
  path.quadTo(left, top, left + radius, top);
  path.close();

  return path;
}

function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${byte}`;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.massive,
  },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  clock: { fontSize: 76, lineHeight: 80 },
  next: { alignItems: 'center', gap: spacing.xxs },
  controls: { gap: spacing.md },
  controlRow: { flexDirection: 'row', gap: spacing.md },
  control: { flex: 1 },
});
