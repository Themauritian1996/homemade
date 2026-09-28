# 4. Plan d'implémentation par phases

Chaque phase se termine par des **critères de sortie** vérifiables. On ne passe pas à la suivante sans eux.

## Phase 0 — Fondations ✅ *(livrée dans ce dépôt)*
- Projet Expo SDK 57 / TypeScript strict / Expo Router, design system « Warm Editorial ».
- Tous les écrans du MVP en **mode démo** (données fictives, aucun backend) : accueil, inscription/connexion, onboarding santé, fil, carte, publication IA, détail, commande/échange, chat, avis, profil.
- Schéma Postgres complet, logique métier en SQL, RLS et privilèges, seed des référentiels.
- Edge Functions : analyse IA, paiement, actions de commande, webhook Stripe, onboarding Connect.
- Tests base de données de bout en bout (`npm run test:db`), typecheck, bundle Android validé.

**Critères de sortie** : `npm run typecheck` et `npm run test:db` au vert ; l'app s'ouvre dans Expo Go en mode démo.

## Phase 1 — Backend réel & comptes (≈ 2 semaines)
- Créer le projet Supabase **région Canada**, appliquer migrations + seed, brancher `.env` (voir [06-setup.md](06-setup.md)).
- Auth courriel (confirmation, réinitialisation, deep links `homemade://`), profils, profil santé synchronisé.
- Photos (Storage), fil et carte sur `feed_meals`, détail sur `get_meal`.
- Politique de confidentialité et conditions (Loi 25 : responsable des renseignements personnels, consentement explicite santé, EFVP si données hors Québec).
- Build de développement EAS (`eas build --profile development`) sur appareils Android réels.

**Sortie** : 10 testeurs internes créent un compte, configurent leurs allergies, voient un fil réel filtré.

## Phase 2 — Publication assistée par IA (≈ 2 semaines)
- Déployer `analyze-meal`, secrets Anthropic, quota.
- Constituer le **jeu d'évaluation** (≥ 200 photos de plats maison québécois, annotées).
- Mesurer rappel/précision allergènes, latence ; ajuster prompt / effort / modèle.
- Enrichir le dictionnaire curé (ingrédients pièges fréquents).
- Tableau de bord interne (SQL) : `validation_diff`, taux de repli manuel.

**Sortie** : rappel allergènes ≥ 98 % sur le jeu d'évaluation ; p95 < 8 s ; ≥ 80 % des publications passent par l'IA sans abandon.

## Phase 3 — Transactions, chat & réputation (≈ 3 semaines)
- Stripe Connect Express (mode test → production), onboarding Cooker, PaymentSheet (carte, Google Pay, Apple Pay).
- Webhooks (pré-autorisation, capture, annulation, litiges, `account.updated`).
- Échanges avec accord mutuel ; chat temps réel ; notifications push (Expo Notifications) pour commandes et messages.
- Avis double-aveugle, badges ; écran « Mes commandes » avec actions Cooker (accepter, prêt) et Eater (récupéré).
- Signalements et modération (file d'attente interne), suspension automatique sur incident allergène.
- Capture automatique si l'Eater oublie de confirmer (tâche planifiée via `pg_net` → Edge Function), remboursements partiels.

**Sortie** : 50 transactions réelles sans incident de paiement ; délai médian de réponse Cooker < 30 min.

## Phase 4 — Bêta fermée Montréal (≈ 4 semaines)
- 2 ou 3 quartiers denses (Plateau, Mile End, Rosemont), 30 Cookers recrutés et vérifiés (identité + formation hygiène), 300 Eaters.
- Parcours Cooker vérifié, contenus d'aide « sécurité alimentaire », support.
- Analytique produit (activation, rétention J7/J30, taux de conversion fil → commande), suivi des erreurs (Sentry).
- Accessibilité (lecteurs d'écran, tailles de police), mode sombre.

**Sortie** : rétention Eater J30 ≥ 25 % ; note Cooker moyenne ≥ 4,5 ; zéro incident allergène non signalé.

## Phase 5 — Lancement Québec & préparation internationale
- Publication Play Store puis App Store (EAS Submit), mises à jour OTA (EAS Update).
- **i18n** : extraction des chaînes (fr-CA par défaut, en-CA), formats monétaires/dates localisés — les référentiels sont déjà bilingues.
- Multi-devises, fiscalité (TPS/TVQ selon statut des Cookers — à valider avec un fiscaliste), listes d'allergènes par région (`allergens.regions` : UE = 14 allergènes).
- Recherche plein texte (index trigram déjà en place), recommandations personnalisées, planification de repas de la semaine, abonnements Cooker.

## Risques majeurs et parades
| Risque | Parade |
|---|---|
| **Cadre légal de la vente d'aliments préparés à domicile (MAPAQ)** — risque n°1 | Avis juridique **avant** la bêta. Pistes : Cookers titulaires d'un permis ou d'une formation reconnue, priorité au mode échange, partenariats avec cuisines commerciales partagées. Le modèle de données supporte déjà `hygiene_certified_at` et le mode échange. |
| Incident allergique | Filtrage serveur *fail-closed*, dictionnaire curé, attestation, avertissement « cuisine domestique », signalement → suspension immédiate, assurance responsabilité civile. |
| Qualité / hygiène | Réputation bidirectionnelle, sous-note « hygiène & emballage », badges, vérification des Cookers. |
| Fraude / non-présentation | Capture à la cueillette, note Eater, historique d'événements, litiges Stripe. |
| Coût IA | Quota, compression, effort réglable, évaluation des modèles plus économiques. |
| Poule et œuf (offre/demande) | Lancement hyperlocal par quartier, recrutement actif de Cookers, échange pour amorcer. |
