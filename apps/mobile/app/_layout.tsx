import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { colors } from '../lib/theme';
import * as Linking from 'expo-linking';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const setSession = useAuthStore((s) => s.setSession);
  const router = useRouter();

  // Listen for auth state changes from Supabase.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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
          setTimeout(() => {
            router.push({ pathname: '/(tabs)/add', params: { sharedUrl } });
          }, 300);
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
