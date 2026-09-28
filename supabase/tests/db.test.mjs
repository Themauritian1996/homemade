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

// Utilisateurs
const [cook] = await q(`insert into auth.users (email, raw_user_meta_data) values ('amelie@test.ca', '{"display_name":"Amélie"}') returning id`);
const [eater] = await q(`insert into auth.users (email) values ('karim@test.ca') returning id`);
const [allergic] = await q(`insert into auth.users (email, raw_user_meta_data) values ('sofia@test.ca', '{"display_name":"Sofia"}') returning id`);
const profiles = await q(`select display_name from public.profiles order by display_name`);
check('trigger handle_new_user crée les profils', profiles.length === 3, profiles.map((p) => p.display_name).join(', '));

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
const pickup = (await q(`select public.get_pickup_details($1) as p`, [po.order_id]))[0].p;
check('adresse exacte révélée après acceptation', pickup && Math.abs(pickup.latitude - 45.5245) < 1e-6, JSON.stringify(pickup));
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

// 9) Privilèges : le rôle authenticated ne peut ni lire le point exact ni sonder un profil santé
await db.exec(`set role authenticated`);
await expectError('colonne pickup_point illisible pour authenticated', () => q(`select pickup_point from public.meals limit 1`), /permission denied/);
await expectError('meal_is_safe_for non exécutable par authenticated', () => q(`select public.meal_is_safe_for($1, $2)`, [meal2, allergic.id]), /permission denied/);
await expectError('insertion directe dans meals interdite', () => q(`insert into public.meals (cooker_id) values ($1)`, [eater.id]), /permission denied/);
const visible = await q(`select id from public.meals`);
check('RLS : lecture des plats visibles fonctionne', visible.length >= 1, `${visible.length} plats`);
await db.exec(`reset role`);

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);
