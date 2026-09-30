// POST /functions/v1/stripe-connect-onboard  { action?: 'status' | 'onboard' }
// Espace paiements du Cooker (écran Paramètres) :
//   status  : état du compte Stripe Connect, relu chez Stripe (au cas où un webhook aurait été manqué)
//   onboard : crée (une fois) le compte Express et renvoie le lien d'inscription Stripe (identité, compte bancaire),
//             ou le lien du tableau de bord Stripe si la vente est déjà active.
import { adminClient, env, handler, json, requireUser } from '../_shared/http.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(
  handler(async (req) => {
    const { user } = await requireUser(req);
    const { action = 'onboard' } = (await req.json().catch(() => ({}))) as { action?: string };
    const admin = adminClient();
    const s = stripe();

    const { data: priv } = await admin.from('user_private').select('stripe_account_id').eq('user_id', user.id).single();
    let accountId = priv?.stripe_account_id as string | null;

    const refresh = async (id: string) => {
      const acct = await s.accounts.retrieve(id);
      const enabled = Boolean(acct.charges_enabled && acct.payouts_enabled);
      await admin.from('user_private').update({ stripe_charges_enabled: enabled }).eq('user_id', user.id);
      return { hasAccount: true, chargesEnabled: enabled, detailsSubmitted: Boolean(acct.details_submitted) };
    };

    if (action === 'status') {
      return json(accountId ? await refresh(accountId) : { hasAccount: false, chargesEnabled: false, detailsSubmitted: false });
    }

    if (accountId) {
      const st = await refresh(accountId);
      if (st.chargesEnabled) {
        const login = await s.accounts.createLoginLink(accountId);
        return json({ url: login.url, kind: 'dashboard', ...st });
      }
    } else {
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

    // Stripe exige des URL https : la fonction stripe-return renvoie vers l'app (homemade://settings).
    const base = `${env('SUPABASE_URL')}/functions/v1/stripe-return`;
    const link = await s.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: Deno.env.get('STRIPE_CONNECT_REFRESH_URL') ?? `${base}?to=refresh`,
      return_url: Deno.env.get('STRIPE_CONNECT_RETURN_URL') ?? `${base}?to=done`,
    });
    return json({ url: link.url, kind: 'onboarding', hasAccount: true, chargesEnabled: false });
  }),
);
