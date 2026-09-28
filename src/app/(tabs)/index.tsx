import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterSheet } from '@/components/FilterSheet';
import { MealCard } from '@/components/MealCard';
import { Chip, EmptyState, IconButton, SectionHeader } from '@/components/ui';
import { CUISINES } from '@/data/allergens';
import { useFeed } from '@/lib/useFeed';
import { activeFilterCount, useApp } from '@/store/app';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Bon matin';
  if (h < 17) return 'Bon après-midi';
  return 'Bonsoir';
}

export default function Discover() {
  const insets = useSafeAreaInsets();
  const { meals, hiddenForHealth, loading, reload } = useFeed();
  const { user, filters, setFilters, health } = useApp();
  const [sheet, setSheet] = useState(false);
  const count = activeFilterCount(filters);

  const endingSoon = useMemo(
    () => [...meals].sort((a, b) => a.availableUntil.localeCompare(b.availableUntil)).slice(0, 4),
    [meals],
  );

  const header = (
    <View style={{ gap: spacing.xl }}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>
            {greeting()}, {user?.displayName ?? ''} 👋
          </Text>
          <Text style={type.h1}>Qu'est-ce qu'on mange ?</Text>
        </View>
        <IconButton icon="notifications-outline" accessibilityLabel="Notifications" />
      </View>

      <Pressable style={styles.search} onPress={() => setSheet(true)}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <Text style={[type.body, { flex: 1, color: colors.muted }]}>Plats, cuisines, quartiers…</Text>
        <View style={styles.filterBtn}>
          <Ionicons name="options-outline" size={18} color={colors.onDark} />
          {count > 0 && <Text style={styles.filterCount}>{count}</Text>}
        </View>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.xl }} style={{ marginHorizontal: -spacing.xl, paddingLeft: spacing.xl }}>
        <Chip label="Tout" selected={filters.cuisines.length === 0} onPress={() => setFilters({ cuisines: [] })} />
        {CUISINES.slice(0, 10).map((c) => (
          <Chip
            key={c.id}
            emoji={c.emoji}
            label={c.fr}
            selected={filters.cuisines.includes(c.id)}
            onPress={() => setFilters({ cuisines: filters.cuisines.includes(c.id) ? filters.cuisines.filter((x) => x !== c.id) : [c.id] })}
          />
        ))}
      </ScrollView>

      <Pressable style={styles.shield} onPress={() => router.push('/health')}>
        <View style={styles.shieldIcon}>
          <Ionicons name="shield-checkmark" size={18} color={colors.forest} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: colors.forest }]}>
            {health.allergens.length ? `Filtre santé actif · ${health.allergens.length} allergène(s)` : 'Configurez votre profil santé'}
          </Text>
          <Text style={[type.caption, { color: colors.forestSoft }]}>
            {hiddenForHealth > 0 ? `${hiddenForHealth} plat(s) masqué(s) pour votre sécurité` : 'Les plats à risque sont retirés automatiquement'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.forest} />
      </Pressable>

      {endingSoon.length > 1 && (
        <View>
          <SectionHeader title="Bientôt terminés ⏳" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.xl }} style={{ marginHorizontal: -spacing.xl, paddingLeft: spacing.xl }}>
            {endingSoon.map((m) => (
              <View key={m.id} style={{ width: 280 }}>
                <MealCard meal={m} variant="compact" />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <SectionHeader title={`Près de vous · ${meals.length}`} action="Voir la carte" onAction={() => router.push('/map')} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={meals}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MealCard meal={item} />}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: spacing.xl }} />}
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.forest} />}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState icon="leaf-outline" title="Aucun plat pour l'instant" body="Élargissez la distance ou retirez quelques filtres. Et pourquoi ne pas cuisiner pour vos voisins ?" />
          )
        }
      />
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={(f) => setFilters(f)} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingLeft: spacing.lg,
    padding: 6,
    ...shadow.card,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.forest,
    height: 40,
    minWidth: 40,
    paddingHorizontal: 11,
    borderRadius: radius.md,
    justifyContent: 'center',
  },
  filterCount: { color: colors.onDark, fontFamily: fonts.bold, fontSize: 12 },
  shield: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.sage, padding: spacing.md, borderRadius: radius.lg },
  shieldIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
