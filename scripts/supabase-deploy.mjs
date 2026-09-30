// Déploiement du serveur Supabase par l'API de gestion (jeton SUPABASE_ACCESS_TOKEN seulement : pas de mot de passe
// de base de données, pas de connexion Postgres directe). Utilisé par les robots GitHub :
//   node scripts/supabase-deploy.mjs check        diagnostic (projets visibles, accès SQL, migrations appliquées)
//   node scripts/supabase-deploy.mjs migrate      applique les migrations manquantes (dans l'ordre) + référentiels (seed)
//   node scripts/supabase-deploy.mjs auth         réglages d'inscription pour la bêta (sans courriel de confirmation)
//   node scripts/supabase-deploy.mjs app-config   écrit l'URL et la clé PUBLIQUE du projet dans $GITHUB_ENV (pour l'APK)
// Variables : SUPABASE_ACCESS_TOKEN (secret), SUPABASE_PROJECT_REF (identifiant du projet, non secret).
// N'affiche jamais de clé : seule la clé publique (anon/publishable) est transmise à l'APK, comme avant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.supabase.com/v1';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const command = process.argv[2];

const fail = (msg) => {
  console.log(`::error::${msg}`);
  process.exit(1);
};
if (!token) fail('Secret SUPABASE_ACCESS_TOKEN manquant (voir GUIDE-UTILISATION.md).');
if (!ref) fail('Identifiant du projet Supabase manquant (SUPABASE_PROJECT_REF).');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** L'API de gestion renvoie parfois des erreurs passagères (5xx, 544 « timeout ») : on réessaie les appels sûrs. */
async function api(method, route, body, { retry = true } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}${route}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (retry && attempt < 4) {
        await wait(attempt * 5000);
        continue;
      }
      throw e;
    }
    const text = await res.text();
    if (retry && attempt < 4 && (res.status >= 500 || res.status === 429)) {
      console.log(`  (Supabase occupé : HTTP ${res.status}, nouvel essai dans ${attempt * 5} s)`);
      await wait(attempt * 5000);
      continue;
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // réponse non JSON
    }
    return { status: res.status, json, text };
  }
}

async function sql(query, { retry = true } = {}) {
  const r = await api('POST', `/projects/${ref}/database/query`, { query }, { retry });
  if (r.status >= 300) throw new Error(`SQL refusé (HTTP ${r.status}) : ${(r.json?.message ?? r.text).slice(0, 800)}`);
  return r.json;
}

/** Dollar-quoting sûr pour insérer un texte littéral dans une requête. */
const lit = (s) => {
  let tag = 'hm';
  while (s.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${s}$${tag}$`;
};

const migrationFiles = () =>
  fs
    .readdirSync(path.join(ROOT, 'supabase', 'migrations'))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ file: f, version: f.split('_')[0], name: f.replace(/^\d+_/, '').replace(/\.sql$/, '') }));

async function appliedVersions() {
  // Postgres résout les tables avant d'exécuter : on vérifie d'abord que l'historique existe (projet neuf).
  const exists = await sql(
    `select exists (select 1 from information_schema.tables where table_schema = 'supabase_migrations' and table_name = 'schema_migrations') as e`,
  );
  if (!exists?.[0]?.e) return new Set();
  const rows = await sql(`select version from supabase_migrations.schema_migrations`);
  return new Set((rows ?? []).map((r) => r.version));
}

async function check() {
  const p = await api('GET', '/projects');
  if (p.status === 401) fail('Jeton SUPABASE_ACCESS_TOKEN invalide ou expiré : recrée-le sur supabase.com/dashboard/account/tokens.');
  if (p.status !== 200) fail(`Le jeton ne peut pas lister les projets (HTTP ${p.status}).`);
  console.log('Projets visibles avec ce jeton :');
  for (const x of p.json) console.log(`  - ${x.name} (${x.id}, ${x.region}, ${x.status})`);
  if (!p.json.some((x) => x.id === ref)) {
    fail(`Le projet ${ref} n'est pas visible avec ce jeton. Recrée le jeton en étant connecté au compte qui possède ce projet.`);
  }
  const ok = await sql('select 1 as ok');
  console.log(`Accès SQL au projet ${ref} : ${ok?.[0]?.ok === 1 ? 'OK' : JSON.stringify(ok)}`);
  const applied = await appliedVersions();
  for (const m of migrationFiles()) console.log(`  ${applied.has(m.version) ? '✓ déjà appliquée' : '· à appliquer   '}  ${m.file}`);
  const tables = await sql(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
  console.log(`Tables dans le schéma public : ${tables?.[0]?.n}`);
}

async function migrate() {
  await sql(`create schema if not exists supabase_migrations;
             create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);`);
  const applied = await appliedVersions();
  let count = 0;
  for (const m of migrationFiles()) {
    if (applied.has(m.version)) continue;
    const body = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', m.file), 'utf8');
    console.log(`Application de ${m.file}…`);
    // Tout ou rien : la migration et son enregistrement dans l'historique sont dans la même transaction.
    try {
      // Pas de nouvel essai aveugle : une migration ne doit jamais être appliquée deux fois.
      await sql(`begin;\n${body}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (${lit(m.version)}, ${lit(m.name)}, '{}');\ncommit;`, { retry: false });
    } catch (e) {
      await wait(5000);
      if (!(await appliedVersions()).has(m.version)) throw e; // la réponse s'est perdue mais la migration est passée
    }
    console.log(`  ✓ ${m.file}`);
    count++;
  }
  console.log(count ? `${count} migration(s) appliquée(s).` : 'Base de données déjà à jour.');
  // Référentiels (allergènes, régimes, cuisines, dictionnaire) : idempotent (on conflict do nothing).
  await sql(fs.readFileSync(path.join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
  console.log('✓ Référentiels (seed) à jour.');
  const n = await sql(`select (select count(*) from public.allergens)::int as allergens, (select count(*) from public.beta_invites)::int as invites`);
  console.log(`Vérification : ${n?.[0]?.allergens} allergènes, ${n?.[0]?.invites} code(s) d'invitation.`);
}

async function auth() {
  // Bêta entre amis : pas de courriel de confirmation (le SMTP gratuit de Supabase est limité à quelques courriels/heure).
  const r = await api('PATCH', `/projects/${ref}/config/auth`, {
    mailer_autoconfirm: true,
    password_min_length: 8,
    site_url: 'homemade://',
    uri_allow_list: 'homemade://**,exp://**',
  });
  if (r.status >= 300) console.log(`::warning::Réglages d'inscription non appliqués (HTTP ${r.status}) : ${(r.json?.message ?? r.text).slice(0, 300)}`);
  else console.log('✓ Inscription sans courriel de confirmation (bêta).');
}

async function appConfig() {
  const r = await api('GET', `/projects/${ref}/api-keys`);
  if (r.status !== 200 || !Array.isArray(r.json)) fail(`Clés du projet illisibles (HTTP ${r.status}).`);
  // Uniquement la clé PUBLIQUE (déjà embarquée dans l'app par conception) ; jamais la clé service_role / secrète.
  const pub = r.json.find((k) => k.name === 'anon' && k.api_key) ?? r.json.find((k) => k.type === 'publishable' && k.api_key);
  if (!pub) fail('Aucune clé publique (anon / publishable) trouvée pour ce projet.');
  const url = `https://${ref}.supabase.co`;
  const out = process.env.GITHUB_ENV;
  if (out) fs.appendFileSync(out, `EXPO_PUBLIC_SUPABASE_URL=${url}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${pub.api_key}\n`);
  console.log(`✓ App branchée sur ${url} (clé publique « ${pub.name} »).`);
}

// ─────────────────────────────────────────────── Test de bout en bout sur le vrai serveur
// Crée un compte temporaire (code d'invitation à usage unique), parcourt les fonctions clés de l'app, appelle l'IA
// (lecture d'une étiquette générée : image_path), puis supprime TOUT ce qui a été créé.
async function smoke(imagePath) {
  const url = `https://${ref}.supabase.co`;
  const keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
  if (keys.status !== 200) fail(`Clés du projet illisibles (HTTP ${keys.status}).`);
  const anon = (keys.json.find((k) => k.name === 'anon') ?? keys.json.find((k) => k.type === 'publishable'))?.api_key;
  const service = (keys.json.find((k) => k.name === 'service_role') ?? keys.json.find((k) => k.type === 'secret'))?.api_key;
  if (!anon || !service) fail('Clés publique / service introuvables.');
  console.log(`::add-mask::${service}`);

  let failures = 0;
  const step = (ok, label, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
    if (!ok) failures++;
  };
  const http = async (method, p, { token: bearer = anon, body, headers = {}, raw } = {}) => {
    const res = await fetch(`${url}${p}`, {
      method,
      headers: { apikey: anon, Authorization: `Bearer ${bearer}`, ...(raw ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // réponse non JSON
    }
    return { status: res.status, json, text };
  };
  const admin = (method, p, body) => http(method, p, { token: service, body, headers: { apikey: service } });

  const code = `ROBOT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const email = `robot-test-${Date.now()}@homemade-test.invalid`;
  let userId = null;
  try {
    await sql(`insert into public.beta_invites (code, note, max_uses) values ('${code}', 'Test automatique (supprimé après usage)', 1)`);

    const st = await http('POST', '/rest/v1/rpc/invite_status', { body: { p_code: code.toLowerCase() } });
    step(st.status === 200 && st.json?.valid === true && st.json?.required === true, 'Code d’invitation vérifié (bêta fermée active)', JSON.stringify(st.json));
    const bad = await http('POST', '/auth/v1/signup', { body: { email: `x${email}`, password: 'MotDePasse-Robot-123', data: { display_name: 'Intrus' } } });
    step(bad.status >= 400, 'Inscription SANS code refusée', `HTTP ${bad.status}`);
    if (bad.json?.user?.id) await admin('DELETE', `/auth/v1/admin/users/${bad.json.user.id}`);

    const password = `Robot-${Math.random().toString(36).slice(2)}-A1`;
    const su = await http('POST', '/auth/v1/signup', { body: { email, password, data: { display_name: 'Robot test', invite_code: code } } });
    userId = su.json?.user?.id ?? su.json?.id ?? null;
    const jwt = su.json?.access_token;
    step(su.status === 200 && Boolean(jwt), 'Inscription avec code (sans courriel de confirmation)', `HTTP ${su.status}${jwt ? '' : ' — ' + su.text.slice(0, 200)}`);
    if (!jwt) throw new Error('inscription impossible');
    const as = (m, p, o = {}) => http(m, p, { ...o, token: jwt });

    const b0 = await as('POST', '/rest/v1/rpc/session_bootstrap', { body: {} });
    step(b0.status === 200 && b0.json?.onboarded === false, 'Nouveau compte : profil santé à remplir', JSON.stringify(b0.json?.onboarded));
    const hp = await as('POST', '/rest/v1/rpc/set_health_profile', { body: { p_allergens: [{ code: 'peanut', severity: 'allergy' }], p_diets: [], p_strict_traces: false } });
    const b1 = await as('POST', '/rest/v1/rpc/session_bootstrap', { body: {} });
    step(hp.status < 300 && b1.json?.onboarded === true && b1.json?.health?.allergens?.[0]?.code === 'peanut', 'Profil santé enregistré sur le serveur');

    const inv = await as('POST', '/rest/v1/rpc/my_invite_code', { body: {} });
    step(inv.status === 200 && /^HM-/.test(inv.json?.code ?? ''), 'Code personnel d’invitation', inv.json?.code);

    const ping = await as('POST', '/functions/v1/analyze-meal', { body: { ping: true } });
    step(ping.status === 200 && ping.json?.ok === true, 'IA configurée côté serveur', JSON.stringify(ping.json?.providers ?? ping.text.slice(0, 200)));

    if (imagePath && fs.existsSync(imagePath)) {
      const photo = `${userId}/robot-etiquette.png`;
      const up = await as('POST', `/storage/v1/object/meal-photos/${photo}`, { raw: fs.readFileSync(imagePath), headers: { 'Content-Type': 'image/png' } });
      step(up.status === 200, 'Envoi d’une photo (stockage)', `HTTP ${up.status}`);
      const t0 = Date.now();
      const ocr = await as('POST', '/functions/v1/analyze-meal', { body: { photo_path: photo, task: 'ocr' } });
      const s = ocr.json?.scan;
      step(ocr.status === 200 && Boolean(s), 'IA gratuite : lecture d’étiquette', `${((Date.now() - t0) / 1000).toFixed(1)} s · ${s?.modelVersion ?? ocr.text.slice(0, 300)}`);
      if (s) {
        const has = (c) => s.contains.includes(c);
        step(has('milk') && has('egg') && has('wheat') && has('gluten'), 'Allergènes lus : lait, œufs, blé ⇒ gluten', `contient=${s.contains.join(',')} traces=${s.mayContain.join(',')}`);
        step(s.mayContain.includes('tree_nut') || s.contains.includes('tree_nut'), 'Mention « Peut contenir : noix » repérée');
      }
      const meal = await as('POST', '/functions/v1/analyze-meal', { body: { photo_path: photo, task: 'meal' } });
      step(meal.status === 200 && typeof meal.json?.analysis?.isFood === 'boolean', 'IA gratuite : analyse de photo de plat', meal.json?.analysis?.modelVersion ?? meal.text.slice(0, 200));
    }

    const pub = await as('POST', '/rest/v1/rpc/publish_meal', {
      body: {
        p_payload: {
          photoPaths: [], title: 'Soupe test du robot', description: 'Test automatique', cuisine: 'quebecois', mode: 'swap', priceCents: null,
          portions: 2, availableHours: 2, pickup: { latitude: 45.5231, longitude: -73.5817 }, pickupArea: 'Test', cookerAttestation: true,
          ingredients: [{ name: 'Pois jaunes', allergens: [], source: 'cooker' }], declaredAllergens: [], mayContain: [], diets: [],
        },
      },
    });
    const mealId = pub.json;
    step(pub.status === 200 && typeof mealId === 'string', 'Publication d’un plat (attestation)', `HTTP ${pub.status} ${pub.status === 200 ? '' : pub.text.slice(0, 200)}`);
    const mine = await as('POST', '/rest/v1/rpc/my_meals', { body: {} });
    step(mine.status === 200 && mine.json?.some?.((m) => m.id === mealId), 'Mes plats');
    const feed = await as('POST', '/rest/v1/rpc/feed_meals', { body: { p_lat: 45.5231, p_lng: -73.5817, p_radius_m: 5000 } });
    step(feed.status === 200 && Array.isArray(feed.json?.meals), 'Fil géolocalisé filtré santé', `${feed.json?.meals?.length ?? '?'} plat(s) visibles`);
    const wd = await as('POST', '/rest/v1/rpc/withdraw_meal', { body: { p_meal_id: mealId } });
    step(wd.status < 300, 'Retrait de l’annonce', `HTTP ${wd.status}`);
    const fb = await as('POST', '/rest/v1/beta_feedback', { body: { user_id: userId, kind: 'other', message: 'Test automatique du robot' }, headers: { Prefer: 'return=minimal' } });
    step(fb.status === 201, 'Commentaire de testeur', `HTTP ${fb.status}`);
  } catch (e) {
    step(false, 'Test interrompu', e instanceof Error ? e.message : String(e));
  } finally {
    // Nettoyage complet : compte (et tout ce qui en dépend, par cascade), photos, code d'invitation, commentaires.
    if (userId) {
      await admin('DELETE', `/storage/v1/object/meal-photos`, { prefixes: [`${userId}/robot-etiquette.png`] }).catch(() => {});
      // Le code personnel n'est pas supprimé par cascade (created_by → null) : sans ça il deviendrait un code libre.
      await sql(
        `delete from public.beta_invites where created_by = '${userId}'; delete from public.beta_feedback where user_id = '${userId}'; delete from public.ai_analyses where user_id = '${userId}';`,
      ).catch(() => {});
      const del = await admin('DELETE', `/auth/v1/admin/users/${userId}`);
      step(del.status === 200, 'Nettoyage : compte de test supprimé', `HTTP ${del.status}`);
    }
    await sql(`delete from public.beta_invites where code = '${code}'`).catch(() => {});
  }
  if (failures) fail(`${failures} vérification(s) en échec sur le serveur réel.`);
  console.log('\nTOUT FONCTIONNE SUR LE SERVEUR RÉEL ✅');
}

try {
  if (command === 'check') await check();
  else if (command === 'smoke') await smoke(process.argv[3]);
  else if (command === 'migrate') await migrate();
  else if (command === 'auth') await auth();
  else if (command === 'app-config') await appConfig();
  else fail(`Commande inconnue : ${command}`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
