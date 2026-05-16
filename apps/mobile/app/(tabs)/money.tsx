import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listItems, type Item, type MoneyTicker } from '../../lib/api';
import { colors, spacing, radius, cardShadow } from '../../lib/theme';

type AssetFilter = 'all' | 'stock' | 'crypto' | 'etf' | 'real estate' | 'other';

const ASSET_FILTERS: { key: AssetFilter; label: string; icon: string; color: string }[] = [
  { key: 'all',         label: 'All',         icon: 'briefcase-outline',    color: colors.accent },
  { key: 'stock',       label: 'Stocks',      icon: 'trending-up-outline',  color: '#1A7F37' },
  { key: 'crypto',      label: 'Crypto',      icon: 'logo-bitcoin',         color: '#F59E0B' },
  { key: 'etf',         label: 'ETFs',        icon: 'pie-chart-outline',    color: '#3B82F6' },
  { key: 'real estate', label: 'Real Estate', icon: 'home-outline',         color: '#8B5CF6' },
  { key: 'other',       label: 'Other',       icon: 'ellipsis-horizontal-outline', color: '#6B6B6B' },
];

const SENTIMENT_CONFIG = {
  bullish: { color: '#1A7F37', bg: '#E6F4EA', icon: 'arrow-up-outline' as const, label: '▲ Bullish' },
  bearish: { color: '#E53E3E', bg: '#FEE2E2', icon: 'arrow-down-outline' as const, label: '▼ Bearish' },
  neutral: { color: '#64748B', bg: '#F1F5F9', icon: 'remove-outline' as const, label: '— Neutral' },
};

const RISK_CONFIG = {
  low:    { color: '#1A7F37', label: 'Low Risk' },
  medium: { color: '#D69E2E', label: 'Med Risk' },
  high:   { color: '#E53E3E', label: 'High Risk' },
};

const HORIZON_CONFIG = {
  'short-term':  { color: '#E53E3E', label: 'Short-term' },
  'medium-term': { color: '#D69E2E', label: 'Mid-term' },
  'long-term':   { color: '#1A7F37', label: 'Long-term' },
};

export default function MoneyScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<AssetFilter>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'money'],
    queryFn: () => listItems({ section: 'money', limit: 200 }),
  });

  const items = data?.items ?? [];
  const filtered = activeFilter === 'all'
    ? items
    : items.filter(i => {
        const assetType = (i.section_data?.asset_type ?? '').toLowerCase();
        const tickers = i.section_data?.tickers ?? [];
        return assetType.includes(activeFilter) || tickers.some(t => t.type === activeFilter);
      });

  function renderTicker(ticker: MoneyTicker) {
    const s = SENTIMENT_CONFIG[ticker.sentiment] ?? SENTIMENT_CONFIG.neutral;
    return (
      <View key={ticker.symbol} style={[styles.ticker, { backgroundColor: s.bg }]}>
        <Text style={[styles.tickerSymbol, { color: s.color }]}>${ticker.symbol}</Text>
        <Text style={[styles.tickerSentiment, { color: s.color }]}>{s.label}</Text>
      </View>
    );
  }

  function renderCard({ item }: { item: Item }) {
    const d = item.section_data;
    const tickers = d?.tickers ?? [];
    const risk = d?.risk_level;
    const horizon = d?.time_horizon;
    const tipType = d?.tip_type;

    return (
      <Pressable style={styles.card} onPress={() => router.push(`/items/${item.id}`)}>
        {/* Header badges */}
        <View style={styles.cardHeader}>
          {tipType && tipType !== 'other' && (
            <View style={styles.tipTypeBadge}>
              <Text style={styles.tipTypeText}>{tipType}</Text>
            </View>
          )}
          {risk && RISK_CONFIG[risk as keyof typeof RISK_CONFIG] && (
            <View style={[styles.riskBadge, { backgroundColor: RISK_CONFIG[risk as keyof typeof RISK_CONFIG].color + '18' }]}>
              <Text style={[styles.riskText, { color: RISK_CONFIG[risk as keyof typeof RISK_CONFIG].color }]}>
                {RISK_CONFIG[risk as keyof typeof RISK_CONFIG].label}
              </Text>
            </View>
          )}
          {horizon && HORIZON_CONFIG[horizon as keyof typeof HORIZON_CONFIG] && (
            <View style={[styles.horizonBadge, { backgroundColor: HORIZON_CONFIG[horizon as keyof typeof HORIZON_CONFIG].color + '18' }]}>
              <Ionicons name="time-outline" size={11} color={HORIZON_CONFIG[horizon as keyof typeof HORIZON_CONFIG].color} />
              <Text style={[styles.horizonText, { color: HORIZON_CONFIG[horizon as keyof typeof HORIZON_CONFIG].color }]}>
                {HORIZON_CONFIG[horizon as keyof typeof HORIZON_CONFIG].label}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.summary && <Text style={styles.cardSummary} numberOfLines={2}>{item.summary}</Text>}

        {/* Ticker pills */}
        {tickers.length > 0 && (
          <View style={styles.tickers}>{tickers.slice(0, 5).map(renderTicker)}</View>
        )}

        {/* Asset type */}
        {d?.asset_type && (
          <View style={styles.assetRow}>
            <Ionicons name="briefcase-outline" size={12} color={colors.textMuted} />
            <Text style={styles.assetText}>{d.asset_type}</Text>
          </View>
        )}

        {/* Confidence note */}
        {d?.confidence_note && (
          <View style={styles.confidenceRow}>
            <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
            <Text style={styles.confidenceText} numberOfLines={1}>{d.confidence_note}</Text>
          </View>
        )}
      </Pressable>
    );
  }

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Money & Investing</Text>
        <Text style={styles.subtitle}>{items.length} saved tips & analyses</Text>
      </View>

      {/* Asset filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {ASSET_FILTERS.map(f => (
          <Pressable
            key={f.key}
            style={[styles.filterChip, activeFilter === f.key && { backgroundColor: f.color }]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Ionicons name={f.icon as any} size={13} color={activeFilter === f.key ? '#fff' : f.color} />
            <Text style={[styles.filterText, activeFilter === f.key && { color: '#fff' }]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="trending-up-outline" size={48} color={colors.accent} />
          <Text style={styles.emptyTitle}>No financial saves yet</Text>
          <Text style={styles.emptySub}>Save an investing reel and tickers will be extracted automatically</Text>
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
  filterScroll: { flexGrow: 0 },
  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: 12, gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceSecondary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  listContent: { padding: spacing.lg, gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, ...cardShadow, gap: 10 },
  cardHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tipTypeBadge: { backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  tipTypeText: { fontSize: 11, color: colors.accent, fontWeight: '700', textTransform: 'capitalize' },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  riskText: { fontSize: 11, fontWeight: '600' },
  horizonBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  horizonText: { fontSize: 11, fontWeight: '600' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, lineHeight: 22 },
  cardSummary: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  tickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ticker: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  tickerSymbol: { fontSize: 13, fontWeight: '800', fontFamily: 'monospace' },
  tickerSentiment: { fontSize: 11, fontWeight: '600' },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assetText: { fontSize: 12, color: colors.textMuted },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  confidenceText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
});
