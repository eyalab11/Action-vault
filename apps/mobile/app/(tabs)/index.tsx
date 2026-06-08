import { useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listItems, type Item, type Section } from '../../lib/api';
import { effectiveSection } from '../../lib/sections';
import { dedupItems } from '../../lib/dedup';
import { colors, spacing, radius, cardShadow, typography } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const queryClient = useQueryClient();
  const appState = useRef(AppState.currentState);
  const lastBackgroundAtRef = useRef<number | null>(null);
  const insets = useSafeAreaInsets();

  // Re-fetch everything when the app comes back from background after 5+ minutes
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState.match(/inactive|background/)) {
        lastBackgroundAtRef.current = Date.now();
      }
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        const lastBg = lastBackgroundAtRef.current;
        if (lastBg && Date.now() - lastBg > 5 * 60_000) {
          queryClient.invalidateQueries({ queryKey: ['items'] });
        }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [queryClient]);

  const { data, isLoading } = useQuery({ queryKey: ['items', 'all-slim'], queryFn: () => listItems({ limit: 100, view: 'slim' }) });
  const rawItems = data?.items ?? [];

  // Dedup: many shares of the same URL collapse into one card with a "× N" badge.
  const deduped = dedupItems(rawItems);
  const duplicateCount = rawItems.length - deduped.length;

  const countBySection = SECTIONS.reduce((acc, s) => {
    acc[s.key] = deduped.filter(i => effectiveSection(i) === s.key).length;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) return (
    <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: spacing.lg + insets.bottom + 72 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.greeting}>Your Vault</Text>
      <Text style={styles.sub}>
        {deduped.length} unique {deduped.length === 1 ? 'item' : 'items'}
        {duplicateCount > 0 ? ` · ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} merged` : ''}
      </Text>

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

      {/* All items — this is the "see everything" view. No truncation. */}
      {deduped.length > 0 && (
        <>
          <View style={styles.allHeader}>
            <Text style={styles.sectionTitle}>All saves</Text>
            <Text style={styles.allCount}>{deduped.length}</Text>
          </View>
          {deduped.map(item => {
            const sec = SECTIONS.find(s => s.key === effectiveSection(item)) ?? { color: '#6B6B6B', label: 'General' };
            return (
              <Pressable key={item.id} style={styles.recentCard} onPress={() => router.push(`/items/${item.id}`)}>
                <View style={[styles.recentDot, { backgroundColor: sec.color }]} />
                <View style={styles.recentBody}>
                  <Text style={styles.recentTitle} numberOfLines={1}>{item.title ?? item.source_url}</Text>
                  <Text style={styles.recentMeta}>{sec.label} · {formatAge(item.created_at)}</Text>
                </View>
                {item.dupCount > 1 && (
                  <View style={styles.dupBadge}>
                    <Text style={styles.dupBadgeText}>×{item.dupCount}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
              </Pressable>
            );
          })}
        </>
      )}

      {deduped.length === 0 && (
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
  content: { padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: 28 },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  sectionCard: { width: '47%', borderRadius: radius.lg, padding: 16, gap: 8 },
  sectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  sectionCount: { fontSize: 24, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  allHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  allCount: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  recentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginBottom: 8, gap: 12, ...cardShadow },
  recentDot: { width: 8, height: 8, borderRadius: 4 },
  recentBody: { flex: 1 },
  recentTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  recentMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dupBadge: { backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  dupBadgeText: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 0.3 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted },
  emptyBtn: { marginTop: 8, backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.full },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
