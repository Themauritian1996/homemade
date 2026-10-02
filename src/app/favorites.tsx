/** Plats mis de côté (❤︎) sur ce téléphone. Les plats retirés ou épuisés sont signalés. */
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MealCard } from '@/components/MealCard';
import { Button, EmptyState, ScreenHeader } from '@/components/ui';
import { fetchMeal } from '@/services/meals';
import { useApp } from '@/store/app';
import { colors, createStyles, radius, spacing, type } from '@/theme';
import type { Meal } from '@/types';

import { t } from '@/i18n';
export default function Favorites() {
  const insets = useSafeAreaInsets();
  const favorites = useApp((s) => s.favorites);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const [items, setItems] = useState<{ id: string; meal: Meal | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all(
      favorites.map((id) =>
        fetchMeal(id)
          .then((meal) => ({ id, meal }))
          .catch(() => ({ id, meal: null })),
      ),
    )
      .then(setItems)
      .finally(() => setLoading(false));
  }, [favorites]);
  useFocusEffect(load);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('Mes favoris')} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.forest} />}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: insets.bottom + spacing.huge }}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState icon="heart-outline" title={t('Aucun favori')} body={t('Touchez ♡ sur un plat pour le retrouver ici.')}>
              <Button title={t('Découvrir les plats')} onPress={() => router.push('/')} style={{ marginTop: spacing.md }} />
            </EmptyState>
          )
        }
        renderItem={({ item }) => {
          const available = item.meal && item.meal.status === 'published' && new Date(item.meal.availableUntil).getTime() > Date.now();
          return (
            <View style={{ gap: spacing.xs }}>
              {item.meal ? (
                <MealCard meal={item.meal} variant="compact" />
              ) : (
                <View style={styles.gone}>
                  <Text style={type.body}>{t('Plat retiré par son Cooker')}</Text>
                </View>
              )}
              {!available && (
                <Text style={[type.caption, { color: colors.warning }]} onPress={() => toggleFavorite(item.id)}>{t('Plus disponible ·')}{' '}<Text style={{ textDecorationLine: 'underline' }}>{t('retirer des favoris')}</Text>
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = createStyles(() => ({
  gone: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.lg },
}));
