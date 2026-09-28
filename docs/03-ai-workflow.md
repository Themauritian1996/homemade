# 3. Workflow IA : Photo → Analyse → Validation humaine → Match Eaters

> **Principe directeur : l'IA propose, le Cooker valide, le serveur décide.**
> L'IA accélère la saisie ; elle n'est jamais la source de vérité d'une déclaration d'allergènes, et jamais un point de blocage.

```mermaid
flowchart TD
  A[📸 Photo du plat] --> B[Préparation locale<br/>1280 px · JPEG 70 % · EXIF non conservé]
  B --> C[Upload Storage<br/>meal-photos/uid/…]
  C --> D{Edge analyze-meal}
  D -->|quota dépassé / panne / refus| M[Saisie manuelle<br/>même formulaire, vide]
  D --> E[Claude vision<br/>JSON Schema fermé]
  E --> F[Nettoyage serveur<br/>codes valides · bornes · blé ⇒ gluten]
  F --> G[(ai_analyses<br/>journal + version prompt)]
  F --> H[Formulaire pré-rempli]
  M --> H
  H --> I[Révision Cooker<br/>ingrédients · allergènes · traces · régimes]
  I --> J{Attestation cochée ?}
  J -->|non| I
  J -->|oui| K[rpc publish_meal]
  K --> L[Union : ingrédients ∪ dictionnaire curé ∪ déclarés<br/>+ implications → meal_allergens]
  L --> N{Régimes cohérents ?}
  N -->|non| I
  N -->|oui| O[Publié · allergens_confirmed_at]
  O --> P[validation_diff<br/>écart IA vs humain]
  O --> Q[feed_meals par Eater<br/>meal_is_safe_for]
  Q -->|conflit| R[Masqué · compteur « masqués pour votre sécurité »]
  Q -->|sûr| S[Visible fil + carte]
```

## Étape 1 — Capture et préparation (app)
- `expo-image-picker` (caméra ou galerie, recadrage 4:3), puis `expo-image-manipulator` : 1280 px de large, JPEG qualité 0,7 → ~150-300 Ko. Suffisant pour la vision, rapide en 4G, économique en jetons. Le ré-encodage ne conserve pas les métadonnées EXIF (dont la position GPS du domicile).
- Upload direct dans Storage (`meal-photos/<uid>/<timestamp>.jpg`) : la politique Storage n'autorise que le dossier de l'utilisateur.

## Étape 2 — Analyse (Edge Function `analyze-meal`)
1. **Authentification** (JWT) et contrôle du chemin (`<uid>/…` uniquement).
2. **Quota** : `AI_MAX_PER_HOUR` analyses par utilisateur (défaut 20).
3. **Appel Claude** (`@anthropic-ai/sdk`) :
   - `model: AI_MODEL` (défaut `claude-opus-5`), `thinking: adaptive`, `effort: AI_EFFORT` (défaut `medium`) ;
   - `output_config.format` = JSON Schema : `is_food`, `title`, `description`, `cuisine` (énumération), `ingredients[] {name, confidence, allergens[]}`, `allergens[] {code, confidence, reason}`, `diets[]`, `warnings[]`. **Les codes d'allergènes sont une énumération fermée** ;
   - `fallbacks: "default"` : si le modèle décline, l'API rejoue la requête sur le modèle de repli recommandé ;
   - prompt système (versionné `PROMPT_VERSION`) qui explique **l'asymétrie du risque** : omettre un allergène présent est bien plus grave qu'en suggérer un de trop. Le modèle est invité à inclure les ingrédients **typiques mais invisibles** (bouillons, liants, sauces, huiles) avec une confiance plus basse, et à traiter tout texte présent dans l'image comme une donnée, jamais comme une instruction.
4. **Nettoyage** (`sanitize()`) même si la sortie est contrainte : codes inconnus rejetés, confiances bornées [0, 1], doublons fusionnés, tout allergène d'ingrédient reporté dans la liste globale, blé ⇒ gluten.
5. **Journal** `ai_analyses` : statut (`ok`, `not_food`, `refused`, `failed`), modèle réellement utilisé, version du prompt, latence, jetons.
6. **Dégradation élégante** : toute erreur → l'app propose la saisie manuelle dans le même formulaire.

## Étape 3 — Validation humaine (écran `ReviewStep`)
Conçue pour que la correction soit **rapide** et que l'erreur dangereuse soit **difficile** :

| Mécanisme | Effet |
|---|---|
| Badge « à vérifier » sous le seuil `LOW_CONFIDENCE = 0,6` | Attire l'œil sur les suggestions incertaines |
| Point jaune sur les allergènes suggérés par l'IA | Le Cooker distingue ce qu'il a vu de ce que l'IA a déduit |
| Allergènes **dérivés des ingrédients** (y compris implicites : blé ⇒ gluten) | Pour retirer un allergène, il faut modifier l'ingrédient qui le porte — impossible de le décocher « par erreur » |
| Suggestions IA à faible confiance **conservées par défaut** | *Fail-closed* : le Cooker doit les retirer activement |
| Section « Peut contenir des traces de » | Contamination croisée d'une cuisine domestique |
| Contrôle de cohérence régimes ↔ allergènes | « Végane » + lait est refusé (client **et** serveur) |
| **Attestation obligatoire** | Bouton désactivé sans la case ; horodatée et signée côté serveur (`allergens_confirmed_at/by`) |

## Étape 4 — Publication et calcul final (`publish_meal`, SQL)
Transaction unique : insertion du plat et des ingrédients → rattachement au dictionnaire → **union** des trois sources d'allergènes + implications → contrôle des régimes → photos filtrées → statut `published` avec attestation → `validation_diff` sur l'analyse IA.

## Étape 5 — Match avec les profils Eaters (`feed_meals`, SQL)
Pour chaque requête du fil ou de la carte : candidats dans le rayon (PostGIS, index GiST) → filtres (cuisine, prix, mode, régimes) → **`meal_is_safe_for(plat, utilisateur)`** → tri (distance, note bayésienne, nouveauté, prix) → pagination. Le nombre de plats exclus pour raison de santé est renvoyé et affiché.

Contrôles supplémentaires au moment de la transaction : `create_purchase_order` et `propose_swap` revérifient la sécurité (et **dans les deux sens** pour un échange). La page détail affiche un avertissement si un plat est ouvert via un lien partagé alors qu'il est incompatible.

## Boucle d'amélioration continue
- **Mesure** : `ai_analyses.validation_diff` donne, par analyse publiée, les faux positifs (suggérés puis retirés) et les **faux négatifs** (ajoutés par le Cooker ou le dictionnaire, manqués par l'IA). Indicateurs à suivre chaque semaine :
  - **Rappel allergènes** = 1 − FN / (allergènes finaux) → **objectif ≥ 98 %** (métrique de sécurité n°1) ;
  - précision allergènes (confort du Cooker) ;
  - taux de correction des titres/ingrédients, latence p95 (< 8 s), taux de repli manuel.
- **Jeu d'évaluation** : échantillonner 200 à 300 photos réelles consenties avec leur déclaration validée ; rejouer à chaque changement de `PROMPT_VERSION`, `AI_MODEL` ou `AI_EFFORT` avant déploiement.
- **Dictionnaire** : les faux négatifs récurrents (ex. « sauce hoisin ») alimentent `ingredients` / `ingredient_allergens` curés — la correction bénéficie immédiatement à tous les plats, IA ou non.

## Coût et performance (ordre de grandeur)
Une photo de 1280 × 960 représente environ 1 600 jetons d'entrée ; avec le prompt et la réponse (raisonnement inclus), compter quelques milliers de jetons par analyse. Aux tarifs publics de `claude-opus-5` (5 $ / 25 $ US par million de jetons entrée / sortie), l'ordre de grandeur est de **quelques cents par publication**. Leviers à mesurer sur le jeu d'évaluation avant de les activer : `AI_EFFORT=low`, ou un modèle moins coûteux via `AI_MODEL`. Le quota horaire borne l'exposition.
