/** Espace Cooker : mes annonces, leur état, et le retrait d'une annonce. */
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, EmptyState, ScreenHeader } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { formatPrice, timeLeft } from '@/lib/format';
import { fetchMyMeals, MyMeal, withdrawMeal } from '@/services/account';
import { colors, radius, shadow, spacing, type } from '@/theme';

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
      .catch((e) => Alert.alert('Chargement impossible', friendlyError(e)))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);

  const withdraw = (m: MyMeal) =>
    Alert.alert(
      'Retirer cette annonce ?',
      `« ${m.title} » n'apparaîtra plus dans le fil ni sur la carte. Les propositions d'échange en attente seront refusées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawMeal(m.id);
              setMeals((l) => l.filter((x) => x.id !== m.id));
            } catch (e) {
              Alert.alert('Retrait impossible', friendlyError(e));
            }
          },
        },
      ],
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Mes plats" subtitle="Vos annonces des 50 derniers plats" />
      <FlatList
        data={meals}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.forest} />}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: insets.bottom + spacing.huge }}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="restaurant-outline"
              title="Aucun plat publié"
              body="Vous cuisinez trop ? Partagez une portion avec vos voisins : une photo suffit."
            >
              <Button title="Publier un plat" variant="accent" icon="camera" onPress={() => router.push('/publish')} style={{ marginTop: spacing.md }} />
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
                    <Badge label={st.label} tone={st.tone} />
                    {m.activeOrders > 0 && <Badge label={`${m.activeOrders} demande(s)`} tone="tomato" icon="chatbubbles-outline" />}
                  </View>
                  <Text style={type.caption}>
                    {formatPrice(m.priceCents)} · {m.portionsLeft}/{m.portionsTotal} portions{live ? ` · encore ${timeLeft(m.availableUntil)}` : ''}
                  </Text>
                </View>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {m.activeOrders > 0 && (
                  <Button title="Voir les demandes" size="md" icon="chatbubbles-outline" onPress={() => router.push('/inbox')} style={{ flex: 1 }} />
                )}
                <Button title="Retirer" size="md" variant="secondary" icon="eye-off-outline" onPress={() => withdraw(m)} style={{ flex: 1 }} />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, ...shadow.card },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
});
