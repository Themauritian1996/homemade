// POST /functions/v1/stripe-connect-onboard
// Crée (une fois) le compte Stripe Connect Express du Cooker et renvoie un lien d'onboarding hébergé par Stripe
// (vérification d'identité, coordonnées bancaires). Le webhook account.updated active ensuite la vente.
import { adminClient, env, handler, json, requireUser } from '../_shared/http.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(
  handler(async (req) => {
    const { user } = await requireUser(req);
    const admin = adminClient();
    const s = stripe();

    const { data: priv } = await admin.from('user_private').select('stripe_account_id').eq('user_id', user.id).single();
    let accountId = priv?.stripe_account_id as string | null;

    if (!accountId) {
      const account = await s.accounts.create(
        {
          type: 'express',
          country: 'CA',
          email: user.email,
          business_type: 'individual',
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          business_profile: { mcc: '5812', product_description: 'Repas faits maison vendus entre particuliers via Homemade' },
          metadata: { supabase_uid: user.id },
        },
        { idempotencyKey: `acct-${user.id}` },
      );
      accountId = account.id;
      await admin.from('user_private').update({ stripe_account_id: accountId }).eq('user_id', user.id);
    }

    // Stripe exige des URL https : ces pages redirigent vers l'app (homemade://payouts).
    const link = await s.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: env('STRIPE_CONNECT_REFRESH_URL'),
      return_url: env('STRIPE_CONNECT_RETURN_URL'),
    });

    return json({ url: link.url });
  }),
);
