import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { colors } from '../lib/theme';
import { listItems } from '../lib/api';
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

/** Prefetch all section data so every tab is instant on first open. */
async function prefetchAllSections() {
  await Promise.allSettled([
    queryClient.prefetchQuery({ queryKey: ['items', 'all'],    queryFn: () => listItems({ limit: 50 }) }),
    queryClient.prefetchQuery({ queryKey: ['items', 'travel'], queryFn: () => listItems({ section: 'travel', limit: 200 }) }),
    queryClient.prefetchQuery({ queryKey: ['items', 'food'],   queryFn: () => listItems({ section: 'food',   limit: 200 }) }),
    queryClient.prefetchQuery({ queryKey: ['items', 'ai'],     queryFn: () => listItems({ section: 'ai',     limit: 200 }) }),
    queryClient.prefetchQuery({ queryKey: ['items', 'money'],  queryFn: () => listItems({ section: 'money',  limit: 200 }) }),
  ]);
}

export default function RootLayout() {
  const setSession = useAuthStore((s) => s.setSession);
  const router = useRouter();

  // Listen for auth state changes from Supabase.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // Once we have a session, wake the backend and prefetch everything
      if (data.session) {
        warmupBackend();
        prefetchAllSections();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        warmupBackend();
        prefetchAllSections();
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [setSession]);

  // Handle Android share intent — the config plugin converts ACTION_SEND → actionvault://add?sharedUrl=...
  // so Expo's Linking module can read it normally.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const sharedUrl = parsed.queryParams?.sharedUrl as string | undefined;
        if (sharedUrl && (sharedUrl.startsWith('http://') || sharedUrl.startsWith('https://'))) {
          // Use 800ms — enough time for the navigator to mount on a cold start
          setTimeout(() => {
            try {
              router.push({ pathname: '/(tabs)/add', params: { sharedUrl } });
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
