import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterSheet } from '@/components/FilterSheet';
import { LeafletMap, LeafletMapHandle } from '@/components/LeafletMap';
import { MealCard } from '@/components/MealCard';
import { NearbyList } from '@/components/NearbyList';
import { ZoneSearch } from '@/components/ZoneSearch';
import { Button, Chip } from '@/components/ui';
import { cuisineById } from '@/data/allergens';
import { formatPriceShort } from '@/lib/format';
import { useFeed } from '@/lib/useFeed';
import { activeFilterCount, useApp } from '@/store/app';
import { colors, createStyles, fonts, radius, shadow, spacing, type } from '@/theme';
import type { Meal } from '@/types';

import { t } from '@/i18n';
export default function MapScreen() {
  const [view, setView] = useState<'map' | 'list'>('map');
  const [mapError, setMapError] = useState(false);
  if (view === 'list' || mapError) {
    return (
      <NearbyList
        notice={mapError ? t('La carte n’a pas pu se charger (connexion ?). Voici les plats triés par distance.') : undefined}
        onShowMap={() => {
          setMapError(false);
          setView('map');
        }}
      />
    );
  }
  return <InteractiveMap onShowList={() => setView('list')} onError={() => setMapError(true)} />;
}

function InteractiveMap({ onShowList, onError }: { onShowList: () => void; onError: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mapRef = useRef<LeafletMapHandle>(null);
  const listRef = useRef<FlatList<Meal>>(null);
  const { meals, loading } = useFeed();
  const { filters, setFilters, location, hasRealLocation, setLocation } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const cardWidth = width - spacing.xl * 2;

  useEffect(() => {
    if (meals.length && !meals.find((m) => m.id === selected)) setSelected(meals[0].id);
  }, [meals, selected]);

  // À chaque nouveau résultat (filtres, position), la carte se cadre sur les plats et sur vous.
  const resultKey = meals.map((m) => m.id).join(',');
  useEffect(() => {
    if (loading || !meals.length) return;
    const points = [...meals.map((m) => m.pickupLocation), ...(hasRealLocation ? [location] : [])];
    // Petit délai : la carte doit avoir reçu ses marqueurs.
    const timer = setTimeout(() => mapRef.current?.fit(points, { top: insets.top + 130, bottom: 190 }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey, loading]);

  // Position connue après l'ouverture de la carte (GPS lent) : on s'y rend s'il n'y a pas de plats à cadrer.
  useEffect(() => {
    if (hasRealLocation && !meals.length) mapRef.current?.flyTo(location, 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRealLocation, location.latitude, location.longitude]);

  const markers = useMemo(
    () =>
      meals.map((m) => ({
        id: m.id,
        latitude: m.pickupLocation.latitude,
        longitude: m.pickupLocation.longitude,
        // Puce compacte : type de plat + prix par portion (« 🍝 5 $ »), « ⇄ » pour l'échange.
        label: m.priceCents == null ? '' : formatPriceShort(m.priceCents),
        swap: m.mode !== 'sale',
        emoji: cuisineById(m.cuisine).emoji,
        pending: m.pending,
      })),
    [meals],
  );

  const select = (id: string) => {
    const index = meals.findIndex((m) => m.id === id);
    if (index < 0) return;
    setSelected(id);
    listRef.current?.scrollToIndex({ index, animated: true });
    mapRef.current?.flyTo(meals[index].pickupLocation, 15);
  };

  const recenter = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('Position désactivée'), t('Autorisez la localisation dans les réglages du téléphone pour voir les plats autour de vous.'));
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(p, true);
      mapRef.current?.flyTo(p, 14);
    } catch {
      Alert.alert(t('Position introuvable'), t('Activez la localisation du téléphone, puis réessayez.'));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
      <LeafletMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        center={location}
        zoom={14}
        markers={markers}
        selectedId={selected}
        onSelect={select}
        circle={{ center: location, radiusM: filters.radiusKm * 1000 }}
        user={hasRealLocation ? location : null}
        onError={onError}
      />

      <View style={[styles.topOverlay, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.row} pointerEvents="box-none">
          <Pressable style={styles.searchPill} onPress={() => setZoneOpen(true)} accessibilityRole="button" accessibilityLabel={t('Chercher autour de…')}>
            <Ionicons name="search" size={16} color={colors.tomato} />
            <Text style={styles.searchText} numberOfLines={1}>
              {loading ? t('Recherche…') : `${zone ? `${zone} · ` : ''}${t('{0} repas dans un rayon de {1} km', { 0: meals.length, 1: filters.radiusKm })}`}
            </Text>
          </Pressable>
          <Pressable style={styles.roundBtn} onPress={onShowList} accessibilityRole="button" accessibilityLabel={t('Afficher la liste')}>
            <Ionicons name="list-outline" size={20} color={colors.ink} />
          </Pressable>
          <Pressable style={styles.roundBtn} onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={t('Filtres')}>
            <Ionicons name="options-outline" size={20} color={colors.ink} />
            {activeFilterCount(filters) > 0 && <View style={styles.dot} />}
          </Pressable>
        </View>
        <View style={[styles.row, { gap: spacing.sm }]} pointerEvents="box-none">
          {(
            [
              ['all', 'Tout'],
              ['sale', 'Achat'],
              ['swap', 'Échange'],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} label={t(label)} selected={filters.mode === id} onPress={() => setFilters({ mode: id })} />
          ))}
        </View>
      </View>

      <Pressable
        style={[styles.roundBtn, styles.locate, { bottom: meals.length ? 150 : spacing.xl }]}
        onPress={recenter}
        accessibilityRole="button"
        accessibilityLabel={t('Me localiser')}
      >
        <Ionicons name={hasRealLocation ? 'navigate' : 'navigate-outline'} size={20} color={colors.forest} />
      </Pressable>

      {!loading && meals.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={type.bodyStrong}>{t('Aucun plat dans ce rayon')}</Text>
          <Text style={type.caption}>
            {hasRealLocation
              ? t('Élargissez la zone ou revenez plus tard : les voisins publient surtout en fin de journée.')
              : t('Activez votre position pour voir les plats autour de vous.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {filters.radiusKm < 25 && (
              <Button
                title={t('Élargir à {0} km', { 0: Math.min(25, filters.radiusKm * 2) })}
                size="md"
                onPress={() => setFilters({ radiusKm: Math.min(25, filters.radiusKm * 2) })}
              />
            )}
            {!hasRealLocation && <Button title={t('Ma position')} size="md" variant="secondary" icon="navigate-outline" onPress={recenter} />}
          </View>
        </View>
      )}

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
            mapRef.current?.flyTo(m.pickupLocation, 15);
          }
        }}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <MealCard meal={item} variant="compact" />
          </View>
        )}
      />
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={(f) => setFilters(f)} />
      <ZoneSearch
        visible={zoneOpen}
        onClose={() => setZoneOpen(false)}
        onFound={(p, label) => {
          setZone(label);
          mapRef.current?.flyTo(p, 14);
        }}
      />
    </View>
  );
}

const styles = createStyles(() => ({
  topOverlay: { position: 'absolute', left: spacing.xl, right: spacing.xl, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  locate: { position: 'absolute', right: spacing.xl },
  emptyCard: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xl + 64,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
    ...shadow.floating,
  },
  carousel: { position: 'absolute', bottom: spacing.xl, left: 0, right: 0, flexGrow: 0 },
}));
