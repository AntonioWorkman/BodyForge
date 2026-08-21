import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Screen, SectionLabel, Text } from '@/components';
import { APP_CONFIG } from '@/config/app.config';
import { colors, layout, radius, spacing } from '@/design';
import { toStorageValue } from '@/domain/units';
import type { UnitSystem } from '@/domain/types';
import { Core } from '@/core';
import { stagger, timing } from '@/motion';
import { fire as fireHaptic } from '@/motion/haptics';
import { useReducedMotion } from '@/motion/useMotionPreference';
import { useServices } from '@/providers/servicesContext';

/**
 * First launch.
 *
 * One screen, five fields, three of them optional — the app asks only for what
 * it genuinely needs to start. There is no carousel and nothing to swipe
 * through before training can begin.
 */
export function OnboardingScreen() {
  const services = useServices();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');
  const [bodyweight, setBodyweight] = useState('');
  const [waist, setWaist] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'An avatar is optional. You can add one later from Settings.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      fireHaptic('selection');
    }
  }, []);

  const begin = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const parsedWeight = Number.parseFloat(bodyweight);
      const parsedWaist = Number.parseFloat(waist);

      await services.player.createPlayer({
        name: name.trim() || APP_CONFIG.actorNoun,
        avatarUri,
        unitSystem,
        startingBodyweightKg:
          Number.isFinite(parsedWeight) && parsedWeight > 0
            ? toStorageValue('bodyweight', parsedWeight, unitSystem)
            : null,
        startingWaistCm:
          Number.isFinite(parsedWaist) && parsedWaist > 0
            ? toStorageValue('waist', parsedWaist, unitSystem)
            : null,
      });

      fireHaptic('progressionUnlocked');
      router.replace('/(tabs)');
    } catch {
      setSubmitting(false);
      Alert.alert('Setup failed', 'Your profile could not be saved. Please try again.');
    }
  }, [avatarUri, bodyweight, name, router, services, submitting, unitSystem, waist]);

  const enter = (index: number) =>
    reducedMotion
      ? FadeIn.duration(timing.micro)
      : FadeInDown.duration(timing.transition).delay(index * stagger.standard);

  const weightUnit = unitSystem === 'metric' ? 'kg' : 'lb';
  const waistUnit = unitSystem === 'metric' ? 'cm' : 'in';

  return (
    <Screen scroll>
      <Animated.View entering={enter(0)} style={styles.header}>
        <Core stage="dormant" size={190} />
        <Text variant="systemLabel" color="highlight" uppercase align="center">
          System initialised
        </Text>
        <Text variant="body" color="textSecondary" align="center" style={styles.intro}>
          {APP_CONFIG.name} runs entirely on this device. No account, no sign-in, nothing sent
          anywhere.
        </Text>
      </Animated.View>

      <Animated.View entering={enter(1)} style={styles.section}>
        <SectionLabel>Player</SectionLabel>
        <View style={styles.identityRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={avatarUri ? 'Change avatar' : 'Add an avatar'}
            onPress={pickAvatar}
            style={styles.avatar}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text variant="micro" color="textMuted" uppercase align="center">
                Add{'\n'}photo
              </Text>
            )}
          </Pressable>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textDisabled}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={40}
            style={styles.nameInput}
            accessibilityLabel="Player name"
            returnKeyType="done"
          />
        </View>
      </Animated.View>

      <Animated.View entering={enter(2)} style={styles.section}>
        <SectionLabel>Units</SectionLabel>
        <View style={styles.choiceRow}>
          <Choice
            label="lb · in"
            selected={unitSystem === 'imperial'}
            onPress={() => setUnitSystem('imperial')}
          />
          <Choice
            label="kg · cm"
            selected={unitSystem === 'metric'}
            onPress={() => setUnitSystem('metric')}
          />
        </View>
      </Animated.View>

      <Animated.View entering={enter(3)} style={styles.section}>
        <SectionLabel trailing="Optional">Baseline</SectionLabel>
        <Text variant="caption" color="textMuted">
          Only used to chart your own trend. Leave blank to skip.
        </Text>
        <View style={styles.measureRow}>
          <MeasureField
            label="Bodyweight"
            unit={weightUnit}
            value={bodyweight}
            onChange={setBodyweight}
          />
          <MeasureField label="Waist" unit={waistUnit} value={waist} onChange={setWaist} />
        </View>
      </Animated.View>

      <Animated.View entering={enter(4)} style={styles.footer}>
        <Button
          label={submitting ? 'Initialising' : 'Begin'}
          onPress={begin}
          size="large"
          disabled={submitting}
          haptic={null}
          detail="Awakening · Workout A"
        />
      </Animated.View>
    </Screen>
  );
}

function Choice({
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
      onPress={() => {
        fireHaptic('selection');
        onPress();
      }}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text
        variant="bodyStrong"
        color={selected ? 'highlight' : 'textSecondary'}
        align="center"
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MeasureField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.measureField}>
      <Text variant="overline" color="textMuted" uppercase>
        {label}
      </Text>
      <View style={styles.measureInputRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="—"
          placeholderTextColor={colors.textDisabled}
          keyboardType="decimal-pad"
          maxLength={6}
          style={styles.measureInput}
          accessibilityLabel={`${label} in ${unit}`}
        />
        <Text variant="caption" color="textMuted">
          {unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxxl },
  intro: { maxWidth: 320, marginTop: spacing.xs },
  section: { gap: spacing.md, marginBottom: spacing.xxl },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  nameInput: {
    flex: 1,
    color: colors.text,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 22,
    paddingVertical: spacing.md,
    borderBottomWidth: layout.hairline,
    borderColor: colors.border,
  },
  choiceRow: { flexDirection: 'row', gap: spacing.md },
  choice: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  choiceSelected: { borderColor: colors.borderStrong, backgroundColor: colors.accentSofter },
  measureRow: { flexDirection: 'row', gap: spacing.xl },
  measureField: { flex: 1, gap: spacing.xs },
  measureInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    borderBottomWidth: layout.hairline,
    borderColor: colors.border,
  },
  measureInput: {
    flex: 1,
    color: colors.text,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 24,
    paddingVertical: spacing.sm,
  },
  footer: { marginTop: spacing.md },
});
