/** Mes voisins favoris : les personnes avec qui j'ai échangé et que je veux retrouver. */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, EmptyState, RatingPill, ScreenHeader } from '@/components/ui';
import { t } from '@/i18n';
import { fetchFavoritePeople } from '@/services/people';
import { colors, createStyles, radius, spacing, type } from '@/theme';
import type { PublicProfile } from '@/types';

export default function Neighbours() {
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<(PublicProfile & { activeMeals: number })[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchFavoritePeople()
        .then(setPeople)
        .catch(() => setPeople([]));
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('Voisins favoris')} subtitle={t('Les personnes avec qui vous aimez échanger')} />
      <FlatList
        data={people ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: insets.bottom + spacing.huge }}
        ListEmptyComponent={
          people ? (
            <EmptyState
              icon="star-outline"
              title={t('Aucun voisin favori')}
              body={t('Après un échange, ouvrez le profil de la personne (depuis la conversation ou le plat) et touchez « Ajouter à mes voisins favoris ».')}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Avatar uri={item.avatarUrl} name={item.displayName} size={48} verified={item.isVerified} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.bodyStrong}>{item.displayName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <RatingPill rating={item.cookerRating} count={item.cookerRatingCount} compact />
                {!!item.neighborhood && <Text style={type.caption}>{item.neighborhood}</Text>}
              </View>
              <Text style={[type.caption, item.activeMeals > 0 && { color: colors.forest }]}>
                {item.activeMeals > 0 ? t('{n} plat(s) en ligne', { n: item.activeMeals }) : t('Aucun plat en ligne pour l’instant')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.lg },
}));
