import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { colors } from '../lib/theme';
import { getItemsSummary } from '../lib/api';
import { normalizeUrl } from '../lib/dedup';
import * as Linking from 'expo-linking';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// Stale time of 5 min — data stays fresh while you switch tabs, no re-fetches
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
    },
  },
});

/** Wake the Render backend immediately so it's ready before the user does anything. */
function warmupBackend() {
  fetch(`${API_URL}/health`, { method: 'GET' }).catch(() => {});
}

/** Prefetch only the lightweight startup payload. Section screens load lazily. */
async function prefetchStartupSummary() {
  await queryClient.prefetchQuery({
    queryKey: ['items', 'summary'],
    queryFn: () => getItemsSummary(),
  });
}

export default function RootLayout() {
  const setSession = useAuthStore((s) => s.setSession);
  const router = useRouter();
  const lastSharedKeyRef = useRef<{ key: string; ts: number } | null>(null);

  // Hydrate cached item lists so the UI renders instantly, then refreshes in background.
  useEffect(() => {
    const hydrate = async (key: unknown[], storageKey: string) => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        queryClient.setQueryData(key, parsed);
      } catch {}
    };

    hydrate(['items', 'summary'], 'cache:items:summary');
    hydrate(['items', 'all-slim'], 'cache:items:all-slim');
    hydrate(['items', 'section', 'general'], 'cache:items:section:general');
    hydrate(['items', 'section', 'ai'], 'cache:items:section:ai');
    hydrate(['items', 'section', 'money'], 'cache:items:section:money');
    hydrate(['items', 'section', 'travel'], 'cache:items:section:travel');
    hydrate(['items', 'section', 'food'], 'cache:items:section:food');

    // Persist the key queries when they change.
    const unsub = queryClient.getQueryCache().subscribe((event: any) => {
      const q = event?.query;
      if (!q) return;
      const key = q.queryKey;
      if (!Array.isArray(key)) return;
      const data = q.state?.data;
      if (!data) return;

      const k = JSON.stringify(key);
      const map: Record<string, string> = {
        '["items","all-slim"]': 'cache:items:all-slim',
        '["items","summary"]': 'cache:items:summary',
        '["items","section","general"]': 'cache:items:section:general',
        '["items","section","ai"]': 'cache:items:section:ai',
        '["items","section","money"]': 'cache:items:section:money',
        '["items","section","travel"]': 'cache:items:section:travel',
        '["items","section","food"]': 'cache:items:section:food',
      };
      const storageKey = map[k];
      if (!storageKey) return;
      AsyncStorage.setItem(storageKey, JSON.stringify(data)).catch(() => {});
    });

    return () => unsub();
  }, []);

  // Listen for auth state changes from Supabase.
  useEffect(() => {
    // Warm the backend immediately (even before auth is restored) to reduce cold-start latency.
    warmupBackend();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // Once we have a session, fetch only the tiny startup summary.
      if (data.session) {
        prefetchStartupSummary();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        prefetchStartupSummary();
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [setSession]);

  // If a background share save happened, refresh items once on next foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      (async () => {
        const needs = await AsyncStorage.getItem('needsItemsRefresh').catch(() => null);
        if (!needs) return;
        await AsyncStorage.removeItem('needsItemsRefresh').catch(() => {});
        queryClient.invalidateQueries({ queryKey: ['items'] });
        prefetchStartupSummary().catch(() => {});
      })();
    });
    return () => sub.remove();
  }, []);

  // Ask for notification permission once (Android 13+).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (typeof Platform.Version !== 'number' || Platform.Version < 33) return;

    (async () => {
      const asked = await AsyncStorage.getItem('notifPermAsked').catch(() => null);
      if (asked) return;
      await AsyncStorage.setItem('notifPermAsked', '1').catch(() => {});
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      } catch {}
    })();
  }, []);

  // Handle Android share intent — the config plugin converts ACTION_SEND → actionvault://add?sharedUrl=...
  // so Expo's Linking module can read it normally.
  useEffect(() => {
    const extractFirstUrl = (text: string): string | null => {
      // Match any http/https URL in the text (handles cases where Instagram prepends text)
      const match = text.match(/https?:\/\/[^\s"'<>]+/);
      return match ? match[0] : null;
    };

    const handleUrl = (url: string | null) => {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const raw = parsed.queryParams?.sharedUrl as string | undefined;
        if (!raw) return;

        // Accept pure URL or extract first URL from text (e.g. "Check this out: https://...")
        const sharedUrl = (raw.startsWith('http://') || raw.startsWith('https://'))
          ? raw
          : extractFirstUrl(raw);

        if (sharedUrl) {
          const key = normalizeUrl(sharedUrl);
          const last = lastSharedKeyRef.current;
          if (last && last.key === key && Date.now() - last.ts < 2000) return;
          lastSharedKeyRef.current = { key, ts: Date.now() };

          setTimeout(() => {
            try {
              router.replace({ pathname: '/(tabs)/add', params: { sharedUrl } });
            } catch {}
          }, 800);
        }
      } catch {}
    };

    // App opened fresh via share intent
    Linking.getInitialURL().then(handleUrl);

    // App already open, share intent arrives
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="items/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            title: '',
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
      </Stack>
    </QueryClientProvider>
  );
}
