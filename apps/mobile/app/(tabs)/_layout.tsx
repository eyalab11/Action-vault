import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/auth';
import { colors } from '../../lib/theme';

export default function TabsLayout() {
  const { session, loading } = useAuthStore();
  if (loading) return null;
  if (!session) return <Redirect href="/auth" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 4,
          height: 62,
        },
        tabBarLabelStyle: { fontSize: 10, marginBottom: 4 },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 18, color: colors.textPrimary, letterSpacing: -0.3 },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Home',   tabBarLabel: 'Home',   tabBarIcon: ({ color, size }) => <Ionicons name="home-outline"          size={size}     color={color} /> }} />
      <Tabs.Screen name="travel"  options={{ headerShown: false, tabBarLabel: 'Travel', tabBarIcon: ({ color, size }) => <Ionicons name="map-outline"           size={size}     color={color} /> }} />
      <Tabs.Screen name="add"     options={{ headerShown: false, tabBarLabel: 'Save',   tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline"    size={size + 4} color={color} /> }} />
      <Tabs.Screen name="food"    options={{ headerShown: false, tabBarLabel: 'Food',   tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline"    size={size}     color={color} /> }} />
      <Tabs.Screen name="ai"      options={{ headerShown: false, tabBarLabel: 'AI',     tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline"      size={size}     color={color} /> }} />
      <Tabs.Screen name="money"   options={{ headerShown: false, tabBarLabel: 'Money',  tabBarIcon: ({ color, size }) => <Ionicons name="trending-up-outline"   size={size}     color={color} /> }} />
      {/* Library — accessible via items, not main nav */}
      <Tabs.Screen name="library" options={{ href: null }} />
    </Tabs>
  );
}
