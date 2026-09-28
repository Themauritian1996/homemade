/**
 * Barre d'actions d'une commande dans le chat : affiche l'état et les actions permises selon le rôle.
 * Les règles font foi côté serveur (`transition_order`) ; cette barre ne fait que proposer les bons boutons.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { fetchOrder, OrderAction, OrderSummary, transitionOrder } from '@/services/orders';
import { colors, fonts, radius, spacing } from '@/theme';
import { Button } from './ui';

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
      { to: 'accepted', label: 'Accepter', variant: 'primary' },
      { to: 'declined', label: 'Refuser', variant: 'danger' },
    ];
  if (cooker && o.status === 'accepted') return [{ to: 'ready', label: 'Le plat est prêt', variant: 'primary' }];
  if (eater && (o.status === 'ready' || (o.kind === 'swap' && o.status === 'accepted')))
    return [{ to: 'picked_up', label: "J'ai récupéré", variant: 'accent' }];
  if (eater && ['requested', 'paid'].includes(o.status)) return [{ to: 'cancelled', label: 'Annuler', variant: 'secondary' }];
  if (['picked_up', 'completed'].includes(o.status)) return [{ to: 'review', label: 'Laisser un avis', variant: 'accent' }];
  return [];
}

export function OrderActions({ orderId, me, refreshKey }: { orderId: string; me: string; refreshKey: number }) {
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchOrder(orderId).then(setOrder).catch(() => {});
  }, [orderId]);
  // Rechargé à chaque nouveau message (les changements d'état publient un message système).
  useEffect(load, [load, refreshKey]);

  if (!order) return null;

  const run = async (a: ActionDef) => {
    if (a.to === 'review') return router.push({ pathname: '/review/[orderId]', params: { orderId } });
    setBusy(true);
    try {
      await transitionOrder(orderId, a.to, order.kind);
      load();
      if (a.to === 'picked_up') router.push({ pathname: '/review/[orderId]', params: { orderId } });
    } catch (e) {
      Alert.alert('Action impossible', e instanceof Error ? e.message : 'Réessayez.');
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
          {order.kind === 'swap' ? 'Échange' : 'Commande'} · {STATUS_LABEL[order.status] ?? order.status}
        </Text>
      </View>
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

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.sage, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.forest },
});
