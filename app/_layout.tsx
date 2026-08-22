import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';

import { Button, Text } from '@/components';
import { APP_CONFIG } from '@/config/app.config';
import { colors, layout, spacing } from '@/design';
import { useAppFonts } from '@/design/fonts';
import { ServicesProvider } from '@/providers/ServicesProvider';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(colors.background);

/**
 * Root layout.
 *
 * Holds the splash screen until the brand fonts have actually loaded, so no
 * text ever renders in a system fallback first, then boots the database behind
 * the same screen.
 */
export default function RootLayout() {
  const { loaded: fontsLoaded, error: fontError } = useAppFonts();
  const [servicesReady, setServicesReady] = useState(false);
  const ready = (fontsLoaded || fontError !== null) && servicesReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ServicesProvider
          fallback={<BootScreen />}
          renderError={(error, retry) => <BootError message={error.message} onRetry={retry} />}
          onReady={() => setServicesReady(true)}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ animation: 'none' }} />
            <Stack.Screen
              name="quest"
              options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
            />
          </Stack>
        </ServicesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function BootScreen() {
  return (
    <View style={styles.boot}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.boot}>
      <Text variant="systemLabel" color="danger" uppercase align="center">
        System failed to initialise
      </Text>
      <Text variant="body" color="textSecondary" align="center" style={styles.bootMessage}>
        {APP_CONFIG.name} could not open its local database. Your data has not been changed.
      </Text>
      <Text variant="caption" color="textMuted" align="center">
        {message}
      </Text>
      <Button label="Try again" onPress={onRetry} style={styles.bootButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  boot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPadding,
    gap: spacing.md,
  },
  bootMessage: { maxWidth: 320 },
  bootButton: { marginTop: spacing.lg, alignSelf: 'stretch', maxWidth: 320 },
});
