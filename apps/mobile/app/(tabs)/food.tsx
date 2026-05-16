import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listItems, type Item } from '../../lib/api';
import { colors, spacing, radius, cardShadow } from '../../lib/theme';

type Taste = 'all' | 'sweet' | 'salty' | 'spicy' | 'savory' | 'sour' | 'umami';

const TASTES: { key: Taste; label: string; emoji: string; color: string }[] = [
  { key: 'all',    label: 'All',    emoji: '🍽',  color: colors.accent },
  { key: 'savory', label: 'Savory', emoji: '🍖',  color: '#C05621' },
  { key: 'sweet',  label: 'Sweet',  emoji: '🍰',  color: '#D69E2E' },
  { key: 'spicy',  label: 'Spicy',  emoji: '🌶',  color: '#E53E3E' },
  { key: 'salty',  label: 'Salty',  emoji: '🧂',  color: '#2B6CB0' },
  { key: 'sour',   label: 'Sour',   emoji: '🍋',  color: '#38A169' },
  { key: 'umami',  label: 'Umami',  emoji: '🍜',  color: '#805AD5' },
];

const DIFF_COLOR = { easy: '#38A169', medium: '#D69E2E', hard: '#E53E3E' };

function formatTime(mins: number | null | undefined) {
  if (!mins) return null;
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`.trim();
}

export default function FoodScreen() {
  const router = useRouter();
  const [activeTaste, setActiveTaste] = useState<Taste>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'food'],
    queryFn: () => listItems({ section: 'food', limit: 200 }),
  });

  const items = data?.items ?? [];
  const filtered = activeTaste === 'all'
    ? items
    : items.filter(item => item.section_data?.taste_profile?.[activeTaste as keyof typeof item.section_data.taste_profile]);

  function renderCard({ item }: { item: Item }) {
    const d = item.section_data;
    const tastes = d?.taste_profile ? Object.entries(d.taste_profile).filter(([, v]) => v).map(([k]) => k) : [];
    const mood = d?.mood_tags?.[0];
    const diff = d?.difficulty;

    return (
      <Pressable style={styles.card} onPress={() => router.push(`/items/${item.id}`)}>
        {/* Cuisine badge */}
        <View style={styles.cardTop}>
          {d?.cuisine && <View style={styles.cuisineBadge}><Text style={styles.cuisineText}>{d.cuisine}</Text></View>}
          {mood && <View style={styles.moodBadge}><Text style={styles.moodText}>{mood}</Text></View>}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.summary && <Text style={styles.cardSummary} numberOfLines={2}>{item.summary}</Text>}

        {/* Taste dots */}
        {tastes.length > 0 && (
          <View style={styles.tasteDots}>
            {tastes.slice(0, 5).map(t => {
              const taste = TASTES.find(ts => ts.key === t);
              return taste ? (
                <View key={t} style={[styles.tasteDot, { backgroundColor: taste.color + '22', borderColor: taste.color }]}>
                  <Text style={styles.tasteDotEmoji}>{taste.emoji}</Text>
                </View>
              ) : null;
            })}
          </View>
        )}

        {/* Meta row */}
        <View style={styles.metaRow}>
          {d?.cook_time_minutes && (
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={styles.metaText}>{formatTime(d.cook_time_minutes)}</Text>
            </View>
          )}
          {d?.ingredient_count && (
            <View style={styles.metaChip}>
              <Ionicons name="list-outline" size={12} color={colors.textMuted} />
              <Text style={styles.metaText}>{d.ingredient_count} ingredients</Text>
            </View>
          )}
          {diff && (
            <View style={[styles.diffBadge, { backgroundColor: DIFF_COLOR[diff] + '22' }]}>
              <Text style={[styles.diffText, { color: DIFF_COLOR[diff] }]}>{diff}</Text>
            </View>
          )}
        </View>

        {/* Dietary tags */}
        {(d?.dietary ?? []).length > 0 && (
          <View style={styles.dietaryRow}>
            {d!.dietary!.slice(0, 3).map(tag => (
              <View key={tag} style={styles.dietaryTag}><Text style={styles.dietaryText}>{tag}</Text></View>
            ))}
          </View>
        )}
      </Pressable>
    );
  }

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Food & Recipes</Text>
        <Text style={styles.subtitle}>{items.length} saved · {filtered.length} showing</Text>
      </View>

      {/* Taste filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tasteScroll} contentContainerStyle={styles.tasteRow}>
        {TASTES.map(t => (
          <Pressable
            key={t.key}
            style={[styles.tasteChip, activeTaste === t.key && { backgroundColor: t.color }]}
            onPress={() => setActiveTaste(t.key)}
          >
            <Text style={styles.tasteEmoji}>{t.emoji}</Text>
            <Text style={[styles.tasteLabel, activeTaste === t.key && { color: '#fff' }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Grid */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 40 }}>🍽</Text>
          <Text style={styles.emptyTitle}>
            {activeTaste === 'all' ? 'No food saves yet' : `No ${activeTaste} recipes yet`}
          </Text>
          <Text style={styles.emptySub}>Save a recipe or food reel to see it here</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  tasteScroll: { flexGrow: 0 },
  tasteRow: { paddingHorizontal: spacing.lg, paddingVertical: 12, gap: 8 },
  tasteChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  tasteEmoji: { fontSize: 14 },
  tasteLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  listContent: { padding: spacing.lg, gap: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, ...cardShadow, gap: 10 },
  cardTop: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cuisineBadge: { backgroundColor: '#C05621' + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  cuisineText: { fontSize: 11, fontWeight: '700', color: '#C05621', textTransform: 'uppercase', letterSpacing: 0.5 },
  moodBadge: { backgroundColor: colors.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  moodText: { fontSize: 11, fontWeight: '600', color: colors.accent },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, lineHeight: 22 },
  cardSummary: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  tasteDots: { flexDirection: 'row', gap: 6 },
  tasteDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tasteDotEmoji: { fontSize: 13 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  metaText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  diffText: { fontSize: 11, fontWeight: '700' },
  dietaryRow: { flexDirection: 'row', gap: 6 },
  dietaryTag: { backgroundColor: '#38A169' + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  dietaryText: { fontSize: 11, color: '#38A169', fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted },
});
