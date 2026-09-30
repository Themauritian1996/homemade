import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterSheet } from '@/components/FilterSheet';
import { MealCard } from '@/components/MealCard';
import { Button, Chip, EmptyState, IconButton, SectionHeader } from '@/components/ui';
import { allergenById, CUISINES, cuisineById } from '@/data/allergens';
import { useFeed } from '@/lib/useFeed';
import { activeFilterCount, useApp } from '@/store/app';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Bon matin';
  if (h < 17) return 'Bon après-midi';
  return 'Bonsoir';
}

export default function Discover() {
  const insets = useSafeAreaInsets();
  const { meals: all, hiddenForHealth, loading, reload } = useFeed();
  const { user, filters, setFilters, health, unread, hasRealLocation, setLocation } = useApp();
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState('');
  const count = activeFilterCount(filters);

  // Recherche plein texte locale sur le fil déjà filtré par le serveur (titre, cuisine, ingrédients, quartier, Cooker).
  const meals = useMemo(() => {
    const q = normalize(query);
    if (!q) return all;
    return all.filter((m) =>
      normalize(
        [m.title, m.description, cuisineById(m.cuisine).fr, m.pickupArea, m.cooker.displayName, ...m.ingredients.map((i) => i.name)].join(' '),
      ).includes(q),
    );
  }, [all, query]);

  const locate = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, true);
    } catch {
      // Localisation désactivée sur le téléphone : on garde la position par défaut.
    }
  };

  const endingSoon = useMemo(() => [...meals].sort((a, b) => a.availableUntil.localeCompare(b.availableUntil)).slice(0, 4), [meals]);

  const header = (
    <View style={{ gap: spacing.xl }}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>
            {greeting()}, {user?.displayName ?? ''} 👋
          </Text>
          <Text style={type.h1}>Qu'est-ce qu'on mange ?</Text>
        </View>
        <IconButton
          icon="chatbubbles-outline"
          accessibilityLabel={unread ? `${unread} message(s) non lu(s)` : 'Messages'}
          badge={unread}
          onPress={() => router.push('/inbox')}
        />
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Plats, ingrédients, quartiers…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Rechercher un plat"
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Effacer la recherche">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
        <Pressable style={styles.filterBtn} onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel="Filtres">
          <Ionicons name="options-outline" size={18} color={colors.onDark} />
          {count > 0 && <Text style={styles.filterCount}>{count}</Text>}
        </Pressable>
      </View>

      {!hasRealLocation && (
        <Pressable style={styles.locationHint} onPress={locate} accessibilityRole="button">
          <Ionicons name="navigate-outline" size={18} color={colors.tomato} />
          <Text style={[type.caption, { flex: 1, color: colors.ink }]}>
            Les plats sont affichés autour de Montréal. Touchez ici pour utiliser votre position.
          </Text>
        </Pressable>
      )}

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
            {health.allergens.length
              ? `Filtre santé actif · ${health.allergens.map((a) => allergenById(a.code).fr).join(', ')}`
              : 'Configurez votre profil santé'}
          </Text>
          <Text style={[type.caption, { color: colors.forestSoft }]}>
            {hiddenForHealth > 0 ? `${hiddenForHealth} plat(s) masqué(s) pour votre sécurité` : 'Les plats à risque sont retirés automatiquement'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.forest} />
      </Pressable>

      {endingSoon.length > 1 && !query && (
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

      <SectionHeader
        title={query ? `Résultats · ${meals.length}` : `Près de vous · ${meals.length}`}
        action="Voir la carte"
        onAction={() => router.push('/map')}
      />
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
          loading ? null : query ? (
            <EmptyState
              icon="search-outline"
              title="Aucun résultat"
              body={`Aucun plat ne correspond à « ${query} » dans un rayon de ${filters.radiusKm} km.`}
            />
          ) : (
            <EmptyState
              icon="leaf-outline"
              title="Aucun plat pour l'instant"
              body="Élargissez la distance ou retirez quelques filtres. Et pourquoi ne pas cuisiner pour vos voisins ?"
            >
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button title="Publier un plat" size="md" variant="accent" icon="camera" onPress={() => router.push('/publish')} />
                <Button title="Inviter" size="md" variant="secondary" icon="gift-outline" onPress={() => router.push('/invite')} />
              </View>
            </EmptyState>
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
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, paddingVertical: spacing.sm, minHeight: 40 },
  locationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tomatoSoft,
    padding: spacing.md,
    borderRadius: radius.lg,
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
