import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listItems, type Item, type Section } from '../../lib/api';
import { colors, spacing, radius, cardShadow, typography } from '../../lib/theme';

const SECTIONS: { key: string; route: string; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'travel',  route: '/(tabs)/travel',  label: 'Travel',  icon: 'map-outline',          color: '#2B8A6E', bg: '#E5F8F1' },
  { key: 'food',    route: '/(tabs)/food',    label: 'Food',    icon: 'restaurant-outline',   color: '#C05621', bg: '#FFF0E6' },
  { key: 'ai',      route: '/(tabs)/ai',      label: 'AI',      icon: 'sparkles-outline',     color: '#5B5FD6', bg: '#EEEEFF' },
  { key: 'money',   route: '/(tabs)/money',   label: 'Money',   icon: 'trending-up-outline',  color: '#1A7F37', bg: '#E6F4EA' },
];

function formatAge(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['items', 'all'], queryFn: () => listItems({ limit: 50 }) });
  const items = data?.items ?? [];

  const countBySection = SECTIONS.reduce((acc, s) => {
    acc[s.key] = items.filter(i => (i.section ?? 'general') === s.key).length;
    return acc;
  }, {} as Record<string, number>);

  const recent = [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  if (isLoading) return (
    <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.greeting}>Your Vault</Text>
      <Text style={styles.sub}>{items.length} saved {items.length === 1 ? 'item' : 'items'}</Text>

      {/* Section grid */}
      <View style={styles.sectionGrid}>
        {SECTIONS.map(s => (
          <Pressable
            key={s.key}
            style={[styles.sectionCard, { backgroundColor: s.bg }]}
            onPress={() => router.push(s.route as any)}
          >
            <View style={[styles.sectionIcon, { backgroundColor: s.color }]}>
              <Ionicons name={s.icon as any} size={20} color="#fff" />
            </View>
            <Text style={[styles.sectionLabel, { color: s.color }]}>{s.label}</Text>
            <Text style={[styles.sectionCount, { color: s.color }]}>{countBySection[s.key] ?? 0}</Text>
          </Pressable>
        ))}
      </View>

      {/* Recent saves */}
      {recent.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recently saved</Text>
          {recent.map(item => {
            const sec = SECTIONS.find(s => s.key === (item.section ?? 'general')) ?? { color: '#6B6B6B', label: 'General' };
            return (
              <Pressable key={item.id} style={styles.recentCard} onPress={() => router.push(`/items/${item.id}`)}>
                <View style={[styles.recentDot, { backgroundColor: sec.color }]} />
                <View style={styles.recentBody}>
                  <Text style={styles.recentTitle} numberOfLines={1}>{item.title ?? item.source_url}</Text>
                  <Text style={styles.recentMeta}>{sec.label} · {formatAge(item.created_at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
              </Pressable>
            );
          })}
        </>
      )}

      {items.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.accent} />
          <Text style={styles.emptyTitle}>Your vault is empty</Text>
          <Text style={styles.emptySub}>Tap Save to add your first link</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/add')}>
            <Text style={styles.emptyBtnText}>Save a link →</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: 28 },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  sectionCard: { width: '47%', borderRadius: radius.lg, padding: 16, gap: 8 },
  sectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  sectionCount: { fontSize: 24, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  recentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginBottom: 8, gap: 12, ...cardShadow },
  recentDot: { width: 8, height: 8, borderRadius: 4 },
  recentBody: { flex: 1 },
  recentTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  recentMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted },
  emptyBtn: { marginTop: 8, backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.full },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
