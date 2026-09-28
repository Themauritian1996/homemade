// POST /functions/v1/stripe-webhook  (appelé par Stripe — verify_jwt = false dans config.toml)
// Signature vérifiée, idempotence par id d'événement, transitions monotones côté SQL.
// À configurer dans Stripe : événements du compte plateforme ET des comptes connectés (account.updated).
import { adminClient, env, json } from '../_shared/http.ts';
import { cryptoProvider, stripe, type Stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return json({ error: 'MISSING_SIGNATURE' }, 400);

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, env('STRIPE_WEBHOOK_SECRET'), undefined, cryptoProvider);
  } catch (e) {
    return json({ error: 'INVALID_SIGNATURE', message: e instanceof Error ? e.message : String(e) }, 400);
  }

  const admin = adminClient();
  const { error: dupErr } = await admin.from('stripe_events').insert({ id: event.id, type: event.type, payload: event });
  if (dupErr?.code === '23505') return json({ received: true, duplicate: true }); // déjà traité
  if (dupErr) return json({ error: dupErr.message }, 500);

  const apply = (pi: string, to: string, note?: string) =>
    admin.rpc('apply_payment_event', { p_payment_intent_id: pi, p_to: to, p_note: note ?? null });

  try {
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated': // pré-autorisation réussie
        await apply(event.data.object.id, 'paid');
        break;
      case 'payment_intent.succeeded': // capture effectuée
        await apply(event.data.object.id, 'completed');
        break;
      case 'payment_intent.canceled':
        await apply(event.data.object.id, 'cancelled', event.data.object.cancellation_reason ?? 'Paiement annulé');
        break;
      case 'charge.dispute.created': {
        const pi = event.data.object.payment_intent;
        if (pi) await apply(typeof pi === 'string' ? pi : pi.id, 'disputed', `Litige Stripe : ${event.data.object.reason}`);
        break;
      }
      case 'account.updated': {
        const acct = event.data.object;
        await admin
          .from('user_private')
          .update({ stripe_charges_enabled: Boolean(acct.charges_enabled && acct.payouts_enabled) })
          .eq('stripe_account_id', acct.id);
        break;
      }
      default:
        break; // événements non utilisés : acquittés
    }
  } catch (e) {
    // On supprime la trace d'idempotence pour que Stripe puisse rejouer l'événement.
    await admin.from('stripe_events').delete().eq('id', event.id);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  return json({ received: true });
});
