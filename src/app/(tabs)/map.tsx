import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterSheet } from '@/components/FilterSheet';
import { MealCard } from '@/components/MealCard';
import { Chip } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { useFeed } from '@/lib/useFeed';
import { activeFilterCount, useApp } from '@/store/app';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Meal } from '@/types';

/** Style Google Maps (Android) sobre et chaud, assorti au design system. */
const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F5F1EA' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6F6A60' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F5F1EA' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#DCE7DF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FBF8F3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#EFE6D8' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#CFE0E8' }] },
];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<Meal>>(null);
  const { meals } = useFeed();
  const { filters, setFilters, location, setLocation } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const cardWidth = width - spacing.xl * 2;

  useEffect(() => {
    if (meals.length && !meals.find((m) => m.id === selected)) setSelected(meals[0].id);
  }, [meals, selected]);

  const focus = (meal: Meal, index: number) => {
    setSelected(meal.id);
    listRef.current?.scrollToIndex({ index, animated: true });
    mapRef.current?.animateToRegion({ ...meal.pickupLocation, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 350);
  };

  const recenter = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setLocation(p, true);
    mapRef.current?.animateToRegion({ ...p, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 400);
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...location, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
        customMapStyle={MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        <Circle center={location} radius={filters.radiusKm * 1000} strokeColor="rgba(31,58,46,0.35)" fillColor="rgba(31,58,46,0.05)" strokeWidth={1} />
        {meals.map((m, i) => {
          const active = m.id === selected;
          return (
            <Marker key={m.id} coordinate={m.pickupLocation} onPress={() => focus(m, i)} tracksViewChanges={false} zIndex={active ? 10 : 1}>
              <View style={[styles.pin, active && styles.pinActive]}>
                {m.mode !== 'sale' && <Ionicons name="swap-horizontal" size={11} color={active ? colors.onDark : colors.forest} />}
                <Text style={[styles.pinText, active && { color: colors.onDark }]}>{formatPrice(m.priceCents)}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.topOverlay, { top: insets.top + spacing.sm }]}>
        <View style={styles.row}>
          <View style={styles.searchPill}>
            <Ionicons name="location" size={16} color={colors.tomato} />
            <Text style={styles.searchText} numberOfLines={1}>
              {meals.length} repas dans un rayon de {filters.radiusKm} km
            </Text>
          </View>
          <Pressable style={styles.roundBtn} onPress={() => setSheet(true)} accessibilityLabel="Filtres">
            <Ionicons name="options-outline" size={20} color={colors.ink} />
            {activeFilterCount(filters) > 0 && <View style={styles.dot} />}
          </Pressable>
        </View>
        <View style={[styles.row, { gap: spacing.sm }]}>
          {(
            [
              ['all', 'Tout'],
              ['sale', 'Achat'],
              ['swap', 'Échange'],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} label={label} selected={filters.mode === id} onPress={() => setFilters({ mode: id })} />
          ))}
        </View>
      </View>

      <Pressable style={[styles.roundBtn, styles.locate]} onPress={recenter} accessibilityLabel="Me localiser">
        <Ionicons name="navigate" size={20} color={colors.forest} />
      </Pressable>

      <FlatList
        ref={listRef}
        style={styles.carousel}
        data={meals}
        horizontal
        keyExtractor={(m) => m.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + spacing.md}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
        getItemLayout={(_, index) => ({ length: cardWidth + spacing.md, offset: (cardWidth + spacing.md) * index, index })}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + spacing.md));
          const m = meals[i];
          if (m && m.id !== selected) {
            setSelected(m.id);
            mapRef.current?.animateToRegion({ ...m.pickupLocation, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 350);
          }
        }}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <MealCard meal={item} variant="compact" />
          </View>
        )}
      />
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={(f) => setFilters(f)} />
    </View>
  );
}

const styles = StyleSheet.create({
  topOverlay: { position: 'absolute', left: spacing.xl, right: spacing.xl, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    ...shadow.floating,
  },
  searchText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, flex: 1 },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  dot: { position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.tomato },
  locate: { position: 'absolute', right: spacing.xl, bottom: 140 },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  pinActive: { backgroundColor: colors.forest, borderColor: colors.forest, transform: [{ scale: 1.1 }] },
  pinText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  carousel: { position: 'absolute', bottom: spacing.xl, left: 0, right: 0, flexGrow: 0 },
});
