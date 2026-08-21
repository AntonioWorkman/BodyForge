import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';

import { Button, Screen, SectionLabel, Sheet, Text } from '@/components';
import { APP_CONFIG } from '@/config/app.config';
import { colors, layout, radius, spacing } from '@/design';
import type { AppSettings } from '@/domain/types';
import { fire as fireHaptic } from '@/motion/haptics';
import { useSystemReducedMotion } from '@/motion/useMotionPreference';
import { useServices } from '@/providers/servicesContext';
import { usePlayerState } from '@/providers/usePlayerState';
import { useSettingsStore } from '@/stores/settingsStore';

import { ActionRow, ToggleRow, ValueRow } from './SettingsRow';
import { useDataActions } from './useDataActions';

const REST_OPTIONS = [60, 75, 90, 105, 120];
const CADENCE_OPTIONS = [2, 3, 4, 5];

/**
 * Settings.
 *
 * Restrained by design. This screen simply works — no ambient motion, no
 * signature composition, nothing to learn.
 */
export function SettingsScreen() {
  const services = useServices();
  const router = useRouter();
  const { state: player, refresh } = usePlayerState();
  const applySettings = useSettingsStore((store) => store.apply);
  const systemReducedMotion = useSystemReducedMotion();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [chooser, setChooser] = useState<'rest' | 'cadence' | 'units' | null>(null);

  const reload = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { exportData, importData, clearData, busy } = useDataActions(async () => {
    await reload();
    const profile = await services.player.getProfile();
    if (!profile) router.replace('/onboarding');
  });

  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      applySettings(patch);
      await services.player.updateSettings(patch);
      await reload();
    },
    [applySettings, reload, services],
  );

  const pickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to set an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      await services.player.updateProfile({ avatarUri: result.assets[0].uri });
      fireHaptic('selection');
      await reload();
    }
  }, [reload, services]);

  if (!player) return <Screen tabBarInset testID="settings-loading" />;

  const settings = player.settings;

  return (
    <Screen scroll tabBarInset testID="settings-screen">
      <Text variant="displayMedium" style={styles.title}>
        Settings
      </Text>

      {/* Profile ----------------------------------------------------------- */}
      <View style={styles.section}>
        <SectionLabel tone="plain" rule>
          Profile
        </SectionLabel>

        <View style={styles.profileRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change avatar"
            onPress={pickAvatar}
            style={styles.avatar}
          >
            {player.profile.avatarUri ? (
              <Image source={{ uri: player.profile.avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text variant="micro" color="textMuted" uppercase align="center">
                Add{'\n'}photo
              </Text>
            )}
          </Pressable>

          <View style={styles.profileText}>
            <Text variant="displaySmall">{player.profile.name}</Text>
            <Text variant="caption" color="textMuted">
              Level {player.level.level} · {player.phase.phase.name} · {player.completedSessions}{' '}
              {player.completedSessions === 1 ? 'quest' : 'quests'}
            </Text>
          </View>
        </View>

        <ActionRow
          label="Player name"
          value={player.profile.name}
          onPress={() => {
            setNameDraft(player.profile.name);
            setEditingName(true);
          }}
        />
      </View>

      {/* Training ---------------------------------------------------------- */}
      <View style={styles.section}>
        <SectionLabel tone="plain" rule>
          Training
        </SectionLabel>

        <ActionRow
          label="Default rest"
          description="Used when a prescription does not set its own."
          value={`${settings.defaultRestSeconds}s`}
          onPress={() => setChooser('rest')}
        />
        <ActionRow
          label="Sessions per week"
          description="What your Consistency score is measured against."
          value={String(settings.sessionsPerWeekTarget)}
          onPress={() => setChooser('cadence')}
        />
        <ActionRow
          label="Units"
          value={settings.unitSystem === 'metric' ? 'kg · cm' : 'lb · in'}
          onPress={() => setChooser('units')}
        />
        <ValueRow label="Protein target" value="120–140 g / day" />
      </View>

      {/* Experience --------------------------------------------------------- */}
      <View style={styles.section}>
        <SectionLabel tone="plain" rule>
          Experience
        </SectionLabel>

        <ToggleRow
          label="Haptics"
          description="Feedback for sets, rest and milestones."
          value={settings.hapticsEnabled}
          onChange={(value) => void update({ hapticsEnabled: value })}
        />
        <ToggleRow
          label="Follow system reduced motion"
          description={
            systemReducedMotion
              ? 'Your device currently has Reduce Motion enabled.'
              : 'Your device currently has Reduce Motion off.'
          }
          value={settings.respectSystemReducedMotion}
          onChange={(value) => void update({ respectSystemReducedMotion: value })}
        />
        <ToggleRow
          label="Reduce motion in the app"
          description="Simplifies animations regardless of your device setting."
          value={settings.motionPreference === 'reduced'}
          disabled={settings.respectSystemReducedMotion && systemReducedMotion}
          onChange={(value) => void update({ motionPreference: value ? 'reduced' : 'full' })}
        />
      </View>

      {/* Data --------------------------------------------------------------- */}
      <View style={styles.section}>
        <SectionLabel tone="plain" rule>
          Data
        </SectionLabel>

        <ActionRow
          label={busy === 'export' ? 'Exporting…' : 'Export data'}
          description="A portable JSON backup of everything you have recorded."
          onPress={exportData}
        />
        <ActionRow
          label={busy === 'import' ? 'Importing…' : 'Import data'}
          description="Validated before anything is replaced."
          onPress={importData}
        />
        <ActionRow
          label={busy === 'clear' ? 'Clearing…' : 'Clear local data'}
          description="Permanently deletes everything on this device."
          onPress={clearData}
          destructive
        />
      </View>

      {/* About -------------------------------------------------------------- */}
      <View style={styles.section}>
        <SectionLabel tone="plain" rule>
          About
        </SectionLabel>
        <ValueRow label="Version" value={APP_CONFIG.version} />
        <Text variant="caption" color="textMuted" style={styles.about}>
          {APP_CONFIG.name} is local-first and works entirely offline. Your training data is stored
          in a database on this device only — there is no account, no server, and nothing is
          uploaded anywhere. Exporting a backup is the only way data leaves the app, and you choose
          where it goes.
        </Text>
      </View>

      {/* Name editor --------------------------------------------------------- */}
      <Sheet
        visible={editingName}
        onClose={() => setEditingName(false)}
        title="Player name"
        testID="name-sheet"
      >
        <TextInput
          value={nameDraft}
          onChangeText={setNameDraft}
          autoFocus
          maxLength={40}
          autoCapitalize="words"
          style={styles.nameInput}
          accessibilityLabel="Player name"
          placeholderTextColor={colors.textDisabled}
        />
        <Button
          label="Save"
          onPress={async () => {
            await services.player.updateProfile({ name: nameDraft.trim() || APP_CONFIG.actorNoun });
            setEditingName(false);
            await reload();
          }}
        />
      </Sheet>

      {/* Choosers ------------------------------------------------------------ */}
      <Sheet
        visible={chooser !== null}
        onClose={() => setChooser(null)}
        title={
          chooser === 'rest'
            ? 'Default rest'
            : chooser === 'cadence'
              ? 'Sessions per week'
              : 'Units'
        }
        testID="settings-chooser"
      >
        {chooser === 'rest'
          ? REST_OPTIONS.map((seconds) => (
              <Option
                key={seconds}
                label={`${seconds} seconds`}
                selected={settings.defaultRestSeconds === seconds}
                onPress={async () => {
                  await update({ defaultRestSeconds: seconds });
                  setChooser(null);
                }}
              />
            ))
          : null}

        {chooser === 'cadence'
          ? CADENCE_OPTIONS.map((count) => (
              <Option
                key={count}
                label={`${count} per week`}
                selected={settings.sessionsPerWeekTarget === count}
                onPress={async () => {
                  await update({ sessionsPerWeekTarget: count });
                  setChooser(null);
                }}
              />
            ))
          : null}

        {chooser === 'units'
          ? (['imperial', 'metric'] as const).map((system) => (
              <Option
                key={system}
                label={system === 'metric' ? 'Kilograms · centimetres' : 'Pounds · inches'}
                selected={settings.unitSystem === system}
                onPress={async () => {
                  await update({ unitSystem: system });
                  setChooser(null);
                }}
              />
            ))
          : null}
      </Sheet>
    </Screen>
  );
}

function Option({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.optionPressed,
      ]}
    >
      <Text variant="body" color={selected ? 'highlight' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  section: { marginTop: spacing.xxl, gap: spacing.sm },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  profileText: { flex: 1, gap: spacing.xxs },
  about: { marginTop: spacing.md },
  nameInput: {
    color: colors.text,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 24,
    paddingVertical: spacing.md,
    borderBottomWidth: layout.hairline,
    borderColor: colors.border,
    marginBottom: spacing.xxl,
  },
  option: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minHeight: layout.minTouchTarget + 8,
    justifyContent: 'center',
  },
  optionSelected: { backgroundColor: colors.accentSofter },
  optionPressed: { backgroundColor: colors.surfacePressed },
});
