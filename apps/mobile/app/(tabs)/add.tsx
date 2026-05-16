/**
 * Add Link screen.
 *
 * The primary input surface for MVP.
 * User pastes a URL (or reads from clipboard), optionally adds a note,
 * and taps Analyze. The app calls POST /analyze synchronously and
 * navigates to the result when ready.
 *
 * Loading state is explicit — analysis takes 5-12s and the user should
 * know something real is happening.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { analyzeUrl, analyzeUrls } from '../../lib/api';
import { colors, radius, typography, spacing, cardShadow } from '../../lib/theme';

const PLATFORM_HINTS = [
  { label: 'YouTube', icon: '▶' },
  { label: 'TikTok', icon: '♪' },
  { label: 'Instagram', icon: '◈' },
  { label: 'Web', icon: '○' },
];

export default function AddLinkScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sharedUrl } = useLocalSearchParams<{ sharedUrl?: string }>();

  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Auto-fill URL when app is opened via Android share intent
  useEffect(() => {
    if (sharedUrl && sharedUrl.startsWith('http')) {
      setUrl(sharedUrl);
    }
  }, [sharedUrl]);

  async function pasteFromClipboard() {
    const text = await Clipboard.getStringAsync();
    if (text?.startsWith('http')) {
      const pasted = text.trim();
      setUrl((prev) => (prev.trim() ? prev.trimEnd() + '\n' + pasted : pasted));
    } else {
      Alert.alert('Nothing to paste', 'Copy a link first, then tap Paste.');
    }
  }

  function parseUrls(input: string): string[] {
    return input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async function handleAnalyze() {
    const urls = parseUrls(url);
    if (urls.length === 0) {
      Alert.alert('Paste a link first', 'Enter a URL to analyze.');
      return;
    }

    for (const u of urls) {
      try {
        new URL(u);
      } catch {
        Alert.alert('Invalid URL', `This URL is not valid:\n${u}`);
        return;
      }
    }

    setLoading(true);

    const isBatch = urls.length > 1;

    if (isBatch) {
      setLoadingMessage(`Analyzing 0/${urls.length} links…`);
    } else {
      setLoadingMessage('Fetching content…');
    }

    const msg2 = !isBatch ? setTimeout(() => setLoadingMessage('Reading with AI…'), 3000) : null;
    const msg3 = !isBatch ? setTimeout(() => setLoadingMessage('Extracting action steps…'), 7000) : null;

    try {
      if (isBatch) {
        const results = await analyzeUrls(
          urls,
          note.trim() || undefined,
          (completed, total) => {
            setLoadingMessage(`Analyzing ${completed}/${total} links…`);
          },
        );

        await queryClient.invalidateQueries({ queryKey: ['items'] });
        setUrl('');
        setNote('');
        router.push(`/items/${results[results.length - 1].item.id}`);
      } else {
        const result = await analyzeUrl(urls[0], note.trim() || undefined);
        await queryClient.invalidateQueries({ queryKey: ['items'] });
        setUrl('');
        setNote('');
        router.push(`/items/${result.item.id}`);
      }
    } catch (err: any) {
      Alert.alert(
        'Analysis failed',
        err.message ?? 'Something went wrong. Please try again.',
      );
    } finally {
      if (msg2) clearTimeout(msg2);
      if (msg3) clearTimeout(msg3);
      setLoading(false);
      setLoadingMessage('');
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingCircle}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
        <Text style={styles.loadingTitle}>Analyzing…</Text>
        <Text style={styles.loadingSubtitle}>{loadingMessage}</Text>
        <Text style={styles.loadingHint}>This takes about 10 seconds</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={styles.headline}>Save a link</Text>
        <Text style={styles.subheadline}>
          Paste one or more links — we'll extract what matters and what to do next.
        </Text>

        {/* Platform hints */}
        <View style={styles.hintRow}>
          {PLATFORM_HINTS.map((h) => (
            <View key={h.label} style={styles.hintChip}>
              <Text style={styles.hintIcon}>{h.icon}</Text>
              <Text style={styles.hintText}>{h.label}</Text>
            </View>
          ))}
        </View>

        {/* URL input card */}
        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>Link</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              placeholder={"https://\nhttps://\nOne link per line"}
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

          <Text style={styles.fieldLabel}>
            Context <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g. AI resume side hustle, pasta recipe, travel packing tips"
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={3}
            value={note}
            onChangeText={setNote}
            maxLength={500}
          />
          <Text style={styles.noteHint}>
            Helps when the link doesn't have much text (e.g. Instagram reels).
          </Text>
        </View>

        {/* Analyze button */}
        <Pressable
          style={[styles.analyzeButton, !url.trim() && styles.analyzeButtonDisabled]}
          onPress={handleAnalyze}
          disabled={!url.trim()}
        >
          <Text style={styles.analyzeButtonText}>
            {parseUrls(url).length > 1
              ? `Analyze ${parseUrls(url).length} links`
              : 'Analyze'}
          </Text>
          <Text style={styles.analyzeArrow}>→</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: spacing.md },

  headline: {
    ...typography.display,
    marginBottom: 10,
  },
  subheadline: {
    ...typography.body,
    marginBottom: 24,
  },

  hintRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  hintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  hintIcon: { fontSize: 12, color: colors.textMuted },
  hintText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },

  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 24,
    ...cardShadow,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  optional: {
    fontWeight: '400',
    color: colors.textMuted,
  },

  urlRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20 },
  urlInput: {
    flex: 1,
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    textAlignVertical: 'top',
  },
  pasteButton: {
    height: 48,
    paddingHorizontal: 20,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteButtonText: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },

  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: 6,
  },
  noteHint: { ...typography.caption, marginBottom: 4 },

  analyzeButton: {
    height: 56,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...cardShadow,
    shadowOpacity: 0.12,
  },
  analyzeButtonDisabled: { opacity: 0.35 },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  analyzeArrow: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '500',
  },

  // Loading state
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    ...typography.headline,
    marginTop: 24,
  },
  loadingSubtitle: {
    fontSize: 15,
    color: colors.accent,
    marginTop: 8,
  },
  loadingHint: {
    ...typography.caption,
    marginTop: 6,
  },
});
