import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/auth';
import { colors } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

export default function TabsLayout() {
  const { session, loading } = useAuthStore();
  const insets = useSafeAreaInsets();
  if (loading) return null;
  if (!session) return <Redirect href="/auth" />;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 10, marginBottom: 0 },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 18, color: colors.textPrimary, letterSpacing: -0.3 },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Home',   tabBarLabel: 'Home',   tabBarIcon: ({ color, size }) => <Ionicons name="home-outline"          size={size}     color={color} /> }} />
      <Tabs.Screen name="general" options={{ headerShown: false, tabBarLabel: 'General', tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline"        size={size}     color={color} /> }} />
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

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const height = 64 + Math.max(insets.bottom, 8);

  const isActive = (name: string) => state.routes[state.index]?.name === name;

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    navigation.navigate(route.name as never);
  };

  const renderTab = (name: string, label: string, icon: any) => {
    const active = isActive(name);
    const color = active ? colors.accent : colors.textLight;
    return (
      <Pressable key={name} style={tabStyles.tab} onPress={() => go(name)}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[tabStyles.label, { color }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[tabStyles.wrap, { paddingBottom: Math.max(insets.bottom, 8), height }]}>
      <View style={tabStyles.row}>
        <View style={tabStyles.side}>
          {renderTab('index', 'Home', 'home-outline')}
          {renderTab('general', 'General', 'albums-outline')}
          {renderTab('travel', 'Travel', 'map-outline')}
        </View>

        <Pressable style={tabStyles.centerBtn} onPress={() => go('add')}>
          <View style={tabStyles.centerCircle}>
            <Ionicons name="add" size={26} color="#fff" />
          </View>
          <Text style={[tabStyles.label, { color: colors.textSecondary, marginTop: 2 }]}>Save</Text>
        </Pressable>

        <View style={tabStyles.side}>
          {renderTab('food', 'Food', 'restaurant-outline')}
          {renderTab('ai', 'AI', 'sparkles-outline')}
          {renderTab('money', 'Money', 'trending-up-outline')}
        </View>
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flex: 1,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 6,
    flex: 1,
    minWidth: 0,
  },
  label: { fontSize: 9, fontWeight: '600' },
  centerBtn: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 62,
    marginHorizontal: 2,
  },
  centerCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
