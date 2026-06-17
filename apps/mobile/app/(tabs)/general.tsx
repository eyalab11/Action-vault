import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listItems, type Item } from '../../lib/api';
import { dedupItems, type DedupedItem } from '../../lib/dedup';
import { effectiveSection } from '../../lib/sections';
import { colors, spacing, radius, cardShadow } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitter: 'X',
  web: 'Web',
  unknown: 'Link',
};

export default function GeneralScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['items', 'section', 'general-client-filtered'],
    queryFn: () => listItems({ limit: 100, view: 'slim' }),
    staleTime: 5 * 60_000,
  });

  const items = dedupItems(data?.items ?? []).filter(item => effectiveSection(item) === 'general');

  function renderItem({ item }: { item: DedupedItem }) {
    const platform = PLATFORM_LABELS[item.source_platform] ?? 'Link';
    return (
      <Pressable style={styles.card} onPress={() => router.push(`/items/${item.id}`)}>
        <View style={styles.iconWrap}>
          <Ionicons name="albums-outline" size={19} color={colors.textSecondary} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{platform}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{formatAge(item.created_at)}</Text>
            {item.dupCount > 1 && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.savedText}>saved x{item.dupCount}</Text>
              </>
            )}
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title ?? item.source_url}</Text>
          {item.summary ? <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
      </Pressable>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.kicker}>Everything Else</Text>
        <Text style={styles.title}>General</Text>
        <Text style={styles.subtitle}>{items.length} save{items.length === 1 ? '' : 's'} that do not fit a special tab</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={44} color={colors.textLight} />
            <Text style={styles.emptyTitle}>No general saves yet</Text>
            <Text style={styles.emptySub}>Links that are not travel, food, AI, or money will appear here.</Text>
          </View>
        }
        contentContainerStyle={[
          styles.list,
          items.length === 0 && styles.emptyList,
          { paddingBottom: spacing.xl + insets.bottom + 88 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: 14 },
  kicker: { fontSize: 11, color: colors.textMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 },
  title: { fontSize: 30, color: colors.textPrimary, fontWeight: '800', letterSpacing: -0.9 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  list: { paddingHorizontal: spacing.lg, paddingTop: 8 },
  emptyList: { flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...cardShadow,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  metaText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  metaDot: { fontSize: 11, color: colors.textLight },
  savedText: { fontSize: 11, color: colors.accent, fontWeight: '700' },
  cardTitle: { fontSize: 15, color: colors.textPrimary, fontWeight: '700', lineHeight: 20 },
  summary: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 18, color: colors.textPrimary, fontWeight: '800' },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
