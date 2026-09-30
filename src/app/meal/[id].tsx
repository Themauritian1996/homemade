import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AllergenList } from '@/components/AllergenPicker';
import { Avatar, Badge, Button, Divider, EmptyState, RatingPill, ScreenHeader, Stars } from '@/components/ui';
import { allergenById, cuisineById, DIETS } from '@/data/allergens';
import { formatDistance, formatPrice, relativeTime, timeLeft } from '@/lib/format';
import { evaluateMeal } from '@/lib/safety';
import { fetchCookerReviews, fetchMeal } from '@/services/meals';
import { useApp } from '@/store/app';
import { colors, radius, shadow, spacing, type } from '@/theme';
import type { Meal, Review } from '@/types';

import { t, tr } from '@/i18n';
import { SALES_ENABLED } from '@/services/payments';
export default function MealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const health = useApp((s) => s.health);
  const me = useApp((s) => s.user?.id);
  const isFavorite = useApp((s) => s.favorites.includes(id));
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [missing, setMissing] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    fetchMeal(id)
      .then((m) => {
        setMeal(m);
        setMissing(!m);
        if (m)
          fetchCookerReviews(m.cooker.id)
            .then(setReviews)
            .catch(() => {});
      })
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('Plat introuvable')} />
        <EmptyState icon="restaurant-outline" title={t('Ce plat n\'est plus disponible')} body={t('Il a peut-être été retiré par son Cooker ou est arrivé à expiration.')}>
          <Button title={t('Voir les autres plats')} onPress={() => router.replace('/')} style={{ marginTop: spacing.md }} />
        </EmptyState>
      </View>
    );
  }

  if (!meal) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  // Double contrôle : le fil est déjà filtré côté serveur, mais un plat peut être ouvert via un lien partagé.
  const verdict = evaluateMeal(meal, health);
  const cuisine = cuisineById(meal.cuisine);
  const blocked = verdict.conflicts.length > 0 || verdict.traceConflicts.length > 0;
  const mine = meal.cooker.id === me;
  const share = () =>
    Share.share({ message: t('{title} · {price} sur Homemade 🍽️\nOuvrir dans l’app : {link}', { title: meal.title, price: formatPrice(meal.priceCents), link: `homemade://meal/${meal.id}` }) }).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View>
          <Image source={{ uri: meal.photos[0] }} style={styles.hero} contentFit="cover" transition={300} />
          <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={[StyleSheet.absoluteFill, { height: 140 }]} />
          <View style={[styles.heroBar, { top: insets.top + spacing.sm }]}>
            <Pressable style={styles.heroBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel={t('Retour')}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={styles.heroBtn} onPress={share} accessibilityLabel={t('Partager')}>
                <Ionicons name="share-outline" size={19} color={colors.ink} />
              </Pressable>
              {!mine && (
                <Pressable
                  style={styles.heroBtn}
                  onPress={() => toggleFavorite(meal.id)}
                  accessibilityRole="button"
                  accessibilityLabel={isFavorite ? t('Retirer des favoris') : t('Ajouter aux favoris')}
                  accessibilityState={{ selected: isFavorite }}
                >
                  <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={19} color={isFavorite ? colors.tomato : colors.ink} />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Badge label={`${cuisine.emoji} ${tr(cuisine)}`} />
            {meal.mode !== 'sale' && <Badge label={meal.mode === 'swap' ? t('Échange') : t('Achat ou échange')} tone="forest" icon="swap-horizontal" />}
            {meal.aiAssisted && <Badge label={t('Analyse IA vérifiée')} tone="saffron" icon="sparkles" />}
          </View>
          <Text style={type.h1}>{meal.title}</Text>
          <View style={styles.metaRow}>
            <Meta icon="time-outline" label={t('Encore {0}', { 0: timeLeft(meal.availableUntil) })} />
            <Meta icon="location-outline" label={formatDistance(meal.distanceKm) || meal.pickupArea.split('—')[0]} />
            <Meta icon="layers-outline" label={t('{0}/{1} portions', { 0: meal.portionsLeft, 1: meal.portionsTotal })} />
          </View>

          {blocked ? (
            <View style={[styles.safety, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="warning" size={20} color={colors.danger} />
              <Text style={[type.bodyStrong, { flex: 1, color: colors.danger }]}>{t('Déconseillé pour vous : contient')}{' '}{[...verdict.conflicts, ...verdict.traceConflicts].map((c) => tr(allergenById(c))).join(', ')}.
              </Text>
            </View>
          ) : (
            health.allergens.length > 0 && (
              <View style={[styles.safety, { backgroundColor: colors.sage }]}>
                <Ionicons name="shield-checkmark" size={20} color={colors.forest} />
                <Text style={[type.bodyStrong, { flex: 1, color: colors.forest }]}>{t('Compatible avec vos préférences alimentaires')}</Text>
              </View>
            )
          )}

          <Text style={type.body}>{meal.description}</Text>

          <Pressable style={styles.cooker}>
            <Avatar uri={meal.cooker.avatarUrl} name={meal.cooker.displayName} size={52} verified={meal.cooker.isVerified} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.bodyStrong}>{t('Cuisiné par')}{' '}{meal.cooker.displayName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <RatingPill rating={meal.cooker.cookerRating} count={meal.cooker.cookerRatingCount} />
                <Text style={type.caption}>{meal.cooker.neighborhood}</Text>
              </View>
              {meal.cooker.badges.length > 0 && <Text style={[type.caption, { color: colors.forest }]}>{meal.cooker.badges.map((b) => t(b)).join(' · ')}</Text>}
            </View>
          </Pressable>

          <Divider />
          <View style={{ gap: spacing.md }}>
            <Text style={type.h3}>{t('Allergènes')}</Text>
            <AllergenList codes={meal.allergens} mayContain={meal.mayContain} conflicts={verdict.conflicts} />
            <Text style={type.caption}>{t('Déclaration validée par le Cooker. Préparé dans une cuisine domestique.')}</Text>
          </View>

          <View style={{ gap: spacing.md }}>
            <Text style={type.h3}>{t('Ingrédients')}</Text>
            <Text style={type.body}>{meal.ingredients.map((i) => i.name).join(' · ')}</Text>
            {meal.diets.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {meal.diets.map((d) => (
                  <Badge key={d} label={tr(DIETS.find((x) => x.id === d) ?? { fr: d, en: d })} tone="forest" icon="leaf-outline" />
                ))}
              </View>
            )}
          </View>

          <View style={styles.pickup}>
            <Ionicons name="walk-outline" size={22} color={colors.forest} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{t('Cueillette')}</Text>
              <Text style={type.caption}>{meal.pickupArea}</Text>
              <Text style={type.caption}>{t('Adresse exacte partagée dans le chat après confirmation.')}</Text>
            </View>
          </View>

          <Divider />
          <View style={{ gap: spacing.lg }}>
            <Text style={type.h3}>{t('Avis sur')}{' '}{meal.cooker.displayName.split(' ')[0]}</Text>
            {reviews.length === 0 && <Text style={type.body}>{t('Pas encore d\'avis — soyez le premier à goûter !')}</Text>}
            {reviews.map((r) => (
              <View key={r.id} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Avatar uri={r.author.avatarUrl} name={r.author.displayName} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong}>{r.author.displayName}</Text>
                    <Text style={type.caption}>{relativeTime(r.createdAt)}</Text>
                  </View>
                  <Stars value={r.rating} size={13} />
                </View>
                <Text style={type.body}>{r.comment}</Text>
              </View>
            ))}
          </View>

          {!mine && (
            <Pressable
              onPress={() => router.push({ pathname: '/report', params: { mealId: meal.id, subjectId: meal.cooker.id, title: meal.title } })}
              style={styles.report}
              accessibilityRole="button"
            >
              <Ionicons name="flag-outline" size={16} color={colors.muted} />
              <Text style={type.caption}>{t('Signaler ce plat ou un problème')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.price, { fontSize: 20 }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatPrice(meal.priceCents)}
          </Text>
          <Text style={type.caption} numberOfLines={1}>
            {meal.priceCents != null ? t('par portion') : t('contre un de vos plats')}
          </Text>
        </View>
        {mine ? (
          <Button title={t('Gérer mes plats')} size="md" icon="storefront-outline" onPress={() => router.push('/my-meals')} />
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {meal.mode !== 'sale' && (
              <Button
                title={t('Échanger')}
                variant={meal.mode === 'swap' ? 'primary' : 'secondary'}
                icon="swap-horizontal"
                size="md"
                disabled={blocked}
                onPress={() => router.push({ pathname: '/order/[id]', params: { id: meal.id, kind: 'swap' } })}
              />
            )}
            {meal.mode !== 'swap' && SALES_ENABLED && (
              <Button
                title={t('Commander')}
                variant="accent"
                size="md"
                disabled={blocked}
                onPress={() => router.push({ pathname: '/order/[id]', params: { id: meal.id, kind: 'purchase' } })}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function Meta({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={15} color={colors.muted} />
      <Text style={[type.caption, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 340, backgroundColor: colors.surfaceAlt },
  heroBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  heroBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  sheet: { marginTop: -28, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, gap: spacing.lg },
  metaRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  safety: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  cooker: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  report: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.md, minHeight: 44 },
  pickup: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

