import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { Line } from 'react-native-svg';

import {
  Button,
  EmptyState,
  Glyph,
  ProgressBar,
  Screen,
  SectionLabel,
  Sheet,
  Text,
} from '@/components';
import { colors, layout, radius, spacing } from '@/design';
import { PHASES } from '@/domain/phases';
import type { PhaseId } from '@/domain/types';
import { fire as fireHaptic } from '@/motion/haptics';
import { useServices } from '@/providers/servicesContext';
import { usePlayerState } from '@/providers/usePlayerState';
import type { ProgressionChainView, ProgressionNode } from '@/services';

import { SkillNode } from './SkillNode';
import { TREE_METRICS, layoutTree } from './treeLayout';

type Zoom = 'detail' | 'overview';

/** How far the tree is scaled at each zoom level. */
const ZOOM_SCALE: Record<Zoom, number> = { detail: 1, overview: 0.68 };

/**
 * Skills.
 *
 * A connected tree rather than a list of cards: each chain is a row of linked
 * nodes running from the easiest variation to the hardest. The screen explains
 * and manages progression — it never launches a workout, because what the
 * player trains is decided by the program, not picked here.
 */
export function SkillsScreen() {
  const services = useServices();
  const { state: player, refresh } = usePlayerState();

  const [chains, setChains] = useState<ProgressionChainView[]>([]);
  const [phaseFilter, setPhaseFilter] = useState<PhaseId | null>(null);
  const [selected, setSelected] = useState<ProgressionNode | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Discrete zoom rather than pinch: pinch nested inside two scroll views is
  // unreliable, and a visible control is reachable without a gesture at all.
  const [zoom, setZoom] = useState<Zoom>('detail');

  const horizontal = useRef<ScrollView>(null);
  const vertical = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setChains(await services.progression.getChains());
    await refresh();
  }, [refresh, services]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const layout_ = useMemo(() => layoutTree(chains, phaseFilter), [chains, phaseFilter]);

  // Centre the view on what the player is currently training.
  useEffect(() => {
    if (!layout_.focus) return;
    const id = setTimeout(() => {
      horizontal.current?.scrollTo({
        x: Math.max(0, layout_.focus!.x - 160),
        animated: true,
      });
      vertical.current?.scrollTo({
        y: Math.max(0, layout_.focus!.y - 200),
        animated: true,
      });
    }, 250);
    return () => clearTimeout(id);
  }, [layout_]);

  const confirmProgression = useCallback(
    (node: ProgressionNode) => {
      Alert.alert(
        'Confirm progression',
        `Only progress when you can meet the technique standard for the next variation. ${
          node.variation.name
        } will be marked mastered and your program will move on.`,
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: 'I am ready',
            onPress: async () => {
              setConfirming(true);
              try {
                const result = await services.progression.confirmProgression(node.variation.id);
                fireHaptic('progressionUnlocked');
                setSelected(null);
                await load();
                Alert.alert(
                  'Progression unlocked',
                  `${result.to.name} is now your prescribed variation. +${result.xpAwarded} XP.`,
                );
              } catch {
                Alert.alert('Not available', 'This variation is not ready to progress.');
              } finally {
                setConfirming(false);
              }
            },
          },
        ],
      );
    },
    [load, services],
  );

  if (!player) return <Screen tabBarInset testID="skills-loading" />;

  return (
    <Screen padded={false} tabBarInset testID="skills-screen">
      <View style={styles.header}>
        <Text variant="systemLabel" color="highlight" uppercase>
          Skills
        </Text>
        <Text variant="body" color="textSecondary">
          Your movement progressions. Harder variations unlock when you confirm you can meet their
          technique standard.
        </Text>
      </View>

      <View style={styles.controls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filters}
        >
          <PhaseChip
            label="All"
            active={phaseFilter === null}
            onPress={() => setPhaseFilter(null)}
          />
          {PHASES.map((phase) => (
            <PhaseChip
              key={phase.id}
              label={phase.name}
              active={phaseFilter === phase.id}
              onPress={() => setPhaseFilter(phase.id)}
            />
          ))}
        </ScrollView>

        <PhaseChip
          label={zoom === 'detail' ? 'Fit' : 'Detail'}
          active={false}
          onPress={() => setZoom(zoom === 'detail' ? 'overview' : 'detail')}
        />
      </View>

      {layout_.nodes.length === 0 ? (
        <EmptyState
          title="Nothing in this phase"
          message="No variations are introduced in this phase. Select another filter to see your progressions."
        />
      ) : (
        <ScrollView ref={vertical} showsVerticalScrollIndicator={false}>
          <ScrollView
            ref={horizontal}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ width: layout_.width * ZOOM_SCALE[zoom] }}
          >
            <View
              style={[
                { width: layout_.width, height: layout_.height },
                zoom === 'overview' ? styles.overview : null,
              ]}
            >
              {/* Connections, drawn behind the nodes. */}
              <Svg
                width={layout_.width}
                height={layout_.height}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              >
                {layout_.edges.map((edge) => (
                  <Line
                    key={`${edge.fromId}-${edge.toId}`}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke={edge.travelled ? colors.accent : colors.borderStrong}
                    strokeWidth={edge.travelled ? 2 : 1}
                    strokeDasharray={edge.travelled ? undefined : '3 4'}
                  />
                ))}
              </Svg>

              {layout_.rows.map((row) => (
                <Text
                  key={row.chainId}
                  variant="overline"
                  color="textMuted"
                  uppercase
                  style={[styles.rowLabel, { top: row.y, left: TREE_METRICS.paddingX }]}
                >
                  {row.chainName}
                </Text>
              ))}

              {layout_.nodes.map((laid) => (
                <View
                  key={laid.node.variation.id}
                  style={[styles.nodeWrapper, { left: laid.x, top: laid.y }]}
                >
                  <SkillNode
                    node={laid.node}
                    width={laid.width}
                    height={laid.height}
                    onPress={() => setSelected(laid.node)}
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      <NodeSheet
        node={selected}
        busy={confirming}
        onClose={() => setSelected(null)}
        onConfirm={confirmProgression}
      />
    </Screen>
  );
}

function PhaseChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filter: ${label}`}
      accessibilityState={{ selected: active }}
      onPress={() => {
        fireHaptic('selection');
        onPress();
      }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text variant="captionStrong" color={active ? 'highlight' : 'textMuted'} uppercase>
        {label}
      </Text>
    </Pressable>
  );
}

function NodeSheet({
  node,
  busy,
  onClose,
  onConfirm,
}: {
  node: ProgressionNode | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (node: ProgressionNode) => void;
}) {
  if (!node) return null;

  const ready = node.status === 'ready';
  const locked = node.status === 'locked';

  return (
    <Sheet
      visible
      onClose={onClose}
      title={node.variation.name}
      subtitle={
        locked
          ? 'Locked — master the variation before this one'
          : node.phaseGated
            ? `Introduced in the ${node.variation.minimumPhase} phase`
            : undefined
      }
      testID="skill-node-sheet"
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.sheetSection}>
          <SectionLabel tone="plain">Execution</SectionLabel>
          <Text variant="body" color="textSecondary">
            {node.variation.execution}
          </Text>
        </View>

        <View style={styles.sheetSection}>
          <SectionLabel tone="plain">Technique standard</SectionLabel>
          {node.variation.formRequirements.map((requirement) => (
            <View key={requirement} style={styles.requirement}>
              <Glyph name="check" size={14} color={ready ? 'highlight' : 'textMuted'} />
              <Text variant="body" color="textSecondary" style={styles.requirementText}>
                {requirement}
              </Text>
            </View>
          ))}
        </View>

        {!locked ? (
          <View style={styles.sheetSection}>
            <SectionLabel tone="plain">Your record</SectionLabel>
            <Text variant="body" color="textSecondary">
              {node.sessionsRecorded === 0
                ? 'No sessions recorded on this variation yet.'
                : `${node.sessionsRecorded} ${
                    node.sessionsRecorded === 1 ? 'session' : 'sessions'
                  } recorded${node.bestRecorded !== null ? `, best set ${node.bestRecorded}` : ''}.`}
            </Text>

            <View style={styles.masteryBlock}>
              <ProgressBar progress={node.masteryProgress} tone={ready ? 'highlight' : 'accent'} />
              <Text variant="caption" color="textMuted">
                {node.qualifyingSessions} of 2 qualifying sessions — every prescribed set at the top
                of the range.
              </Text>
            </View>
          </View>
        ) : null}

        {ready ? (
          <View style={styles.sheetSection}>
            <Text variant="body" color="textSecondary" style={styles.readyNote}>
              {
                'You have met the criteria. The app cannot see your form, so this is your call: progress only if you can hold the technique standard above.'
              }
            </Text>
            <Button
              label={busy ? 'Confirming' : 'I am ready to progress'}
              onPress={() => onConfirm(node)}
              disabled={busy}
              haptic={null}
              testID="confirm-progression"
            />
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: layout.screenPadding,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  filterScroll: { flex: 1 },
  filters: { paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  overview: {
    transform: [{ scale: ZOOM_SCALE.overview }],
    transformOrigin: 'top left',
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.borderStrong, backgroundColor: colors.accentSofter },
  rowLabel: { position: 'absolute' },
  nodeWrapper: { position: 'absolute' },
  sheetSection: { gap: spacing.sm, marginBottom: spacing.xxl },
  requirement: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  requirementText: { flex: 1 },
  masteryBlock: { marginTop: spacing.md, gap: spacing.sm },
  readyNote: { marginBottom: spacing.md },
});
