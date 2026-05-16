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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { listItems, deleteItem, type Item } from '../../lib/api';
import { colors, radius, typography, spacing, cardShadow } from '../../lib/theme';

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
  const queryClient = useQueryClient();
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

  async function handleDelete(id: string) {
    Alert.alert('Delete item', 'Remove this from your vault?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteItem(id);
            queryClient.invalidateQueries({ queryKey: ['items'] });
          } catch {
            Alert.alert('Error', 'Could not delete item. Try again.');
          }
        },
      },
    ]);
  }

  function renderItem({ item }: { item: Item }) {
    const needsReview = item.status === 'needs_review';
    const catColor = colors.categories[item.primary_category ?? ''] ?? colors.categories.Other;
    const platformLabel = PLATFORM_LABELS[item.source_platform] ?? 'Link';
    const stepCount = item.actionable ? (item.action_count ?? 0) : 0;

    const deleteAction = (
      <Pressable style={styles.deleteAction} onPress={() => handleDelete(item.id)}>
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.deleteActionText}>Delete</Text>
      </Pressable>
    );

    return (
      <Swipeable renderRightActions={() => deleteAction} overshootRight={false}>
        <Pressable
          style={styles.card}
          onPress={() => router.push(`/items/${item.id}`)}
        >
          {/* Orange accent strip — consistent with brand */}
          <View style={styles.accentStrip} />

          <View style={styles.cardBody}>
            {/* Header line: platform + category + timestamp */}
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
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.timestamp}>{formatAge(item.created_at)}</Text>
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
      </Swipeable>
    );
  }

  function renderEmpty() {
    if (isLoading) return null;
    const catLabel = CATEGORY_LABELS[activeCategory] ?? activeCategory;
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyCircle}>
          <Ionicons
            name={activeCategory === 'All' ? 'lock-closed-outline' : 'folder-open-outline'}
            size={32}
            color={colors.accent}
          />
        </View>
        <Text style={styles.emptyTitle}>
          {activeCategory === 'All' ? 'Your vault is empty' : `Nothing in ${catLabel} yet`}
        </Text>
        <Text style={styles.emptySubtitle}>
          {activeCategory === 'All'
            ? 'Tap Add to save your first link and unlock action steps.'
            : 'Save content from this category and it will appear here.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Category chips with right-fade scroll hint */}
      <View style={styles.chipContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CATEGORIES.map(renderCategoryChip)}
        </ScrollView>
        <View style={styles.chipFade} pointerEvents="none" />
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
    position: 'relative',
  },
  chipFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    backgroundColor: colors.bg,
    opacity: 0.85,
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
    backgroundColor: colors.accent,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textLight,
  },
  deleteAction: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: radius.lg,
    gap: 4,
    marginLeft: 8,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
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
  emptyTitle: { ...typography.headline, fontSize: 20, marginBottom: 8 },
  emptySubtitle: { ...typography.body, textAlign: 'center', lineHeight: 22 },
});
