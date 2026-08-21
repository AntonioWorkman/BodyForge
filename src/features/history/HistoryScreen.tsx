import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Button, EmptyState, Glyph, Screen, SectionLabel, Sheet, Text } from '@/components';
import { colors, layout, radius, spacing } from '@/design';
import { formatFullDate, formatShortDate } from '@/domain/format';
import type { Measurement, MeasurementType, WorkoutSessionDetail } from '@/domain/types';
import { toDisplayValue, unitLabel } from '@/domain/units';
import { fire as fireHaptic } from '@/motion/haptics';
import { useServices } from '@/providers/servicesContext';
import { usePlayerState } from '@/providers/usePlayerState';
import type { ProgressionChainView } from '@/services';

import { LineChart } from './LineChart';
import {
  TIME_RANGES,
  buildMilestones,
  measurementSeries,
  rangeStart,
  strengthSeries,
} from './chartData';
import type { SeriesPoint, TimeRange } from './chartData';

/**
 * History.
 *
 * Every chart here is drawn from rows the player recorded. Where there is no
 * data, the screen says so — it never fills the space with imagery or a
 * synthesised trend. XP is deliberately absent: this screen exists to show that
 * progress is grounded in real training, not in points.
 */
export function HistoryScreen() {
  const services = useServices();
  const { state: player } = usePlayerState();

  const [range, setRange] = useState<TimeRange>('90d');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [sessions, setSessions] = useState<WorkoutSessionDetail[]>([]);
  const [chains, setChains] = useState<ProgressionChainView[]>([]);
  const [variationId, setVariationId] = useState<string | null>(null);
  const [logType, setLogType] = useState<MeasurementType | null>(null);
  const [inspecting, setInspecting] = useState<{ title: string; body: string } | null>(null);

  const load = useCallback(async () => {
    const [allMeasurements, allSessions, allChains] = await Promise.all([
      services.measurements.list(),
      services.workouts.listCompletedSessions(),
      services.progression.getChains(),
    ]);
    setMeasurements(allMeasurements);
    setSessions(allSessions);
    setChains(allChains);

    if (!variationId) {
      const trained = allChains
        .flatMap((chain) => chain.nodes)
        .find((node) => node.sessionsRecorded > 0);
      if (trained) setVariationId(trained.variation.id);
    }
  }, [services, variationId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const units = player?.settings.unitSystem ?? 'imperial';
  const from = useMemo(() => rangeStart(range, new Date()), [range]);

  const bodyweight = useMemo(
    () =>
      measurementSeries(
        measurements.filter((m) => m.type === 'bodyweight'),
        from,
        (value) => Math.round(toDisplayValue('bodyweight', value, units) * 10) / 10,
      ),
    [from, measurements, units],
  );

  const waist = useMemo(
    () =>
      measurementSeries(
        measurements.filter((m) => m.type === 'waist'),
        from,
        (value) => Math.round(toDisplayValue('waist', value, units) * 10) / 10,
      ),
    [from, measurements, units],
  );

  const strength = useMemo(
    () => (variationId ? strengthSeries(sessions, variationId, from) : null),
    [from, sessions, variationId],
  );

  const trainedNodes = useMemo(
    () =>
      chains
        .flatMap((chain) => chain.nodes)
        .filter((node) => node.sessionsRecorded > 0)
        .sort((a, b) => b.sessionsRecorded - a.sessionsRecorded),
    [chains],
  );

  const milestones = useMemo(
    () =>
      buildMilestones(
        sessions,
        chains
          .flatMap((chain) => chain.nodes)
          .filter((node) => node.masteredAt !== null)
          .map((node) => ({ variationName: node.variation.name, masteredAt: node.masteredAt! })),
      ).filter((milestone) => milestone.t >= from),
    [chains, from, sessions],
  );

  const hasAnything = measurements.length > 0 || sessions.length > 0;

  const inspectMeasurement = useCallback(
    (point: SeriesPoint, type: MeasurementType) => {
      const record = measurements.find((m) => m.id === point.sourceId);
      if (!record) return;
      setInspecting({
        title: type === 'bodyweight' ? 'Bodyweight' : 'Waist',
        body: `${point.value} ${unitLabel(type, units)} recorded on ${formatFullDate(
          record.createdAt,
        )}${record.note ? `\n\n${record.note}` : ''}`,
      });
    },
    [measurements, units],
  );

  const inspectSession = useCallback(
    (point: SeriesPoint) => {
      const session = sessions.find((candidate) => candidate.id === point.sourceId);
      if (!session) return;
      const performance = session.performances.find((p) => p.variationId === variationId);
      const setsText = performance?.sets
        .map(
          (set) =>
            `Set ${set.setNumber}: ${set.primaryValue}${
              set.secondaryValue !== null ? ` / ${set.secondaryValue}` : ''
            }`,
        )
        .join('\n');

      setInspecting({
        title: `${session.templateName} · ${formatFullDate(session.completedAt ?? session.startedAt)}`,
        body: `${performance?.variationName ?? ''}\n\n${setsText ?? 'No sets recorded.'}`,
      });
    },
    [sessions, variationId],
  );

  return (
    <Screen scroll tabBarInset testID="history-screen">
      <View style={styles.header}>
        <Text variant="systemLabel" color="highlight" uppercase>
          History
        </Text>
        <Text variant="body" color="textSecondary">
          Everything here comes from workouts and measurements you recorded.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {TIME_RANGES.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: range === option.id }}
            onPress={() => {
              fireHaptic('selection');
              setRange(option.id);
            }}
            style={[styles.chip, range === option.id && styles.chipActive]}
          >
            <Text
              variant="captionStrong"
              color={range === option.id ? 'highlight' : 'textMuted'}
              uppercase
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {!hasAnything ? (
        <EmptyState
          title="No records yet"
          message="Complete a quest or log a measurement, and your trends will appear here."
        />
      ) : null}

      {/* Body ------------------------------------------------------------- */}
      <View style={styles.section}>
        <SectionLabel tone="plain" rule>
          Bodyweight
        </SectionLabel>
        <LineChart
          series={bodyweight}
          unit={unitLabel('bodyweight', units)}
          formatDate={(t) => formatShortDate(new Date(t).toISOString())}
          onSelectPoint={(point) => inspectMeasurement(point, 'bodyweight')}
          testID="bodyweight-chart"
        />
        <Button
          label="Log bodyweight"
          variant="secondary"
          onPress={() => setLogType('bodyweight')}
        />
      </View>

      <View style={styles.section}>
        <SectionLabel tone="plain" rule>
          Waist
        </SectionLabel>
        <LineChart
          series={waist}
          unit={unitLabel('waist', units)}
          formatDate={(t) => formatShortDate(new Date(t).toISOString())}
          onSelectPoint={(point) => inspectMeasurement(point, 'waist')}
          testID="waist-chart"
        />
        <Button label="Log waist" variant="secondary" onPress={() => setLogType('waist')} />
      </View>

      {/* Strength --------------------------------------------------------- */}
      <View style={styles.section}>
        <SectionLabel tone="plain" rule>
          Strength
        </SectionLabel>

        {trainedNodes.length === 0 ? (
          <Text variant="caption" color="textMuted">
            No exercises recorded yet.
          </Text>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              {trainedNodes.map((node) => (
                <Pressable
                  key={node.variation.id}
                  accessibilityRole="button"
                  accessibilityLabel={node.variation.name}
                  accessibilityState={{ selected: variationId === node.variation.id }}
                  onPress={() => {
                    fireHaptic('selection');
                    setVariationId(node.variation.id);
                  }}
                  style={[styles.chip, variationId === node.variation.id && styles.chipActive]}
                >
                  <Text
                    variant="captionStrong"
                    color={variationId === node.variation.id ? 'highlight' : 'textMuted'}
                  >
                    {node.variation.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {strength ? (
              <>
                <LineChart
                  series={strength}
                  unit={
                    trainedNodes.find((node) => node.variation.id === variationId)?.variation
                      .measurementKind === 'time'
                      ? 'sec'
                      : 'reps'
                  }
                  formatDate={(t) => formatShortDate(new Date(t).toISOString())}
                  onSelectPoint={inspectSession}
                  testID="strength-chart"
                />
                <Text variant="caption" color="textMuted">
                  Best working set per session. For single-leg work, the weaker side counts.
                </Text>
              </>
            ) : null}
          </>
        )}
      </View>

      {/* Milestones ------------------------------------------------------- */}
      {milestones.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel tone="plain" rule>
            Milestones
          </SectionLabel>
          {milestones.map((milestone) => (
            <View key={milestone.id} style={styles.milestone}>
              <Glyph name="trend" size={16} color="highlight" />
              <View style={styles.milestoneText}>
                <Text variant="bodyStrong">{milestone.title}</Text>
                <Text variant="caption" color="textMuted">
                  {milestone.detail} · {formatShortDate(new Date(milestone.t).toISOString())}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Sessions --------------------------------------------------------- */}
      {sessions.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel tone="plain" rule trailing={`${sessions.length}`}>
            Completed quests
          </SectionLabel>
          {[...sessions]
            .reverse()
            .slice(0, 12)
            .map((session) => (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                accessibilityLabel={`${session.templateName}, ${formatShortDate(
                  session.completedAt ?? session.startedAt,
                )}`}
                onPress={() =>
                  setInspecting({
                    title: session.templateName,
                    body: session.performances
                      .map(
                        (p) =>
                          `${p.variationName}: ${p.sets
                            .map(
                              (set) =>
                                `${set.primaryValue}${
                                  set.secondaryValue !== null ? `/${set.secondaryValue}` : ''
                                }`,
                            )
                            .join(', ')}`,
                      )
                      .join('\n'),
                  })
                }
                style={({ pressed }) => [styles.sessionRow, pressed && styles.pressed]}
              >
                <View style={styles.milestoneText}>
                  <Text variant="bodyStrong">{session.templateName}</Text>
                  <Text variant="caption" color="textMuted">
                    {formatShortDate(session.completedAt ?? session.startedAt)} ·{' '}
                    {session.performances.reduce((sum, p) => sum + p.sets.length, 0)} sets
                    {session.xpAwarded !== null ? ` · +${session.xpAwarded} XP` : ''}
                  </Text>
                </View>
                <Glyph name="chevron-right" size={16} color="textMuted" />
              </Pressable>
            ))}
        </View>
      ) : null}

      <LogMeasurementSheet
        type={logType}
        units={units}
        onClose={() => setLogType(null)}
        onSaved={async () => {
          setLogType(null);
          await load();
        }}
      />

      <Sheet
        visible={inspecting !== null}
        onClose={() => setInspecting(null)}
        title={inspecting?.title ?? ''}
      >
        <Text variant="body" color="textSecondary">
          {inspecting?.body ?? ''}
        </Text>
      </Sheet>
    </Screen>
  );
}

function LogMeasurementSheet({
  type,
  units,
  onClose,
  onSaved,
}: {
  type: MeasurementType | null;
  units: 'metric' | 'imperial';
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const services = useServices();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    if (!type || saving) return;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert('Enter a value', 'Measurements must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      await services.measurements.log(type, parsed, units);
      fireHaptic('setComplete');
      setValue('');
      await onSaved();
    } catch {
      Alert.alert('Could not save', 'That measurement could not be recorded.');
    } finally {
      setSaving(false);
    }
  }, [onSaved, saving, services, type, units, value]);

  if (!type) return null;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={type === 'bodyweight' ? 'Log bodyweight' : 'Log waist'}
      subtitle={`Recorded today in ${unitLabel(type, units)}`}
      testID="log-measurement-sheet"
    >
      <View style={styles.logRow}>
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder="0.0"
          placeholderTextColor={colors.textDisabled}
          autoFocus
          maxLength={6}
          style={styles.logInput}
          accessibilityLabel={`${type} in ${unitLabel(type, units)}`}
        />
        <Text variant="displaySmall" color="textMuted">
          {unitLabel(type, units)}
        </Text>
      </View>

      <Button
        label={saving ? 'Saving' : 'Save'}
        onPress={save}
        disabled={saving}
        haptic={null}
        testID="save-measurement"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  filters: { paddingVertical: spacing.lg, gap: spacing.sm },
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
  section: { marginTop: spacing.xxl, gap: spacing.lg },
  milestone: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  milestoneText: { flex: 1, gap: spacing.xxs },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
    minHeight: layout.minTouchTarget,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  logRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    marginBottom: spacing.xxl,
    borderBottomWidth: layout.hairline,
    borderColor: colors.border,
  },
  logInput: {
    flex: 1,
    color: colors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 48,
    paddingVertical: spacing.sm,
  },
});
