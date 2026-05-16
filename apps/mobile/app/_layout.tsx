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

  // Handle Android share intent — when user shares a URL to ActionVault
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      // Extract shared text from the intent URL
      // Android shares come as: actionvault://?text=https://...
      try {
        const parsed = Linking.parse(url);
        const sharedText = parsed.queryParams?.text as string | undefined;
        const targetUrl = sharedText ?? parsed.queryParams?.url as string | undefined;
        if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
          router.push({ pathname: '/(tabs)/add', params: { sharedUrl: targetUrl } });
        }
      } catch {}
    };

    // Handle app opened via share intent
    Linking.getInitialURL().then(handleUrl);

    // Handle share intent while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [router]);

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
