# 📱 Guide d'utilisation — Homemade

**Pour tester l'app sur ton téléphone Android, sans savoir coder.**

Tout est déjà installé et configuré sur ton PC : l'app, la base de données en ligne (Supabase) et l'intelligence artificielle gratuite qui analyse les photos (Qwen, sur ta carte graphique RTX 3050).

---

## Partie 1 — Préparer ton téléphone (une seule fois)

1. Sur ton téléphone Android, ouvre le **Play Store**.
2. Cherche **Expo Go** et installe l'app (gratuite, éditeur : *Expo Project*).
3. Ouvre Expo Go une première fois, puis passe les écrans d'accueil. Pas besoin de créer de compte Expo.

---

## Partie 2 — Lancer l'app (à chaque fois)

1. Vérifie que ton **PC et ton téléphone sont sur le même Wi-Fi**.
2. Sur le PC, ouvre l'**Explorateur de fichiers** et va dans : `C:\Users\Cahya\Projects\homemade`
3. **Double-clique** sur **`Lancer-Homemade.bat`**.
4. Une fenêtre noire s'ouvre et affiche :
   - `[1/3] IA locale (Ollama)…` → l'IA démarre toute seule ;
   - `[2/3] Chargement du modèle d'IA sur la carte graphique… OK` → l'IA est prête sur ta RTX ;
   - `[3/3] Démarrage du serveur…`, puis un grand **QR code**.
5. **Si Windows affiche « Pare-feu Windows : autoriser Node.js ? »**, coche **Réseaux privés**, puis clique **Autoriser l'accès**. Sans ça, le téléphone ne peut pas se connecter.
6. Sur le téléphone, ouvre **Expo Go** → **Scan QR code** → vise le QR code sur l'écran du PC.
7. La **première** ouverture prend 1 à 2 minutes (barre de progression). Les suivantes sont rapides.

> ⚠️ **Garde la fenêtre noire ouverte** pendant tout le test. La fermer arrête l'app.

---

## Partie 3 — Utiliser l'app

### Créer un compte
1. **Créer un compte** → prénom, courriel, mot de passe (8 caractères minimum) → coche la case → **Créer mon compte**.
2. **Profil santé** : touche tes allergies (elles deviennent rouges). Pour chacune, choisis *Allergie* ou *Intolérance*.
3. **Enregistrer et continuer**. Si l'app demande ta position, accepte : elle sert à trouver les plats près de toi.

### Les 5 onglets du bas
| Onglet | À quoi il sert |
|---|---|
| 🍴 **Découvrir** | Les plats autour de toi. Ceux dangereux pour tes allergies sont **automatiquement cachés**. Le bandeau vert indique combien. |
| 🗺️ **Carte** | Les plats sur une carte. Bouton ⚙️ pour filtrer : distance, prix, cuisine, régime, achat ou échange. |
| 📷 **Publier** | Photographier ton plat. L'IA remplit l'annonce pour toi. |
| 💬 **Messages** | Discuter avec le Cooker ou l'Eater, accepter un échange, confirmer la récupération. |
| 👤 **Profil** | Tes notes (en tant que Cooker et en tant qu'Eater), ton profil santé, la déconnexion. |

### Publier un plat avec l'IA
1. Onglet **Publier** → **Photographier mon plat** (ou **Choisir dans la galerie**).
2. Recadre la photo, puis valide.
3. **Analyse en cours** : environ **15 secondes**. L'IA tourne sur ton PC, gratuitement.
4. L'annonce est pré-remplie : titre, description, type de cuisine, ingrédients, allergènes.
5. **Vérifie tout** :
   - un ingrédient avec le badge **« à vérifier »** est incertain ;
   - touche un ingrédient pour modifier ses allergènes, ou 🗑️ pour le supprimer ;
   - ajoute les ingrédients oubliés dans **« Ajouter un ingrédient »** ;
   - les allergènes avec un **point jaune** ont été proposés par l'IA.
6. **Mode** : choisis **Échange**. La vente n'est pas encore activée, il faut d'abord configurer Stripe.
7. Nombre de portions, durée de disponibilité, lieu de cueillette approximatif.
8. Coche **« J'ai vérifié la liste des ingrédients et des allergènes »** → **Publier le plat**.

> L'IA gratuite est rapide mais peut se tromper : dans nos essais, elle a pris un curry pour une moussaka. **Ta vérification est indispensable.** C'est le principe de l'app : l'IA propose, le cuisinier valide.

### Proposer un échange
1. Ouvre un plat (Découvrir ou Carte) → **Échanger**.
2. Choisis un de **tes** plats publiés en mode Échange → écris un petit mot → **Envoyer la proposition**.
3. Le chat s'ouvre. Le Cooker voit **Accepter / Refuser** en haut de la conversation.
4. Une fois accepté, l'adresse exacte devient visible. Coordonnez l'heure dans le chat.
5. Après la récupération : **J'ai récupéré** → donne une **note** et un avis.
6. Les deux avis s'affichent **en même temps**, quand chacun a noté : personne ne voit la note de l'autre avant d'avoir donné la sienne.

---

## Partie 4 — Scénario de test complet (environ 15 minutes)

On ne voit jamais **ses propres** plats dans son fil. Il faut donc **deux comptes**, avec deux adresses courriel différentes (par exemple ton courriel perso et un second).

| # | Qui | Action | Résultat attendu |
|---|---|---|---|
| 1 | Compte **A** | Créer le compte, aucune allergie | Fil vide (normal : aucun plat encore) |
| 2 | A | Publier un plat **avec du fromage ou de la crème**, mode Échange | « Votre plat est en ligne ! » |
| 3 | A | Profil → **Se déconnecter** | Retour à l'accueil |
| 4 | Compte **B** | Créer le compte avec l'allergie **Lait** | Le plat de A est **caché**, avec le bandeau « 1 plat masqué pour votre sécurité » ✅ |
| 5 | B | Profil → Profil santé → retirer Lait → Enregistrer | Le plat de A **apparaît** dans le fil et sur la carte ✅ |
| 6 | B | Publier son propre plat, mode Échange | — |
| 7 | B | Ouvrir le plat de A → **Échanger** → choisir son plat → Envoyer | Le chat s'ouvre : « En attente de réponse » |
| 8 | A | Se reconnecter → Messages → la conversation → **Accepter** | « Acceptée · cueillette à coordonner » |
| 9 | B | Se reconnecter → Messages → **J'ai récupéré** → noter | Avis enregistré (caché pour l'instant) |
| 10 | A | Se reconnecter → Messages → **Laisser un avis** | Les deux avis deviennent visibles ✅ |

---

## Partie 5 — Voir les données (facultatif)

1. Va sur **https://supabase.com/dashboard** → ton projet.
2. Menu de gauche → **Table Editor**.
3. Tables utiles : `profiles` (comptes), `meals` (plats), `meal_allergens` (allergènes calculés), `orders` (échanges), `messages` (chat), `reviews` (avis).

---

## Partie 6 — En cas de problème

| Ce que tu vois | Que faire |
|---|---|
| Expo Go : « Could not connect » ou le chargement tourne sans fin | PC et téléphone sur **le même Wi-Fi** ? Pare-feu autorisé (Partie 2, étape 5) ? Ferme la fenêtre noire et relance `Lancer-Homemade.bat`. |
| Le QR code ne s'affiche pas | Agrandis la fenêtre noire, ou attends 30 s de plus. |
| « Analyse indisponible » | L'IA n'a pas démarré : ouvre **Ollama** depuis le menu Démarrer, puis réessaie. Tu peux aussi remplir l'annonce à la main. |
| « Attention : IA locale indisponible » dans la fenêtre noire | Même solution : ouvre Ollama, puis relance le `.bat`. |
| Erreur « STRIPE_ONBOARDING_REQUIRED » | Normal : la vente exige Stripe. Choisis le mode **Échange**. |
| « Aucun plat pour l'instant » | Normal si personne d'autre n'a publié : fais le scénario de la Partie 4 avec deux comptes. |
| « Vous n'avez aucun plat publié en mode Échange » | Publie d'abord un plat en mode **Échange** ou **Les deux**. |
| Tu veux revoir les plats d'exemple (Montréal) | Renomme le fichier `.env` en `.env.off`, puis relance : l'app repasse en **mode démo**. Renomme-le en `.env` pour revenir. |

---

## Partie 7 — Réglages de l'IA (facultatif)

Le fichier **`.env`** (dans le dossier du projet, à ouvrir avec le Bloc-notes) contient :
```
EXPO_PUBLIC_LOCAL_AI_MODEL=qwen3-vl:2b-instruct
```
| Valeur | Vitesse sur ta RTX 3050 | Précision (allergènes trouvés sur 4 plats de test) |
|---|---|---|
| `qwen3-vl:2b-instruct` *(par défaut)* | **≈ 15 s** par photo, 82 % sur la carte graphique | 8 sur 10 |
| `qwen3-vl:4b-instruct` | ≈ 75 s par photo (déborde de la carte graphique) | 10 sur 10 |

Pour changer : remplace la valeur, enregistre, puis relance `Lancer-Homemade.bat`.

---

## Partie 8 — Coûts

| Service | Aujourd'hui (tests) | Plus tard (vraie app) |
|---|---|---|
| IA Qwen sur ton PC | **0 $** | Pour le développement seulement : ton PC doit rester allumé |
| Supabase (base de données) | **0 $** (plan Free) | Gratuit tant que l'app est petite |
| Claude (IA en ligne, Anthropic) | Non utilisé | Quelques cents US par photo, plus rapide et plus précis, fonctionne sans ton PC |
| Stripe (paiements) | Non activé | Mode test gratuit. En réel : environ 2,9 % + 0,30 $ par paiement (à vérifier sur stripe.com/ca/pricing) |

---

## Partie 9 — Avant un vrai lancement (à faire avec de l'aide)

- Déplacer la base de données vers un projet Supabase **au Canada** (Loi 25). Aujourd'hui elle est aux États-Unis, ce qui convient pour des tests.
- **Réactiver la confirmation par courriel** (désactivée pour faciliter les tests).
- Passer l'IA sur **Claude** (en ligne) pour que l'app fonctionne sans ton PC.
- Activer **Stripe** pour la vente.
- Obtenir un **avis juridique** sur la vente de plats faits maison (MAPAQ).
- Publier sur le Play Store (via EAS Build).

La documentation technique complète se trouve dans le dossier `docs/`.
