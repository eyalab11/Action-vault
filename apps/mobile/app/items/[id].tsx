/**
 * Item Detail screen.
 *
 * Shows the full enriched item: title, summary, category, tags,
 * and the action steps checklist.
 */

import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getItem,
  updateItem,
  updateTask,
  deleteItem,
  type ActionTask,
} from '../../lib/api';
import { colors, radius, typography, spacing, cardShadow } from '../../lib/theme';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['item', id],
    queryFn: () => getItem(id),
    enabled: !!id,
  });

  const item = data?.item;

  const taskMutation = useMutation({
    mutationFn: ({
      taskId,
      status,
    }: {
      taskId: string;
      status: ActionTask['status'];
    }) => updateTask(id, taskId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
  });

  const noteMutation = useMutation({
    mutationFn: (note: string) => updateItem(id, { manual_note: note }),
    onSuccess: (result) => {
      queryClient.setQueryData(['item', id], { item: result.item });
      setEditingNote(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateItem(id, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      router.back();
    },
  });

  function toggleTask(task: ActionTask) {
    const nextStatus: ActionTask['status'] =
      task.status === 'completed' ? 'pending' : 'completed';
    taskMutation.mutate({ taskId: task.id, status: nextStatus });
  }

  function openSource() {
    const url = item?.source_url;
    if (!url) return;
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open link', url),
    );
  }

  function handleSaveNote() {
    noteMutation.mutate(noteText.trim());
  }

  function handleArchive() {
    Alert.alert('Archive item', 'Move this to your archive?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', onPress: () => archiveMutation.mutate() },
    ]);
  }

  function handleDelete() {
    Alert.alert('Delete item', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !item) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load item</Text>
      </View>
    );
  }

  const categoryStyle = colors.categories[item.primary_category ?? ''] ?? colors.categories.Other;
  const completedCount = (item.action_tasks ?? []).filter(
    (t) => t.status === 'completed',
  ).length;
  const totalCount = (item.action_tasks ?? []).length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable onPress={handleArchive} style={{ marginRight: 16 }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Archive</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Source link card */}
        <Pressable onPress={openSource} style={styles.sourceCard}>
          <Text style={styles.sourcePlatform}>{item.source_platform}</Text>
          <Text style={styles.sourceUrl} numberOfLines={1}>
            {item.source_url}
          </Text>
          <Text style={styles.sourceArrow}>↗</Text>
        </Pressable>

        {/* Creator */}
        {item.creator_name && (
          <Text style={styles.creator}>by {item.creator_name}</Text>
        )}

        {/* Category badge */}
        {item.primary_category && (
          <View
            style={[styles.categoryBadge, { backgroundColor: categoryStyle.bg }]}
          >
            <Text style={[styles.categoryText, { color: categoryStyle.text }]}>
              {item.primary_category}
            </Text>
          </View>
        )}

        {/* Title */}
        <Text style={styles.title}>{item.title ?? 'Untitled'}</Text>

        {/* Summary */}
        {item.summary ? (
          <Text style={styles.summary}>{item.summary}</Text>
        ) : (
          <View style={styles.noSummaryBox}>
            <Text style={styles.noSummaryText}>
              We couldn't extract enough info from this link. Add a note below to help us understand it.
            </Text>
          </View>
        )}

        {/* Tags */}
        {item.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Low confidence */}
        {(item.confidence_score ?? 1) < 0.5 && (
          <View style={styles.lowConfidenceBox}>
            <Text style={styles.lowConfidenceText}>
              Low confidence — the AI had limited info. Add a note to improve.
            </Text>
          </View>
        )}

        {/* ── Action Steps ─────────────────────────────────── */}
        {item.actionable && totalCount > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Action steps</Text>
              <Text style={styles.sectionProgress}>
                {completedCount}/{totalCount}
              </Text>
            </View>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>

            <View style={styles.tasksCard}>
              {(item.action_tasks ?? [])
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((task, idx) => {
                  const done = task.status === 'completed';
                  const isLast = idx === totalCount - 1;
                  return (
                    <Pressable
                      key={task.id}
                      style={[styles.taskRow, !isLast && styles.taskRowBorder]}
                      onPress={() => toggleTask(task)}
                    >
                      <View style={[styles.checkbox, done && styles.checkboxDone]}>
                        {done && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={styles.taskTextBlock}>
                        <Text
                          style={[styles.taskTitle, done && styles.taskTitleDone]}
                        >
                          {task.title}
                        </Text>
                        {task.description && !done && (
                          <Text style={styles.taskDesc}>{task.description}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
            </View>
          </View>
        )}

        {/* No action steps */}
        {!item.actionable && (
          <View style={styles.noActionsBox}>
            <Text style={styles.noActionsText}>
              This item doesn't have specific action steps.
            </Text>
          </View>
        )}

        {/* ── Your Note ─────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your note</Text>

          {editingNote ? (
            <>
              <TextInput
                style={styles.noteInput}
                value={noteText}
                onChangeText={setNoteText}
                multiline
                autoFocus
                placeholder="What is this about? What drew you to it?"
                placeholderTextColor={colors.textLight}
              />
              <View style={styles.noteActions}>
                <Pressable
                  style={styles.saveNoteButton}
                  onPress={handleSaveNote}
                  disabled={noteMutation.isPending}
                >
                  <Text style={styles.saveNoteText}>
                    {noteMutation.isPending ? 'Saving…' : 'Save note'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setEditingNote(false)}>
                  <Text style={styles.cancelNoteText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable
              onPress={() => {
                setNoteText(item.manual_note ?? '');
                setEditingNote(true);
              }}
              style={styles.noteCard}
            >
              {item.manual_note ? (
                <Text style={styles.noteText}>{item.manual_note}</Text>
              ) : (
                <Text style={styles.notePlaceholder}>
                  Add a note about why you saved this…
                </Text>
              )}
            </Pressable>
          )}
        </View>

        {/* ── Danger zone ──────────────────────────────────── */}
        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Delete item</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  errorText: { color: colors.danger, fontSize: 15 },

  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginBottom: 14,
    ...cardShadow,
  },
  sourcePlatform: {
    ...typography.label,
    color: colors.accent,
  },
  sourceUrl: { flex: 1, fontSize: 12, color: colors.textMuted },
  sourceArrow: { fontSize: 16, color: colors.accent, fontWeight: '600' },

  creator: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
  },

  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.sm,
    marginBottom: 14,
  },
  categoryText: { fontSize: 12, fontWeight: '700' },

  title: {
    ...typography.display,
    fontSize: 26,
    lineHeight: 34,
    marginBottom: 14,
  },
  summary: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 18,
  },

  noSummaryBox: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
  },
  noSummaryText: { fontSize: 14, color: '#8B6914', lineHeight: 20 },

  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 18,
  },
  tag: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  tagText: { fontSize: 12, color: colors.textMuted },

  lowConfidenceBox: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
  },
  lowConfidenceText: { fontSize: 13, color: '#8B6914', lineHeight: 19 },

  section: { marginBottom: 30 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  sectionProgress: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '600',
  },

  progressTrack: {
    height: 4,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },

  tasksCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 4,
    ...cardShadow,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  taskRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  taskTextBlock: { flex: 1 },
  taskTitle: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  taskTitleDone: {
    color: colors.textLight,
    textDecorationLine: 'line-through',
  },
  taskDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 3,
  },

  noActionsBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: 18,
    marginBottom: 24,
  },
  noActionsText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },

  noteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginTop: 8,
    ...cardShadow,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    minHeight: 100,
    backgroundColor: colors.surface,
    marginTop: 8,
    marginBottom: 10,
  },
  noteActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  saveNoteButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  saveNoteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelNoteText: { color: colors.textMuted, fontSize: 14 },
  noteText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  notePlaceholder: {
    fontSize: 15,
    color: colors.textLight,
    fontStyle: 'italic',
  },

  deleteButton: { alignItems: 'center', padding: 16 },
  deleteText: { color: colors.danger, fontSize: 14 },
});
