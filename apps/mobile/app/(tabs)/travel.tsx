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
import { effectiveSection } from '../../lib/sections';
import { dedupItems, type DedupedItem } from '../../lib/dedup';
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

/**
 * Build a self-contained Leaflet HTML page with all location pins baked in.
 *
 * Reliability notes:
 *  - Loads Leaflet from cdnjs (Cloudflare) — more reliable than unpkg on mobile networks.
 *  - Falls back to jsdelivr if cdnjs fails.
 *  - Posts {type:'ready'} once the map renders, {type:'error', msg} if Leaflet won't load.
 *  - Uses both CartoCDN and OSM tiles so even if one fails, the other shows.
 */
function buildMapHtml(items: Item[]): string {
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
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    body { background: linear-gradient(160deg, #E8D7B8 0%, #CADDC6 48%, #AFC7D5 100%); }
    #map { filter: saturate(1.12) contrast(1.02) sepia(0.08); }
    #map:after {
      content: ""; pointer-events: none; position: fixed; inset: 0; z-index: 450;
      background:
        radial-gradient(circle at 18% 18%, rgba(255, 248, 224, 0.28), transparent 32%),
        radial-gradient(circle at 80% 12%, rgba(255, 89, 36, 0.12), transparent 26%),
        linear-gradient(180deg, rgba(41, 31, 20, 0.10) 0%, transparent 24%, transparent 68%, rgba(41, 31, 20, 0.16) 100%);
      mix-blend-mode: multiply;
    }
    .leaflet-container { background: #D9C5A3; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; }
    .leaflet-control-zoom {
      border: 0 !important; border-radius: 18px !important; overflow: hidden;
      box-shadow: 0 10px 30px rgba(63, 47, 30, 0.20) !important;
    }
    .leaflet-control-zoom a {
      width: 34px !important; height: 34px !important; line-height: 34px !important;
      border: 0 !important; background: rgba(255,255,255,0.86) !important; color: #5B4632 !important;
      backdrop-filter: blur(10px);
    }
    #fallback { display:none; position:fixed; inset:0; padding:24px; font-family:-apple-system,Roboto,sans-serif; color:#1A1A1A; background:#FAFAF8; }
    #fallback h2 { font-size:17px; margin-bottom:8px; }
    #fallback p { font-size:14px; color:#666; line-height:1.5; }
    .pin-wrap { position: relative; width: 42px; height: 48px; }
    .pin-pulse {
      position: absolute; left: 8px; bottom: 2px; width: 26px; height: 10px;
      border-radius: 50%; background: rgba(35, 26, 18, 0.22); filter: blur(2px);
    }
    .custom-pin {
      position: absolute; left: 5px; top: 0;
      width: 32px; height: 32px; border-radius: 18px 18px 18px 4px;
      transform: rotate(-45deg);
      border: 3px solid rgba(255,255,255,0.92);
      box-shadow: 0 10px 22px rgba(48, 33, 18, 0.32), inset 0 -6px 10px rgba(0,0,0,0.12);
    }
    .custom-pin:after {
      content: ""; position: absolute; inset: 7px; border-radius: 50%;
      background: rgba(255,255,255,0.90);
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.15);
    }
    .leaflet-popup-content-wrapper {
      border-radius: 20px; padding: 0; overflow: hidden;
      box-shadow: 0 18px 50px rgba(50,34,20,0.25);
      border: 1px solid rgba(255,255,255,0.55);
    }
    .leaflet-popup-content { margin: 0; min-width: 230px; }
    .leaflet-popup-tip { background: #fffaf4; }
    .popup-inner { padding: 16px 18px 14px; background: linear-gradient(180deg, #fffaf4 0%, #ffffff 100%); }
    .popup-kicker { font-size: 10px; color: #FF5924; letter-spacing: 1px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px; }
    .popup-title { font-size: 16px; font-weight: 800; color: #1A1A1A; margin-bottom: 5px; line-height: 1.18; }
    .popup-sub { font-size: 12px; color: #665C52; line-height: 1.45; margin-bottom: 2px; }
    .popup-btn {
      display: block; background: #FF5924; color: #fff;
      text-align: center; padding: 10px 0; font-size: 13px;
      font-weight: 700; border: none; width: 100%; cursor: pointer;
      border-radius: 0 0 20px 20px; margin-top: 0;
    }
  </style>
</head>
<body>
<div id="map"></div>
<div id="fallback">
  <h2>Map couldn't load</h2>
  <p>We need an internet connection to draw the map. Pull down to retry, or use the list below.</p>
</div>
<script>
  // Tell the RN host what's happening.
  function notify(type, payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
    }
  }

  // Try CDNs in order. Resolve on first success; reject if all fail.
  function loadScript(urls) {
    return new Promise(function(resolve, reject) {
      var i = 0;
      function tryNext() {
        if (i >= urls.length) { reject(new Error('all CDNs failed')); return; }
        var s = document.createElement('script');
        s.src = urls[i++];
        s.async = false;
        s.onload = resolve;
        s.onerror = function() { tryNext(); };
        document.head.appendChild(s);
      }
      tryNext();
    });
  }

  var LEAFLET_CDNS = [
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  ];

  loadScript(LEAFLET_CDNS).then(function() {
    initMap();
  }).catch(function(err) {
    document.getElementById('map').style.display = 'none';
    document.getElementById('fallback').style.display = 'block';
    notify('error', { msg: String(err && err.message || err) });
  });

  function initMap() {
    var pins = ${pinsJson};

    var map = L.map('map', { zoomControl: true, attributionControl: false });

    // Primary tile layer (warm, illustrated travel-map feel) with reliable fallbacks.
    var primary = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    });
    var fallback = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });

    var tilesLoaded = false;
    primary.on('load', function() { tilesLoaded = true; });
    primary.addTo(map);
    // If primary tiles haven't appeared after 4s, swap to OSM.
    setTimeout(function() {
      if (!tilesLoaded) {
        map.removeLayer(primary);
        fallback.addTo(map);
      }
    }, 4000);

    if (pins.length === 0) {
      map.setView([20, 10], 2);
    }

    var bounds = [];
    pins.forEach(function(pin) {
      var el = document.createElement('div');
      el.className = 'pin-wrap';
      el.innerHTML = '<div class="pin-pulse"></div><div class="custom-pin" style="background:' + pin.color + '"></div>';

      var icon = L.divIcon({
        html: el.outerHTML,
        iconSize: [42, 48],
        iconAnchor: [21, 40],
        className: '',
      });

      var marker = L.marker([pin.lat, pin.lng], { icon: icon }).addTo(map);
      var popupHtml =
        '<div class="popup-inner">' +
          '<div class="popup-kicker">' + pin.type + '</div>' +
          '<div class="popup-title">' + pin.name + '</div>' +
          '<div class="popup-sub">' + pin.title + (pin.summary ? '<br>' + pin.summary : '') + '</div>' +
        '</div>' +
        '<button class="popup-btn" onclick="openItem(\\'' + pin.id + '\\')">View details →</button>';
      marker.bindPopup(popupHtml, { maxWidth: 260 });
      bounds.push([pin.lat, pin.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    // Make sure Leaflet measures the container correctly after RN layout.
    setTimeout(function() { map.invalidateSize(); }, 50);
    setTimeout(function() { map.invalidateSize(); }, 500);

    notify('ready', { pins: pins.length });
  }

  window.openItem = function(id) {
    notify('openItem', { id: id });
  };
</script>
</body>
</html>`;
}

export default function TravelScreen() {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'all'],
    queryFn: () => listItems({ limit: 100 }),
  });

  const items = dedupItems((data?.items ?? []).filter(i => effectiveSection(i) === 'travel'));
  const itemsWithoutPins = items.filter(i => !(i.section_data?.locations?.length));
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
      } else if (msg.type === 'ready') {
        setMapState('ready');
      } else if (msg.type === 'error') {
        setMapState('error');
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
      <View style={styles.atlasBackdrop} pointerEvents="none" />

      {/* Floating Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ATLAS</Text>
          <Text style={styles.title}>Travel Map</Text>
          <Text style={styles.subtitle}>
            {totalPins} {totalPins === 1 ? 'pin' : 'pins'} · {allCountries.length} {allCountries.length === 1 ? 'destination' : 'destinations'}
          </Text>
        </View>
        <View style={styles.compass}>
          <Ionicons name="navigate" size={18} color={colors.accent} />
        </View>
      </View>

      {/* Map */}
      <View style={styles.map}>
        <WebView
          style={{ flex: 1 }}
          source={{ html: buildMapHtml(items) }}
          onMessage={handleWebMessage}
          onError={() => setMapState('error')}
          onHttpError={() => setMapState('error')}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
        />
        {mapState === 'loading' && (
          <View style={styles.mapOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.mapOverlayText}>Loading map…</Text>
          </View>
        )}
      </View>

      {/* Empty state overlay — no travel items at all */}
      {items.length === 0 && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
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

      {/* No-pins overlay — items exist but no coordinates were extracted yet */}
      {items.length > 0 && totalPins === 0 && (
        <View style={styles.noPinsOverlay} pointerEvents="box-none">
          <View style={styles.noPinsCard}>
            <Ionicons name="location-outline" size={28} color={colors.accent} />
            <Text style={styles.noPinsTitle}>No locations yet</Text>
            <Text style={styles.noPinsSub}>
              You have {items.length} travel save{items.length === 1 ? '' : 's'}, but the AI hasn't tagged them with coordinates. Tap any below to open it.
            </Text>
          </View>
        </View>
      )}

      {/* Bottom strip — saved trips */}
      {items.length > 0 && (
        <View style={styles.bottomStrip}>
          <View style={styles.bottomHandle} />
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
  container: { flex: 1, backgroundColor: '#D9C5A3' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  atlasBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 2,
    backgroundColor: 'rgba(254,252,249,0.08)',
  },
  header: {
    position: 'absolute',
    top: 48,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,250,244,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: radius.xl,
    ...cardShadow,
    shadowOpacity: 0.14,
    shadowRadius: 24,
  },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.accent, letterSpacing: 1.4, marginBottom: 2 },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.7 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  compass: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },

  map: { flex: 1 },

  // Empty state
  emptyOverlay: { position: 'absolute', top: 120, left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  noPinsOverlay: { position: 'absolute', top: 120, left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  noPinsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, alignItems: 'center', gap: 6, ...cardShadow, maxWidth: 320 },
  noPinsTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  noPinsSub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  mapOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: 'rgba(250,250,248,0.85)' },
  mapOverlayText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 32, alignItems: 'center', gap: 12, ...cardShadow },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.full, marginTop: 4 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Bottom strip
  bottomStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,250,244,0.96)',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.85)',
    ...cardShadow,
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  bottomHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D8CFC5', alignSelf: 'center', marginBottom: 10 },
  stripLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, paddingHorizontal: spacing.lg, marginBottom: 8 },
  tripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    maxWidth: 220,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
    shadowOpacity: 0.05,
  },
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
