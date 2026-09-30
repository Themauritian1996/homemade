import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterSheet } from '@/components/FilterSheet';
import { MealCard } from '@/components/MealCard';
import { Button, Chip, EmptyState, IconButton, SectionHeader } from '@/components/ui';
import { CUISINES, cuisineById } from '@/data/allergens';
import { t, tr } from '@/i18n';
import { useFeed } from '@/lib/useFeed';
import { activeFilterCount, useApp } from '@/store/app';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/** Catégories mises en avant d'abord (repas de la semaine, santé), puis les cuisines du monde. */
const FEATURED_FIRST = ['meal_prep', 'healthy_bowl', 'breakfast'];
const FEATURED_CUISINES = [...CUISINES.filter((c) => FEATURED_FIRST.includes(c.id)), ...CUISINES.filter((c) => !FEATURED_FIRST.includes(c.id) && c.id !== 'other')];

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return t('Bon matin');
  if (h < 17) return t('Bon après-midi');
  return t('Bonsoir');
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
        [m.title, m.description, cuisineById(m.cuisine).fr, cuisineById(m.cuisine).en, m.pickupArea, m.cooker.displayName, ...m.ingredients.map((i) => i.name)].join(' '),
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
          <Text style={type.h1}>{t('Qu\'est-ce qu\'on mange ?')}</Text>
        </View>
        <IconButton
          icon="chatbubbles-outline"
          accessibilityLabel={unread ? t('{0} message(s) non lu(s)', { 0: unread }) : t('Messages')}
          badge={unread}
          onPress={() => router.push('/inbox')}
        />
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('Plats, ingrédients, quartiers…')}
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel={t('Rechercher un plat')}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('Effacer la recherche')}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
        <Pressable style={styles.filterBtn} onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={t('Filtres')}>
          <Ionicons name="options-outline" size={18} color={colors.onDark} />
          {count > 0 && <Text style={styles.filterCount}>{count}</Text>}
        </Pressable>
      </View>

      {!hasRealLocation && (
        <Pressable style={styles.locationHint} onPress={locate} accessibilityRole="button">
          <Ionicons name="navigate-outline" size={18} color={colors.tomato} />
          <Text style={[type.caption, { flex: 1, color: colors.ink }]}>{t('Les plats sont affichés autour de Montréal. Touchez ici pour utiliser votre position.')}</Text>
        </Pressable>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.xl }} style={{ marginHorizontal: -spacing.xl, paddingLeft: spacing.xl }}>
        <Chip label={t('Tout')} selected={filters.cuisines.length === 0} onPress={() => setFilters({ cuisines: [] })} />
        {FEATURED_CUISINES.map((c) => (
          <Chip
            key={c.id}
            emoji={c.emoji}
            label={tr(c)}
            selected={filters.cuisines.includes(c.id)}
            onPress={() => setFilters({ cuisines: filters.cuisines.includes(c.id) ? filters.cuisines.filter((x) => x !== c.id) : [c.id] })}
          />
        ))}
      </ScrollView>

      {!query && (
        <View style={styles.community}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[type.h3, { color: colors.onDark }]}>{t('La table du quartier 🍲')}</Text>
            <Text style={[type.caption, { color: 'rgba(255,255,255,0.85)' }]}>{t('Des voisins qui aiment cuisiner partagent leurs plats et leurs meal preps. Chaque portion partagée, c\'est un repas sauvé du gaspillage.')}</Text>
          </View>
          <Pressable style={styles.communityBtn} onPress={() => router.push('/publish')} accessibilityRole="button" accessibilityLabel={t('Partager un plat')}>
            <Ionicons name="add" size={22} color={colors.forest} />
          </Pressable>
        </View>
      )}

      {/* Préférences alimentaires : appliquées par le serveur ; on reste transparent sur les plats masqués, sans en faire le sujet. */}
      {(health.allergens.length > 0 || health.diets.length > 0) && (
        <Pressable style={styles.prefs} onPress={() => router.push('/health')} accessibilityRole="button">
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.forestSoft} />
          <Text style={[type.caption, { flex: 1, color: colors.forestSoft }]} numberOfLines={1}>{t('Vos préférences alimentaires sont appliquées')}{hiddenForHealth > 0 ? t(' · {0} plat(s) masqué(s)', { 0: hiddenForHealth }) : ''}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.forestSoft} />
        </Pressable>
      )}

      {endingSoon.length > 1 && !query && (
        <View>
          <SectionHeader title={t('Bientôt terminés ⏳')} />
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
        title={query ? t('Résultats · {0}', { 0: meals.length }) : t('Près de vous · {0}', { 0: meals.length })}
        action={t('Voir la carte')}
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
              title={t('Aucun résultat')}
              body={t('Aucun plat ne correspond à « {0} » dans un rayon de {1} km.', { 0: query, 1: filters.radiusKm })}
            />
          ) : (
            <EmptyState
              icon="restaurant-outline"
              title={t('La table est encore vide ici')}
              body={t('Soyez le premier à partager un plat ou votre meal prep, ou invitez vos voisins qui aiment cuisiner. Vous pouvez aussi élargir la distance.')}
            >
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button title={t('Publier un plat')} size="md" variant="accent" icon="camera" onPress={() => router.push('/publish')} />
                <Button title={t('Inviter')} size="md" variant="secondary" icon="gift-outline" onPress={() => router.push('/invite')} />
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
  community: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.forest, padding: spacing.lg, borderRadius: radius.lg, ...shadow.card },
  communityBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  prefs: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.sm, minHeight: 32 },
});
