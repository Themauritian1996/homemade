/**
 * Commande (achat) ou proposition d'échange.
 * Achat : PaymentSheet Stripe — le montant est PRÉ-AUTORISÉ puis capturé à la cueillette (protection Eater).
 */
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MealCard } from '@/components/MealCard';
import { Button, Divider, IconButton } from '@/components/ui';
import { config, DEMO_MODE } from '@/lib/config';
import { formatPrice } from '@/lib/format';
import { fetchMeal, fetchMySwappableMeals } from '@/services/meals';
import { useApp } from '@/store/app';
import { friendlyError } from '@/lib/errors';
import { createPurchase, proposeSwap } from '@/services/orders';
import { colors, fonts, radius, spacing, type } from '@/theme';
import type { Meal } from '@/types';

import { t } from '@/i18n';
export default function OrderModal() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: 'purchase' | 'swap' }>();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [meal, setMeal] = useState<Meal | null>(null);
  const [qty, setQty] = useState(1);
  const [offered, setOffered] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const userId = useApp((st) => st.user?.id);
  const [myMeals, setMyMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMeal(id).then(setMeal);
    if (kind === 'swap' && userId) fetchMySwappableMeals(userId).then((l) => setMyMeals(l.filter((m) => m.id !== id))).catch(() => {});
  }, [id, kind, userId]);

  if (!meal) return null;
  const subtotal = (meal.priceCents ?? 0) * qty;
  const serviceFee = Math.round(subtotal * 0.05);

  const pay = async () => {
    setLoading(true);
    try {
      const res = await createPurchase(meal.id, qty);
      if ('demo' in res) {
        Alert.alert(t('Commande envoyée 🎉'), t('{0} va confirmer votre commande. Coordonnez la cueillette dans le chat.', { 0: meal.cooker.displayName }));
        router.replace({ pathname: '/chat/[id]', params: { id: res.conversationId } });
        return;
      }
      const init = await initPaymentSheet({
        merchantDisplayName: 'Homemade',
        customerId: res.customerId,
        customerEphemeralKeySecret: res.ephemeralKey,
        paymentIntentClientSecret: res.paymentIntentClientSecret,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { address: { country: 'CA' } },
        returnURL: 'homemade://stripe-redirect',
      });
      if (init.error) throw new Error(init.error.message);
      const { error } = await presentPaymentSheet();
      if (error) {
        if (error.code !== 'Canceled') Alert.alert(t('Paiement refusé'), error.message);
        return;
      }
      router.replace({ pathname: '/chat/[id]', params: { id: res.conversationId } });
    } catch (e) {
      Alert.alert(t('Commande impossible'), friendlyError(e, t('Paiement impossible.')));
    } finally {
      setLoading(false);
    }
  };

  const swap = async () => {
    if (!offered) return Alert.alert(t('Choisissez un plat'), t('Sélectionnez le plat que vous proposez en échange.'));
    setLoading(true);
    try {
      const res = await proposeSwap(meal.id, offered, note);
      Alert.alert(t('Proposition envoyée'), t('{0} recevra votre offre d\'échange.', { 0: meal.cooker.displayName }));
      router.replace({ pathname: '/chat/[id]', params: { id: res.conversationId } });
    } catch (e) {
      Alert.alert(t('Proposition impossible'), friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={type.h2}>{kind === 'swap' ? t('Proposer un échange') : t('Votre commande')}</Text>
        <IconButton icon="close" onPress={() => router.back()} accessibilityLabel={t('Fermer')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl, paddingBottom: 160 }}>
        <View style={styles.summary}>
          <Image source={{ uri: meal.photos[0] }} style={styles.thumb} contentFit="cover" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.bodyStrong} numberOfLines={2}>
              {meal.title}
            </Text>
            <Text style={type.caption}>{t('par')}{' '}{meal.cooker.displayName}</Text>
            <Text style={type.caption}>{meal.pickupArea}</Text>
          </View>
        </View>

        {kind === 'purchase' ? (
          <>
            <View style={styles.qtyRow}>
              <Text style={[type.bodyStrong, { flex: 1 }]}>{t('Portions')}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => setQty(Math.max(1, qty - 1))}>
                <Ionicons name="remove" size={18} color={colors.ink} />
              </Pressable>
              <Text style={[type.h3, { minWidth: 28, textAlign: 'center' }]}>{qty}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => setQty(Math.min(meal.portionsLeft, qty + 1))}>
                <Ionicons name="add" size={18} color={colors.ink} />
              </Pressable>
            </View>
            <View style={styles.card}>
              <Line label={t('{0} × {1}', { 0: qty, 1: formatPrice(meal.priceCents) })} value={formatPrice(subtotal)} />
              <Line label={t('Frais de service')} value={formatPrice(serviceFee)} />
              <Divider />
              <Line label={t('Total')} value={formatPrice(subtotal + serviceFee)} strong />
            </View>
            <View style={styles.info}>
              <Ionicons name="lock-closed" size={16} color={colors.forest} />
              <Text style={[type.caption, { flex: 1, color: colors.forest }]}>{t('Paiement sécurisé par Stripe. Le montant est pré-autorisé et débité seulement quand vous confirmez la cueillette. Annulation gratuite tant que le Cooker n\'a pas accepté.')}</Text>
            </View>
            {!DEMO_MODE && !config.stripePublishableKey && <Text style={[type.caption, { color: colors.danger }]}>{t('Clé Stripe manquante (EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY).')}</Text>}
          </>
        ) : (
          <>
            <Text style={type.h3}>{t('Quel plat proposez-vous ?')}</Text>
            <View style={{ gap: spacing.md }}>
              {myMeals.length === 0 && (
                <Text style={type.body}>{t('Vous n\'avez aucun plat publié en mode « Échange ». Publiez d\'abord un plat (onglet Publier, mode Échange ou Les deux), puis revenez ici.')}</Text>
              )}
              {myMeals.map((m) => (
                <Pressable key={m.id} onPress={() => setOffered(m.id)} style={[styles.offer, offered === m.id && { borderColor: colors.forest, backgroundColor: colors.sage }]}>
                  <View style={{ flex: 1, pointerEvents: 'none' }}>
                    <MealCard meal={m} variant="compact" />
                  </View>
                  <Ionicons name={offered === m.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={offered === m.id ? colors.forest : colors.muted} />
                </Pressable>
              ))}
            </View>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('Un petit mot pour le Cooker (optionnel)')}
              placeholderTextColor={colors.muted}
              multiline
              style={styles.note}
              maxLength={300}
            />
            <View style={styles.info}>
              <Ionicons name="people" size={16} color={colors.forest} />
              <Text style={[type.caption, { flex: 1, color: colors.forest }]}>{t('Un échange est confirmé seulement quand les deux parties l\'acceptent. Chacun note l\'autre après la cueillette.')}</Text>
            </View>
          </>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {kind === 'purchase' ? (
          <Button title={t('Payer {0}', { 0: formatPrice(subtotal + serviceFee) })} variant="accent" icon="card-outline" onPress={pay} loading={loading} />
        ) : (
          <Button title={t('Envoyer la proposition')} icon="swap-horizontal" onPress={swap} loading={loading} disabled={!offered} />
        )}
      </View>
    </View>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={strong ? type.bodyStrong : type.body}>{label}</Text>
      <Text style={[strong ? type.price : type.bodyStrong, !strong && { fontFamily: fonts.medium }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  summary: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg },
  qtyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  info: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.sage, padding: spacing.md, borderRadius: radius.md },
  offer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.xs, paddingRight: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: 'transparent' },
  note: { minHeight: 80, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingTop: spacing.md, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
});
