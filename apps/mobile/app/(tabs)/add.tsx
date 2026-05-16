import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { analyzeUrl, analyzeUrls } from '../../lib/api';
import { colors, radius, spacing, cardShadow } from '../../lib/theme';

type Section = 'auto' | 'travel' | 'food' | 'ai' | 'money' | 'general';

const SECTION_HINTS: { key: Section; label: string; icon: string; color: string; hint: string }[] = [
  { key: 'auto',    label: 'Auto',    icon: 'sparkles-outline',    color: colors.textMuted,  hint: 'Let AI decide' },
  { key: 'travel',  label: 'Travel',  icon: 'map-outline',          color: '#2B8A6E',         hint: 'Drop pins on map' },
  { key: 'food',    label: 'Food',    icon: 'restaurant-outline',   color: '#C05621',         hint: 'Taste profile + recipe' },
  { key: 'ai',      label: 'AI',      icon: 'sparkles-outline',     color: '#5B5FD6',         hint: 'Tool + prompt tips' },
  { key: 'money',   label: 'Money',   icon: 'trending-up-outline',  color: '#1A7F37',         hint: 'Tickers + analysis' },
];

const LOADING_MESSAGES: Record<Section, string[]> = {
  travel:  ['Fetching content…', 'Extracting locations…', 'Dropping pins on map…'],
  food:    ['Fetching content…', 'Reading with AI…', 'Building taste profile…'],
  ai:      ['Fetching content…', 'Detecting AI tool…', 'Extracting prompt tips…'],
  money:   ['Fetching content…', 'Reading with AI…', 'Extracting tickers…'],
  general: ['Fetching content…', 'Reading with AI…', 'Extracting action steps…'],
  auto:    ['Fetching content…', 'Reading with AI…', 'Extracting insights…'],
};

function detectSectionFromUrl(url: string): Section {
  const u = url.toLowerCase();
  if (/instagram|tiktok|youtube/.test(u)) return 'auto';
  if (/tripadvisor|booking|airbnb|hotels|maps\.google|wanderlog/.test(u)) return 'travel';
  if (/allrecipes|yummly|food52|tasty|delish|seriouseats/.test(u)) return 'food';
  if (/openai|anthropic|google\.com\/gemini|midjourney|cursor\.sh|huggingface/.test(u)) return 'ai';
  if (/robinhood|coinbase|binance|tradingview|seekingalpha|investing\.com/.test(u)) return 'money';
  return 'auto';
}

export default function AddLinkScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sharedUrl } = useLocalSearchParams<{ sharedUrl?: string }>();

  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [section, setSection] = useState<Section>('auto');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  useEffect(() => {
    if (sharedUrl && sharedUrl.startsWith('http')) {
      setUrl(sharedUrl);
      const detected = detectSectionFromUrl(sharedUrl);
      if (detected !== 'auto') setSection(detected);
    }
  }, [sharedUrl]);

  async function pasteFromClipboard() {
    const text = await Clipboard.getStringAsync();
    if (text?.startsWith('http')) {
      setUrl(text.trim());
      const detected = detectSectionFromUrl(text);
      if (detected !== 'auto') setSection(detected);
    } else {
      Alert.alert('Nothing to paste', 'Copy a link first, then tap Paste.');
    }
  }

  function parseUrls(input: string): string[] {
    return input.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  }

  async function handleAnalyze() {
    const urls = parseUrls(url);
    if (urls.length === 0) { Alert.alert('Paste a link first', 'Enter a URL to analyze.'); return; }
    for (const u of urls) {
      try { new URL(u); } catch { Alert.alert('Invalid URL', `Not a valid URL:\n${u}`); return; }
    }

    setLoading(true);
    const messages = LOADING_MESSAGES[section];
    setLoadingMessage(messages[0]);
    const t1 = setTimeout(() => setLoadingMessage(messages[1] ?? messages[0]), 3500);
    const t2 = setTimeout(() => setLoadingMessage(messages[2] ?? messages[1] ?? messages[0]), 8000);

    const manualNote = note.trim() || (section !== 'auto' ? `Section: ${section}` : undefined);

    try {
      if (urls.length > 1) {
        const results = await analyzeUrls(urls, manualNote, (c, t) => setLoadingMessage(`Analyzing ${c}/${t}…`));
        await queryClient.invalidateQueries({ queryKey: ['items'] });
        setUrl(''); setNote('');
        router.push(`/items/${results[results.length - 1].item.id}`);
      } else {
        const result = await analyzeUrl(urls[0], manualNote);
        await queryClient.invalidateQueries({ queryKey: ['items'] });
        setUrl(''); setNote('');
        router.push(`/items/${result.item.id}`);
      }
    } catch (err: any) {
      Alert.alert('Analysis failed', err.message ?? 'Something went wrong.');
    } finally {
      clearTimeout(t1); clearTimeout(t2);
      setLoading(false); setLoadingMessage('');
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={[styles.loadingCircle, section !== 'auto' && { backgroundColor: SECTION_HINTS.find(s => s.key === section)?.color + '18' }]}>
          <ActivityIndicator size="large" color={section !== 'auto' ? SECTION_HINTS.find(s => s.key === section)?.color : colors.accent} />
        </View>
        <Text style={styles.loadingTitle}>Analyzing…</Text>
        <Text style={[styles.loadingSubtitle, { color: section !== 'auto' ? SECTION_HINTS.find(s => s.key === section)?.color : colors.accent }]}>{loadingMessage}</Text>
        <Text style={styles.loadingHint}>Takes about 10–15 seconds</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.headline}>Save a link</Text>
        <Text style={styles.sub}>Paste any link — we'll extract what matters and what to do next.</Text>

        {/* Section selector */}
        <Text style={styles.fieldLabel}>Save to</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }} contentContainerStyle={{ gap: 8 }}>
          {SECTION_HINTS.map(s => (
            <Pressable
              key={s.key}
              style={[styles.sectionChip, section === s.key && { backgroundColor: s.color, borderColor: s.color }]}
              onPress={() => setSection(s.key)}
            >
              <Ionicons name={s.icon as any} size={14} color={section === s.key ? '#fff' : s.color} />
              <View>
                <Text style={[styles.sectionChipLabel, section === s.key && { color: '#fff' }]}>{s.label}</Text>
                <Text style={[styles.sectionChipHint, section === s.key && { color: 'rgba(255,255,255,0.7)' }]}>{s.hint}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {/* URL input */}
        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>Link</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              placeholder="https://"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              multiline
              numberOfLines={3}
              value={url}
              onChangeText={setUrl}
            />
            <Pressable style={styles.pasteButton} onPress={pasteFromClipboard}>
              <Text style={styles.pasteButtonText}>Paste</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Context <Text style={{ fontWeight: '400', color: colors.textMuted }}>(optional)</Text></Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Add context to improve AI analysis (e.g. 'Tokyo budget trip', 'vegan pasta recipe')"
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={2}
            value={note}
            onChangeText={setNote}
            maxLength={500}
          />
        </View>

        <Pressable style={[styles.analyzeButton, !url.trim() && styles.analyzeButtonDisabled]} onPress={handleAnalyze} disabled={!url.trim()}>
          <Text style={styles.analyzeButtonText}>
            {parseUrls(url).length > 1 ? `Analyze ${parseUrls(url).length} links` : 'Analyze →'}
          </Text>
        </Pressable>
        {!url.trim() && <Text style={styles.disabledHint}>Paste a link above to continue</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: 64 },
  headline: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 8 },
  sub: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  sectionChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: 'transparent', minWidth: 110 },
  sectionChipLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  sectionChipHint: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  inputCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, marginBottom: 24, ...cardShadow, gap: 12 },
  urlRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  urlInput: { flex: 1, minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.bg, textAlignVertical: 'top' },
  pasteButton: { height: 44, paddingHorizontal: 18, backgroundColor: colors.surfaceSecondary, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  pasteButtonText: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  noteInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.bg, textAlignVertical: 'top', minHeight: 64 },
  analyzeButton: { height: 56, backgroundColor: colors.accent, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', ...cardShadow },
  analyzeButtonDisabled: { opacity: 0.35 },
  analyzeButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  disabledHint: { textAlign: 'center', fontSize: 13, color: colors.textMuted, marginTop: 10 },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  loadingTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: 24 },
  loadingSubtitle: { fontSize: 15, color: colors.accent, marginTop: 8 },
  loadingHint: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
});
