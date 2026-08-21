import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Glyph, ProgressBar, Screen, SectionLabel, Text } from '@/components';
import { colors, layout, radius, spacing } from '@/design';
import { Core } from '@/core';
import { stagger, timing } from '@/motion';
import { useReducedMotion } from '@/motion/useMotionPreference';
import { fire as fireHaptic } from '@/motion/haptics';

import { useSystemScreen } from './useSystemScreen';
import type { SystemDirective } from './useSystemScreen';
import { WeekIndicator } from './WeekIndicator';

/**
 * System.
 *
 * One dominant idea: the Core, with the player's state written around it as
 * type rather than as cards. The screen answers what to do next and where the
 * player is, and nothing else competes for attention.
 */
export function SystemScreen() {
  const { player, directive, loading, refresh } = useSystemScreen();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [coreTaps, setCoreTaps] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const startQuest = useCallback(async () => {
    if (!directive) return;
    if (directive.kind === 'resume') {
      router.push('/quest/active');
      return;
    }
    router.push({ pathname: '/quest/active', params: { templateId: directive.plan.template.id } });
  }, [directive, router]);

  if (loading || !player) {
    return <Screen tabBarInset testID="system-loading" />;
  }

  const enter = (index: number) =>
    reducedMotion
      ? FadeIn.duration(timing.micro)
      : FadeInDown.duration(timing.transition).delay(index * stagger.tight);

  // Bounded by height as well as width so the directive and its call to action
  // stay above the fold on shorter phones.
  const coreSize = Math.min(width - layout.screenPadding * 2, height * 0.3, 300);
  const isNewPlayer = player.completedSessions === 0;

  return (
    <Screen scroll tabBarInset testID="system-screen">
      {/* Identity ---------------------------------------------------------- */}
      <Animated.View entering={enter(0)} style={styles.identity}>
        <View style={styles.identityText}>
          <Text variant="overline" color="textMuted" uppercase numberOfLines={1}>
            {player.profile.name}
          </Text>
          <Text variant="displayMedium" tabular>
            LVL {String(player.level.level).padStart(2, '0')}
          </Text>
          <Text variant="systemLabel" color="highlight" uppercase>
            {player.phase.phase.name}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={() => router.push('/(tabs)/settings')}
          style={styles.avatar}
        >
          {player.profile.avatarUri ? (
            <Image source={{ uri: player.profile.avatarUri }} style={styles.avatarImage} />
          ) : (
            <Glyph name="status" size={20} color="textMuted" />
          )}
        </Pressable>
      </Animated.View>

      {/* XP ---------------------------------------------------------------- */}
      <Animated.View entering={enter(1)} style={styles.xp}>
        <ProgressBar
          progress={player.level.progress}
          accessibilityLabel={`Experience: ${player.level.xpIntoLevel} of ${player.level.xpForLevel}`}
        />
        <View style={styles.xpRow}>
          <Text variant="caption" color="textMuted" tabular>
            {player.level.xpIntoLevel} / {player.level.xpForLevel} XP
          </Text>
          <Text variant="caption" color="textMuted" tabular>
            {player.level.totalXp} total
          </Text>
        </View>
      </Animated.View>

      {/* The Core ---------------------------------------------------------- */}
      <Animated.View entering={enter(2)} style={styles.core}>
        <Core
          stage={player.core.stage}
          stageProgress={player.core.stageProgress}
          charge={player.level.progress}
          size={coreSize}
          onTap={() => {
            fireHaptic('selection');
            setCoreTaps((count) => count + 1);
          }}
          testID="system-core"
        />
        <Text variant="overline" color="textMuted" uppercase align="center">
          {player.core.stageName}
        </Text>
        {coreTaps > 0 ? (
          <Animated.View entering={FadeIn.duration(timing.interaction)}>
            <Text variant="caption" color="textMuted" align="center" style={styles.coreNote}>
              {player.core.stageDescription}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      {/* Directive --------------------------------------------------------- */}
      <Animated.View entering={enter(3)} style={styles.directive}>
        <SectionLabel rule>Main directive</SectionLabel>
        {directive ? (
          <DirectiveBlock directive={directive} isNewPlayer={isNewPlayer} onStart={startQuest} />
        ) : (
          <Text variant="body" color="textSecondary">
            No workout is available. Restore a backup or reset your data from Settings.
          </Text>
        )}
      </Animated.View>

      {/* This week --------------------------------------------------------- */}
      <Animated.View entering={enter(4)} style={styles.week}>
        <SectionLabel trailing={`${player.week.completed} / ${player.week.target}`} rule>
          This week
        </SectionLabel>
        <WeekIndicator completed={player.week.completed} target={player.week.target} />
        {isNewPlayer ? (
          <Text variant="caption" color="textMuted">
            No training data detected.
          </Text>
        ) : (
          <Text variant="caption" color="textMuted">
            {player.completedSessions} {player.completedSessions === 1 ? 'quest' : 'quests'}{' '}
            completed · {player.phase.phase.purpose}
          </Text>
        )}
      </Animated.View>
    </Screen>
  );
}

function DirectiveBlock({
  directive,
  isNewPlayer,
  onStart,
}: {
  directive: SystemDirective;
  isNewPlayer: boolean;
  onStart: () => void;
}) {
  if (directive.kind === 'resume') {
    const { session, exerciseIndex, exerciseCount } = directive;
    return (
      <View style={styles.directiveBody}>
        <Text variant="displayMedium">{session.templateName}</Text>
        <Text variant="body" color="textSecondary">
          {session.templateFocus}
        </Text>
        <Text variant="caption" color="highlight">
          In progress · Exercise {Math.min(exerciseIndex + 1, exerciseCount)} of {exerciseCount}
        </Text>
        <Button
          label="Resume quest"
          onPress={onStart}
          size="large"
          haptic="setComplete"
          style={styles.cta}
          testID="resume-quest"
        />
      </View>
    );
  }

  const { plan, exerciseCount, estimateLabel } = directive;

  return (
    <View style={styles.directiveBody}>
      <Text variant="displayMedium">{plan.template.name}</Text>
      <Text variant="body" color="textSecondary">
        {plan.template.focus}
      </Text>
      <Text variant="caption" color="textMuted">
        {exerciseCount} exercises · about {estimateLabel}
      </Text>

      {directive.kind === 'recovery' ? (
        <Text variant="caption" color="highlight" style={styles.recovery}>
          Recovery recommended · {directive.suggestion}
        </Text>
      ) : null}

      <Button
        label={isNewPlayer ? 'Begin first quest' : 'Begin quest'}
        onPress={onStart}
        size="large"
        haptic="setComplete"
        variant={directive.kind === 'recovery' ? 'secondary' : 'primary'}
        style={styles.cta}
        testID="begin-quest"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  identityText: { flex: 1, gap: spacing.xxs },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  xp: { marginTop: spacing.xl, gap: spacing.sm },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  core: { alignItems: 'center', marginTop: spacing.md, gap: spacing.xs },
  coreNote: { maxWidth: 280, marginTop: spacing.xxs },
  directive: { marginTop: spacing.xl, gap: spacing.md },
  directiveBody: { gap: spacing.xs },
  recovery: { marginTop: spacing.sm },
  cta: { marginTop: spacing.lg },
  week: { marginTop: spacing.xxxl, gap: spacing.md },
});
