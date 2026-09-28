/**
 * Commandes & échanges.
 * Achat  : Edge Function `create-payment-intent` → PaymentSheet Stripe (capture manuelle à la cueillette).
 * Échange : RPC `propose_swap` → le Cooker accepte/refuse dans le chat → accord mutuel.
 */
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';

export interface PaymentSheetParams {
  orderId: string;
  paymentIntentClientSecret: string;
  customerId: string;
  ephemeralKey: string;
  conversationId: string;
}

export type PurchaseResult = PaymentSheetParams | { orderId: string; conversationId: string; demo: true };

export async function createPurchase(mealId: string, quantity: number): Promise<PurchaseResult> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 900));
    return { orderId: 'o-demo', conversationId: 'c1', demo: true };
  }
  const { data, error } = await requireSupabase().functions.invoke<PaymentSheetParams>('create-payment-intent', {
    body: { meal_id: mealId, quantity },
  });
  if (error) throw error;
  if (!data) throw new Error('Réponse de paiement vide');
  return data;
}

export async function proposeSwap(mealId: string, offeredMealId: string, message: string): Promise<{ orderId: string; conversationId: string }> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 700));
    return { orderId: 'o-demo-swap', conversationId: 'c2' };
  }
  const { data, error } = await requireSupabase().rpc('propose_swap', {
    p_meal_id: mealId,
    p_offered_meal_id: offeredMealId,
    p_message: message,
  });
  if (error) throw error;
  const row = data as { order_id: string; conversation_id: string };
  return { orderId: row.order_id, conversationId: row.conversation_id };
}

/**
 * Transitions d'état via l'Edge Function `order-action` : elle valide la transition (RPC `transition_order`,
 * exécutée avec le JWT de l'utilisateur) puis applique l'effet Stripe (capture à `picked_up`, annulation sinon).
 */
export async function transitionOrder(orderId: string, to: 'accepted' | 'declined' | 'ready' | 'picked_up' | 'cancelled', reason?: string) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase().functions.invoke('order-action', { body: { order_id: orderId, to, reason } });
  if (error) throw error;
}

export async function submitReview(params: { orderId: string; rating: number; comment: string; tags: string[]; subScores: Record<string, number> }) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase().rpc('submit_review', {
    p_order_id: params.orderId,
    p_rating: params.rating,
    p_comment: params.comment,
    p_tags: params.tags,
    p_sub_scores: params.subScores,
  });
  if (error) throw error;
}
