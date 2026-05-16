import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { colors } from '../lib/theme';
import * as Linking from 'expo-linking';
import ReceiveSharingIntent from 'react-native-receive-sharing-intent';

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

  // Handle Android share intent — runs ONCE on mount only to avoid double-processing
  useEffect(() => {
    // Clear any stale intent data from a previous session first
    ReceiveSharingIntent.clearReceivedFiles();

    ReceiveSharingIntent.getReceivedFiles(
      (files: any[]) => {
        const shared = files?.[0];
        const url = shared?.weblink || shared?.text || shared?.subject;
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          // Small delay so the router is ready before pushing
          setTimeout(() => {
            router.push({ pathname: '/(tabs)/add', params: { sharedUrl: url } });
          }, 300);
        }
        ReceiveSharingIntent.clearReceivedFiles();
      },
      (_error: any) => {},
      'actionvault',
    );
    // Empty deps — run only once when the app first mounts
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
