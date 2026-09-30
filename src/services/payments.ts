/**
 * Paiements (Stripe Connect). L'argent suit la remise du plat : pré-autorisation à la commande, capture à la cueillette.
 * La vente n'apparaît dans l'app que si la clé PUBLIABLE Stripe est fournie au moment de fabriquer l'APK.
 */
import { config, DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';

/** La vente est-elle possible dans cette version de l'app (Stripe configuré) ? */
export const SALES_ENABLED = Boolean(config.stripePublishableKey);

/** Mode test Stripe : cartes fictives, aucun argent réel. */
export const PAYMENTS_TEST_MODE = config.stripePublishableKey.startsWith('pk_test_');

export interface PaymentStatus {
  hasAccount: boolean;
  chargesEnabled: boolean;
  detailsSubmitted?: boolean;
}

export async function fetchPaymentStatus(): Promise<PaymentStatus> {
  if (DEMO_MODE || !SALES_ENABLED) return { hasAccount: false, chargesEnabled: false };
  const sb = requireSupabase();
  // Relu chez Stripe par la fonction serveur ; repli sur la base si la fonction est indisponible.
  const { data, error } = await sb.functions.invoke<PaymentStatus>('stripe-connect-onboard', { body: { action: 'status' } });
  if (!error && data) return data;
  const { data: local, error: e2 } = await sb.rpc('my_payment_status');
  if (e2) throw e2;
  return local as PaymentStatus;
}

/** Lien Stripe : inscription (identité, compte bancaire) ou tableau de bord si la vente est déjà active. */
export async function paymentsLink(): Promise<{ url: string; kind: 'onboarding' | 'dashboard' } | null> {
  if (DEMO_MODE || !SALES_ENABLED) return null;
  const { data, error } = await requireSupabase().functions.invoke<{ url: string; kind: 'onboarding' | 'dashboard' }>('stripe-connect-onboard', {
    body: { action: 'onboard' },
  });
  if (error) throw error;
  return data ?? null;
}
