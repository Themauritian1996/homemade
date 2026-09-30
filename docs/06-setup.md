# 6. Mise en route : comptes, back-end et déploiement

## A. Lancer l'app en mode démo (2 minutes, aucun compte requis)
```bash
npm install
npx expo start
```
Scanner le QR code avec **Expo Go** (Android) ou l'appareil photo (iOS). Sans variables Supabase, l'app tourne en **mode démo** : comptes fictifs locaux, plats de Montréal, analyse IA simulée. Rien n'est envoyé.

## B. Activer les vrais comptes (Supabase)
1. Créer un compte sur <https://supabase.com> → **New project** → région **Canada (Central)** (données au Canada — Loi 25).
2. Dans le terminal, à la racine du projet :
   ```bash
   npx supabase login
   npx supabase link --project-ref <REF_DU_PROJET>
   npx supabase db push --include-seed
   ```
3. **Authentication → URL Configuration** : *Site URL* `homemade://`, *Redirect URLs* `homemade://**` et `exp://**` (développement).
4. **Authentication → Providers** : courriel activé (confirmation recommandée). Google et Apple en phase 2.
5. Copier `.env.example` en `.env` et renseigner (**Project Settings → API**) :
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<clé anon / publishable>
   ```
6. Relancer `npx expo start -c` : l'inscription crée désormais un vrai compte (profil, données privées et réglages créés par le trigger `handle_new_user`).

> Firebase a été écarté au profit de Supabase : le filtrage allergènes × ingrédients × distance exige des jointures et des requêtes géographiques côté serveur que Firestore ne fait pas nativement (voir [01-architecture.md](01-architecture.md)).

## C. Activer l'IA — gratuite (Gemini, secours Groq)
**Sans terminal (recommandé)** : ranger les secrets `GEMINI_API_KEY` (et `GROQ_API_KEY`), `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` dans GitHub ; le workflow **Serveur Supabase** (`.github/workflows/supabase-deploy.yml`) applique les migrations, enregistre les clés et déploie `analyze-meal` à chaque mise à jour de `main`. Pas à pas : [GUIDE-UTILISATION.md](../GUIDE-UTILISATION.md), Étapes 1 à 3.

**En ligne de commande** :
1. Clé gratuite sur <https://aistudio.google.com/apikey> (ne pas activer la facturation) ; facultatif : <https://console.groq.com/keys>.
2. Copier `supabase/functions/.env.example` en `supabase/functions/.env`, renseigner `GEMINI_API_KEY` (et `GROQ_API_KEY`). `ANTHROPIC_API_KEY` reste facultatif (payant).
3. Déployer :
   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy analyze-meal
   ```

## D. Activer les paiements (Stripe Connect)
1. Créer un compte <https://dashboard.stripe.com> (commencer en **mode test**), activer **Connect** (type *Express*, pays Canada).
2. Renseigner `STRIPE_SECRET_KEY` (sk_test_…) dans `supabase/functions/.env`, et `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_test_…) dans `.env`.
3. **Développeurs → Webhooks → Ajouter un endpoint** : `https://<REF>.supabase.co/functions/v1/stripe-webhook`
   - Événements : `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.canceled`, `charge.dispute.created`, `account.updated`.
   - Cocher l'écoute des **comptes connectés** (pour `account.updated`).
   - Copier le secret de signature dans `STRIPE_WEBHOOK_SECRET`.
4. `STRIPE_CONNECT_RETURN_URL` / `STRIPE_CONNECT_REFRESH_URL` : deux pages https (site vitrine) qui redirigent vers `homemade://payouts`.
5. Déployer toutes les fonctions :
   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy
   ```
6. Tester avec les cartes de test Stripe (ex. `4242 4242 4242 4242`) dans un **build de développement** (voir E).

## E. Builds natifs (EAS)
Expo Go suffit pour le mode démo. Pour Stripe et les notifications, utiliser un build de développement (la carte, elle, fonctionne partout sans clé) :
```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
```
La carte utilise Leaflet + OpenStreetMap (tuiles CARTO) : **aucune clé Google Maps n'est nécessaire**.

## F. Bêta fermée (invitations)
1. Appliquer les migrations (dont `20260929000100_beta.sql`) : `npx supabase db push`.
2. L'inscription exige un code. Code de lancement : **`VOISINS2026`** (100 inscriptions). Chaque membre a ensuite un code personnel de 5 invitations (Profil → Invitez vos voisins).
3. Gérer les codes depuis **SQL Editor** :
   ```sql
   -- nouveau code (lettres majuscules, chiffres, tirets)
   insert into public.beta_invites (code, note, max_uses) values ('FAMILLE', 'Famille et amis', 20);
   -- suivi
   select code, note, uses, max_uses, created_by is not null as personnel from public.beta_invites order by created_at;
   -- ouvrir les inscriptions à tous (ou 'true' pour refermer)
   update public.app_config set value = 'false' where key = 'invite_required';
   ```
4. Commentaires des testeurs : table `beta_feedback` ; signalements : table `reports`.
5. Facultatif : variable GitHub `EXPO_PUBLIC_BETA_DOWNLOAD_URL` = lien public de l'APK (ex. Google Drive), ajouté aux invitations partagées.

## G. Vérifications
```bash
npm run typecheck   # TypeScript strict
npm run test:db     # migrations + scénario de bout en bout sur Postgres/PostGIS (sans Docker)
```

## Récapitulatif des variables

| Variable | Où | Secret ? |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` (app) | Non |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `.env` (app) | Non |
| `EXPO_PUBLIC_AI_PROVIDER` (`server` \| `local` \| `none`), `EXPO_PUBLIC_BETA_DOWNLOAD_URL` | `.env` (app), variables GitHub | Non |
| `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT`, `AI_MAX_PER_HOUR` | secrets Edge Functions | **Oui** (clé) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | secrets Edge Functions | **Oui** |
| `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL`, `SERVICE_FEE_RATE`, `PLATFORM_FEE_RATE` | secrets Edge Functions | Non |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | injectées par Supabase | **Oui** (service role) |
