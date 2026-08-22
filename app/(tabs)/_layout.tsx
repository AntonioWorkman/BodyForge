import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';

import { colors } from '@/design';
import { TabBar } from '@/features/shell/TabBar';
import { useServices } from '@/providers/servicesContext';

/**
 * The five-tab shell.
 *
 * Main Quest is deliberately not a tab — it is launched from System and
 * presented over the shell, so the tab bar disappears during training.
 */
export default function TabsLayout() {
  const services = useServices();
  const router = useRouter();

  // A player who has not been created yet is sent straight to setup rather
  // than shown an empty shell.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const profile = await services.player.getProfile();
      if (!cancelled && !profile) router.replace('/onboarding');
    })();
    return () => {
      cancelled = true;
    };
  }, [router, services]);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'System' }} />
      <Tabs.Screen name="status" options={{ title: 'Status' }} />
      <Tabs.Screen name="skills" options={{ title: 'Skills' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
