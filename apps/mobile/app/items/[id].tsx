/**
 * Item Detail screen.
 *
 * Shows the full enriched item: title, summary, category, tags,
 * and the action steps checklist.
 */

import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Alert, TextInput, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getItem, updateItem, updateTask, deleteItem, type ActionTask, type Item } from '../../lib/api';
import { colors, radius, typography, spacing, cardShadow } from '../../lib/theme';

const PIN_COLORS: Record<string, string> = {
  restaurant: '#E53E3E', landmark: '#3182CE', hotel: '#805AD5',
  activity: '#D69E2E', neighborhood: '#38A169', other: '#718096',
};

function SectionPanel({ item }: { item: Item }) {
  const section = item.section ?? 'general';
  const d = item.section_data;
  if (!d || section === 'general') return null;

  if (section === 'travel') {
    const locs = d.locations ?? [];
    if (locs.length === 0) return null;
    const avgLat = locs.reduce((s, l) => s + l.lat, 0) / locs.length;
    const avgLng = locs.reduce((s, l) => s + l.lng, 0) / locs.length;
    const delta = locs.length > 1 ? 8 : 0.3;
    const pinsJson = JSON.stringify(locs.map(loc => ({
      lat: loc.lat, lng: loc.lng, name: loc.name,
      color: PIN_COLORS[loc.type] ?? '#718096',
    })));
    const miniMapHtml = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box;}html,body,#map{width:100%;height:100%;}.pin{width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
map.setView([${avgLat},${avgLng}],${locs.length > 1 ? 5 : 13});
var pins=${pinsJson};
pins.forEach(function(p){var el=document.createElement('div');el.className='pin';el.style.backgroundColor=p.color;L.marker([p.lat,p.lng],{icon:L.divIcon({html:el.outerHTML,iconSize:[22,22],iconAnchor:[11,11],className:''})}).addTo(map);});
</script></body></html>`;
    return (
      <View style={panelStyles.panel}>
        <Text style={panelStyles.panelTitle}>{locs.length} location{locs.length > 1 ? 's' : ''}</Text>
        <WebView
          style={panelStyles.miniMap}
          source={{ html: miniMapHtml }}
          javaScriptEnabled
          scrollEnabled={false}
          originWhitelist={['*']}
          mixedContentMode="always"
        />
        {locs.map((loc, i) => (
          <View key={i} style={panelStyles.locationRow}>
            <View style={[panelStyles.locationDot, { backgroundColor: PIN_COLORS[loc.type] ?? '#718096' }]} />
            <View style={{ flex: 1 }}>
              <Text style={panelStyles.locationName}>{loc.name}</Text>
              <Text style={panelStyles.locationDesc} numberOfLines={1}>{loc.description}</Text>
            </View>
          </View>
        ))}
        {d.best_season && <Text style={panelStyles.meta}>Best time to visit: {d.best_season}</Text>}
      </View>
    );
  }

  if (section === 'food') {
    const tastes = d.taste_profile ? Object.entries(d.taste_profile).filter(([, v]) => v).map(([k]) => k) : [];
    const TASTE_EMOJI: Record<string, string> = { sweet: '🍰', salty: '🧂', spicy: '🌶', savory: '🍖', sour: '🍋', umami: '🍜', bitter: '🫖' };
    return (
      <View style={panelStyles.panel}>
        <Text style={panelStyles.panelTitle}>Taste profile</Text>
        <View style={panelStyles.tasteRow}>
          {tastes.map(t => (
            <View key={t} style={panelStyles.tastePill}>
              <Text style={{ fontSize: 16 }}>{TASTE_EMOJI[t] ?? '🍽'}</Text>
              <Text style={panelStyles.tastePillText}>{t}</Text>
            </View>
          ))}
        </View>
        <View style={panelStyles.metaGrid}>
          {d.cuisine && <View style={panelStyles.metaItem}><Text style={panelStyles.metaLabel}>Cuisine</Text><Text style={panelStyles.metaValue}>{d.cuisine}</Text></View>}
          {d.cook_time_minutes && <View style={panelStyles.metaItem}><Text style={panelStyles.metaLabel}>Time</Text><Text style={panelStyles.metaValue}>{d.cook_time_minutes < 60 ? `${d.cook_time_minutes}m` : `${Math.floor(d.cook_time_minutes/60)}h`}</Text></View>}
          {d.difficulty && <View style={panelStyles.metaItem}><Text style={panelStyles.metaLabel}>Difficulty</Text><Text style={panelStyles.metaValue}>{d.difficulty}</Text></View>}
          {d.ingredient_count && <View style={panelStyles.metaItem}><Text style={panelStyles.metaLabel}>Ingredients</Text><Text style={panelStyles.metaValue}>{d.ingredient_count}</Text></View>}
        </View>
        {(d.dietary ?? []).length > 0 && (
          <View style={panelStyles.dietRow}>
            {d.dietary!.map(t => <View key={t} style={panelStyles.dietTag}><Text style={panelStyles.dietTagText}>{t}</Text></View>)}
          </View>
        )}
        {(d.mood_tags ?? []).length > 0 && (
          <View style={panelStyles.dietRow}>
            {d.mood_tags!.map(t => <View key={t} style={panelStyles.moodTag}><Text style={panelStyles.moodTagText}>{t}</Text></View>)}
          </View>
        )}
      </View>
    );
  }

  if (section === 'ai') {
    const AI_COLORS: Record<string, string> = { ChatGPT: '#10A37F', Claude: '#D97706', Gemini: '#4285F4', Midjourney: '#7C3AED', Cursor: '#1D4ED8', Other: '#6B6B6B' };
    const toolColor = AI_COLORS[d.tool ?? 'Other'] ?? '#6B6B6B';
    return (
      <View style={panelStyles.panel}>
        <View style={panelStyles.aiHeader}>
          <View style={[panelStyles.toolBadge, { backgroundColor: toolColor }]}>
            <Text style={panelStyles.toolBadgeText}>{d.tool ?? 'AI Tool'}</Text>
          </View>
          {d.skill_level && <View style={panelStyles.skillBadge}><Text style={panelStyles.skillText}>{d.skill_level}</Text></View>}
        </View>
        {d.use_case && <Text style={panelStyles.useCase}><Text style={{ fontWeight: '700' }}>Use case: </Text>{d.use_case}</Text>}
        {(d.task_type ?? []).length > 0 && (
          <View style={panelStyles.tasteRow}>
            {d.task_type!.map(t => <View key={t} style={panelStyles.taskTag}><Text style={panelStyles.taskTagText}>{t}</Text></View>)}
          </View>
        )}
        {d.prompt_tip && (
          <View style={panelStyles.promptBox}>
            <Text style={panelStyles.promptLabel}>PROMPT TIP</Text>
            <Text style={panelStyles.promptText}>{d.prompt_tip}</Text>
          </View>
        )}
      </View>
    );
  }

  if (section === 'money') {
    const tickers = d.tickers ?? [];
    const SENT = { bullish: { color: '#1A7F37', bg: '#E6F4EA', label: '▲ Bullish' }, bearish: { color: '#E53E3E', bg: '#FEE2E2', label: '▼ Bearish' }, neutral: { color: '#64748B', bg: '#F1F5F9', label: '— Neutral' } };
    return (
      <View style={panelStyles.panel}>
        {tickers.length > 0 && (
          <>
            <Text style={panelStyles.panelTitle}>Tickers mentioned</Text>
            <View style={panelStyles.tickersRow}>
              {tickers.map(t => {
                const s = SENT[t.sentiment] ?? SENT.neutral;
                return (
                  <View key={t.symbol} style={[panelStyles.ticker, { backgroundColor: s.bg }]}>
                    <Text style={[panelStyles.tickerSymbol, { color: s.color }]}>${t.symbol}</Text>
                    <Text style={[panelStyles.tickerSent, { color: s.color }]}>{s.label}</Text>
                    <Text style={[panelStyles.tickerType, { color: s.color }]}>{t.type}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
        <View style={panelStyles.metaGrid}>
          {d.asset_type && <View style={panelStyles.metaItem}><Text style={panelStyles.metaLabel}>Asset type</Text><Text style={panelStyles.metaValue}>{d.asset_type}</Text></View>}
          {d.tip_type && <View style={panelStyles.metaItem}><Text style={panelStyles.metaLabel}>Tip type</Text><Text style={panelStyles.metaValue}>{d.tip_type}</Text></View>}
          {d.time_horizon && <View style={panelStyles.metaItem}><Text style={panelStyles.metaLabel}>Horizon</Text><Text style={panelStyles.metaValue}>{d.time_horizon}</Text></View>}
          {d.risk_level && <View style={panelStyles.metaItem}><Text style={panelStyles.metaLabel}>Risk</Text><Text style={panelStyles.metaValue}>{d.risk_level}</Text></View>}
        </View>
        {d.confidence_note && (
          <View style={panelStyles.confidenceBox}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={panelStyles.confidenceNote}>{d.confidence_note}</Text>
          </View>
        )}
      </View>
    );
  }

  return null;
}

const panelStyles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginBottom: 20, ...cardShadow, gap: 12 },
  panelTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  miniMap: { height: 180, borderRadius: radius.md, overflow: 'hidden' },
  pin: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  locationDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  locationName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  locationDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  meta: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  tasteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tastePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  tastePillText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, textTransform: 'capitalize' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { gap: 2 },
  metaLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, textTransform: 'capitalize' },
  dietRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dietTag: { backgroundColor: '#38A169' + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  dietTagText: { fontSize: 11, color: '#38A169', fontWeight: '600' },
  moodTag: { backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  moodTagText: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  aiHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  toolBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full },
  toolBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  skillBadge: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  skillText: { fontSize: 12, color: colors.textMuted, fontWeight: '600', textTransform: 'capitalize' },
  useCase: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  taskTag: { backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  taskTagText: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  promptBox: { backgroundColor: '#1A1A2E', borderRadius: radius.md, padding: 14, gap: 6 },
  promptLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
  promptText: { fontSize: 13, color: '#E2E8F0', lineHeight: 20, fontFamily: 'monospace' },
  tickersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ticker: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, gap: 2 },
  tickerSymbol: { fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },
  tickerSent: { fontSize: 11, fontWeight: '600' },
  tickerType: { fontSize: 10, opacity: 0.7, textTransform: 'uppercase' },
  confidenceBox: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  confidenceNote: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
});

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

        {/* Summary — detect deleted/unavailable content */}
        {item.extraction_quality === 'failed' || (item.summary ?? '').toLowerCase().includes('not available') || (item.summary ?? '').toLowerCase().includes('taken down') || (item.summary ?? '').toLowerCase().includes('no longer available') ? (
          <View style={styles.deletedBox}>
            <Ionicons name="alert-circle-outline" size={20} color="#9B2C2C" />
            <Text style={styles.deletedText}>
              This content has been deleted or is no longer available. The original post was removed before it could be analysed.
            </Text>
          </View>
        ) : item.summary ? (
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

        {/* ── Section-specific data ────────────────────────── */}
        <SectionPanel item={item} />

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

  deletedBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FFF5F5', borderRadius: radius.md,
    padding: 16, marginBottom: 18, borderLeftWidth: 3, borderLeftColor: '#FC8181',
  },
  deletedText: { flex: 1, fontSize: 14, color: '#9B2C2C', lineHeight: 20 },
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
