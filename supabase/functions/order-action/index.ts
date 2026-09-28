// POST /functions/v1/order-action  { order_id, to, reason? }
// 1. Valide et applique la transition AVEC LE JWT de l'utilisateur (RPC transition_order : rôle + état vérifiés en SQL)
// 2. Applique l'effet Stripe : capture à la cueillette, annulation de la pré-autorisation sinon.
import { adminClient, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { stripe } from '../_shared/stripe.ts';

const ALLOWED = new Set(['accepted', 'declined', 'ready', 'picked_up', 'cancelled']);

Deno.serve(
  handler(async (req) => {
    const { client } = await requireUser(req);
    const { order_id, to, reason } = (await req.json()) as { order_id?: string; to?: string; reason?: string };
    if (!order_id || !to || !ALLOWED.has(to)) throw new HttpError(400, 'INVALID_INPUT');

    const { data, error } = await client.rpc('transition_order', { p_order_id: order_id, p_to: to, p_reason: reason ?? null });
    if (error) throw new HttpError(409, error.message.split(':')[0], error.message);
    const t = data as { id: string; kind: 'purchase' | 'swap'; from: string; to: string; stripe_payment_intent_id: string | null };

    if (t.kind === 'purchase' && t.stripe_payment_intent_id) {
      const s = stripe();
      if (t.to === 'picked_up') {
        try {
          // Le webhook payment_intent.succeeded passera la commande à « completed ».
          await s.paymentIntents.capture(t.stripe_payment_intent_id, undefined, { idempotencyKey: `capture-${t.id}` });
        } catch (e) {
          // Rare (pré-autorisation expirée…) : on ouvre un litige pour traitement humain plutôt que de masquer l'échec.
          await adminClient().rpc('apply_payment_event', {
            p_payment_intent_id: t.stripe_payment_intent_id,
            p_to: 'disputed',
            p_note: `Échec de capture : ${e instanceof Error ? e.message : e}`.slice(0, 300),
          });
          throw new HttpError(502, 'CAPTURE_FAILED');
        }
      } else if (t.to === 'cancelled' || t.to === 'declined') {
        try {
          await s.paymentIntents.cancel(t.stripe_payment_intent_id, { cancellation_reason: t.to === 'declined' ? 'abandoned' : 'requested_by_customer' });
        } catch (e) {
          // Déjà annulé ou jamais confirmé : sans effet financier.
          console.warn('[order-action] cancel PI', e instanceof Error ? e.message : e);
        }
      }
    }

    return json(t);
  }),
);
