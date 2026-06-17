import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Modal, ActivityIndicator, Platform, Animated, PanResponder,
  Dimensions, Linking, Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getItem, listItems, type Item, type TravelLocation } from '../../lib/api';
import { dedupItems, normalizeUrl, type DedupedItem } from '../../lib/dedup';
import { colors, spacing, radius, cardShadow } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PIN_COLORS: Record<string, string> = {
  restaurant: '#E53E3E',
  landmark:   '#3182CE',
  hotel:      '#805AD5',
  activity:   '#D69E2E',
  neighborhood:'#38A169',
  other:      '#718096',
};

type SpotCategory = TravelLocation['type'] | 'all';

type TravelSpot = {
  key: string;
  itemId: string;
  itemTitle: string;
  itemSummary: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  type: TravelLocation['type'];
  imageUrl: string | null;
  destination: string;
  createdAt: string;
};

const CATEGORY_META: Record<SpotCategory, { label: string; icon: keyof typeof Ionicons.glyphMap; glyph: string; color: string }> = {
  all: { label: 'All', icon: 'apps-outline', glyph: '*', color: colors.accent },
  restaurant: { label: 'Restaurants', icon: 'restaurant-outline', glyph: 'F', color: PIN_COLORS.restaurant },
  landmark: { label: 'Landmarks', icon: 'camera-outline', glyph: 'L', color: PIN_COLORS.landmark },
  hotel: { label: 'Hotels', icon: 'bed-outline', glyph: 'H', color: PIN_COLORS.hotel },
  activity: { label: 'Activities', icon: 'walk-outline', glyph: 'A', color: PIN_COLORS.activity },
  neighborhood: { label: 'Areas', icon: 'trail-sign-outline', glyph: 'N', color: PIN_COLORS.neighborhood },
  other: { label: 'Other', icon: 'location-outline', glyph: 'P', color: PIN_COLORS.other },
};

const SHEET_PEEK = 52;
const TAB_BAR_BASE_HEIGHT = 64;
const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY ?? '';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

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
function buildMapHtml(items: Item[], stadiaKey: string, apiUrl: string): string {
  const keyParam = stadiaKey ? `?api_key=${stadiaKey}` : '';
  const rawPins = items.flatMap(item =>
    (item.section_data?.locations ?? []).map((loc, index) => ({
      key: spotKey(item, loc, index),
      id: item.id,
      lat: loc.lat,
      lng: loc.lng,
      name: loc.name,
      description: loc.description ?? '',
      imageUrl: proxiedImageUrl(loc.media_url ?? item.media_urls?.[index] ?? item.media_urls?.[0] ?? null, apiUrl),
      type: loc.type ?? 'other',
      color: PIN_COLORS[loc.type ?? 'other'] ?? '#718096',
      title: item.title ?? 'Travel',
      summary: (item.summary ?? '').slice(0, 90),
      glyph: CATEGORY_META[loc.type ?? 'other']?.glyph ?? CATEGORY_META.other.glyph,
      label: CATEGORY_META[loc.type ?? 'other']?.label ?? CATEGORY_META.other.label,
    }))
  );
  const pins = rawPins.filter((pin, index) => !rawPins.slice(0, index).some(existing => shouldMergeLocations(existing, pin)));

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
    body { background: #EBE3D5; overscroll-behavior: none; }
    #map { filter: saturate(1.18) contrast(1.05); }
    #map:after {
      content: ""; pointer-events: none; position: fixed; inset: 0; z-index: 450;
      background:
        radial-gradient(circle at 16% 18%, rgba(255, 248, 224, 0.12), transparent 30%),
        radial-gradient(circle at 84% 14%, rgba(255, 89, 36, 0.06), transparent 24%),
        linear-gradient(180deg, rgba(34, 28, 22, 0.02) 0%, transparent 36%, transparent 74%, rgba(34, 28, 22, 0.08) 100%);
      mix-blend-mode: multiply;
    }
    .leaflet-container { background: #EBE3D5; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; }
    .leaflet-control-zoom {
      margin-right: 16px !important; margin-bottom: 154px !important;
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
    .pin-wrap { position: relative; width: 46px; height: 52px; transition: opacity 160ms ease, transform 160ms ease; }
    .pin-pulse {
      position: absolute; left: 8px; bottom: 2px; width: 30px; height: 11px;
      border-radius: 50%; background: rgba(35, 26, 18, 0.22); filter: blur(2px);
    }
    .custom-pin {
      position: absolute; left: 5px; top: 0;
      width: 36px; height: 36px; border-radius: 20px 20px 20px 6px;
      transform: rotate(-45deg);
      border: 3px solid rgba(255,255,255,0.92);
      box-shadow: 0 10px 22px rgba(48, 33, 18, 0.32), inset 0 -6px 10px rgba(0,0,0,0.12);
    }
    .pin-glyph {
      position: absolute; inset: 6px; border-radius: 50%;
      background: rgba(255,255,255,0.94);
      color: #33261B; display: flex; align-items: center; justify-content: center;
      transform: rotate(45deg);
      font-size: 11px; font-weight: 900; letter-spacing: -0.2px;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.12);
    }
    .pin-wrap.is-selected { transform: translateY(-5px) scale(1.12); z-index: 700; }
    .pin-wrap.is-muted { opacity: 0.28; }
    .leaflet-marker-icon { transition: opacity 160ms ease, transform 160ms ease; }
    .leaflet-control-attribution { display: none !important; }
    .leaflet-popup { margin-bottom: 4px; }
    .leaflet-popup-close-button {
      color: #8D7F70 !important; padding: 10px 12px 0 0 !important; font-size: 18px !important;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 22px; padding: 0; overflow: hidden;
      box-shadow: 0 18px 50px rgba(50,34,20,0.25);
      border: 1px solid rgba(255,255,255,0.55);
    }
    .leaflet-popup-content { margin: 0; width: 244px !important; }
    .leaflet-popup-tip { background: #fffaf4; }
    .popup-inner { padding: 17px 18px 15px; background: linear-gradient(180deg, #fffaf4 0%, #ffffff 100%); }
    .popup-image { display:block; width:100%; height:118px; object-fit:cover; background:#F6F3EE; }
    .popup-kicker { font-size: 10px; color: #FF5924; letter-spacing: 1px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px; }
    .popup-title { font-size: 16px; font-weight: 800; color: #1A1A1A; margin-bottom: 6px; line-height: 1.18; padding-right: 12px; }
    .popup-sub { font-size: 12px; color: #665C52; line-height: 1.42; margin-bottom: 2px; }
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
    var markers = [];
    var markerByKey = {};
    var activeKey = null;
    var currentFilter = 'all';

    var stadiaKeyParam = '${keyParam}';

    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 16,
      maxBoundsViscosity: 1.0
    });
    // Hard-stop panning at the world edges so you can't drift into empty ocean.
    map.setMaxBounds(L.latLngBounds([[-72, -180], [84, 180]]));

    // Stamen Watercolor (colorful, illustrated) needs a Stadia key; fall back to
    // a vibrant Carto basemap when the key is missing or the tiles fail to load.
    var cartoFallback = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 16,
      minZoom: 2,
      subdomains: 'abcd',
    });

    var tilesLoaded = false;

    if (stadiaKeyParam) {
      var watercolor = L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg' + stadiaKeyParam, {
        maxZoom: 16,
        minZoom: 2,
      });
      var labels = L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain_labels/{z}/{x}/{y}{r}.png' + stadiaKeyParam, {
        maxZoom: 16,
        minZoom: 2,
      });
      watercolor.on('load', function() { tilesLoaded = true; });
      // If the watercolor tiles 403/err, drop them and use the Carto fallback.
      watercolor.on('tileerror', function() {
        if (map.hasLayer(watercolor)) {
          map.removeLayer(watercolor);
          map.removeLayer(labels);
          cartoFallback.addTo(map);
        }
      });
      watercolor.addTo(map);
      labels.addTo(map);
    } else {
      cartoFallback.on('load', function() { tilesLoaded = true; });
      cartoFallback.addTo(map);
    }

    // Safety net: if nothing painted after 4s, force the Carto fallback.
    setTimeout(function() {
      if (!tilesLoaded && !map.hasLayer(cartoFallback)) {
        cartoFallback.addTo(map);
      }
    }, 4000);

    if (pins.length === 0) {
      map.setView([20, 0], 2);
    }

    var bounds = [];
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }

    function renderPin(pin, selected) {
      return '<div class="pin-wrap' + (selected ? ' is-selected' : '') + '" data-key="' + escapeHtml(pin.key) + '">' +
        '<div class="pin-pulse"></div>' +
        '<div class="custom-pin" style="background:' + pin.color + '">' +
          '<div class="pin-glyph">' + escapeHtml(pin.glyph) + '</div>' +
        '</div>' +
      '</div>';
    }

    function setSelected(key) {
      activeKey = key;
      markers.forEach(function(entry) {
        entry.marker.setIcon(L.divIcon({
          html: renderPin(entry.pin, entry.pin.key === activeKey),
          iconSize: [46, 52],
          iconAnchor: [23, 44],
          popupAnchor: [0, -38],
          className: '',
        }));
      });
    }

    pins.forEach(function(pin) {
      var icon = L.divIcon({
        html: renderPin(pin, false),
        iconSize: [46, 52],
        iconAnchor: [23, 44],
        popupAnchor: [0, -38],
        className: '',
      });

      var marker = L.marker([pin.lat, pin.lng], { icon: icon }).addTo(map);
      var popupHtml =
        (pin.imageUrl ? '<img class="popup-image" src="' + escapeHtml(pin.imageUrl) + '" />' : '') +
        '<div class="popup-inner">' +
          '<div class="popup-kicker">' + escapeHtml(pin.label) + '</div>' +
          '<div class="popup-title">' + escapeHtml(pin.name) + '</div>' +
          '<div class="popup-sub">' + escapeHtml(pin.title) + (pin.description ? '<br>' + escapeHtml(pin.description).slice(0, 120) : '') + '</div>' +
        '</div>' +
        '<button class="popup-btn" onclick="openItem(\\'' + pin.id + '\\')">View details</button>';
      marker.bindPopup(popupHtml, {
        maxWidth: 260,
        keepInView: true,
        autoPanPaddingTopLeft: [18, 116],
        autoPanPaddingBottomRight: [18, 76],
      });
      marker.on('click', function() {
        setSelected(pin.key);
        notify('selectSpot', { key: pin.key, id: pin.id });
      });
      markers.push({ pin: pin, marker: marker });
      markerByKey[pin.key] = marker;
      bounds.push([pin.lat, pin.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { paddingTopLeft: [36, 150], paddingBottomRight: [36, 210] });
    }

    // Make sure Leaflet measures the container correctly after RN layout.
    setTimeout(function() { map.invalidateSize(); }, 50);
    setTimeout(function() { map.invalidateSize(); }, 500);

    window.setFilter = function(category) {
      currentFilter = category || 'all';
      markers.forEach(function(entry) {
        var shouldShow = currentFilter === 'all' || entry.pin.type === currentFilter;
        if (shouldShow && !map.hasLayer(entry.marker)) entry.marker.addTo(map);
        if (!shouldShow && map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
      });
    };

    window.focusPin = function(key, lat, lng) {
      setSelected(key);
      window.setFilter(currentFilter);
      map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.55 });
      setTimeout(function() {
        var marker = markerByKey[key];
        if (marker) marker.openPopup();
      }, 420);
    };

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
  const webRef = useRef<WebView>(null);
  const spotScrollRef = useRef<ScrollView>(null);
  const sheetHeight = useRef(new Animated.Value(SHEET_PEEK)).current;
  const currentSheetHeight = useRef(SHEET_PEEK);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedCategory, setSelectedCategory] = useState<SpotCategory>('all');
  const [activeSpotKey, setActiveSpotKey] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<'peek' | 'half' | 'full'>('peek');
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const tabBarHeight = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 8);
  const sheetFullHeight = Math.round(screenHeight * 0.86);
  const sheetHalfHeight = Math.round(screenHeight * 0.47);

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'section', 'travel'],
    queryFn: () => listItems({ section: 'travel', limit: 100, view: 'card' }),
  });

  const { data: selectedItemData } = useQuery({
    queryKey: ['item', selectedItem?.id],
    queryFn: () => getItem(selectedItem!.id),
    enabled: !!selectedItem?.id,
  });

  const items = consolidateTravelItems(dedupItems(data?.items ?? []));
  const itemDetailQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['item', item.id],
      queryFn: () => getItem(item.id),
      staleTime: 5 * 60_000,
    })),
  });
  const enrichedItems = useMemo(() => {
    const detailsById = new Map(
      itemDetailQueries
        .map((query) => query.data?.item)
        .filter((item): item is Item => !!item)
        .map((item) => [item.id, item])
    );
    return items.map((item) => detailsById.get(item.id) ?? item);
  }, [itemDetailQueries, items]);
  const previewItem = selectedItemData?.item ?? selectedItem;
  const spots = useMemo(() => buildTravelSpots(enrichedItems), [enrichedItems]);
  const mapHtml = useMemo(() => buildMapHtml(enrichedItems, STADIA_API_KEY, API_URL), [enrichedItems]);
  const filteredSpots = useMemo(
    () => spots.filter((spot) => selectedCategory === 'all' || spot.type === selectedCategory),
    [selectedCategory, spots]
  );
  const allDestinations = useMemo(() => uniqueDestinationNames(spots), [spots]);
  const filteredDestinations = useMemo(() => uniqueDestinationNames(filteredSpots), [filteredSpots]);
  const spotGroups = useMemo(() => groupSpotsByDestination(filteredSpots), [filteredSpots]);
  const categoryCounts = useMemo(() => countSpotsByCategory(spots), [spots]);
  const availableCategories = useMemo(
    () => (Object.keys(CATEGORY_META) as SpotCategory[]).filter((category) => category === 'all' || categoryCounts[category] > 0),
    [categoryCounts]
  );

  const clampSheetHeight = (value: number) => Math.max(SHEET_PEEK, Math.min(sheetFullHeight, value));

  function snapSheetTo(value: number) {
    const next = clampSheetHeight(value);
    currentSheetHeight.current = next;
    if (next === sheetFullHeight) setSheetSnap('full');
    else if (next === sheetHalfHeight) setSheetSnap('half');
    else setSheetSnap('peek');
    Animated.spring(sheetHeight, {
      toValue: next,
      useNativeDriver: false,
      damping: 24,
      stiffness: 220,
      mass: 0.9,
    }).start();
  }

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
    onPanResponderMove: (_, gesture) => {
      sheetHeight.setValue(clampSheetHeight(currentSheetHeight.current - gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => {
      const snaps = [SHEET_PEEK, sheetHalfHeight, sheetFullHeight];
      if (gesture.vy < -0.65) {
        const higher = snaps.find((snap) => snap > currentSheetHeight.current);
        snapSheetTo(higher ?? sheetFullHeight);
        return;
      }
      if (gesture.vy > 0.65) {
        const lower = snaps.filter((snap) => snap < currentSheetHeight.current).pop();
        snapSheetTo(lower ?? SHEET_PEEK);
        return;
      }
      const releaseHeight = clampSheetHeight(currentSheetHeight.current - gesture.dy);
      const nearest = snaps.reduce((best, snap) => (
        Math.abs(snap - releaseHeight) < Math.abs(best - releaseHeight) ? snap : best
      ), SHEET_PEEK);
      snapSheetTo(nearest);
    },
  // Snap points are recalculated from screen/inset metrics on render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sheetFullHeight, sheetHalfHeight]);

  useEffect(() => {
    snapSheetTo(spots.length > 0 ? SHEET_PEEK : sheetHalfHeight);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetHalfHeight, spots.length]);

  useEffect(() => {
    if (mapState !== 'ready') return;
    injectMapScript(`window.setFilter && window.setFilter('${selectedCategory}');`);
  }, [mapState, selectedCategory]);

  useEffect(() => {
    if (!activeSpotKey) return;
    const index = filteredSpots.findIndex((spot) => spot.key === activeSpotKey);
    if (index < 0) return;
    spotScrollRef.current?.scrollTo({ y: Math.max(0, index * 108 - 10), animated: true });
  }, [activeSpotKey, filteredSpots]);

  function injectMapScript(script: string) {
    webRef.current?.injectJavaScript(`${script}\ntrue;`);
  }

  function chooseCategory(category: SpotCategory) {
    setSelectedCategory(category);
    setActiveSpotKey(null);
  }

  function focusSpot(spot: TravelSpot) {
    setActiveSpotKey(spot.key);
    snapSheetTo(sheetHalfHeight);
    injectMapScript(`window.focusPin && window.focusPin(${JSON.stringify(spot.key)}, ${spot.lat}, ${spot.lng});`);
  }

  function openDirections(spot: TravelSpot) {
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
    Linking.openURL(url).catch(() => {});
  }

  function toggleSheet() {
    snapSheetTo(sheetSnap === 'peek' ? sheetHalfHeight : SHEET_PEEK);
  }

  function handleWebMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'openItem') {
        const item = items.find(i => i.id === msg.id);
        if (item) setSelectedItem(item);
      } else if (msg.type === 'selectSpot') {
        setActiveSpotKey(msg.key);
        snapSheetTo(SHEET_PEEK);
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
      <View style={[styles.header, { top: insets.top + 6 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="map" size={15} color={colors.accent} />
          </View>
          <View>
            <Text style={styles.title}>Travel</Text>
            <Text style={styles.subtitle}>{spots.length} spots</Text>
          </View>
        </View>
      </View>

      {spots.length > 0 && (
        <View style={[styles.filterWrap, { top: insets.top + 58 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            {availableCategories.map((category) => {
              const meta = CATEGORY_META[category];
              const active = selectedCategory === category;
              const count = category === 'all' ? spots.length : categoryCounts[category];
              return (
                <Pressable
                  key={category}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => chooseCategory(category)}
                >
                  <Ionicons name={meta.icon} size={15} color={active ? '#fff' : meta.color} />
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{meta.label}</Text>
                  <Text style={[styles.filterCount, active && styles.filterCountActive]}>{count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Map */}
      <View style={styles.map}>
        <WebView
          ref={webRef}
          style={{ flex: 1 }}
          source={{ html: mapHtml }}
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
        <View style={[styles.emptyOverlay, { top: insets.top + 110 }]} pointerEvents="box-none">
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
      {items.length > 0 && spots.length === 0 && (
        <View style={[styles.noPinsOverlay, { top: insets.top + 110 }]} pointerEvents="box-none">
          <View style={styles.noPinsCard}>
            <Ionicons name="location-outline" size={28} color={colors.accent} />
            <Text style={styles.noPinsTitle}>No locations yet</Text>
            <Text style={styles.noPinsSub}>
              You have {items.length} travel save{items.length === 1 ? '' : 's'}, but the AI hasn't tagged them with coordinates. Tap any below to open it.
            </Text>
          </View>
        </View>
      )}

      {items.length > 0 && (
        <Animated.View
          style={[
            styles.spotSheet,
            {
              height: sheetHeight,
              bottom: 0,
            },
          ]}
        >
          <View style={styles.sheetDragZone} {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {filteredSpots.length} {filteredSpots.length === 1 ? 'spot' : 'spots'} · {filteredDestinations.length} {filteredDestinations.length === 1 ? 'destination' : 'destinations'}
              </Text>
              <Pressable style={styles.expandButton} onPress={toggleSheet}>
                <Ionicons name={sheetSnap === 'peek' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          {spots.length === 0 ? (
            <View style={styles.sheetEmpty}>
              <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
              <Text style={styles.sheetEmptyTitle}>Places will appear here</Text>
              <Text style={styles.sheetEmptyText}>Save a reel with locations and ActionVault will extract the spots.</Text>
            </View>
          ) : (
            <ScrollView
              ref={spotScrollRef}
              style={styles.spotList}
              contentContainerStyle={styles.spotListContent}
              showsVerticalScrollIndicator={false}
            >
              {spotGroups.map((group) => (
                <View key={group.destination} style={styles.destinationGroup}>
                  <Text style={styles.destinationLabel}>{group.destination}</Text>
                  {group.spots.map((spot) => {
                    const meta = CATEGORY_META[spot.type] ?? CATEGORY_META.other;
                    const active = activeSpotKey === spot.key;
                    return (
                      <Pressable
                        key={spot.key}
                        style={[styles.spotRow, active && styles.spotRowActive]}
                        onPress={() => focusSpot(spot)}
                      >
                        {spot.imageUrl ? (
                          <Image source={{ uri: spot.imageUrl }} style={styles.spotThumb} />
                        ) : (
                          <View style={[styles.spotBadge, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}30` }]}>
                            <Ionicons name={meta.icon} size={17} color={meta.color} />
                          </View>
                        )}
                        <View style={styles.spotBody}>
                          <View style={styles.spotTitleRow}>
                            <Text style={styles.spotName} numberOfLines={1}>{spot.name}</Text>
                            <Text style={[styles.spotType, { color: meta.color }]}>{meta.label.replace(/s$/, '')}</Text>
                          </View>
                          {spot.description ? (
                            <Text style={styles.spotDescription} numberOfLines={2}>{spot.description}</Text>
                          ) : (
                            <Text style={styles.spotDescription} numberOfLines={1}>Saved from {spot.itemTitle}</Text>
                          )}
                          <Text style={styles.spotSource} numberOfLines={1}>{spot.itemTitle} · {formatAge(spot.createdAt)}</Text>
                        </View>
                        <Pressable style={styles.directionsButton} onPress={() => openDirections(spot)}>
                          <Ionicons name="navigate-outline" size={16} color={colors.accent} />
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              {filteredSpots.length === 0 && (
                <View style={styles.sheetEmpty}>
                  <Ionicons name="options-outline" size={22} color={colors.textMuted} />
                  <Text style={styles.sheetEmptyTitle}>No spots in this filter</Text>
                  <Text style={styles.sheetEmptyText}>Try another category chip above the map.</Text>
                </View>
              )}
            </ScrollView>
          )}
        </Animated.View>
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
            {previewItem && (
              <>
                {modalMediaUrls(previewItem).length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.modalMediaStrip}
                  >
                    {modalMediaUrls(previewItem).map((url, index) => (
                      <Image
                        key={`${url}-${index}`}
                        source={{ uri: url }}
                        style={styles.modalMediaImage}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                )}
                <Text style={styles.modalTitle} numberOfLines={2}>{previewItem.title}</Text>
                {previewItem.summary ? (
                  <Text style={styles.modalSummary} numberOfLines={3}>{previewItem.summary}</Text>
                ) : null}
                {previewItem.section_data?.trip_context ? (
                  <Text style={styles.modalContext}>{previewItem.section_data.trip_context}</Text>
                ) : null}
                {(previewItem.section_data?.locations ?? []).length > 0 && (
                  <View style={styles.locList}>
                    {(previewItem.section_data?.locations ?? []).slice(0, 5).map((loc, i) => (
                      <View key={i} style={styles.locRow}>
                        <View style={[styles.locDot, { backgroundColor: PIN_COLORS[loc.type] ?? '#718096' }]} />
                        <Text style={styles.locName} numberOfLines={1}>{loc.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Pressable
                  style={styles.modalBtn}
                  onPress={() => { setSelectedItem(null); router.push(`/items/${previewItem.id}`); }}
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

function travelItemKey(item: Item): string {
  const normalized = normalizeUrl(item.source_url);
  if (normalized) return normalized;
  return (item.title ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function locationKey(loc: { name: string; lat: number; lng: number }) {
  const name = String(loc.name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const lat = Number.isFinite(loc.lat) ? loc.lat.toFixed(2) : '';
  const lng = Number.isFinite(loc.lng) ? loc.lng.toFixed(2) : '';
  return `${name}|${lat}|${lng}`;
}

function coordinateKey(loc: { lat: number; lng: number }) {
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return '';
  // Four decimals is roughly 11m precision, close enough for repeated geocoding
  // of the same place without collapsing different nearby destinations.
  return `${loc.lat.toFixed(4)}|${loc.lng.toFixed(4)}`;
}

function shouldMergeLocations(a: { name: string; lat: number; lng: number }, b: { name: string; lat: number; lng: number }) {
  if (locationKey(a) === locationKey(b)) return true;
  const aCoord = coordinateKey(a);
  const bCoord = coordinateKey(b);
  return !!aCoord && aCoord === bCoord;
}

function uniqueLocations(items: Item[]) {
  const merged: NonNullable<Item['section_data']>['locations'] = [];

  for (const it of items) {
    const locs = it.section_data?.locations ?? [];
    for (const loc of locs) {
      if (merged?.some(existing => shouldMergeLocations(existing, loc))) continue;
      merged?.push(loc);
    }
  }

  return merged ?? [];
}

function consolidateTravelItems(items: DedupedItem[]): DedupedItem[] {
  const groups = new Map<string, DedupedItem[]>();
  for (const item of items) {
    const key = travelItemKey(item);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  return [...groups.values()].map((group) => {
    const sorted = [...group].sort((a, b) => {
      const aLocs = uniqueLocations([a, ...(a.duplicates ?? [])]).length;
      const bLocs = uniqueLocations([b, ...(b.duplicates ?? [])]).length;
      if (aLocs !== bLocs) return bLocs - aLocs;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const representative = sorted[0];
    const rawDuplicates = sorted.flatMap((item) => [item, ...(item.duplicates ?? [])]);
    // Same-link duplicates are old analyses of the same content. Keep the best
    // representative's locations instead of unioning stale duplicate locations.
    const locations = uniqueLocations([representative]);

    return {
      ...representative,
      dupCount: rawDuplicates.length,
      duplicates: rawDuplicates,
      section_data: {
        ...(representative.section_data ?? {}),
        locations,
      },
    };
  });
}

function spotKey(item: Item, loc: { name: string; lat: number; lng: number }, index: number) {
  const coord = coordinateKey(loc);
  const name = String(loc.name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${item.id}:${coord || name || index}`;
}

function destinationFromName(name: string) {
  const parts = String(name ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || 'Saved places';
}

function buildTravelSpots(items: Item[]): TravelSpot[] {
  const raw = items.flatMap((item) =>
    (item.section_data?.locations ?? []).map((loc, index) => ({
      key: spotKey(item, loc, index),
      itemId: item.id,
      itemTitle: item.title ?? 'Travel save',
      itemSummary: item.summary ?? '',
      name: loc.name,
      description: loc.description ?? '',
      lat: loc.lat,
      lng: loc.lng,
      type: loc.type ?? 'other',
      imageUrl: loc.media_url ?? item.media_urls?.[index] ?? item.media_urls?.[0] ?? null,
      destination: destinationFromName(loc.name),
      createdAt: item.created_at,
    }))
  );

  return raw.filter((spot, index) => !raw.slice(0, index).some(existing => shouldMergeLocations(existing, spot)));
}

function modalMediaUrls(item: Item) {
  const locationUrls = (item.section_data?.locations ?? [])
    .map((loc) => loc.media_url)
    .filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url));
  const itemUrls = (item.media_urls ?? [])
    .filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url));
  return [...new Set([...itemUrls, ...locationUrls])].slice(0, 10);
}

function proxiedImageUrl(url: string | null | undefined, apiUrl: string) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return `${apiUrl.replace(/\/$/, '')}/media/proxy?url=${encodeURIComponent(url)}`;
}

function uniqueDestinationNames(spots: TravelSpot[]) {
  return [...new Set(spots.map((spot) => spot.destination).filter(Boolean))];
}

function groupSpotsByDestination(spots: TravelSpot[]) {
  const groups = new Map<string, TravelSpot[]>();
  for (const spot of spots) {
    const existing = groups.get(spot.destination);
    if (existing) existing.push(spot);
    else groups.set(spot.destination, [spot]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([destination, groupedSpots]) => ({
      destination,
      spots: groupedSpots.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function countSpotsByCategory(spots: TravelSpot[]) {
  return spots.reduce((counts, spot) => {
    counts[spot.type] = (counts[spot.type] ?? 0) + 1;
    return counts;
  }, {} as Record<SpotCategory, number>);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#CFE6E5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  atlasBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 230,
    zIndex: 2,
    backgroundColor: 'rgba(254,252,249,0.08)',
  },
  header: {
    position: 'absolute',
    top: 48,
    left: 12,
    zIndex: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,250,244,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: radius.full,
    ...cardShadow,
    shadowOpacity: 0.08,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  title: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.25 },
  subtitle: { fontSize: 10, color: colors.textMuted, marginTop: -1, fontWeight: '700' },
  compass: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },

  filterWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 11,
  },
  filterContent: {
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,250,244,0.92)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...cardShadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterText: { fontSize: 11, fontWeight: '800', color: colors.textPrimary },
  filterTextActive: { color: '#fff' },
  filterCount: { fontSize: 10, fontWeight: '800', color: colors.textMuted },
  filterCountActive: { color: 'rgba(255,255,255,0.78)' },

  map: { flex: 1 },

  emptyOverlay: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center', zIndex: 8 },
  noPinsOverlay: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center', zIndex: 8 },
  noPinsCard: {
    backgroundColor: 'rgba(255,250,244,0.96)',
    borderRadius: radius.lg,
    padding: 18,
    alignItems: 'center',
    gap: 6,
    ...cardShadow,
    maxWidth: 330,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  noPinsTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  noPinsSub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  mapOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: 'rgba(250,250,248,0.70)' },
  mapOverlayText: { fontSize: 14, color: colors.textMuted, fontWeight: '700' },
  emptyCard: {
    backgroundColor: 'rgba(255,250,244,0.96)',
    borderRadius: radius.xl,
    padding: 30,
    alignItems: 'center',
    gap: 12,
    ...cardShadow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.74)',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.full, marginTop: 4 },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  spotSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(255,250,244,0.98)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#2B2119',
    shadowOpacity: 0.20,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
    overflow: 'hidden',
  },
  sheetDragZone: { paddingTop: 6, paddingHorizontal: spacing.lg, paddingBottom: 4 },
  sheetHandle: { width: 36, height: 4, borderRadius: 999, backgroundColor: '#D7CEC3', alignSelf: 'center', marginBottom: 5 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  expandButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  spotList: { flex: 1 },
  spotListContent: {
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 90 : 72,
    gap: 14,
  },
  destinationGroup: { gap: 9 },
  destinationLabel: {
    paddingHorizontal: 6,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...cardShadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  spotRowActive: {
    borderColor: colors.accentMuted,
    backgroundColor: colors.surfaceWarm,
  },
  spotBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  spotThumb: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: '#fff',
  },
  spotBody: { flex: 1, minWidth: 0 },
  spotTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spotName: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.2 },
  spotType: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  spotDescription: { marginTop: 4, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  spotSource: { marginTop: 6, fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  directionsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  sheetEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  sheetEmptyTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sheetEmptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40, gap: 12 },
  handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  modalMediaStrip: { gap: 10, paddingRight: spacing.lg },
  modalMediaImage: {
    width: 132,
    height: 170,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
  },
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
