// Valide les migrations Homemade sur un vrai Postgres (PGlite + PostGIS) et exécute un scénario de bout en bout.
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = await PGlite.create({ extensions: { postgis, pg_trgm } });

const stubs = `
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
create publication supabase_realtime;
`;
await db.exec(stubs);

const migDir = path.join(ROOT, 'supabase', 'migrations');
for (const f of fs.readdirSync(migDir).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
    console.log('✓ migration', f);
  } catch (e) {
    console.error('✗ migration', f, '\n ', e.message, e.position ? `(pos ${e.position})` : '');
    process.exit(1);
  }
}
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
console.log('✓ seed');

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ''}', false)`);
let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};
const expectError = async (label, fn, pattern) => {
  try {
    await fn();
    check(label, false, 'aucune erreur levée');
  } catch (e) {
    check(label, pattern.test(e.message), e.message);
  }
};

// 0) Bêta fermée : inscription sur code d'invitation
const signup = (email, meta = {}) => q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [email, JSON.stringify(meta)]);
await expectError('inscription sans code d’invitation refusée', () => signup('intrus@test.ca'), /INVITE_CODE_INVALID/);
await expectError('inscription avec un code inconnu refusée', () => signup('intrus@test.ca', { invite_code: 'FAUX-CODE' }), /INVITE_CODE_INVALID/);
const [{ s: st1 }] = await q(`select public.invite_status(' voisins2026 ') as s`);
check('invite_status : code normalisé (casse, espaces) reconnu', st1.required === true && st1.valid === true, JSON.stringify(st1));

// Utilisateurs
const [cook] = await signup('amelie@test.ca', { display_name: 'Amélie', invite_code: 'VOISINS2026' });
const [eater] = await signup('karim@test.ca', { invite_code: 'voisins2026' });
const [allergic] = await signup('sofia@test.ca', { display_name: 'Sofia', invite_code: 'VOISINS2026' });
const profiles = await q(`select display_name from public.profiles order by display_name`);
check('trigger handle_new_user crée les profils', profiles.length === 3, profiles.map((p) => p.display_name).join(', '));
const [inv] = await q(`select uses from public.beta_invites where code = 'VOISINS2026'`);
check('code d’invitation consommé à chaque inscription', inv.uses === 3, `uses=${inv.uses}`);

await q(`insert into public.beta_invites (code, max_uses) values ('UNE-FOIS', 1)`);
await signup('premier@test.ca', { invite_code: 'UNE-FOIS' });
await expectError('code épuisé refusé', () => signup('second@test.ca', { invite_code: 'UNE-FOIS' }), /INVITE_CODE_INVALID/);
await q(`insert into public.beta_invites (code, max_uses, expires_at) values ('EXPIRE', 10, now() - interval '1 day')`);
await expectError('code expiré refusé', () => signup('tard@test.ca', { invite_code: 'EXPIRE' }), /INVITE_CODE_INVALID/);

await as(cook.id);
const [{ c: myCode }] = await q(`select public.my_invite_code() as c`);
const [{ c: myCode2 }] = await q(`select public.my_invite_code() as c`);
check('code personnel : 5 invitations, stable', myCode.maxUses === 5 && myCode.code === myCode2.code && /^HM-[A-Z2-9]{6}$/.test(myCode.code), JSON.stringify(myCode));
const [invited] = await signup('voisine@test.ca', { invite_code: myCode.code });
const [iv] = await q(`select invited_with from public.profiles where id = $1`, [invited.id]);
check('code personnel utilisable par un voisin', iv.invited_with === myCode.code);

const [{ b: boot0 }] = await q(`select public.session_bootstrap() as b`);
check('session : non onboardé avant le profil santé', boot0.onboarded === false && boot0.deleted === false, JSON.stringify(boot0));

await q(`update public.user_private set stripe_charges_enabled = true where user_id in ($1, $2)`, [cook.id, eater.id]);

const basePayload = {
  photoPaths: [`${cook.id}/p1.jpg`, `someoneelse/evil.jpg`],
  description: 'Test',
  mayContain: [],
  priceCents: 1200,
  portions: 3,
  availableHours: 24,
  pickup: { latitude: 45.5245, longitude: -73.5825 },
  pickupArea: 'Plateau',
  cookerAttestation: true,
};

// 1) Publication : le Cooker oublie le sésame du tahini → le dictionnaire curé l'ajoute
await as(cook.id);
const [{ publish_meal: meal1 }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, title: 'Bol Buddha', cuisine: 'healthy_bowl', mode: 'both', diets: ['vegan'], declaredAllergens: [],
    ingredients: [{ name: 'Quinoa', allergens: [], source: 'ai' }, { name: 'Tahini', allergens: [], source: 'ai' }] }),
]);
const a1 = (await q(`select allergen_code, source from public.meal_allergens where meal_id = $1`, [meal1])).map((r) => `${r.allergen_code}:${r.source}`);
check('filet de sécurité : tahini ⇒ sésame ajouté par le dictionnaire', a1.includes('sesame:dictionary'), a1.join(', '));
const photos = await q(`select storage_path from public.meal_photos where meal_id = $1`, [meal1]);
check('photos hors dossier utilisateur rejetées', photos.length === 1, photos.map((p) => p.storage_path).join(', '));
const [pub] = await q(`select status, allergens_confirmed_at is not null as confirmed, extensions.st_distance(pickup_point, pickup_point_public) as jitter from public.meals where id = $1`, [meal1]);
check('plat publié avec confirmation horodatée', pub.status === 'published' && pub.confirmed);
check('point public brouillé de 100 à 300 m', pub.jitter >= 99 && pub.jitter <= 301, `${Math.round(pub.jitter)} m`);

// 1b) Nouvelles catégories (meal prep, déjeuner) : référentiel à jour et publication acceptée
const cats = (await q(`select code from public.cuisines where code in ('meal_prep', 'breakfast')`)).map((r) => r.code).sort();
check('catégories « meal prep » et « déjeuner » présentes', cats.join() === 'breakfast,meal_prep', cats.join());
const [{ publish_meal: mealPrep }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, title: 'Meal prep poulet riz', cuisine: 'meal_prep', mode: 'swap', priceCents: null, diets: [], declaredAllergens: [],
    ingredients: [{ name: 'Poulet', allergens: [], source: 'ai' }, { name: 'Riz', allergens: [], source: 'ai' }] }),
]);
check('publication d’un meal prep', typeof mealPrep === 'string');
await q(`select public.withdraw_meal($1)`, [mealPrep]);

// 2) Implication blé ⇒ gluten
const [{ publish_meal: meal2 }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, title: 'Ramen maison', cuisine: 'asian', mode: 'sale', diets: [], declaredAllergens: ['egg'],
    ingredients: [{ name: 'Nouilles', allergens: ['wheat'], source: 'ai' }, { name: 'Œuf mariné', allergens: ['egg'], source: 'cooker' }] }),
]);
const a2 = (await q(`select allergen_code from public.meal_allergens where meal_id = $1 and kind = 'contains' order by 1`, [meal2])).map((r) => r.allergen_code);
check('implication blé ⇒ gluten', a2.includes('gluten') && a2.includes('wheat'), a2.join(', '));

// 3) Validations bloquantes
await expectError('régime incohérent refusé (végane + lait)', () =>
  q(`select public.publish_meal($1::jsonb)`, [JSON.stringify({ ...basePayload, title: 'Gâteau', cuisine: 'dessert', mode: 'sale', diets: ['vegan'], declaredAllergens: [],
    ingredients: [{ name: 'Crème', allergens: ['milk'], source: 'ai' }] })]), /DIET_CONFLICT/);
await expectError('publication sans attestation refusée', () =>
  q(`select public.publish_meal($1::jsonb)`, [JSON.stringify({ ...basePayload, cookerAttestation: false, title: 'Soupe', cuisine: 'other', mode: 'swap', diets: [], declaredAllergens: [],
    ingredients: [{ name: 'Carottes', allergens: [], source: 'ai' }] })]), /ATTESTATION_REQUIRED/);
await as(allergic.id);
await expectError('vente sans compte Stripe actif refusée', () =>
  q(`select public.publish_meal($1::jsonb)`, [JSON.stringify({ ...basePayload, photoPaths: [], title: 'Pâtes', cuisine: 'italian', mode: 'sale', diets: [], declaredAllergens: [],
    ingredients: [{ name: 'Pâtes', allergens: ['wheat'], source: 'ai' }] })]), /STRIPE_ONBOARDING_REQUIRED/);

// 4) Filtrage santé du fil
await q(`select public.set_health_profile($1::jsonb, $2::text[], false)`, [JSON.stringify([{ code: 'sesame', severity: 'allergy' }]), '{}']);
const feedAllergic = (await q(`select public.feed_meals(45.5231, -73.5817, 5000) as f`))[0].f;
check('fil : plat au sésame masqué pour l’Eater allergique', feedAllergic.meals.length === 1 && feedAllergic.meals[0].id === meal2, `visibles=${feedAllergic.meals.length}`);
check('fil : compteur « masqués pour votre santé »', feedAllergic.hidden_for_health === 1, `hidden=${feedAllergic.hidden_for_health}`);
check('fil : distance calculée', typeof feedAllergic.meals[0].distanceKm === 'number', `${feedAllergic.meals[0].distanceKm} km`);

await as(eater.id);
const feedEater = (await q(`select public.feed_meals(45.5231, -73.5817, 5000, null, null, null, 'all', 'rating') as f`))[0].f;
check('fil : Eater sans allergie voit les 2 plats', feedEater.meals.length === 2);
const feedSwap = (await q(`select public.feed_meals(45.5231, -73.5817, 5000, null, null, null, 'swap') as f`))[0].f;
check('filtre mode échange', feedSwap.meals.length === 1 && feedSwap.meals[0].id === meal1);
const feedFar = (await q(`select public.feed_meals(46.8139, -71.2080, 5000) as f`))[0].f; // Québec (ville)
check('filtre distance (Québec ≠ Montréal)', feedFar.meals.length === 0);
await as(cook.id);
const feedOwn = (await q(`select public.feed_meals(45.5231, -73.5817, 5000) as f`))[0].f;
check('fil : un Cooker ne voit pas ses propres plats', feedOwn.meals.length === 0);

// 5) Achat de bout en bout
const [{ create_purchase_order: po }] = await q(`select public.create_purchase_order($1, $2, 2, 0.05, 0.12)`, [meal2, eater.id]);
check('commande : montants (2 × 12 $ + 5 %)', po.total_cents === 2520 && po.application_fee_cents === 120 + 288, JSON.stringify(po));
let [m2] = await q(`select portions_left from public.meals where id = $1`, [meal2]);
check('commande : portions réservées', m2.portions_left === 1);
await expectError('achat refusé si profil santé en conflit', () => q(`select public.create_purchase_order($1, $2, 1, 0.05, 0.12)`, [meal1, allergic.id]), /HEALTH_PROFILE_CONFLICT/);

await q(`update public.orders set stripe_payment_intent_id = 'pi_test_1' where id = $1`, [po.order_id]);
await q(`select public.apply_payment_event('pi_test_1', 'paid')`);
await as(eater.id);
await expectError('l’Eater ne peut pas accepter sa propre commande', () => q(`select public.transition_order($1, 'accepted')`, [po.order_id]), /INVALID_TRANSITION/);
await as(cook.id);
await q(`select public.transition_order($1, 'accepted')`, [po.order_id]);
await as(eater.id);
const hidden = (await q(`select public.get_pickup_details($1) as p`, [po.order_id]))[0].p;
check('adresse cachée à l’acceptation tant que le Cooker ne l’a pas partagée', hidden === null);
await as(cook.id);
await q(`select public.share_pickup_address($1)`, [po.order_id]);
await as(eater.id);
const pickup = (await q(`select public.get_pickup_details($1) as p`, [po.order_id]))[0].p;
check('adresse exacte révélée quand le Cooker la partage', pickup && Math.abs(pickup.latitude - 45.5245) < 1e-6, JSON.stringify(pickup));
await as(cook.id);
await q(`select public.transition_order($1, 'ready')`, [po.order_id]);
await as(eater.id);
await q(`select public.transition_order($1, 'picked_up')`, [po.order_id]);
await q(`select public.apply_payment_event('pi_test_1', 'completed')`);
const events = (await q(`select to_status from public.order_events where order_id = $1 order by id`, [po.order_id])).map((r) => r.to_status);
check('journal d’audit complet', events.join('>') === 'paid>accepted>ready>picked_up>completed', events.join(' > '));
const sys = await q(`select count(*)::int as n from public.messages m join public.conversations c on c.id = m.conversation_id where c.order_id = $1 and m.kind = 'system'`, [po.order_id]);
check('messages système dans le chat', sys[0].n >= 5, `${sys[0].n} messages`);

// 6) Avis double-aveugle
await q(`select public.submit_review($1, 5::smallint, 'Excellent', '{Savoureux}', '{"taste":5}'::jsonb)`, [po.order_id]);
let [r1] = await q(`select visible_at from public.reviews where order_id = $1`, [po.order_id]);
check('avis caché tant que l’autre partie n’a pas noté', r1.visible_at === null);
await as(cook.id);
await q(`select public.submit_review($1, 4::smallint, 'Ponctuel', '{}', '{}'::jsonb)`, [po.order_id]);
const revs = await q(`select visible_at is not null as v from public.reviews where order_id = $1`, [po.order_id]);
check('les deux avis révélés simultanément', revs.every((r) => r.v) && revs.length === 2);
const [pc] = await q(`select cooker_rating_avg::float as c, cooker_rating_count as cc, eater_rating_avg::float as e from public.profiles where id = $1`, [cook.id]);
const [pe] = await q(`select eater_rating_avg::float as e from public.profiles where id = $1`, [eater.id]);
check('agrégats Cooker et Eater mis à jour', pc.c === 5 && pc.cc === 1 && pe.e === 4, JSON.stringify({ cooker: pc, eater: pe }));
await expectError('un seul avis par commande et par auteur', () => q(`select public.submit_review($1, 3::smallint)`, [po.order_id]), /duplicate|unique/i);

// 7) Échange : sécurité bidirectionnelle
await as(allergic.id);
await q(`update public.user_private set stripe_charges_enabled = true where user_id = $1`, [allergic.id]);
const [{ publish_meal: sofiaMeal }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, photoPaths: [], title: 'Risotto', cuisine: 'italian', mode: 'both', diets: [], declaredAllergens: [],
    ingredients: [{ name: 'Riz', allergens: [], source: 'ai' }, { name: 'Parmesan', allergens: [], source: 'ai' }] }),
]);
await as(eater.id);
await q(`select public.set_health_profile($1::jsonb, '{}', false)`, [JSON.stringify([{ code: 'milk', severity: 'intolerance' }])]);
const [{ publish_meal: karimMeal }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, photoPaths: [], title: 'Curry pois chiches', cuisine: 'indian', mode: 'swap', priceCents: null, diets: ['vegan'], declaredAllergens: [],
    ingredients: [{ name: 'Pois chiches', allergens: [], source: 'ai' }, { name: 'Huile de sésame', allergens: [], source: 'cooker' }] }),
]);
await expectError('échange refusé : le plat cible contient du lait (parmesan via dictionnaire) pour l’Eater intolérant', () =>
  q(`select public.propose_swap($1, $2, 'Salut !')`, [sofiaMeal, karimMeal]), /HEALTH_PROFILE_CONFLICT/);
await q(`select public.set_health_profile('[]'::jsonb, '{}', false)`);
await expectError('échange refusé : le plat offert contient du sésame pour la Cooker allergique', () =>
  q(`select public.propose_swap($1, $2, 'Salut !')`, [sofiaMeal, karimMeal]), /OFFER_CONFLICTS_WITH_COOKER_HEALTH_PROFILE/);

// 8) Signalement d'incident allergène ⇒ suspension immédiate
await q(`insert into public.reports (reporter_id, meal_id, reason, details) values ($1, $2, 'allergen_incident', 'Réaction après consommation')`, [eater.id, meal1]);
const [susp] = await q(`select status from public.meals where id = $1`, [meal1]);
check('incident allergène ⇒ plat suspendu', susp.status === 'suspended');

// 9) Espace Cooker : retrait d'annonce
await as(cook.id);
const [{ b: boot1 }] = await q(`select public.session_bootstrap() as b`);
check('session : toujours non onboardé sans profil santé', boot1.onboarded === false);
await q(`select public.set_health_profile('[]'::jsonb, '{}', false)`);
const [{ b: boot2 }] = await q(`select public.session_bootstrap() as b`);
check('session : onboardé dès que le profil santé est enregistré (même vide)', boot2.onboarded === true);
const [{ m: mine }] = await q(`select public.my_meals() as m`);
check('mes plats : liste avec commandes actives', mine.length === 2 && mine.every((x) => typeof x.activeOrders === 'number'), mine.map((x) => `${x.title}:${x.status}:${x.activeOrders}`).join(', '));
const [{ publish_meal: toWithdraw }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, photoPaths: [], title: 'Soupe aux pois', cuisine: 'quebecois', mode: 'swap', priceCents: null, diets: [], declaredAllergens: [],
    ingredients: [{ name: 'Pois jaunes', allergens: [], source: 'cooker' }] }),
]);
await as(eater.id);
const [{ propose_swap: pendingSwap }] = await q(`select public.propose_swap($1, $2, 'Échange ?')`, [toWithdraw, karimMeal]);
await expectError('retrait du plat d’un autre Cooker interdit', () => q(`select public.withdraw_meal($1)`, [toWithdraw]), /FORBIDDEN/);
await as(cook.id);
await q(`select public.withdraw_meal($1)`, [toWithdraw]);
const [wd] = await q(`select status from public.meals where id = $1`, [toWithdraw]);
const [ps] = await q(`select status from public.orders where id = $1`, [pendingSwap.order_id]);
check('retrait : plat archivé, proposition d’échange en attente refusée', wd.status === 'archived' && ps.status === 'declined', `${wd.status} / ${ps.status}`);

// 10) Commentaires des testeurs & export Loi 25
await db.exec(`set role authenticated`);
await q(`insert into public.beta_feedback (user_id, kind, message, screen) values ($1, 'bug', 'La carte ne charge pas', 'map')`, [cook.id]);
await expectError('commentaire au nom d’un autre membre refusé', () => q(`insert into public.beta_feedback (user_id, kind, message) values ($1, 'idea', 'Usurpation')`, [eater.id]), /row-level security/);
await expectError('codes d’invitation illisibles par les clients', () => q(`select code from public.beta_invites`), /permission denied/);
await db.exec(`reset role`);
const [{ e: exported }] = await q(`select public.export_my_data() as e`);
check('export Loi 25 : profil, plats, commandes, commentaires', exported.profile.id === cook.id && exported.meals.length >= 2 && exported.orders.length >= 1 && exported.feedback.length === 1,
  `plats=${exported.meals.length} commandes=${exported.orders.length}`);

// 11) Suppression de compte
const [leaver] = await signup('depart@test.ca', { display_name: 'Léa', invite_code: 'VOISINS2026' });
await as(leaver.id);
await q(`select public.set_health_profile($1::jsonb, $2::text[], false)`, [JSON.stringify([{ code: 'peanut', severity: 'allergy' }]), '{}']);
const [{ publish_meal: leaverMeal }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, photoPaths: [], title: 'Tarte aux pommes', cuisine: 'dessert', mode: 'swap', priceCents: null, diets: [], declaredAllergens: [],
    ingredients: [{ name: 'Pommes', allergens: [], source: 'cooker' }] }),
]);
await as(eater.id);
const [{ propose_swap: leaverSwap }] = await q(`select public.propose_swap($1, $2, null)`, [leaverMeal, karimMeal]);
await as(leaver.id);
await q(`select public.transition_order($1, 'accepted')`, [leaverSwap.order_id]);
await q(`select public.delete_my_account()`);
const [gone] = await q(`select display_name, deleted_at is not null as d from public.profiles where id = $1`, [leaver.id]);
const [health] = await q(`select (select count(*)::int from public.user_allergens where user_id = $1) + (select count(*)::int from public.user_diets where user_id = $1) as n`, [leaver.id]);
const [lm] = await q(`select status, portions_left from public.meals where id = $1`, [leaverMeal]);
const [ls] = await q(`select status from public.orders where id = $1`, [leaverSwap.order_id]);
check('suppression : profil anonymisé', gone.d && gone.display_name === 'Membre supprimé');
check('suppression : données santé effacées', health.n === 0);
check('suppression : annonces retirées, échange accepté annulé (portions rendues)', lm.status === 'archived' && ls.status === 'cancelled' && lm.portions_left === 3, `${lm.status} ${lm.portions_left} / ${ls.status}`);
const [{ b: bootGone }] = await q(`select public.session_bootstrap() as b`);
check('session : compte supprimé détecté à la reconnexion', bootGone.deleted === true);
await as(eater.id);
await expectError('suppression refusée avec une commande payante en cours', async () => {
  await q(`update public.meals set portions_left = 3, status = 'published' where id = $1`, [meal2]);
  await q(`select public.create_purchase_order($1, $2, 1, 0.05, 0.12)`, [meal2, eater.id]);
  await q(`select public.delete_my_account()`);
}, /ACTIVE_PAID_ORDERS/);

// 11b) Adresse privée, zone publique par code postal, anti-contournement dans le chat
await as(cook.id);
const [{ a: addr }] = await q(`select public.set_my_address('123 rue Rachel Est, Montréal', 'h2j1a1', 45.5245, -73.5825) as a`);
check('adresse : code postal normalisé, zone publique = 3 caractères', addr.postalCode === 'H2J 1A1' && addr.zone === 'H2J', JSON.stringify(addr));
await expectError('adresse : code postal invalide refusé', () => q(`select public.set_my_address('x', '12345', 45.5, -73.5)`), /INVALID_POSTAL_CODE/);
const [{ publish_meal: zoned }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, photoPaths: [], title: 'Pâté chinois', cuisine: 'quebecois', mode: 'swap', priceCents: null, diets: [], declaredAllergens: [],
    pickupArea: 'Plateau, 123 rue Rachel', ingredients: [{ name: 'Boeuf haché', allergens: [], source: 'cooker' }, { name: 'Maïs', allergens: [], source: 'cooker' }] }),
]);
const [zm] = await q(`select pickup_area from public.meals where id = $1`, [zoned]);
check('zone publique : code postal abrégé, aucun numéro d’adresse', zm.pickup_area === 'H2J · Plateau, rue Rachel', zm.pickup_area);
await as(eater.id);
const [{ publish_meal: breadMeal }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, photoPaths: [], title: 'Pain maison', cuisine: 'other', mode: 'swap', priceCents: null, diets: [], declaredAllergens: [],
    ingredients: [{ name: 'Farine de blé', allergens: ['wheat'], source: 'cooker' }] }),
]);
const [{ propose_swap: zSwap }] = await q(`select public.propose_swap($1, $2, $3)`, [zoned, breadMeal, 'Appelle-moi au 514-555-1234, ou je te paie par Interac : karim@exemple.com']);
const msgs = await q(`select body, masked from public.messages m join public.conversations c on c.id = m.conversation_id where c.order_id = $1 and m.kind = 'text'`, [zSwap.order_id]);
check('chat : téléphone, courriel et paiement hors app masqués', msgs.length === 1 && msgs[0].masked && !/514|exemple|interac/i.test(msgs[0].body), msgs[0]?.body);
const [{ p: before }] = await q(`select public.get_pickup_details($1) as p`, [zSwap.order_id]);
check('adresse invisible avant acceptation', before === null);
await as(cook.id);
await q(`select public.transition_order($1, 'accepted')`, [zSwap.order_id]);
await q(`select public.share_pickup_address($1)`, [zSwap.order_id]);
await as(eater.id);
const [{ p: after }] = await q(`select public.get_pickup_details($1) as p`, [zSwap.order_id]);
check('adresse écrite révélée après partage par le Cooker', after?.address === '123 rue Rachel Est, Montréal' && after?.postalCode === 'H2J 1A1', JSON.stringify(after));
const [{ s: pay }] = await q(`select public.my_payment_status() as s`);
check('statut des paiements lisible', typeof pay.hasAccount === 'boolean' && typeof pay.chargesEnabled === 'boolean', JSON.stringify(pay));

// 11c) V10 : plat « en cours », échange avec photo, adresse partagée, avis par critère, conversations, favoris
const [tiers] = await signup('tiers@test.ca', { display_name: 'Tiers', invite_code: 'VOISINS2026' });
await as(cook.id);
const [{ publish_meal: lastOne }] = await q(`select public.publish_meal($1::jsonb)`, [
  JSON.stringify({ ...basePayload, photoPaths: [], title: 'Dernière part de tourtière', cuisine: 'quebecois', mode: 'swap', priceCents: null, portions: 1, diets: [], declaredAllergens: [],
    ingredients: [{ name: 'Porc', allergens: [], source: 'cooker' }] }),
]);
await q(`select public.set_meal_photo_meta($1, now() - interval '2 days', 'library')`, [lastOne]);
const [pm] = await q(`select photo_source, photo_taken_at < now() - interval '1 day' as old from public.meals where id = $1`, [lastOne]);
check('photo : origine galerie et date de prise de vue enregistrées', pm.photo_source === 'library' && pm.old === true, JSON.stringify(pm));
await as(eater.id);
const offer = { ...basePayload, photoPaths: [], title: 'Muffins aux bleuets', cuisine: 'dessert', diets: [], declaredAllergens: [], photoSource: 'camera',
  ingredients: [{ name: 'Bleuets', allergens: [], source: 'ai' }] };
const [{ r: pso }] = await q(`select public.propose_swap_with_photo($1, $2::jsonb, 'Je propose mes muffins') as r`, [lastOne, JSON.stringify(offer)]);
const [priv] = await q(`select is_private, status, photo_source from public.meals where id = $1`, [pso.offered_meal_id]);
check('échange avec photo : offre privée créée (appareil photo)', priv.is_private && priv.status === 'published' && priv.photo_source === 'camera', JSON.stringify(priv));
await as(tiers.id);
let feedT = (await q(`select public.feed_meals(45.5231, -73.5817, 5000) as f`))[0].f;
check('offre privée absente du fil', !feedT.meals.some((m) => m.id === pso.offered_meal_id));
const [{ g: seenByTiers }] = await q(`select public.get_meal($1) as g`, [pso.offered_meal_id]);
check('offre privée invisible pour un tiers', seenByTiers === null);
await as(cook.id);
const [{ g: seenByCook }] = await q(`select public.get_meal($1) as g`, [pso.offered_meal_id]);
check('offre privée visible pour le Cooker sollicité', seenByCook?.isPrivate === true);
await as(eater.id);
const [{ n: privBefore }] = await q(`select count(*)::int as n from public.meals where is_private`);
await expectError('échange avec photo refusé si l’offre contient un allergène de la Cooker (tahini ⇒ sésame)', () =>
  q(`select public.propose_swap_with_photo($1, $2::jsonb, null)`, [sofiaMeal, JSON.stringify({ ...offer, title: 'Houmous', ingredients: [{ name: 'Tahini', allergens: [], source: 'ai' }] })]),
  /OFFER_CONFLICTS_WITH_COOKER_HEALTH_PROFILE/);
const [{ n: privAfter }] = await q(`select count(*)::int as n from public.meals where is_private`);
check('refus : aucune offre privée orpheline', privAfter === privBefore);
await as(cook.id);
await q(`select public.transition_order($1, 'accepted')`, [pso.order_id]);
await as(tiers.id);
feedT = (await q(`select public.feed_meals(45.5231, -73.5817, 5000) as f`))[0].f;
const pend = feedT.meals.find((m) => m.id === lastOne);
check('dernière portion acceptée : plat toujours visible, « en cours »', pend?.pending === true, JSON.stringify(pend && { pending: pend.pending, left: pend.portionsLeft }));
await as(eater.id);
const [{ p: noAddr }] = await q(`select public.get_pickup_details($1) as p`, [pso.order_id]);
check('adresse non partagée : l’Eater ne la voit pas', noAddr === null);
const [{ id: convId }] = await q(`select id from public.conversations where order_id = $1`, [pso.order_id]);
await expectError('conversation non supprimable pendant la transaction', () => q(`select public.hide_conversation($1)`, [convId]), /CONVERSATION_ACTIVE/);
await q(`select public.transition_order($1, 'picked_up')`, [pso.order_id]);
await as(tiers.id);
feedT = (await q(`select public.feed_meals(45.5231, -73.5817, 5000) as f`))[0].f;
check('après la remise : le plat disparaît du fil', !feedT.meals.some((m) => m.id === lastOne));
await as(eater.id);
await q(`select public.hide_conversation($1)`, [convId]);
const [{ c: convs }] = await q(`select public.my_conversations() as c`);
check('conversation supprimée de ma liste', !convs.some((c) => c.id === convId));
await q(`select public.submit_review($1, 5::smallint, 'Délicieux', '{Savoureux}', '{"taste":5,"hygiene":4}'::jsonb)`, [pso.order_id]);
await as(cook.id);
await q(`select public.submit_review($1, 4::smallint, 'À l’heure', '{Ponctuel}', '{"punctuality":5,"communication":3}'::jsonb)`, [pso.order_id]);
const [{ s: sumE }] = await q(`select public.review_summary($1, 'eater') as s`, [eater.id]);
check('avis : fiabilité de l’Eater notée par critère', Number(sumE.criteria.punctuality) === 5 && sumE.count >= 1, JSON.stringify(sumE.criteria));
const [{ s: sumC }] = await q(`select public.review_summary($1, 'cooker') as s`, [cook.id]);
check('avis : synthèse Cooker par critère et répartition', Number(sumC.criteria.taste) === 5 && Object.keys(sumC.distribution).length === 5, JSON.stringify(sumC));
const [{ t: fav1 }] = await q(`select public.toggle_favorite_person($1) as t`, [eater.id]);
const [{ f: favs }] = await q(`select public.my_favorite_people() as f`);
const [{ p: page }] = await q(`select public.person_page($1) as p`, [eater.id]);
check('voisins favoris : ajout et page du voisin', fav1 === true && favs.length === 1 && page.isFavorite && page.tradedWith, JSON.stringify({ fav1, n: favs.length }));
const [{ t: fav2 }] = await q(`select public.toggle_favorite_person($1) as t`, [eater.id]);
check('voisins favoris : retrait', fav2 === false);

// 11d) Notifications push : jetons par RPC, envoi jamais bloquant (même sans pg_net ni Firebase)
await as(eater.id);
const tokE = 'fcm-eater-' + 'x'.repeat(40);
await q(`select public.register_push_token($1, 'android')`, [tokE]);
await expectError('jeton push : plateforme invalide refusée', () => q(`select public.register_push_token($1, 'windows')`, [tokE]), /INVALID_INPUT/);
await as(cook.id);
await q(`select public.register_push_token($1, 'android')`, ['fcm-cook-' + 'y'.repeat(40)]);
const tokRows = await q(`select user_id from public.push_tokens order by user_id`);
check('jetons push enregistrés (un par appareil)', tokRows.length === 2);
await q(`insert into public.push_config (endpoint, secret) values ('http://127.0.0.1:9/push-notify', $1)`, ['s'.repeat(40)]);
const [{ id: pushConv }] = await q(`select conversation_id as id from public.conversation_participants where user_id = $1 limit 1`, [eater.id]);
await q(`insert into public.conversation_participants (conversation_id, user_id) values ($1, $2) on conflict do nothing`, [pushConv, cook.id]);
await q(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Test push')`, [pushConv, cook.id]);
check('message enregistré même si l’envoi push échoue (fail-safe)', (await q(`select 1 from public.messages where body = 'Test push'`)).length === 1);
// Même téléphone, autre compte connecté : le jeton change de propriétaire.
await q(`select public.register_push_token($1, 'android')`, [tokE]);
check('jeton push : passe au dernier compte connecté', (await q(`select user_id from public.push_tokens where token = $1`, [tokE]))[0].user_id === cook.id);
await q(`select public.unregister_push_token($1)`, [tokE]);
check('jeton push : retiré à la déconnexion', (await q(`select 1 from public.push_tokens where token = $1`, [tokE])).length === 0);
await q(`delete from public.push_config`);

// 11e) Portion : quantité + unité enregistrées avec le plat, en une transaction ; valeurs invalides refusées
await as(cook.id);
const [{ id: mealMl }] = await q(`select public.publish_meal_with_details($1::jsonb) as id`, [
  JSON.stringify({ ...basePayload, title: 'Soupe repas', cuisine: 'other', mode: 'sale', diets: [], declaredAllergens: [], portionQty: 500, portionUnit: 'ml',
    photoSource: 'camera', ingredients: [{ name: 'Carottes', allergens: [], source: 'cooker' }] }),
]);
const [{ m: mlJson }] = await q(`select public.meal_to_json($1) as m`, [mealMl]);
check('portion : 500 ml enregistrés et renvoyés', Number(mlJson.portionQty) === 500 && mlJson.portionUnit === 'ml' && mlJson.photoSource === 'camera', `${mlJson.portionQty} ${mlJson.portionUnit}`);
const beforeBad = (await q(`select count(*)::int as n from public.meals`))[0].n;
await expectError('portion : unité inconnue refusée', () => q(`select public.publish_meal_with_details($1::jsonb)`, [
  JSON.stringify({ ...basePayload, title: 'Mauvaise unité', cuisine: 'other', mode: 'sale', diets: [], declaredAllergens: [], portionQty: 1, portionUnit: 'barrel',
    ingredients: [{ name: 'Riz', allergens: [], source: 'cooker' }] }),
]), /INVALID_PORTION/);
await expectError('portion : quantité nulle refusée', () => q(`select public.publish_meal_with_details($1::jsonb)`, [
  JSON.stringify({ ...basePayload, title: 'Zéro', cuisine: 'other', mode: 'sale', diets: [], declaredAllergens: [], portionQty: 0, portionUnit: 'g',
    ingredients: [{ name: 'Riz', allergens: [], source: 'cooker' }] }),
]), /INVALID_PORTION/);
await expectError('portion : quantité arrondie à zéro refusée proprement', () => q(`select public.publish_meal_with_details($1::jsonb)`, [
  JSON.stringify({ ...basePayload, title: 'Minuscule', cuisine: 'other', mode: 'sale', diets: [], declaredAllergens: [], portionQty: 0.001, portionUnit: 'kg',
    ingredients: [{ name: 'Riz', allergens: [], source: 'cooker' }] }),
]), /INVALID_PORTION/);
check('portion invalide : aucun plat créé', (await q(`select count(*)::int as n from public.meals`))[0].n === beforeBad);
const [{ m: defJson }] = await q(`select public.meal_to_json($1) as m`, [meal1]);
check('portion par défaut : 1 assiette', Number(defJson.portionQty) === 1 && defJson.portionUnit === 'plate');

// 11f) Accueil : mes échanges en cours (rôle, ce qui attend ma réponse en premier)
for (const who of [cook, eater]) {
  await as(who.id);
  const [{ x: active }] = await q(`select public.my_active_exchanges() as x`);
  const [{ n }] = await q(`select count(*)::int as n from public.orders where $1 in (cooker_id, eater_id) and status in ('requested','paid','accepted','ready')`, [who.id]);
  const sorted = active.every((e, i) => i === 0 || !(e.needsMe && !active[i - 1].needsMe));
  check(`accueil : échanges en cours de ${who === cook ? 'Cooker' : 'Eater'} (${n})`, active.length === Math.min(n, 20) && active.every((e) => ['cooker', 'eater'].includes(e.role) && e.conversationId) && sorted, JSON.stringify(active.map((e) => [e.status, e.role, e.needsMe])));
}

// 12) Invitations désactivables par l'équipe
await q(`update public.app_config set value = 'false' where key = 'invite_required'`);
const [open] = await signup('libre@test.ca');
check('inscriptions ouvertes : compte créé sans code', Boolean(open?.id));

// 13) Privilèges : le rôle authenticated ne peut ni lire le point exact ni sonder un profil santé
await db.exec(`set role authenticated`);
await expectError('colonne pickup_point illisible pour authenticated', () => q(`select pickup_point from public.meals limit 1`), /permission denied/);
await expectError('meal_is_safe_for non exécutable par authenticated', () => q(`select public.meal_is_safe_for($1, $2)`, [meal2, allergic.id]), /permission denied/);
await expectError('adresse privée illisible directement', () => q(`select address_line from public.user_private limit 1`), /permission denied/);
await expectError('insertion directe dans meals interdite', () => q(`insert into public.meals (cooker_id) values ($1)`, [eater.id]), /permission denied/);
await expectError('jetons push illisibles directement', () => q(`select token from public.push_tokens`), /permission denied/);
await expectError('configuration push illisible', () => q(`select secret from public.push_config`), /permission denied/);
const visible = await q(`select id from public.meals`);
check('RLS : lecture des plats visibles fonctionne', visible.length >= 1, `${visible.length} plats`);
await db.exec(`reset role`);

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);
