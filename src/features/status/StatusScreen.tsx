import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { EmptyState, Glyph, ProgressBar, Screen, SectionLabel, Sheet, Text } from '@/components';
import { APP_CONFIG } from '@/config/app.config';
import { colors, layout, radius, spacing } from '@/design';
import { formatDelta } from '@/domain/format';
import type { AttributeValue } from '@/domain/types';
import { stagger, timing } from '@/motion';
import { useReducedMotion } from '@/motion/useMotionPreference';
import { useServices } from '@/providers/servicesContext';
import { usePlayerState } from '@/providers/usePlayerState';

/**
 * Status.
 *
 * Four attributes, each derived from something the player actually recorded.
 * There is no jump height, no mobility score and no power rating — the app does
 * not measure those, so it does not display them. Every attribute opens a
 * breakdown naming the real sessions behind its value.
 */
export function StatusScreen() {
  const services = useServices();
  const { state: player, refresh } = usePlayerState();
  const reducedMotion = useReducedMotion();

  const [attributes, setAttributes] = useState<AttributeValue[]>([]);
  const [selected, setSelected] = useState<AttributeValue | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        await refresh();
        const next = await services.player.getAttributes();
        if (!cancelled) setAttributes(next);
      })();
      return () => {
        cancelled = true;
      };
    }, [refresh, services]),
  );

  if (!player) return <Screen tabBarInset testID="status-loading" />;

  const enter = (index: number) =>
    reducedMotion
      ? FadeIn.duration(timing.micro)
      : FadeInDown.duration(timing.transition).delay(index * stagger.tight);

  const hasTraining = player.completedSessions > 0;

  return (
    <Screen scroll tabBarInset testID="status-screen">
      <Animated.View entering={enter(0)} style={styles.header}>
        <Text variant="systemLabel" color="highlight" uppercase>
          {APP_CONFIG.actorNoun} status
        </Text>
        <Text variant="displayXL" tabular>
          {String(player.level.level).padStart(2, '0')}
        </Text>
        <Text variant="body" color="textSecondary">
          {player.profile.name} · {player.phase.phase.name}
        </Text>
      </Animated.View>

      <Animated.View entering={enter(1)} style={styles.xp}>
        <ProgressBar progress={player.level.progress} />
        <View style={styles.xpRow}>
          <Text variant="caption" color="textMuted" tabular>
            {player.level.xpIntoLevel} / {player.level.xpForLevel} XP
          </Text>
          <Text variant="caption" color="textMuted" tabular>
            {player.level.totalXp} total
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={enter(2)} style={styles.section}>
        <SectionLabel rule>Attributes</SectionLabel>

        {hasTraining ? (
          attributes.map((attribute, index) => (
            <AttributeRow
              key={attribute.id}
              attribute={attribute}
              index={index}
              onPress={() => setSelected(attribute)}
            />
          ))
        ) : (
          <EmptyState
            title="No training data detected"
            message="Attributes are derived from workouts you have recorded. Complete your first quest to establish a baseline."
          />
        )}
      </Animated.View>

      <Animated.View entering={enter(3)} style={styles.section}>
        <SectionLabel rule>Phase</SectionLabel>
        <Text variant="displaySmall">{player.phase.phase.name}</Text>
        <Text variant="body" color="textSecondary">
          {player.phase.phase.description}
        </Text>
        <ProgressBar progress={player.phase.progress} tone="highlight" />
        <Text variant="caption" color="textMuted">
          {player.phase.sessionsInPhase
            ? `${player.phase.sessionsIntoPhase} of ${player.phase.sessionsInPhase} sessions into this phase`
            : 'Final phase'}
          {player.phase.nextPhase ? ` · next: ${player.phase.nextPhase.name}` : ''}
        </Text>
      </Animated.View>

      <Animated.View entering={enter(4)} style={styles.disclaimer}>
        <Glyph name="info" size={16} color="textMuted" />
        <Text variant="caption" color="textMuted" style={styles.disclaimerText}>
          These are {APP_CONFIG.systemName} scores derived from your recorded training. They are not
          medical or physiological measurements.
        </Text>
      </Animated.View>

      <AttributeSheet attribute={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function AttributeRow({
  attribute,
  index,
  onPress,
}: {
  attribute: AttributeValue;
  index: number;
  onPress: () => void;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View
      entering={
        reducedMotion
          ? FadeIn.duration(timing.micro)
          : FadeInDown.duration(timing.transition).delay(index * stagger.tight)
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${attribute.name}: ${attribute.value}`}
        accessibilityHint="Opens the breakdown of how this score was derived"
        onPress={onPress}
        style={({ pressed }) => [styles.attribute, pressed && styles.attributePressed]}
      >
        <View style={styles.attributeText}>
          <Text variant="bodyStrong">{attribute.name}</Text>
          <Text variant="caption" color="textMuted">
            {attribute.contributions.length}{' '}
            {attribute.contributions.length === 1 ? 'source' : 'sources'}
          </Text>
        </View>

        <View style={styles.attributeValue}>
          <Text variant="numeric" tabular>
            {attribute.value}
          </Text>
          {attribute.delta !== 0 ? (
            <Text variant="caption" color={attribute.delta > 0 ? 'success' : 'textMuted'} tabular>
              {formatDelta(attribute.delta)} last quest
            </Text>
          ) : (
            <Text variant="caption" color="textMuted">
              No change
            </Text>
          )}
        </View>

        <Glyph name="chevron-right" size={16} color="textMuted" />
      </Pressable>
    </Animated.View>
  );
}

function AttributeSheet({
  attribute,
  onClose,
}: {
  attribute: AttributeValue | null;
  onClose: () => void;
}) {
  if (!attribute) return null;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={attribute.name}
      subtitle={`${attribute.value} · ${formatDelta(attribute.delta)} since your last quest`}
      testID="attribute-sheet"
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text variant="body" color="textSecondary" style={styles.basis}>
          {attribute.basis}
        </Text>

        <SectionLabel tone="plain">What produced this</SectionLabel>

        {attribute.contributions.length === 0 ? (
          <Text variant="body" color="textMuted" style={styles.basis}>
            Nothing has contributed to this score yet.
          </Text>
        ) : (
          attribute.contributions.map((contribution, index) => (
            <View key={`${contribution.label}-${index}`} style={styles.contribution}>
              <View style={styles.contributionText}>
                <Text variant="bodyStrong">{contribution.label}</Text>
                <Text variant="caption" color="textMuted">
                  {contribution.detail}
                </Text>
              </View>
              <Text variant="captionStrong" color="highlight" tabular>
                {Math.round(contribution.points * 10) / 10}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xxs },
  xp: { marginTop: spacing.lg, gap: spacing.sm },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  section: { marginTop: spacing.xxxl, gap: spacing.md },
  attribute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
    minHeight: layout.minTouchTarget + 20,
  },
  attributePressed: { backgroundColor: colors.surfacePressed },
  attributeText: { flex: 1, gap: spacing.xxs },
  attributeValue: { alignItems: 'flex-end', gap: spacing.xxs },
  disclaimer: {
    marginTop: spacing.xxxl,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  disclaimerText: { flex: 1 },
  basis: { marginBottom: spacing.xl },
  contribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  contributionText: { flex: 1, gap: spacing.xxs },
});
