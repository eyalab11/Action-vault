import { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, ActivityIndicator } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listItems, type Item, type TravelLocation } from '../../lib/api';
import { colors, spacing, radius, cardShadow, typography } from '../../lib/theme';

const PIN_COLORS: Record<string, string> = {
  restaurant: '#E53E3E', landmark: '#3182CE', hotel: '#805AD5',
  activity: '#D69E2E', neighborhood: '#38A169', other: '#718096',
};

const PIN_ICONS: Record<string, string> = {
  restaurant: 'restaurant', landmark: 'camera', hotel: 'bed',
  activity: 'bicycle', neighborhood: 'home', other: 'location',
};

export default function TravelScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'travel'],
    queryFn: () => listItems({ section: 'travel', limit: 200 }),
  });

  const items = data?.items ?? [];
  const allLocations: { loc: TravelLocation; item: Item }[] = items.flatMap(item =>
    (item.section_data?.locations ?? []).map(loc => ({ loc, item }))
  );

  const handleMarkerPress = (item: Item) => setSelectedItem(item);

  const totalPins = allLocations.length;
  const countries = [...new Set(allLocations.map(({ loc }) => loc.name.split(',').pop()?.trim()))].filter(Boolean);

  if (isLoading) return (
    <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Travel Map</Text>
          <Text style={styles.subtitle}>{totalPins} {totalPins === 1 ? 'pin' : 'pins'} · {countries.length} {countries.length === 1 ? 'destination' : 'destinations'}</Text>
        </View>
        <Pressable style={styles.listBtn} onPress={() => {}}>
          <Ionicons name="list-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{ latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 }}
        onMapReady={() => setMapReady(true)}
        showsUserLocation
        showsCompass
      >
        {mapReady && allLocations.map(({ loc, item }, idx) => (
          <Marker
            key={`${item.id}-${idx}`}
            coordinate={{ latitude: loc.lat, longitude: loc.lng }}
            onPress={() => handleMarkerPress(item)}
          >
            <View style={[styles.pin, { backgroundColor: PIN_COLORS[loc.type] ?? PIN_COLORS.other }]}>
              <Ionicons name={PIN_ICONS[loc.type] as any ?? 'location'} size={14} color="#fff" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Empty state */}
      {items.length === 0 && (
        <View style={styles.emptyOverlay}>
          <View style={styles.emptyCard}>
            <Ionicons name="map-outline" size={40} color={colors.accent} />
            <Text style={styles.emptyTitle}>No travel saves yet</Text>
            <Text style={styles.emptySub}>Save a travel reel and pins will drop here automatically</Text>
          </View>
        </View>
      )}

      {/* Bottom sheet — recent travel saves */}
      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>Saved trips</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.lg }}>
          {items.map(item => {
            const locs = item.section_data?.locations ?? [];
            return (
              <Pressable
                key={item.id}
                style={styles.tripChip}
                onPress={() => {
                  router.push(`/items/${item.id}`);
                  if (locs.length > 0) {
                    mapRef.current?.animateToRegion({ latitude: locs[0].lat, longitude: locs[0].lng, latitudeDelta: 0.5, longitudeDelta: 0.5 }, 600);
                  }
                }}
              >
                <Ionicons name="map-outline" size={14} color={colors.accent} />
                <Text style={styles.tripChipText} numberOfLines={1}>{item.title ?? 'Travel'}</Text>
                {locs.length > 0 && <Text style={styles.tripPinCount}>{locs.length} pins</Text>}
              </Pressable>
            );
          })}
          {items.length === 0 && <Text style={styles.noTrips}>No trips yet</Text>}
        </ScrollView>
      </View>

      {/* Selected item modal */}
      <Modal visible={!!selectedItem} transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedItem(null)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {selectedItem && (
              <>
                <Text style={styles.modalTitle} numberOfLines={2}>{selectedItem.title}</Text>
                <Text style={styles.modalSummary} numberOfLines={3}>{selectedItem.summary}</Text>
                {selectedItem.section_data?.trip_context && (
                  <Text style={styles.modalContext}>{selectedItem.section_data.trip_context}</Text>
                )}
                <View style={styles.modalPins}>
                  {(selectedItem.section_data?.locations ?? []).map((loc, i) => (
                    <View key={i} style={styles.modalPin}>
                      <View style={[styles.pinDot, { backgroundColor: PIN_COLORS[loc.type] ?? '#718096' }]} />
                      <Text style={styles.modalPinText}>{loc.name}</Text>
                    </View>
                  ))}
                </View>
                <Pressable style={styles.modalBtn} onPress={() => { setSelectedItem(null); router.push(`/items/${selectedItem.id}`); }}>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: 12, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  listBtn: { padding: 8, backgroundColor: colors.surfaceSecondary, borderRadius: radius.full },
  map: { flex: 1 },
  pin: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  emptyOverlay: { position: 'absolute', top: '30%', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 32, alignItems: 'center', gap: 12, ...cardShadow },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  bottomSheet: { backgroundColor: colors.surface, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border },
  sheetTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, paddingHorizontal: spacing.lg, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  tripChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full, maxWidth: 200 },
  tripChipText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  tripPinCount: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  noTrips: { fontSize: 13, color: colors.textMuted, paddingVertical: 8 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40, gap: 12 },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  modalSummary: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  modalContext: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  modalPins: { gap: 6 },
  modalPin: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinDot: { width: 8, height: 8, borderRadius: 4 },
  modalPinText: { fontSize: 13, color: colors.textSecondary },
  modalBtn: { backgroundColor: colors.accent, borderRadius: radius.full, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
