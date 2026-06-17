import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listItems, type Item } from '../../lib/api';
import { dedupItems, type DedupedItem } from '../../lib/dedup';
import { effectiveSection } from '../../lib/sections';
import { colors, spacing, radius, cardShadow } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AI_TOOLS: { key: string; label: string; color: string; bg: string; icon: string }[] = [
  { key: 'All',             label: 'All',              color: colors.accent,  bg: colors.accentSoft, icon: 'sparkles-outline' },
  { key: 'ChatGPT',         label: 'ChatGPT',          color: '#10A37F',      bg: '#E6F7F3',         icon: 'logo-electron' },
  { key: 'Claude',          label: 'Claude',           color: '#D97706',      bg: '#FEF3C7',         icon: 'planet-outline' },
  { key: 'Gemini',          label: 'Gemini',           color: '#4285F4',      bg: '#EBF3FE',         icon: 'logo-google' },
  { key: 'Midjourney',      label: 'Midjourney',       color: '#7C3AED',      bg: '#EDE9FE',         icon: 'image-outline' },
  { key: 'Cursor',          label: 'Cursor',           color: '#1D4ED8',      bg: '#EFF6FF',         icon: 'code-slash-outline' },
  { key: 'Perplexity',      label: 'Perplexity',       color: '#0D9488',      bg: '#F0FDFA',         icon: 'search-outline' },
  { key: 'Multiple',        label: 'Comparison',       color: '#64748B',      bg: '#F1F5F9',         icon: 'git-compare-outline' },
  { key: 'Other',           label: 'Other',            color: '#6B6B6B',      bg: '#F0F0F0',         icon: 'ellipsis-horizontal-outline' },
];

const SKILL_BADGE: Record<string, { color: string; bg: string }> = {
  beginner:     { color: '#38A169', bg: '#E6F7EE' },
  intermediate: { color: '#D69E2E', bg: '#FEF3C7' },
  advanced:     { color: '#E53E3E', bg: '#FEE2E2' },
};

export default function AIToolsScreen() {
  const router = useRouter();
  const [activeTool, setActiveTool] = useState('All');
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'section', 'ai-with-legacy-general'],
    queryFn: async () => {
      const [ai, general] = await Promise.all([
        listItems({ section: 'ai', limit: 80, view: 'card' }),
        listItems({ section: 'general', limit: 100, view: 'card' }),
      ]);
      return { items: [...ai.items, ...general.items], total: ai.total + general.total };
    },
    staleTime: 5 * 60_000,
  });

  const items = dedupItems(data?.items ?? []).filter(item => effectiveSection(item) === 'ai');
  const filtered = activeTool === 'All' ? items : items.filter(i => i.section_data?.tool === activeTool);

  // Count per tool
  const counts = AI_TOOLS.reduce((acc, t) => {
    acc[t.key] = t.key === 'All' ? items.length : items.filter(i => i.section_data?.tool === t.key).length;
    return acc;
  }, {} as Record<string, number>);

  function renderCard({ item }: { item: DedupedItem }) {
    const d = item.section_data;
    const tool = AI_TOOLS.find(t => t.key === d?.tool) ?? AI_TOOLS[AI_TOOLS.length - 1];
    const skill = d?.skill_level;
    const skillStyle = skill ? SKILL_BADGE[skill] : null;

    return (
      <Pressable style={styles.card} onPress={() => router.push(`/items/${item.id}`)}>
        {item.dupCount > 1 && (
          <View style={styles.dupBadge}><Text style={styles.dupBadgeText}>saved ×{item.dupCount}</Text></View>
        )}
        {/* Tool badge + skill level */}
        <View style={styles.cardHeader}>
          <View style={[styles.toolBadge, { backgroundColor: tool.bg }]}>
            <Ionicons name={tool.icon as any} size={14} color={tool.color} />
            <Text style={[styles.toolText, { color: tool.color }]}>{tool.label}</Text>
          </View>
          {skill && skillStyle && (
            <View style={[styles.skillBadge, { backgroundColor: skillStyle.bg }]}>
              <Text style={[styles.skillText, { color: skillStyle.color }]}>{skill}</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.summary && <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>}

        {/* Prompt tip pill */}
        {d?.prompt_tip && (
          <View style={styles.promptTip}>
            <Text style={styles.promptTipLabel}>Prompt tip</Text>
            <Text style={styles.promptTipText} numberOfLines={2}>{d.prompt_tip}</Text>
          </View>
        )}

        {/* Task type tags */}
        {(d?.task_type ?? []).length > 0 && (
          <View style={styles.taskTags}>
            {d!.task_type!.slice(0, 4).map(tag => (
              <View key={tag} style={styles.taskTag}><Text style={styles.taskTagText}>{tag}</Text></View>
            ))}
          </View>
        )}
      </Pressable>
    );
  }

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.kicker}>Knowledge Shelf</Text>
        <Text style={styles.title}>AI Tools</Text>
        <Text style={styles.subtitle}>{items.length} saved tip{items.length === 1 ? '' : 's'} and techniques</Text>
      </View>

      {/* Tool filter panel */}
      <View style={styles.filterPanel}>
        {AI_TOOLS.filter(t => t.key === 'All' || counts[t.key] > 0).map(tool => (
          <Pressable
            key={tool.key}
            style={[styles.toolFilter, activeTool === tool.key && { backgroundColor: tool.color }]}
            onPress={() => setActiveTool(tool.key)}
          >
            <Ionicons name={tool.icon as any} size={14} color={activeTool === tool.key ? '#fff' : tool.color} />
            <Text style={[styles.toolFilterText, activeTool === tool.key && { color: '#fff' }]}>{tool.label}</Text>
            {counts[tool.key] > 0 && (
              <View style={[styles.toolCount, activeTool === tool.key ? { backgroundColor: 'rgba(255,255,255,0.3)' } : { backgroundColor: tool.bg }]}>
                <Text style={[styles.toolCountText, activeTool === tool.key && { color: '#fff' }]}>{counts[tool.key]}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="sparkles-outline" size={48} color={colors.accent} />
          <Text style={styles.emptyTitle}>No AI tips yet</Text>
          <Text style={styles.emptySub}>Save a reel about AI tools and it'll appear here</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderCard}
          contentContainerStyle={[styles.listContent, { paddingBottom: spacing.lg + insets.bottom + 72 }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: 12 },
  kicker: { fontSize: 11, fontWeight: '800', color: colors.accent, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 4 },
  title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.9 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  filterPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...cardShadow,
    shadowOpacity: 0.03,
  },
  toolFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    maxWidth: '48%',
  },
  toolFilterText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, flexShrink: 1 },
  toolCount: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginLeft: 'auto' },
  toolCountText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: spacing.lg, gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, ...cardShadow, gap: 9, position: 'relative', borderWidth: 1, borderColor: colors.borderSubtle },
  dupBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  dupBadgeText: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 0.3 },
  cardHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  toolBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  toolText: { fontSize: 12, fontWeight: '700' },
  skillBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  skillText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, lineHeight: 23, paddingRight: 44 },
  cardSummary: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  useCase: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  useCaseText: { fontSize: 12, color: colors.accent, fontWeight: '600' },
  promptTip: { backgroundColor: colors.surfaceWarm, borderRadius: radius.md, padding: 10, gap: 4, borderWidth: 1, borderColor: colors.accentMuted },
  promptTipLabel: { fontSize: 9, fontWeight: '800', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.7 },
  promptTipText: { fontSize: 12, color: colors.textPrimary, lineHeight: 17 },
  taskTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  taskTag: { backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  taskTagText: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted },
});
