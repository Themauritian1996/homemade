/**
 * Paramètres → Paiements.
 * Cooker : activer la vente (Stripe Connect : identité + compte bancaire), puis tableau de bord Stripe.
 * Eater : paiement par carte ou Google Pay dans l'app ; montant pré-autorisé, débité seulement à la cueillette.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Alert, AppState, Text, View } from 'react-native';
import { t } from '@/i18n';
import { config } from '@/lib/config';
import { friendlyError } from '@/lib/errors';
import { fetchPaymentStatus, PAYMENTS_TEST_MODE, paymentsLink, PaymentStatus, SALES_ENABLED } from '@/services/payments';
import { colors, createStyles, fonts, radius, spacing, type } from '@/theme';
import { Badge, Button, Card } from './ui';

const pct = (r: number) => `${Math.round(r * 100)} %`;

export function PaymentsSection({ refreshKey }: { refreshKey?: string }) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(SALES_ENABLED);
  const [opening, setOpening] = useState(false);

  const load = useCallback(() => {
    if (!SALES_ENABLED) return;
    setLoading(true);
    fetchPaymentStatus()
      .then(setStatus)
      .catch(() => setStatus({ hasAccount: false, chargesEnabled: false }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load, refreshKey]);
  // Retour dans l'app (après le formulaire Stripe, même fermé à la main) : statut relu.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => sub.remove();
  }, [load]);

  if (!SALES_ENABLED) {
    return (
      <Card style={{ paddingVertical: spacing.lg, gap: spacing.sm }}>
        <Text style={type.bodyStrong}>{t('Achat bientôt disponible')}</Text>
        <Text style={type.caption}>{t('Pour l’instant, les plats s’échangent entre voisins. La vente s’activera dès que l’organisateur de la bêta aura branché Stripe.')}</Text>
      </Card>
    );
  }

  const open = async () => {
    setOpening(true);
    try {
      const link = await paymentsLink();
      // Fenêtre Stripe intégrée : elle se ferme d'elle-même quand Stripe renvoie vers homemade://settings.
      if (link?.url) await WebBrowser.openAuthSessionAsync(link.url, 'homemade://settings');
      load();
    } catch (e) {
      Alert.alert(t('Paiements indisponibles'), friendlyError(e, t('Réessayez plus tard.')));
    } finally {
      setOpening(false);
    }
  };

  const active = status?.chargesEnabled;
  return (
    <View style={{ gap: spacing.md }}>
      {PAYMENTS_TEST_MODE && (
        <View style={styles.test}>
          <Ionicons name="flask-outline" size={16} color={colors.warning} />
          <Text style={[type.caption, { flex: 1, color: colors.ink }]}>
            {t('Mode test : aucun argent réel. Carte de test 4242 4242 4242 4242, date future, n’importe quel code.')}
          </Text>
        </View>
      )}
      <Card style={{ paddingVertical: spacing.lg, gap: spacing.md }}>
        <View style={styles.row}>
          <Ionicons name="storefront-outline" size={20} color={colors.forest} />
          <Text style={[type.bodyStrong, { flex: 1 }]}>{t('Vendre mes plats (Cooker)')}</Text>
          {loading ? (
            <ActivityIndicator color={colors.forest} />
          ) : (
            <Badge label={active ? t('Actif') : status?.hasAccount ? t('Vérification en cours') : t('Non activé')} tone={active ? 'forest' : 'saffron'} />
          )}
        </View>
        <Text style={type.caption}>
          {active
            ? t('Les paiements arrivent sur votre compte bancaire après chaque cueillette confirmée.')
            : t('Stripe vérifie votre identité et votre compte bancaire (5 minutes). Ensuite, vous pouvez vendre vos plats en plus de les échanger.')}
        </Text>
        <Button
          title={active ? t('Tableau de bord Stripe') : status?.hasAccount ? t('Continuer la vérification') : t('Activer la vente')}
          variant={active ? 'secondary' : 'primary'}
          size="md"
          icon={active ? 'open-outline' : 'card-outline'}
          loading={opening}
          onPress={open}
        />
      </Card>
      <Card style={{ paddingVertical: spacing.lg, gap: spacing.sm }}>
        <View style={styles.row}>
          <Ionicons name="bag-check-outline" size={20} color={colors.forest} />
          <Text style={[type.bodyStrong, { flex: 1 }]}>{t('Acheter (Eater)')}</Text>
        </View>
        <Text style={type.caption}>
          {t('Carte ou Google Pay, dans l’app. Le montant est pré-autorisé à la commande et débité seulement à la cueillette ; annulation gratuite tant que le Cooker n’a pas accepté.')}
        </Text>
      </Card>
      <Text style={[type.caption, { fontFamily: fonts.medium }]}>
        {t('Frais : {platform} prélevés sur le prix du Cooker, {service} de frais de service pour l’Eater. Payer hors de l’app (Interac, comptant) vous prive de la protection et des avis : ces demandes sont masquées dans le chat.', {
          platform: pct(config.platformFeeRate),
          service: pct(0.05),
        })}
      </Text>
    </View>
  );
}

const styles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  test: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.saffronSoft, padding: spacing.md, borderRadius: radius.md },
}));
