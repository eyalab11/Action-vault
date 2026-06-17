import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { analyzeUrl } from './api';
import { normalizeUrl } from './dedup';

type ShareAnalyzeTaskData = {
  sharedText?: string;
};

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

function nowMs() {
  return Date.now();
}

const INFLOW_TTL_MS = 2 * 60_000;

/**
 * Android Headless JS task.
 * Triggered by `ShareAnalyzeService` when user shares a link to ActionVault.
 */
export async function shareAnalyzeTask(data: ShareAnalyzeTaskData): Promise<void> {
  const sharedText = data?.sharedText;
  if (!sharedText) return;

  const url = extractFirstUrl(sharedText);
  if (!url) return;

  const normalized = normalizeUrl(url);
  if (!normalized) return;

  // Local in-flight guard: avoid double-processing when Android delivers the share twice.
  const lockKey = `shareAnalyzeInflight:${normalized}`;
  const prev = await AsyncStorage.getItem(lockKey).catch(() => null);
  const prevTs = prev ? Number(prev) : 0;
  if (prevTs && nowMs() - prevTs < INFLOW_TTL_MS) return;
  await AsyncStorage.setItem(lockKey, String(nowMs())).catch(() => {});

  const notifications = (NativeModules as any).ActionVaultNotifications;
  if (typeof notifications?.showProcessingNotification === 'function') {
    notifications.showProcessingNotification(
      'Saving your reel…',
      'ActionVault is analyzing it in the background',
    );
  }

  try {
    const result = await analyzeUrl(url);
    const itemId = result?.item?.id as string | undefined;
    if (!itemId) {
      if (typeof notifications?.cancelProcessingNotification === 'function') {
        notifications.cancelProcessingNotification();
      }
      return;
    }

    // Signal the foreground app to refresh list/map caches when it becomes active.
    await AsyncStorage.setItem('needsItemsRefresh', '1').catch(() => {});

    if (typeof notifications?.showReadyNotification === 'function') {
      notifications.showReadyNotification(
        itemId,
        'Your AI reel is ready to view',
        'Tap to open it in ActionVault',
      );
    }
  } catch (e: any) {
    const message = typeof e?.message === 'string' ? e.message : 'Save failed';

    if (typeof notifications?.showErrorNotification === 'function') {
      const title =
        message === 'Not authenticated'
          ? 'Open ActionVault to sign in'
          : 'Could not save this reel';
      const body =
        message === 'Not authenticated'
          ? 'Sign in once, then sharing will work in the background.'
          : 'Try sharing again.';

      notifications.showErrorNotification(title, body);
    }
  }
}

