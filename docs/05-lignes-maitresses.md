# 5. Lignes maîtresses

Le document à relire avant chaque décision produit ou technique. Si une demande entre en conflit avec une règle **non négociable**, la règle gagne : on ajuste la demande, pas la règle.

## Mission
**Homemade** met en relation des voisins pour échanger ou vendre des repas faits maison : moins de gaspillage alimentaire, une alternative saine et abordable au restaurant pour les jeunes professionnels pressés. Marché initial : **Québec (Montréal d'abord)**. Vision : international.

## Les 10 règles non négociables

1. **La sécurité alimentaire passe avant tout.** Le filtrage des allergies est fait **côté serveur** (`meal_is_safe_for`), jamais seulement dans l'app.
2. **L'IA propose, l'humain valide, le serveur décide.** Aucun plat n'est visible sans attestation horodatée du Cooker (contrainte SQL `meals_published_requires_confirmation`).
3. **Fail-closed.** En cas de doute (faible confiance, donnée manquante, erreur), on **exclut** ou on **conserve l'allergène**, jamais l'inverse. Les sources d'allergènes s'additionnent, elles ne se soustraient pas.
4. **L'IA n'est jamais un point de blocage.** Panne, quota ou refus → saisie manuelle dans le même formulaire.
5. **Aucun secret dans l'app.** Clés Anthropic, Stripe secrète et *service role* : Edge Functions uniquement. Seules les variables `EXPO_PUBLIC_*` (non secrètes) vont dans le bundle.
6. **Écritures critiques via RPC uniquement** (`meals`, `meal_allergens`, `orders`, `reviews`). RLS sur toutes les tables, privilèges par colonne pour les champs sensibles.
7. **Vie privée par défaut.** Adresse exacte révélée seulement après acceptation d'une commande ; position publique brouillée (100-300 m) ; données santé = renseignements sensibles (Loi 25) : consentement explicite, minimisation, hébergement au Canada.
8. **L'argent suit la remise du plat.** Pré-autorisation à la commande, **capture à la cueillette**, annulation gratuite avant acceptation.
9. **Réputation honnête.** Notes bidirectionnelles (Cooker **et** Eater), double-aveugle, agrégats calculés par le serveur uniquement, tri bayésien.
10. **Le français d'abord.** Interface en français québécois par défaut (Charte de la langue française), anglais prêt pour l'expansion ; référentiels bilingues dès le jour 1.

## Paramètres macro (valeurs de référence)

| Paramètre | Valeur | Où |
|---|---|---|
| Commission plateforme (Cooker) | 12 % du sous-total | `PLATFORM_FEE_RATE` |
| Frais de service (Eater) | 5 % du sous-total | `SERVICE_FEE_RATE` |
| Prix par portion | 2 $ – 50 $ CA | contrainte `meals.price_cents` |
| Portions par annonce | 1 – 20 | contrainte `meals.portions_total` |
| Fenêtre de disponibilité | 2 – 72 h | `publish_meal`, contrainte `meals_window_valid` |
| Rayon de recherche | 1 – 25 km (défaut 5) | filtres, `feed_meals` (max 50 km serveur) |
| Brouillage de position | 100 – 300 m | `publish_meal` |
| Expiration commande non payée | 30 min (achat) / 24 h (échange) | `cancel_stale_orders` |
| Révélation des avis | Les deux notés, ou 7 jours | `submit_review`, `reveal_stale_reviews` |
| Fenêtre pour laisser un avis | 14 jours | `submit_review` |
| Seuil IA « à vérifier » | confiance < 0,6 | `LOW_CONFIDENCE` (publish.tsx) |
| Quota IA | 20 analyses / h / utilisateur | `AI_MAX_PER_HOUR` |
| Modèle IA / effort (production) | `claude-opus-5` / `medium` | `AI_MODEL`, `AI_EFFORT` |
| Modèle IA local (développement, gratuit) | `qwen3-vl:4b-instruct` via Ollama | `EXPO_PUBLIC_AI_PROVIDER=local`, `EXPO_PUBLIC_LOCAL_AI_MODEL` |
| Photo envoyée à l'IA | 1280 px, JPEG 70 % | `preparePhoto()` |
| Objectif rappel allergènes IA | ≥ 98 % | jeu d'évaluation (docs/03) |
| Objectif latence analyse | p95 < 8 s | idem |

Toute modification d'un paramètre se fait **à un seul endroit** et se reflète dans ce tableau.

## Principes produit
- **Standard Uber Eats / Good Food** : trois tapes pour commander, photos plein cadre, prix et distance visibles d'un coup d'œil, zéro jargon.
- **Transparence** : on dit combien de plats ont été masqués pour la santé de l'utilisateur, et pourquoi un plat est déconseillé.
- **Zéro gaspi mesurable** : compteur « repas sauvés » sur le profil ; mise en avant des plats « bientôt terminés ».
- **Un compte, deux rôles** : tout le monde est Eater ; on devient Cooker en publiant (paiements activés à la première vente).
- **Hyperlocal d'abord** : densité par quartier avant l'étendue géographique.

## Principes de design (« Warm Editorial »)
- Palette : crème `#FAF6EF`, vert forêt `#1F3A2E` (confiance, santé), tomate `#E2553B` (appétit, actions), safran `#F2B441` (notes). Rouge danger réservé aux allergènes.
- Typographie : **Fraunces** (titres, caractère éditorial chaleureux) + **Inter** (texte, lisibilité).
- Photos de plats en grand, coins arrondis généreux (16-24 px), ombres douces, retour haptique léger.
- Toute valeur visuelle vient de `src/theme` ; tout écran se compose avec `src/components/ui.tsx`.
- Accessibilité : rôles et libellés sur les boutons, contrastes AA, cibles ≥ 44 px.

## Principes d'ingénierie
- **Une seule source de vérité par règle** : la logique métier vit en SQL ; `src/lib/safety.ts` et `mealValidation.ts` en sont des miroirs pour l'UX et le mode démo, testés contre le même comportement.
- **Contrats typés** : les RPC renvoient exactement les types de `src/types.ts` ; tout changement de schéma met à jour les deux.
- **Référentiels synchronisés** : `supabase/seed.sql` ⇄ `src/data/allergens.ts` ⇄ `supabase/functions/analyze-meal/prompt.ts`.
- **Versionner l'IA** : toute modification du prompt ou du schéma incrémente `PROMPT_VERSION` et passe par le jeu d'évaluation.
- **Avant de livrer** : `npm run typecheck` et `npm run test:db` au vert ; nouvelle règle métier = nouveau cas dans `supabase/tests/db.test.mjs`.
- **Migrations additives** : ne jamais modifier une migration déjà appliquée en production ; en créer une nouvelle.
- **Expo évolue vite** : vérifier la documentation de la version d'Expo installée avant d'utiliser une API (voir `AGENTS.md`).

## Conformité — à valider par des professionnels avant la bêta publique
- **MAPAQ** : encadrement de la préparation et de la vente d'aliments au public (permis, formation en hygiène et salubrité). C'est le risque n°1 ; le modèle de données prévoit la certification des Cookers et le mode échange.
- **Loi 25** (protection des renseignements personnels) : responsable désigné, politique de confidentialité, consentement explicite pour les données santé, évaluation des facteurs relatifs à la vie privée pour tout transfert hors Québec (IA, paiement).
- **Fiscalité** : TPS/TVQ selon le statut des Cookers et le rôle de la plateforme.
- **Assurance** responsabilité civile de la plateforme ; conditions d'utilisation claires sur la responsabilité des Cookers.
