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

/** Offre d'échange faite d'une simple photo : plat privé (jamais dans le fil), visible seulement par ce Cooker. */
export interface SwapPhotoOffer {
  photoPaths: string[];
  title: string;
  description: string;
  cuisine: string;
  ingredients: { name: string; allergens: string[]; source: 'ai' | 'cooker' }[];
  declaredAllergens: string[];
  mayContain: string[];
  diets: string[];
  pickup: { latitude: number; longitude: number };
  pickupArea: string;
  cookerAttestation: boolean;
  aiAnalysisId?: string;
  photoSource?: 'camera' | 'library';
  photoTakenAt?: string | null;
}

/**
 * Le serveur publie l'offre en privé (mêmes règles que publish_meal : attestation, allergènes recalculés), vérifie
 * qu'elle est compatible avec le profil santé du Cooker (OFFER_CONFLICTS…) puis envoie la proposition.
 */
export async function proposeSwapWithPhoto(mealId: string, offer: SwapPhotoOffer, message: string): Promise<{ orderId: string; conversationId: string }> {
  if (!offer.cookerAttestation) throw new Error('La validation des allergènes est obligatoire.');
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 700));
    return { orderId: 'o-demo-swap', conversationId: 'c2' };
  }
  const { data, error } = await requireSupabase().rpc('propose_swap_with_photo', { p_meal_id: mealId, p_offer: offer, p_message: message });
  if (error) throw error;
  const row = data as { order_id: string; conversation_id: string };
  return { orderId: row.order_id, conversationId: row.conversation_id };
}

export type OrderAction = 'accepted' | 'declined' | 'ready' | 'picked_up' | 'cancelled';

export interface OrderSummary {
  id: string;
  kind: 'purchase' | 'swap';
  status: string;
  cookerId: string;
  eaterId: string;
  /** Le Cooker a partagé son adresse (bouton dans la conversation). */
  addressSharedAt?: string | null;
  offeredMealId?: string | null;
}

/** Commande liée à une conversation (lecture autorisée aux deux parties par la RLS). */
export async function fetchOrder(orderId: string): Promise<OrderSummary | null> {
  if (DEMO_MODE) return { id: orderId, kind: 'purchase', status: 'accepted', cookerId: 'cook-sofia', eaterId: 'demo-user', addressSharedAt: null };
  const { data, error } = await requireSupabase()
    .from('orders')
    .select('id, kind, status, cookerId:cooker_id, eaterId:eater_id, addressSharedAt:address_shared_at, offeredMealId:offered_meal_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as OrderSummary) ?? null;
}

/**
 * Transitions d'état. Échange : RPC `transition_order` directe (rôle et état vérifiés en SQL, aucun paiement).
 * Achat : Edge Function `order-action`, qui valide la même transition puis applique l'effet Stripe
 * (capture à `picked_up`, annulation de la pré-autorisation sinon).
 */
export async function transitionOrder(orderId: string, to: OrderAction, kind: 'purchase' | 'swap', reason?: string) {
  if (DEMO_MODE) return;
  const sb = requireSupabase();
  if (kind === 'swap') {
    const { error } = await sb.rpc('transition_order', { p_order_id: orderId, p_to: to, p_reason: reason ?? null });
    if (error) throw error;
    return;
  }
  const { error } = await sb.functions.invoke('order-action', { body: { order_id: orderId, to, reason } });
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

/** Le Cooker partage son adresse exacte avec l'autre personne (après acceptation, quand il le décide). */
export async function shareAddress(orderId: string) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase().rpc('share_pickup_address', { p_order_id: orderId });
  if (error) throw error;
}
