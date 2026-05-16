import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Modal, ActivityIndicator, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listItems, type Item } from '../../lib/api';
import { colors, spacing, radius, cardShadow } from '../../lib/theme';

const PIN_COLORS: Record<string, string> = {
  restaurant: '#E53E3E',
  landmark:   '#3182CE',
  hotel:      '#805AD5',
  activity:   '#D69E2E',
  neighborhood:'#38A169',
  other:      '#718096',
};

function formatAge(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Build a self-contained Leaflet HTML page with all location pins baked in. */
function buildMapHtml(items: Item[]): string {
  // Flatten all locations tagged with their parent item id
  const pins = items.flatMap(item =>
    (item.section_data?.locations ?? []).map(loc => ({
      id: item.id,
      lat: loc.lat,
      lng: loc.lng,
      name: loc.name,
      type: loc.type ?? 'other',
      color: PIN_COLORS[loc.type ?? 'other'] ?? '#718096',
      title: item.title ?? 'Travel',
      summary: (item.summary ?? '').slice(0, 120),
    }))
  );

  const pinsJson = JSON.stringify(pins);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .custom-pin {
      width: 28px; height: 28px; border-radius: 50%;
      border: 2.5px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 12px; padding: 0; overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
    }
    .leaflet-popup-content { margin: 0; min-width: 200px; }
    .popup-inner { padding: 14px 16px; }
    .popup-title { font-size: 14px; font-weight: 700; color: #1A1A1A; margin-bottom: 4px; }
    .popup-sub { font-size: 12px; color: #666; line-height: 1.4; margin-bottom: 10px; }
    .popup-btn {
      display: block; background: #FF5924; color: #fff;
      text-align: center; padding: 8px 0; font-size: 13px;
      font-weight: 700; border: none; width: 100%; cursor: pointer;
      border-radius: 0 0 12px 12px; margin-top: 4px;
    }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var pins = ${pinsJson};

  var map = L.map('map', { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  if (pins.length === 0) {
    map.setView([20, 10], 2);
  }

  var bounds = [];

  pins.forEach(function(pin) {
    var el = document.createElement('div');
    el.className = 'custom-pin';
    el.style.backgroundColor = pin.color;

    var icon = L.divIcon({
      html: el.outerHTML,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      className: ''
    });

    var marker = L.marker([pin.lat, pin.lng], { icon: icon }).addTo(map);

    var popupHtml =
      '<div class="popup-inner">' +
        '<div class="popup-title">' + pin.name + '</div>' +
        '<div class="popup-sub">' + pin.title + (pin.summary ? '<br>' + pin.summary : '') + '</div>' +
      '</div>' +
      '<button class="popup-btn" onclick="openItem(\'' + pin.id + '\')">View details →</button>';

    marker.bindPopup(popupHtml, { maxWidth: 260 });
    bounds.push([pin.lat, pin.lng]);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 13);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }

  function openItem(id) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'openItem', id: id }));
    }
  }
</script>
</body>
</html>`;
}

export default function TravelScreen() {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'travel'],
    queryFn: () => listItems({ section: 'travel', limit: 200 }),
  });

  const items = data?.items ?? [];
  const totalPins = items.reduce((n, item) => n + (item.section_data?.locations?.length ?? 0), 0);
  const allCountries = [
    ...new Set(
      items
        .flatMap(item => item.section_data?.locations ?? [])
        .map(loc => loc.name.split(',').pop()?.trim())
        .filter(Boolean)
    ),
  ];

  function handleWebMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'openItem') {
        const item = items.find(i => i.id === msg.id);
        if (item) setSelectedItem(item);
      }
    } catch {}
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Travel Map</Text>
          <Text style={styles.subtitle}>
            {totalPins} {totalPins === 1 ? 'pin' : 'pins'} · {allCountries.length} {allCountries.length === 1 ? 'destination' : 'destinations'}
          </Text>
        </View>
      </View>

      {/* Map */}
      <WebView
        style={styles.map}
        source={{ html: buildMapHtml(items) }}
        onMessage={handleWebMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
      />

      {/* Empty state overlay */}
      {items.length === 0 && (
        <View style={styles.emptyOverlay}>
          <View style={styles.emptyCard}>
            <Ionicons name="map-outline" size={40} color={colors.accent} />
            <Text style={styles.emptyTitle}>No travel saves yet</Text>
            <Text style={styles.emptySub}>Save a travel reel and pins will drop here automatically</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/add')}>
              <Text style={styles.emptyBtnText}>Save a travel link →</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Bottom strip — saved trips */}
      {items.length > 0 && (
        <View style={styles.bottomStrip}>
          <Text style={styles.stripLabel}>SAVED TRIPS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: spacing.lg }}>
            {items.map(item => {
              const locs = item.section_data?.locations ?? [];
              return (
                <Pressable
                  key={item.id}
                  style={styles.tripChip}
                  onPress={() => setSelectedItem(item)}
                >
                  <Ionicons name="map-outline" size={13} color={colors.accent} />
                  <Text style={styles.tripChipText} numberOfLines={1}>{item.title ?? 'Travel'}</Text>
                  {locs.length > 0 && <Text style={styles.pinCount}>{locs.length} pins</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Item detail bottom sheet */}
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedItem(null)}>
          <View style={styles.modalSheet}>
            <View style={styles.handle} />
            {selectedItem && (
              <>
                <Text style={styles.modalTitle} numberOfLines={2}>{selectedItem.title}</Text>
                {selectedItem.summary ? (
                  <Text style={styles.modalSummary} numberOfLines={3}>{selectedItem.summary}</Text>
                ) : null}
                {selectedItem.section_data?.trip_context ? (
                  <Text style={styles.modalContext}>{selectedItem.section_data.trip_context}</Text>
                ) : null}
                {(selectedItem.section_data?.locations ?? []).length > 0 && (
                  <View style={styles.locList}>
                    {(selectedItem.section_data?.locations ?? []).slice(0, 5).map((loc, i) => (
                      <View key={i} style={styles.locRow}>
                        <View style={[styles.locDot, { backgroundColor: PIN_COLORS[loc.type] ?? '#718096' }]} />
                        <Text style={styles.locName} numberOfLines={1}>{loc.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Pressable
                  style={styles.modalBtn}
                  onPress={() => { setSelectedItem(null); router.push(`/items/${selectedItem.id}`); }}
                >
                  <Text style={styles.modalBtnText}>View full details →</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: 12,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  map: { flex: 1 },

  // Empty state
  emptyOverlay: { position: 'absolute', top: 120, left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 32, alignItems: 'center', gap: 12, ...cardShadow },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.full, marginTop: 4 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Bottom strip
  bottomStrip: { backgroundColor: colors.surface, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border },
  stripLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.6, paddingHorizontal: spacing.lg, marginBottom: 8 },
  tripChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, maxWidth: 200 },
  tripChipText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  pinCount: { fontSize: 11, color: colors.accent, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40, gap: 12 },
  handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  modalSummary: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  modalContext: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  locList: { gap: 6 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locDot: { width: 10, height: 10, borderRadius: 5 },
  locName: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  modalBtn: { backgroundColor: colors.accent, borderRadius: radius.full, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
