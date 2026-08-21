import { useCallback, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { APP_CONFIG } from '@/config/app.config';
import { fire as fireHaptic } from '@/motion/haptics';
import { useServices } from '@/providers/servicesContext';

/**
 * Data export, import and reset.
 *
 * Every destructive step is confirmed, and an import is validated in full
 * before anything is written — the player sees what the file contains and what
 * it will replace before agreeing to it.
 */
export function useDataActions(onChanged: () => Promise<void>) {
  const services = useServices();
  const [busy, setBusy] = useState<'export' | 'import' | 'clear' | null>(null);

  const exportData = useCallback(async () => {
    if (busy) return;
    setBusy('export');

    try {
      const json = await services.backup.exportToJson();
      const fileName = services.backup.suggestFileName();
      const path = `${FileSystem.Paths.cache.uri}${fileName}`;

      const file = new FileSystem.File(path);
      file.write(json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          dialogTitle: `${APP_CONFIG.name} backup`,
          UTI: 'public.json',
        });
      } else if (Platform.OS === 'web') {
        await Share.share({ message: json, title: fileName });
      } else {
        Alert.alert('Backup saved', `Written to ${path}`);
      }

      fireHaptic('setComplete');
    } catch {
      Alert.alert('Export failed', 'Your backup could not be created. Nothing has changed.');
    } finally {
      setBusy(null);
    }
  }, [busy, services]);

  const importData = useCallback(async () => {
    if (busy) return;

    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'public.json', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;

    setBusy('import');

    try {
      const file = new FileSystem.File(picked.assets[0].uri);
      const raw = file.textSync();

      const validation = services.backup.validate(raw);
      if (!validation.ok) {
        Alert.alert(
          'This backup cannot be imported',
          `Nothing has been changed.\n\n${validation.errors.join('\n')}`,
        );
        return;
      }

      const { summary } = validation;
      Alert.alert(
        'Replace all data?',
        `This backup holds ${summary.sessions} completed ${
          summary.sessions === 1 ? 'quest' : 'quests'
        } and ${summary.measurements} ${
          summary.measurements === 1 ? 'measurement' : 'measurements'
        } for ${summary.playerName}.\n\nEverything currently on this device will be replaced. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              try {
                const result = await services.backup.import(raw);
                await services.progression.recomputeAllMastery();
                await onChanged();
                fireHaptic('progressionUnlocked');
                Alert.alert(
                  'Data restored',
                  `${result.sessions} quests and ${result.measurements} measurements were restored.`,
                );
              } catch {
                Alert.alert('Import failed', 'Your data could not be restored.');
              }
            },
          },
        ],
      );
    } catch {
      Alert.alert('Import failed', 'That file could not be read. Nothing has changed.');
    } finally {
      setBusy(null);
    }
  }, [busy, onChanged, services]);

  const clearData = useCallback(() => {
    if (busy) return;

    Alert.alert(
      'Clear all local data?',
      `Every recorded quest, measurement and progression on this device will be permanently deleted. ${APP_CONFIG.name} will return to its first-launch state.\n\nThis cannot be undone. Export a backup first if you want to keep it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            // A second confirmation: this is the only irreversible action in the
            // app, and a single mis-tap should not be enough to trigger it.
            Alert.alert('Are you certain?', 'There is no way to recover this data.', [
              { text: 'Keep my data', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  setBusy('clear');
                  try {
                    await services.backup.clearAll();
                    await onChanged();
                    fireHaptic('warning');
                  } catch {
                    Alert.alert('Could not clear data', 'Your data has not been changed.');
                  } finally {
                    setBusy(null);
                  }
                },
              },
            ]);
          },
        },
      ],
    );
  }, [busy, onChanged, services]);

  return { exportData, importData, clearData, busy };
}
