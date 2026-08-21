import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, EmptyState, Screen, SectionLabel, Text } from '@/components';
import { Core } from '@/core';
import { colors, layout, radius, spacing } from '@/design';
import { formatDuration } from '@/domain/format';
import { resolveLevel } from '@/domain/levels';
import { stagger, timing } from '@/motion';
import { fire as fireHaptic } from '@/motion/haptics';
import { useReducedMotion } from '@/motion/useMotionPreference';
import { useServices } from '@/providers/servicesContext';
import type { PlayerState, QuestCompleteSummary } from '@/services';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

/**
 * Quest Complete.
 *
 * The screen quiets down, the Core emerges, and the session's real numbers are
 * revealed in sequence. Everything shown here is recorded fact — sets actually
 * logged, XP actually awarded, bests actually beaten. Nothing is embellished,
 * and the whole sequence is short enough to still be welcome on the hundredth
 * workout.
 */
export function QuestCompleteScreen() {
  const services = useServices();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const clearWorkout = useActiveWorkoutStore((store) => store.clear);

  const [summary, setSummary] = useState<QuestCompleteSummary | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [nextDirective, setNextDirective] = useState<string>('Recovery');
  const [error, setError] = useState<string | null>(null);

  // The session is completed and saved here, before anything is displayed —
  // the player never has to reach this screen for their work to be recorded.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const sessionId = params.sessionId;
        if (!sessionId) throw new Error('missing session');

        const result = await services.workouts.completeSession(sessionId);
        if (cancelled) return;

        setSummary(result);
        fireHaptic('questComplete');

        const state = await services.player.getState();
        const plan = await services.workouts.getNextPlan();
        if (cancelled) return;

        setPlayer(state);
        setNextDirective(plan ? `${plan.template.name} · ${plan.template.focus}` : 'Recovery');
        clearWorkout();
      } catch {
        if (!cancelled) setError('This quest has already been recorded.');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Completion must run exactly once for this session id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sessionId]);

  const finish = useCallback(() => {
    clearWorkout();
    router.replace('/(tabs)');
  }, [clearWorkout, router]);

  if (error) {
    return (
      <Screen>
        <EmptyState title="Nothing to record" message={error} />
        <Button label="Back to System" onPress={finish} />
      </Screen>
    );
  }

  if (!summary || !player) return <Screen testID="quest-complete-loading" />;

  const enter = (index: number) =>
    reducedMotion
      ? FadeIn.duration(timing.micro)
      : FadeInDown.duration(timing.transition).delay(300 + index * stagger.loose);

  const levelBefore = resolveLevel(summary.levelBefore).level;
  const levelAfter = resolveLevel(summary.levelAfter).level;
  const leveledUp = levelAfter > levelBefore;

  return (
    <Screen scroll testID="quest-complete">
      {/* The Core emerges into a quiet screen. */}
      <Animated.View
        entering={FadeIn.duration(reducedMotion ? timing.micro : timing.milestone)}
        style={styles.coreBlock}
      >
        <Core
          stage={player.core.stage}
          stageProgress={player.core.stageProgress}
          charge={1}
          size={Math.min(width - layout.screenPadding * 2, 240)}
        />
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(reducedMotion ? timing.micro : timing.milestoneFast).delay(200)}
        style={styles.title}
      >
        <Text variant="displayLarge" align="center">
          QUEST COMPLETE
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          {summary.session.templateName} · {summary.session.templateFocus}
        </Text>
      </Animated.View>

      {/* What actually happened ------------------------------------------- */}
      <Animated.View entering={enter(0)} style={styles.facts}>
        <Fact
          value={`${summary.completedExercises} / ${summary.totalExercises}`}
          label="Exercises"
        />
        <Fact value={String(summary.workingSets)} label="Working sets" />
        <Fact value={formatDuration(summary.durationSeconds)} label="Duration" />
      </Animated.View>

      {/* XP ---------------------------------------------------------------- */}
      <Animated.View entering={enter(1)} style={styles.xpBlock}>
        <Text variant="displayMedium" color="highlight" align="center" tabular>
          +{summary.xp.total} XP
        </Text>
        <View style={styles.xpLines}>
          {summary.xp.lineItems.map((item) => (
            <View key={item.id} style={styles.xpLine}>
              <Text variant="caption" color="textSecondary" style={styles.xpLabel}>
                {item.label}
              </Text>
              <Text variant="caption" color="textMuted" style={styles.xpDetail} numberOfLines={1}>
                {item.detail}
              </Text>
              <Text variant="captionStrong" color="textSecondary" tabular>
                +{item.xp}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {leveledUp ? (
        <Animated.View entering={enter(2)} style={styles.milestone}>
          <Text variant="systemLabel" color="highlight" uppercase align="center">
            Level up
          </Text>
          <Text variant="numeric" align="center" tabular>
            LVL {String(levelAfter).padStart(2, '0')}
          </Text>
        </Animated.View>
      ) : null}

      {/* Improvements and bests -------------------------------------------- */}
      {summary.improvements > 0 || summary.personalBests.length > 0 ? (
        <Animated.View entering={enter(3)} style={styles.section}>
          {summary.improvements > 0 ? (
            <Text variant="bodyStrong" color="text">
              {summary.improvements} {summary.improvements === 1 ? 'improvement' : 'improvements'}{' '}
              on your last session
            </Text>
          ) : null}

          {summary.personalBests.map((best) => (
            <View key={best.variationId} style={styles.best}>
              <Text variant="overline" color="highlight" uppercase>
                Personal best
              </Text>
              <Text variant="bodyStrong">
                {best.variationName} · {best.bestSetValue}
                {best.measurementKind === 'time' ? 's' : ''}
              </Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      {/* Progression available --------------------------------------------- */}
      {summary.progressionsAvailable.length > 0 ? (
        <Animated.View entering={enter(4)} style={styles.progression}>
          <SectionLabel>Progression available</SectionLabel>
          {summary.progressionsAvailable.map((item) => (
            <Text key={item.variationId} variant="bodyStrong">
              {item.variationName}
            </Text>
          ))}
          <Text variant="caption" color="textMuted">
            Review the technique requirements in Skills before you progress.
          </Text>
        </Animated.View>
      ) : null}

      {summary.phaseAdvanced ? (
        <Animated.View entering={enter(5)} style={styles.milestone}>
          <Text variant="systemLabel" color="highlight" uppercase align="center">
            Phase advanced
          </Text>
          <Text variant="displaySmall" align="center">
            {player.phase.phase.name}
          </Text>
          <Text variant="caption" color="textSecondary" align="center">
            {player.phase.phase.purpose}
          </Text>
        </Animated.View>
      ) : null}

      {/* Next -------------------------------------------------------------- */}
      <Animated.View entering={enter(6)} style={styles.next}>
        <SectionLabel rule>Next directive</SectionLabel>
        <Text variant="displaySmall">Recovery</Text>
        <Text variant="caption" color="textSecondary">
          A 30–45 minute walk. Then {nextDirective}.
        </Text>
      </Animated.View>

      <Animated.View entering={enter(7)}>
        <Button
          label="Return to System"
          onPress={finish}
          size="large"
          testID="quest-complete-done"
        />
      </Animated.View>
    </Screen>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="numeric" align="center" tabular>
        {value}
      </Text>
      <Text variant="overline" color="textMuted" uppercase align="center">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  coreBlock: { alignItems: 'center', marginTop: spacing.xl },
  title: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  facts: { flexDirection: 'row', marginTop: spacing.huge, gap: spacing.md },
  fact: { flex: 1, gap: spacing.xxs },
  xpBlock: { marginTop: spacing.huge, gap: spacing.lg },
  xpLines: { gap: spacing.sm },
  xpLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  xpLabel: { minWidth: 110 },
  xpDetail: { flex: 1 },
  milestone: {
    marginTop: spacing.xxl,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentSofter,
    gap: spacing.xxs,
  },
  section: { marginTop: spacing.xxl, gap: spacing.md },
  best: { gap: spacing.xxs },
  progression: { marginTop: spacing.xxl, gap: spacing.sm },
  next: { marginTop: spacing.huge, gap: spacing.sm, marginBottom: spacing.xxl },
});
