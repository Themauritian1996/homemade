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

async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

async function sql(query) {
  const r = await api('POST', `/projects/${ref}/database/query`, { query });
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
    await sql(`begin;\n${body}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (${lit(m.version)}, ${lit(m.name)}, '{}');\ncommit;`);
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

try {
  if (command === 'check') await check();
  else if (command === 'migrate') await migrate();
  else if (command === 'auth') await auth();
  else if (command === 'app-config') await appConfig();
  else fail(`Commande inconnue : ${command}`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
