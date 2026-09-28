// POST /functions/v1/create-payment-intent  { meal_id, quantity }
// 1. Vérifie le compte Stripe du Cooker  2. Réserve les portions (RPC atomique, contrôle santé inclus)
// 3. Crée un PaymentIntent en capture MANUELLE (charge « destination » vers le Cooker, commission plateforme)
// 4. Renvoie les paramètres du PaymentSheet. En cas d'échec après réservation : annulation ⇒ portions restituées.
import { adminClient, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { EPHEMERAL_KEY_API_VERSION, PLATFORM_FEE_RATE, SERVICE_FEE_RATE, stripe } from '../_shared/stripe.ts';

Deno.serve(
  handler(async (req) => {
    const { user } = await requireUser(req);
    const { meal_id, quantity } = (await req.json()) as { meal_id?: string; quantity?: number };
    if (!meal_id || !Number.isInteger(quantity) || quantity! < 1 || quantity! > 10) throw new HttpError(400, 'INVALID_INPUT');

    const admin = adminClient();
    const s = stripe();

    const { data: meal } = await admin.from('meals').select('cooker_id').eq('id', meal_id).single();
    if (!meal) throw new HttpError(404, 'MEAL_NOT_FOUND');
    const { data: cookerPrivate } = await admin
      .from('user_private')
      .select('stripe_account_id, stripe_charges_enabled')
      .eq('user_id', meal.cooker_id)
      .single();
    if (!cookerPrivate?.stripe_account_id || !cookerPrivate.stripe_charges_enabled) throw new HttpError(409, 'COOKER_PAYMENTS_DISABLED');

    // Réservation atomique (verrou de ligne) + contrôle du profil santé de l'acheteur.
    const { data: order, error: orderErr } = await admin.rpc('create_purchase_order', {
      p_meal_id: meal_id,
      p_eater_id: user.id,
      p_quantity: quantity,
      p_service_fee_rate: SERVICE_FEE_RATE,
      p_platform_fee_rate: PLATFORM_FEE_RATE,
    });
    if (orderErr) throw new HttpError(409, orderErr.message.split(':')[0], orderErr.message);
    const o = order as { order_id: string; conversation_id: string; total_cents: number; application_fee_cents: number; currency: string };

    try {
      // Client Stripe de l'Eater (créé une seule fois).
      const { data: eaterPrivate } = await admin.from('user_private').select('stripe_customer_id').eq('user_id', user.id).single();
      let customerId = eaterPrivate?.stripe_customer_id as string | null;
      if (!customerId) {
        const customer = await s.customers.create({ email: user.email, metadata: { supabase_uid: user.id } }, { idempotencyKey: `cus-${user.id}` });
        customerId = customer.id;
        await admin.from('user_private').update({ stripe_customer_id: customerId }).eq('user_id', user.id);
      }

      const ephemeralKey = await s.ephemeralKeys.create({ customer: customerId }, { apiVersion: EPHEMERAL_KEY_API_VERSION });

      const intent = await s.paymentIntents.create(
        {
          amount: o.total_cents,
          currency: o.currency.toLowerCase(),
          customer: customerId,
          capture_method: 'manual', // pré-autorisation ; capture à la confirmation de cueillette
          automatic_payment_methods: { enabled: true },
          application_fee_amount: o.application_fee_cents,
          transfer_data: { destination: cookerPrivate.stripe_account_id },
          on_behalf_of: cookerPrivate.stripe_account_id, // le Cooker est le marchand du repas
          description: `Homemade · commande ${o.order_id.slice(0, 8)}`,
          metadata: { order_id: o.order_id, meal_id, eater_id: user.id },
        },
        { idempotencyKey: `pi-${o.order_id}` },
      );

      const { error: upErr } = await admin.from('orders').update({ stripe_payment_intent_id: intent.id }).eq('id', o.order_id);
      if (upErr) throw upErr;

      return json({
        orderId: o.order_id,
        conversationId: o.conversation_id,
        paymentIntentClientSecret: intent.client_secret,
        customerId,
        ephemeralKey: ephemeralKey.secret,
      });
    } catch (e) {
      // Compensation : l'annulation déclenche la restitution des portions (trigger orders_on_status_change).
      await admin.from('orders').update({ status: 'cancelled', cancel_reason: 'Échec de création du paiement' }).eq('id', o.order_id);
      throw e;
    }
  }),
);
