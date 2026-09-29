/**
 * Vue « liste » de l'onglet Carte : les mêmes plats filtrés (santé, distance, mode), du plus proche au plus loin.
 * Sert aussi de repli si la carte ne peut pas se charger (hors ligne).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeed } from '@/lib/useFeed';
import { activeFilterCount, useApp } from '@/store/app';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';
import { FilterSheet } from './FilterSheet';
import { MealCard } from './MealCard';
import { Chip, EmptyState } from './ui';

export function NearbyList({ notice, onShowMap }: { notice?: string; onShowMap?: () => void }) {
  const insets = useSafeAreaInsets();
  const { meals, loading, reload } = useFeed();
  const { filters, setFilters } = useApp();
  const [sheet, setSheet] = useState(false);
  const sorted = [...meals].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={sorted}
        keyExtractor={(m) => m.id}
        onRefresh={reload}
        refreshing={loading}
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={type.h1}>Autour de vous</Text>
                <Text style={type.caption}>
                  {meals.length} repas dans un rayon de {filters.radiusKm} km · du plus proche au plus loin
                </Text>
              </View>
              {onShowMap && (
                <Pressable style={styles.roundBtn} onPress={onShowMap} accessibilityRole="button" accessibilityLabel="Afficher la carte">
                  <Ionicons name="map-outline" size={20} color={colors.ink} />
                </Pressable>
              )}
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
            {notice && (
              <View style={styles.notice}>
                <Ionicons name="cloud-offline-outline" size={16} color={colors.forest} />
                <Text style={[type.caption, { flex: 1, color: colors.forest }]}>{notice}</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => <MealCard meal={item} variant="compact" />}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState icon="location-outline" title="Aucun plat à proximité" body="Élargissez le rayon dans les filtres, ou revenez un peu plus tard." />
          )
        }
      />
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={(f) => setFilters(f)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  dot: { position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.tomato },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.sage, padding: spacing.md, borderRadius: radius.md },
  label: { fontFamily: fonts.semibold },
});
