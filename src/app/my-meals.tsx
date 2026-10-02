/** Espace Cooker : mes annonces, leur état, et le retrait d'une annonce. */
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, EmptyState, ScreenHeader } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { formatPrice, timeLeft } from '@/lib/format';
import { fetchMyMeals, MyMeal, withdrawMeal } from '@/services/account';
import { colors, createStyles, radius, shadow, spacing, type } from '@/theme';

import { t } from '@/i18n';
const STATUS: Record<string, { label: string; tone: 'forest' | 'saffron' | 'danger' | 'neutral' }> = {
  published: { label: 'En ligne', tone: 'forest' },
  reserved: { label: 'Réservé', tone: 'saffron' },
  sold_out: { label: 'Épuisé', tone: 'neutral' },
  expired: { label: 'Expiré', tone: 'neutral' },
  suspended: { label: 'Suspendu · signalement', tone: 'danger' },
  draft: { label: 'Brouillon', tone: 'neutral' },
};

export default function MyMeals() {
  const insets = useSafeAreaInsets();
  const [meals, setMeals] = useState<MyMeal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchMyMeals()
      .then(setMeals)
      .catch((e) => Alert.alert(t('Chargement impossible'), friendlyError(e)))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);

  const withdraw = (m: MyMeal) =>
    Alert.alert(
      t('Retirer cette annonce ?'),
      t('« {0} » n\'apparaîtra plus dans le fil ni sur la carte. Les propositions d\'échange en attente seront refusées.', { 0: m.title }),
      [
        { text: t('Annuler'), style: 'cancel' },
        {
          text: t('Retirer'),
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawMeal(m.id);
              setMeals((l) => l.filter((x) => x.id !== m.id));
            } catch (e) {
              Alert.alert(t('Retrait impossible'), friendlyError(e));
            }
          },
        },
      ],
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('Mes plats')} subtitle={t('Vos annonces des 50 derniers plats')} />
      <FlatList
        data={meals}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.forest} />}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: insets.bottom + spacing.huge }}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="restaurant-outline"
              title={t('Aucun plat publié')}
              body={t('Vous cuisinez trop ? Partagez une portion avec vos voisins : une photo suffit.')}
            >
              <Button title={t('Publier un plat')} variant="accent" icon="camera" onPress={() => router.navigate('/publish')} style={{ marginTop: spacing.md }} />
            </EmptyState>
          )
        }
        renderItem={({ item: m }) => {
          const st = STATUS[m.status] ?? STATUS.draft;
          const live = m.status === 'published' || m.status === 'reserved';
          return (
            <View style={styles.card}>
              <Pressable onPress={() => router.push({ pathname: '/meal/[id]', params: { id: m.id } })} style={styles.row} accessibilityRole="button">
                <Image source={{ uri: m.photos[0] }} style={styles.thumb} contentFit="cover" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={type.h3} numberOfLines={1}>
                    {m.title}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                    <Badge label={t(st.label)} tone={st.tone} />
                    {m.activeOrders > 0 && <Badge label={t('{0} demande(s)', { 0: m.activeOrders })} tone="tomato" icon="chatbubbles-outline" />}
                  </View>
                  <Text style={type.caption}>
                    {formatPrice(m.priceCents)} · {m.portionsLeft}/{m.portionsTotal}{' '}{t('portions')}{live ? t(' · encore {0}', { 0: timeLeft(m.availableUntil) }) : ''}
                  </Text>
                </View>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {m.activeOrders > 0 && (
                  <Button title={t('Voir les demandes')} size="md" icon="chatbubbles-outline" onPress={() => router.navigate('/inbox')} style={{ flex: 1 }} />
                )}
                <Button title={t('Retirer')} size="md" variant="secondary" icon="eye-off-outline" onPress={() => withdraw(m)} style={{ flex: 1 }} />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = createStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, ...shadow.card },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
}));
