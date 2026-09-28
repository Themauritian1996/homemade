@AGENTS.md

# Homemade — contexte projet

App P2P d'échange/vente de repas faits maison (Québec d'abord). Expo SDK 57 + Supabase (Postgres/PostGIS, RLS, Edge Functions) + Claude (vision) + Stripe Connect.

**Avant toute modification, respecter les lignes maîtresses :** @docs/05-lignes-maitresses.md

Rappels essentiels :
- La sécurité allergènes est décidée côté serveur (`meal_is_safe_for`, `feed_meals`) ; `src/lib/safety.ts` n'en est qu'un miroir.
- L'IA propose, le Cooker atteste, le serveur publie (`publish_meal`). Fail-closed partout.
- Aucun secret dans l'app ; écritures critiques via RPC uniquement.
- Référentiels à garder synchronisés : `supabase/seed.sql` ⇄ `src/data/allergens.ts` ⇄ `supabase/functions/analyze-meal/prompt.ts`.
- UI en français québécois ; styles depuis `src/theme`, composants depuis `src/components/ui.tsx`.

Vérifier avant de terminer : `npm run typecheck` et `npm run test:db`.
