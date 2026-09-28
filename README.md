# homemade.

**Des vrais repas, cuisinés par vos voisins.**
Application mobile *peer-to-peer* d'échange et de vente de repas faits maison — moins de gaspillage alimentaire, une alternative saine au restaurant pour les jeunes professionnels. Lancement au Québec, pensée pour l'international.

| | |
|---|---|
| 📸 **Publication assistée par IA** | Photo du plat → type, ingrédients et allergènes pré-remplis par Claude → le Cooker vérifie et atteste. |
| 🛡️ **Filtrage santé automatique** | Les plats incompatibles avec vos allergies disparaissent de votre fil et de la carte — décidé côté serveur, *fail-closed*. |
| 🗺️ **Carte interactive** | Repas autour de vous, filtres distance · cuisine · prix · régimes · achat/échange. |
| ⭐ **Réputation bidirectionnelle** | Cookers **et** Eaters sont notés ; avis en double-aveugle. |
| 💬 **Chat & transactions** | Paiement Stripe pré-autorisé puis capturé à la cueillette ; échanges par accord mutuel. |

## Démarrage rapide (mode démo, sans compte)
```bash
npm install
npx expo start
```
Scannez le QR code avec **Expo Go**. Sans configuration, l'app fonctionne avec des données de démonstration (Montréal) et une analyse IA simulée.

Pour activer les vrais comptes, l'IA et les paiements : **[docs/06-setup.md](docs/06-setup.md)**.

## Stack
- **App** : React Native 0.86 · Expo SDK 57 · Expo Router · TypeScript strict · Zustand · react-native-maps · Stripe React Native
- **Back-end** : Supabase — Postgres 15 + PostGIS, RLS, Auth, Storage, Realtime, Edge Functions (Deno), pg_cron
- **IA** : Anthropic Claude (`claude-opus-5`) — vision + sorties structurées JSON Schema, côté serveur
- **Paiement** : Stripe Connect Express (destination charges, capture manuelle)

## Documentation
1. [Architecture globale](docs/01-architecture.md) — composants, flux, choix techniques (Supabase vs Firebase, choix de l'IA)
2. [Schéma de la base de données](docs/02-database.md) — ingrédients, allergènes, profils santé, notes, transactions
3. [Workflow IA](docs/03-ai-workflow.md) — Photo → Analyse → Validation humaine → Match Eaters
4. [Plan d'implémentation par phases](docs/04-roadmap.md) — jalons, critères de sortie, risques
5. [Lignes maîtresses](docs/05-lignes-maitresses.md) — règles non négociables, paramètres macro, principes
6. [Mise en route](docs/06-setup.md) — comptes Supabase / Anthropic / Stripe, déploiement

## Scripts
| Commande | Rôle |
|---|---|
| `npx expo start` | Serveur de développement (Expo Go / build de dev) |
| `npm run android` / `npm run ios` | Ouvrir sur émulateur / appareil |
| `npm run typecheck` | Vérification TypeScript |
| `npm run test:db` | Migrations + scénario de bout en bout sur Postgres/PostGIS (PGlite, sans Docker) |

## Structure
```
src/app/          Écrans (Expo Router)          supabase/migrations/  Schéma, logique métier, sécurité
src/components/   Design system                 supabase/functions/   Edge Functions (IA, Stripe)
src/services/     Accès back-end (démo | réel)  supabase/tests/       Tests base de données
src/lib/          Sécurité, validation, format  docs/                 Documentation
```
