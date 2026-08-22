import { Stack } from 'expo-router';

import { colors } from '@/design';

/** The quest flow is presented over the tab shell, so no tab bar is visible. */
export default function QuestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="active" />
      <Stack.Screen name="complete" options={{ animation: 'fade' }} />
    </Stack>
  );
}
