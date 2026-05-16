/**
 * Library screen.
 *
 * Shows all saved items, newest first.
 * Filter by category via horizontal chip row.
 * Tap any item to see the full detail.
 *
 * Inspired by MyMind — clean, spacious, visual card grid.
 */

import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { listItems, type Item } from '../../lib/api';
import { colors, radius, typography, spacing, cardShadow } from '../../lib/theme';

const CATEGORIES = [
  'All', 'AI', 'Work', 'Money', 'Productivity', 'Learning',
  'Travel', 'Food', 'Fitness', 'PersonalAdmin', 'Inspiration', 'Other',
];

const CATEGORY_LABELS: Record<string, string> = { PersonalAdmin: 'Admin' };

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitter: 'X',
  web: 'Web',
  unknown: 'Link',
};

export default function LibraryScreen() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState('All');

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['items', activeCategory],
    queryFn: () =>
      listItems({ category: activeCategory === 'All' ? undefined : activeCategory, limit: 50 }),
  });

  const items = data?.items ?? [];

  function renderCategoryChip(cat: string) {
    const isActive = cat === activeCategory;
    return (
      <Pressable
        key={cat}
        style={[styles.chip, isActive && styles.chipActive]}
        onPress={() => setActiveCategory(cat)}
      >
        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
          {CATEGORY_LABELS[cat] ?? cat}
        </Text>
      </Pressable>
    );
  }

  function renderItem({ item }: { item: Item }) {
    const needsReview = item.status === 'needs_review';
    const catColor = colors.categories[item.primary_category ?? ''] ?? colors.categories.Other;
    const platformLabel = PLATFORM_LABELS[item.source_platform] ?? 'Link';
    const stepCount = item.actionable ? (item.action_count ?? 0) : 0;

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/items/${item.id}`)}
      >
        {/* Colored accent strip on left for category */}
        {item.primary_category && (
          <View style={[styles.accentStrip, { backgroundColor: catColor.text }]} />
        )}

        <View style={styles.cardBody}>
          {/* Header line: platform + category */}
          <View style={styles.cardMeta}>
            <Text style={styles.platformLabel}>{platformLabel}</Text>
            {item.primary_category && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={[styles.categoryLabel, { color: catColor.text }]}>
                  {CATEGORY_LABELS[item.primary_category] ?? item.primary_category}
                </Text>
              </>
            )}
            {needsReview && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <View style={styles.reviewDot} />
              </>
            )}
          </View>

          {/* Title — the hero */}
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title ?? item.source_url}
          </Text>

          {/* Summary — single line, subtle */}
          {item.summary ? (
            <Text style={styles.cardSummary} numberOfLines={1}>
              {item.summary}
            </Text>
          ) : null}

          {/* Footer: action steps count */}
          {stepCount > 0 && (
            <View style={styles.cardFooter}>
              <View style={styles.stepsPill}>
                <Text style={styles.stepsText}>{stepCount} steps</Text>
              </View>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  function renderEmpty() {
    if (isLoading) return null;
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyCircle}>
          <Text style={styles.emptyCircleText}>V</Text>
        </View>
        <Text style={styles.emptyTitle}>
          {activeCategory === 'All' ? 'Your mind is empty' : `No ${activeCategory} items`}
        </Text>
        <Text style={styles.emptySubtitle}>
          {activeCategory === 'All'
            ? 'Tap Add Link to save your first link.'
            : 'Save more content to see it here.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Category chips — fixed height with room to breathe */}
      <View style={styles.chipContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CATEGORIES.map(renderCategoryChip)}
        </ScrollView>
      </View>

      {/* Count */}
      {!isLoading && (
        <Text style={styles.countText}>
          {data?.total ?? items.length} item{items.length !== 1 ? 's' : ''}
        </Text>
      )}

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          contentContainerStyle={
            items.length === 0
              ? styles.emptyContainer
              : { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // -- Chip filter bar --
  chipContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bg,
  },
  chipRow: {
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSecondary,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  // -- Count --
  countText: {
    ...typography.caption,
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: 8,
  },

  // -- Card --
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    flexDirection: 'row',
    overflow: 'hidden',
    ...cardShadow,
  },
  accentStrip: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },

  // Meta line: "YouTube · Food"
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  platformLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 12,
    color: colors.textLight,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  reviewDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },

  // Title — clean and prominent
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 22,
  },

  // Summary — one line, understated
  cardSummary: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 4,
  },

  // Footer
  cardFooter: {
    marginTop: 10,
    flexDirection: 'row',
  },
  stepsPill: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  stepsText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '600',
  },

  // -- Loading / Empty --
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyCircleText: { fontSize: 30, fontWeight: '700', color: colors.accent },
  emptyTitle: { ...typography.headline, fontSize: 20, marginBottom: 8 },
  emptySubtitle: { ...typography.body, textAlign: 'center', lineHeight: 22 },
});
