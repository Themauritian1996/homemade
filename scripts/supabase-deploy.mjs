// Déploiement du serveur Supabase par l'API de gestion (jeton SUPABASE_ACCESS_TOKEN seulement : pas de mot de passe
// de base de données, pas de connexion Postgres directe). Utilisé par les robots GitHub :
//   node scripts/supabase-deploy.mjs check        diagnostic (projets visibles, accès SQL, migrations appliquées)
//   node scripts/supabase-deploy.mjs migrate      applique les migrations manquantes (dans l'ordre) + référentiels (seed)
//   node scripts/supabase-deploy.mjs auth         réglages d'inscription (courriels par Gmail si GMAIL_ADDRESS/GMAIL_APP_PASSWORD, sinon sans courriel)
//   node scripts/supabase-deploy.mjs app-config   écrit l'URL et la clé PUBLIQUE du projet dans $GITHUB_ENV (pour l'APK)
//   node scripts/supabase-deploy.mjs stripe        paiements : points d'accès webhook Stripe + secrets (si STRIPE_SECRET_KEY)
//   node scripts/supabase-deploy.mjs push          notifications push : compte de service Firebase + secret partagé (si FIREBASE_SERVICE_ACCOUNT)
//   node scripts/supabase-deploy.mjs robot-create  compte de test temporaire (test sur émulateur Android) → $GITHUB_ENV
//   node scripts/supabase-deploy.mjs robot-delete  supprime ce compte et tout ce qu'il a créé
// Variables : SUPABASE_ACCESS_TOKEN (secret), SUPABASE_PROJECT_REF (identifiant du projet, non secret).
// N'affiche jamais de clé : seule la clé publique (anon/publishable) est transmise à l'APK, comme avant.
import crypto from 'node:crypto';
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

// Courriels de l'app (code de confirmation, mot de passe oublié) : un code à 6 chiffres à taper dans l'app,
// pas de lien à ouvrir (fonctionne sur tous les téléphones). Bilingues, comme l'app.
const EMAIL = (titleFr, bodyFr, titleEn, bodyEn) => `<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:auto;color:#1B1A17">
<h2 style="color:#1F3A2E;margin-bottom:4px">${titleFr}</h2>
<p>${bodyFr}</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#1F3A2E;background:#FAF6EF;border-radius:12px;padding:16px;text-align:center">{{ .Token }}</p>
<p style="color:#8A857B;font-size:13px">Ce code expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce courriel.</p>
<hr style="border:none;border-top:1px solid #E8E0D3;margin:24px 0">
<p style="font-size:14px"><b>${titleEn}</b><br>${bodyEn}</p>
<p style="color:#8A857B;font-size:12px">homemade. — des repas faits maison entre voisins</p></div>`;

async function auth() {
  const base = { password_min_length: 8, site_url: 'homemade://', uri_allow_list: 'homemade://**,exp://**' };
  const smtpUser = process.env.GMAIL_ADDRESS || process.env.SMTP_USER || '';
  const smtpPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const smtpHost = process.env.SMTP_HOST || (process.env.GMAIL_ADDRESS ? 'smtp.gmail.com' : '');
  if (!smtpUser || !smtpPass || !smtpHost) {
    // Sans service de courriel : inscription immédiate (le courriel intégré de Supabase n'écrit qu'aux membres de l'équipe).
    const r = await api('PATCH', `/projects/${ref}/config/auth`, { ...base, mailer_autoconfirm: true });
    if (r.status >= 300) console.log(`::warning::Réglages d'inscription non appliqués (HTTP ${r.status}) : ${(r.json?.message ?? r.text).slice(0, 300)}`);
    else console.log('✓ Inscription immédiate, sans courriel (ajoutez GMAIL_ADDRESS + GMAIL_APP_PASSWORD pour les codes par courriel).');
    return;
  }
  const r = await api('PATCH', `/projects/${ref}/config/auth`, {
    ...base,
    mailer_autoconfirm: false,
    smtp_host: smtpHost,
    smtp_port: String(process.env.SMTP_PORT || 465),
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    smtp_admin_email: process.env.SMTP_SENDER || smtpUser,
    smtp_sender_name: 'Homemade',
    mailer_otp_exp: 3600,
    mailer_subjects_confirmation: 'Votre code Homemade / Your Homemade code',
    mailer_templates_confirmation_content: EMAIL(
      'Bienvenue à la table !',
      'Voici votre code pour confirmer votre compte Homemade. Entrez-le dans l’app :',
      'Welcome to Homemade!',
      'Enter this code in the app to confirm your account: {{ .Token }}',
    ),
    mailer_subjects_recovery: 'Nouveau mot de passe Homemade / Reset your Homemade password',
    mailer_templates_recovery_content: EMAIL(
      'Mot de passe oublié ?',
      'Entrez ce code dans l’app pour choisir un nouveau mot de passe :',
      'Forgot your password?',
      'Enter this code in the app to choose a new password: {{ .Token }}',
    ),
  });
  if (r.status >= 300) {
    // Échec : on garde des inscriptions possibles plutôt que de bloquer les nouveaux testeurs.
    console.log(`::warning::Service de courriel non appliqué (HTTP ${r.status}) : ${(r.json?.message ?? r.text).slice(0, 300)}`);
    await api('PATCH', `/projects/${ref}/config/auth`, { ...base, mailer_autoconfirm: true });
    console.log('Inscription immédiate conservée (sans courriel).');
    return;
  }
  console.log(`✓ Courriels activés (${smtpHost}, expéditeur ${smtpUser.replace(/^(.).*(@.*)$/, '$1…$2')}) : code de confirmation + mot de passe oublié.`);
  // Plafond d'envois par heure (facultatif : réglage ignoré s'il n'est pas reconnu).
  const rl = await api('PATCH', `/projects/${ref}/config/auth`, { rate_limit_email_sent: 60 });
  if (rl.status >= 300) console.log(`  (plafond d'envois non modifié : HTTP ${rl.status})`);
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

// ─────────────────────────────────────────────── Paiements Stripe (facultatif)
// Avec la seule clé secrète Stripe (sk_test_… ou sk_live_…), crée les deux points d'accès webhook (compte plateforme +
// comptes connectés des Cooker) et enregistre leurs secrets de signature dans les secrets Supabase. Idempotent.
const STRIPE_PLATFORM_EVENTS = ['payment_intent.amount_capturable_updated', 'payment_intent.succeeded', 'payment_intent.canceled', 'charge.dispute.created'];
const STRIPE_CONNECT_EVENTS = ['account.updated'];

async function stripeApi(method, route, params) {
  const body = params ? new URLSearchParams(params) : undefined;
  const res = await fetch(`https://api.stripe.com/v1${route}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status >= 300) throw new Error(`Stripe ${method} ${route} : HTTP ${res.status} ${json?.error?.message ?? ''}`);
  return json;
}

async function stripeSetup() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.log('Paiements : pas de clé STRIPE_SECRET_KEY → seul l’échange est proposé dans l’app (voir le guide pour activer l’achat).');
    return;
  }
  const mode = key.startsWith('sk_live_') ? 'RÉEL (argent réel)' : 'TEST (cartes fictives, aucun argent réel)';
  const account = await stripeApi('GET', '/account');
  console.log(`Stripe : compte ${account.id} · mode ${mode}`);

  const url = `https://${ref}.supabase.co/functions/v1/stripe-webhook`;
  const existing = (await stripeApi('GET', '/webhook_endpoints?limit=100')).data.filter((e) => e.url === url);
  const secrets = await api('GET', `/projects/${ref}/secrets`);
  const hasSecret = Array.isArray(secrets.json) && secrets.json.some((x) => x.name === 'STRIPE_WEBHOOK_SECRET');
  const complete = existing.some((e) => !e.connect) && existing.some((e) => e.connect);
  if (complete && hasSecret) {
    console.log('✓ Webhooks Stripe déjà en place.');
  } else {
    // Le secret de signature n'est lisible qu'à la création : on recrée proprement les deux points d'accès.
    for (const e of existing) await stripeApi('DELETE', `/webhook_endpoints/${e.id}`);
    const mk = async (events, connect) => {
      const params = [['url', url], ['description', `Homemade (${connect ? 'comptes connectés' : 'plateforme'})`], ...events.map((ev) => ['enabled_events[]', ev])];
      if (connect) params.push(['connect', 'true']);
      return stripeApi('POST', '/webhook_endpoints', params);
    };
    const platform = await mk(STRIPE_PLATFORM_EVENTS, false);
    const connect = await mk(STRIPE_CONNECT_EVENTS, true);
    console.log(`::add-mask::${platform.secret}`);
    console.log(`::add-mask::${connect.secret}`);
    const r = await api('POST', `/projects/${ref}/secrets`, [{ name: 'STRIPE_WEBHOOK_SECRET', value: `${platform.secret},${connect.secret}` }]);
    if (r.status >= 300) fail(`Secret webhook non enregistré (HTTP ${r.status}) : ${r.text.slice(0, 200)}`);
    console.log('✓ Webhooks Stripe créés (plateforme + comptes connectés), secret enregistré.');
  }
  // Connect doit être activé une fois dans le tableau de bord Stripe (sinon les Cooker ne peuvent pas s'inscrire).
  try {
    await stripeApi('GET', '/accounts?limit=1');
    console.log('✓ Stripe Connect disponible (inscription des Cooker possible).');
  } catch (e) {
    console.log(`::warning::Stripe Connect n'est pas encore activé : tableau de bord Stripe → Connect → « Commencer » (voir le guide). ${e.message}`);
  }
}

// ─────────────────────────────────────────────── Notifications push (Firebase Cloud Messaging)
async function pushSetup() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    console.log('Notifications push : pas de compte Firebase (secret FIREBASE_SERVICE_ACCOUNT) → notifications quand l’app est ouverte seulement (voir le guide).');
    return;
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    fail('FIREBASE_SERVICE_ACCOUNT n’est pas un JSON valide : colle TOUT le contenu du fichier téléchargé depuis Firebase (de { à }).');
  }
  if (sa.type !== 'service_account' || !sa.project_id || !sa.client_email || !sa.private_key) {
    fail('FIREBASE_SERVICE_ACCOUNT ne ressemble pas à un compte de service Firebase (Paramètres du projet → Comptes de service → Générer une nouvelle clé privée).');
  }
  // Secret partagé base ↔ fonction : créé une fois puis réutilisé (la base l'envoie à chaque notification).
  const rows = await sql(`select secret from public.push_config where id`);
  const secret = rows?.[0]?.secret ?? crypto.randomBytes(32).toString('hex');
  console.log(`::add-mask::${secret}`);
  const r = await api('POST', `/projects/${ref}/secrets`, [
    { name: 'FIREBASE_SERVICE_ACCOUNT', value: raw },
    { name: 'PUSH_WEBHOOK_SECRET', value: secret },
  ]);
  if (r.status >= 300) fail(`Secrets push non enregistrés (HTTP ${r.status}) : ${r.text.slice(0, 200)}`);
  const endpoint = `https://${ref}.supabase.co/functions/v1/push-notify`;
  await sql(
    `insert into public.push_config (id, endpoint, secret) values (true, ${lit(endpoint)}, ${lit(secret)})
     on conflict (id) do update set endpoint = excluded.endpoint, secret = excluded.secret, updated_at = now()`,
  );
  const net = await sql(`select 1 from pg_extension where extname = 'pg_net'`);
  if (!net?.length) {
    await sql(`create extension if not exists pg_net`).catch((e) =>
      fail(`Extension pg_net indisponible (Supabase → Database → Extensions → pg_net → activer) : ${e.message}`),
    );
  }
  console.log(`✓ Notifications push activées (projet Firebase « ${sa.project_id} »).`);
}

// ─────────────────────────────────────────────── Compte robot (test de l'APK sur émulateur Android)
async function serviceKey() {
  const keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
  if (keys.status !== 200) fail(`Clés du projet illisibles (HTTP ${keys.status}).`);
  const service = (keys.json.find((k) => k.name === 'service_role') ?? keys.json.find((k) => k.type === 'secret'))?.api_key;
  if (!service) fail('Clé service introuvable.');
  console.log(`::add-mask::${service}`);
  return service;
}

async function adminAuth(service, method, p, body) {
  const res = await fetch(`https://${ref}.supabase.co${p}`, {
    method,
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // réponse non JSON
  }
  return { status: res.status, json, text };
}

async function purgeUser(service, id) {
  await sql(
    `delete from public.meals where cooker_id = '${id}'; delete from public.beta_invites where created_by = '${id}'; delete from public.beta_feedback where user_id = '${id}'; delete from public.ai_analyses where user_id = '${id}';`,
  ).catch(() => {});
  return adminAuth(service, 'DELETE', `/auth/v1/admin/users/${id}`);
}

async function robotCreate() {
  const service = await serviceKey();
  const code = `ROBOT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const email = `robot-test-e2e-${Date.now()}@homemade-test.invalid`;
  const password = `Robot${Math.random().toString(36).slice(2, 10)}A1`;
  await sql(`insert into public.beta_invites (code, note, max_uses) values ('${code}', 'Test émulateur (supprimé après usage)', 1)`);
  try {
    const cu = await adminAuth(service, 'POST', '/auth/v1/admin/users', { email, password, email_confirm: true, user_metadata: { display_name: 'Robot', invite_code: code } });
    const id = cu.json?.id ?? cu.json?.user?.id;
    if (!id) fail(`Compte robot non créé (HTTP ${cu.status}) : ${cu.text.slice(0, 200)}`);
    console.log(`::add-mask::${password}`);
    if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `ROBOT_EMAIL=${email}\nROBOT_PASSWORD=${password}\nROBOT_ID=${id}\n`);
    console.log(`✓ Compte robot créé (${email}).`);
  } finally {
    await sql(`delete from public.beta_invites where code = '${code}'`).catch(() => {});
  }
}

async function robotDelete() {
  const service = await serviceKey();
  const ids = new Set([process.env.ROBOT_ID].filter(Boolean));
  const old = await sql(`select id from auth.users where email like 'robot-test-e2e-%@homemade-test.invalid' and created_at < now() - interval '2 hours'`).catch(() => []);
  for (const u of old ?? []) ids.add(u.id);
  for (const id of ids) {
    const d = await purgeUser(service, id);
    console.log(`Compte robot ${id} : suppression HTTP ${d.status}`);
  }
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

  // Restes d'un test précédent interrompu (comptes robot-test-…@homemade-test.invalid) : supprimés d'abord.
  const leftovers = await sql(`select id from auth.users where email like '%robot-test-%@homemade-test.invalid'`).catch(() => []);
  for (const u of leftovers ?? []) {
    await sql(
      `delete from public.meals where cooker_id = '${u.id}'; delete from public.beta_invites where created_by = '${u.id}'; delete from public.beta_feedback where user_id = '${u.id}'; delete from public.ai_analyses where user_id = '${u.id}';`,
    ).catch(() => {});
    const d = await admin('DELETE', `/auth/v1/admin/users/${u.id}`);
    console.log(`Ancien compte de test ${u.id} : suppression HTTP ${d.status}${d.status === 200 ? '' : ' — ' + d.text.slice(0, 300)}`);
  }

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
    const settings = await http('GET', '/auth/v1/settings');
    const emailCodes = settings.json?.mailer_autoconfirm === false;
    let jwt = null;
    if (!emailCodes) {
      const su = await http('POST', '/auth/v1/signup', { body: { email, password, data: { display_name: 'Robot test', invite_code: code } } });
      userId = su.json?.user?.id ?? su.json?.id ?? null;
      jwt = su.json?.access_token;
      step(su.status === 200 && Boolean(jwt), 'Inscription avec code (sans courriel de confirmation)', `HTTP ${su.status}${jwt ? '' : ' — ' + su.text.slice(0, 200)}`);
    } else {
      // Courriels actifs : aucun envoi vers une adresse fictive ; compte confirmé créé par l'API admin (même trigger d'invitation).
      const cu = await admin('POST', '/auth/v1/admin/users', { email, password, email_confirm: true, user_metadata: { display_name: 'Robot test', invite_code: code } });
      userId = cu.json?.id ?? cu.json?.user?.id ?? null;
      const tk = await http('POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
      jwt = tk.json?.access_token;
      step(cu.status === 200 && Boolean(jwt), 'Inscription avec code + connexion (courriels de confirmation actifs)', `HTTP ${cu.status}/${tk.status}${jwt ? '' : ' — ' + (cu.text + tk.text).slice(0, 200)}`);
    }
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
      // Détail des erreurs d'IA (journal ai_analyses) : indispensable pour comprendre un refus du fournisseur.
      const errs = await sql(`select task, status, provider, model, error from public.ai_analyses where user_id = '${userId}' and status <> 'ok' order by created_at`);
      for (const r of errs ?? []) console.log(`    journal IA [${r.task}] ${r.status} ${r.provider}/${r.model} : ${r.error ?? ''}`);
    }

    // Retour du formulaire Stripe (page publique) et fonds de carte sans clé (ceux que l'app affiche).
    const ret = await fetch(`${url}/functions/v1/stripe-return?to=done`, { redirect: 'manual' })
      .then((r) => ({ status: r.status, location: r.headers.get('location') ?? '' }))
      .catch((e) => ({ status: 0, location: String(e) }));
    step(ret.status === 302 && ret.location === 'homemade://settings?payments=done', 'Retour du formulaire Stripe → redirection vers l’app', `HTTP ${ret.status} → ${ret.location}`);
    // Carte principale : style vectoriel OpenFreeMap → TileJSON → une tuile vectorielle de Montréal.
    try {
      const style = await (await fetch('https://tiles.openfreemap.org/styles/liberty')).json();
      const src = Object.values(style.sources ?? {}).find((x) => x.type === 'vector' && x.url);
      const tilejson = await (await fetch(src.url)).json();
      const vt = await fetch(tilejson.tiles[0].replace('{z}', '14').replace('{x}', '4843').replace('{y}', '5850'));
      const size = (await vt.arrayBuffer()).byteLength;
      console.log(`${vt.status === 200 && size > 100 ? '✓' : '⚠'} Carte vectorielle OpenFreeMap : style « ${style.name ?? 'liberty'} », tuile HTTP ${vt.status} · ${size} octets`);
    } catch (e) {
      console.log(`⚠ Carte vectorielle OpenFreeMap injoignable (l'app utilisera le repli OpenStreetMap) : ${e.message}`);
    }
    // Mode sombre : style « dark » du même fournisseur.
    const darkStyle = await fetch('https://tiles.openfreemap.org/styles/dark').catch(() => null);
    console.log(`${darkStyle?.status === 200 ? '✓' : '⚠'} Carte sombre OpenFreeMap : HTTP ${darkStyle?.status ?? 'réseau'}`);
    for (const [label, tile] of [
      ['OpenStreetMap', 'https://tile.openstreetmap.org/14/4843/5850.png'],
      ['Esri (secours)', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/14/5850/4843'],
    ]) {
      const t = await fetch(tile, { headers: { 'User-Agent': 'HomemadeBeta/1.0 (+https://github.com/Themauritian1996/homemade)', Referer: 'https://homemade.app/' } }).catch(() => null);
      const type = t?.headers.get('content-type') ?? '';
      const size = t ? (await t.arrayBuffer()).byteLength : 0;
      console.log(`${t?.status === 200 && type.startsWith('image/') && size > 2000 ? '✓' : '⚠'} Fond de carte ${label} : HTTP ${t?.status ?? 'réseau'} · ${type} · ${size} octets`);
    }
    // Notifications push : la fonction répond et, si Firebase est configuré, Google accepte le compte de service.
    const pushCfg = await sql(`select secret from public.push_config where id`).catch(() => null);
    if (pushCfg?.[0]?.secret) {
      console.log(`::add-mask::${pushCfg[0].secret}`);
      const pp = await http('POST', '/functions/v1/push-notify', { body: { ping: true }, headers: { 'x-push-secret': pushCfg[0].secret } });
      step(pp.status === 200 && pp.json?.firebase === true, 'Notifications push : Firebase accepte le compte de service', pp.json?.project ?? pp.text.slice(0, 200));
    } else {
      console.log('⚠ Notifications push non configurées (Firebase) : seulement quand l’app est ouverte.');
    }
    const addr = await as('POST', '/rest/v1/rpc/set_my_address', { body: { p_address: '1 rue Test', p_postal_code: 'h2j1a1', p_lat: 45.5231, p_lng: -73.5817 } });
    step(addr.status === 200 && addr.json?.zone === 'H2J', 'Adresse privée enregistrée (zone publique H2J)', `HTTP ${addr.status}`);

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
      await sql(`delete from public.meals where cooker_id = '${userId}';`).catch((e) => console.log(`    (nettoyage plats : ${e.message})`));
      const del = await admin('DELETE', `/auth/v1/admin/users/${userId}`);
      step(del.status === 200, 'Nettoyage : compte de test supprimé', `HTTP ${del.status}${del.status === 200 ? '' : ' — ' + del.text.slice(0, 300)}`);
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
  else if (command === 'stripe') await stripeSetup();
  else if (command === 'push') await pushSetup();
  else if (command === 'robot-create') await robotCreate();
  else if (command === 'robot-delete') await robotDelete();
  else fail(`Commande inconnue : ${command}`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
