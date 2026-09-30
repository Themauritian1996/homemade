/**
 * Barre d'actions d'une commande dans le chat : affiche l'état et les actions permises selon le rôle.
 * Les règles font foi côté serveur (`transition_order`) ; cette barre ne fait que proposer les bons boutons.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { friendlyError } from '@/lib/errors';
import { fetchPickupDetails, PickupDetails } from '@/services/address';
import { fetchOrder, OrderAction, OrderSummary, transitionOrder } from '@/services/orders';
import { colors, fonts, radius, spacing } from '@/theme';
import { Button } from './ui';

import { t } from '@/i18n';
const STATUS_LABEL: Record<string, string> = {
  requested: 'En attente de réponse',
  paid: 'Paiement pré-autorisé · en attente du Cooker',
  accepted: 'Acceptée · cueillette à coordonner',
  ready: 'Prêt à récupérer',
  picked_up: 'Récupéré',
  completed: 'Terminé',
  cancelled: 'Annulée',
  declined: 'Refusée',
  disputed: 'Litige en cours',
};

type ActionDef = { to: OrderAction | 'review'; label: string; variant: 'primary' | 'accent' | 'secondary' | 'danger' };

function actionsFor(o: OrderSummary, me: string): ActionDef[] {
  const cooker = me === o.cookerId;
  const eater = me === o.eaterId;
  const awaitingCooker = o.kind === 'swap' ? o.status === 'requested' : o.status === 'paid';
  if (cooker && awaitingCooker)
    return [
      { to: 'accepted', label: t('Accepter'), variant: 'primary' },
      { to: 'declined', label: t('Refuser'), variant: 'danger' },
    ];
  if (cooker && o.status === 'accepted') return [{ to: 'ready', label: t('Le plat est prêt'), variant: 'primary' }];
  if (eater && (o.status === 'ready' || (o.kind === 'swap' && o.status === 'accepted')))
    return [{ to: 'picked_up', label: t("J'ai récupéré"), variant: 'accent' }];
  if (eater && ['requested', 'paid'].includes(o.status)) return [{ to: 'cancelled', label: t('Annuler'), variant: 'secondary' }];
  if (['picked_up', 'completed'].includes(o.status)) return [{ to: 'review', label: t('Laisser un avis'), variant: 'accent' }];
  return [];
}

export function OrderActions({ orderId, me, refreshKey }: { orderId: string; me: string; refreshKey: number }) {
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickup, setPickup] = useState<PickupDetails | null>(null);

  const load = useCallback(() => {
    fetchOrder(orderId).then(setOrder).catch(() => {});
  }, [orderId]);
  // Rechargé à chaque nouveau message (les changements d'état publient un message système).
  useEffect(load, [load, refreshKey]);

  // Adresse exacte : fournie par le serveur seulement une fois la commande acceptée (et payée pour un achat).
  const revealed = order ? ['accepted', 'ready', 'picked_up'].includes(order.status) : false;
  useEffect(() => {
    if (!revealed) return setPickup(null);
    fetchPickupDetails(orderId)
      .then(setPickup)
      .catch(() => setPickup(null));
  }, [revealed, orderId]);

  if (!order) return null;

  const run = async (a: ActionDef) => {
    if (a.to === 'review') return router.push({ pathname: '/review/[orderId]', params: { orderId } });
    setBusy(true);
    try {
      await transitionOrder(orderId, a.to, order.kind);
      load();
      if (a.to === 'picked_up') router.push({ pathname: '/review/[orderId]', params: { orderId } });
    } catch (e) {
      Alert.alert(t('Action impossible'), friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const actions = actionsFor(order, me);
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Ionicons name={order.kind === 'swap' ? 'swap-horizontal' : 'bag-check-outline'} size={18} color={colors.forest} />
        <Text style={styles.label} numberOfLines={1}>
          {order.kind === 'swap' ? t('Échange') : t('Commande')} · {STATUS_LABEL[order.status] ? t(STATUS_LABEL[order.status]) : order.status}
        </Text>
      </View>
      {pickup && (
        <Pressable onPress={() => openDirections(pickup)} style={styles.pickup} accessibilityRole="button" accessibilityLabel={t('Itinéraire')}>
          <Ionicons name="location" size={18} color={colors.tomato} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pickupTitle}>{pickup.address ?? t('Point de cueillette exact')}</Text>
            <Text style={styles.pickupSub}>{[pickup.postalCode, t('Toucher pour l’itinéraire')].filter(Boolean).join(' · ')}</Text>
          </View>
          <Ionicons name="navigate-outline" size={18} color={colors.forest} />
        </Pressable>
      )}
      {!pickup && order.status === 'paid' && me === order.eaterId && (
        <Text style={styles.pickupSub}>{t('L’adresse exacte s’affichera ici dès que le Cooker aura accepté.')}</Text>
      )}
      {actions.length > 0 && (
        <View style={styles.row}>
          {actions.map((a) => (
            <Button key={a.to} title={a.label} variant={a.variant} size="md" loading={busy} onPress={() => run(a)} style={{ flex: 1 }} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Ouvre l'itinéraire dans l'app de cartes du téléphone (Google Maps sur Android). */
function openDirections(p: PickupDetails) {
  const q = p.address ? encodeURIComponent(`${p.address}${p.postalCode ? `, ${p.postalCode}` : ''}`) : `${p.latitude},${p.longitude}`;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${q}`
      : `https://www.google.com/maps/dir/?api=1&destination=${p.address ? q : `${p.latitude},${p.longitude}`}`;
  Linking.openURL(url).catch(() => {});
}

const styles = StyleSheet.create({
  pickup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  pickupTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  pickupSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkSoft },
  bar: { backgroundColor: colors.sage, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.forest },
});
