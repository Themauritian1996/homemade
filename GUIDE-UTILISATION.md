# 📱 Guide d'utilisation — Homemade

**Pour tester l'app sur ton téléphone Android, sans savoir coder.**

Tout est déjà installé et configuré : l'app, la base de données en ligne (Supabase) et l'intelligence artificielle qui analyse les photos et lit les étiquettes (Claude en ligne, ou Qwen gratuit sur ta carte graphique RTX 3050).

> 🆕 **Version bêta** : inscription sur **code d'invitation**, **carte interactive** (sans clé Google), **lecture d'étiquettes par l'IA**, paramètres, « Mes plats », favoris, signalements et commentaires des testeurs. Avant d'inviter du monde, fais une fois l'**Étape 0** ci-dessous.

## Deux façons de tester

| | **Méthode A — APK (recommandée)** | **Méthode B — Expo Go + PC** |
|---|---|---|
| Principe | L'app est **installée** sur le téléphone, comme une vraie app | Le téléphone affiche l'app pendant que le PC la fait tourner |
| PC allumé ? | **Non** | Oui, avec la fenêtre noire ouverte |
| Même Wi-Fi ? | **Non** (4G ou Wi-Fi) | Oui |
| IA qui remplit l'annonce et lit les étiquettes | **Oui** si Claude est activé (Étape 0-B), sinon saisie à la main | **Oui** (Qwen sur ta RTX, environ 15 s) |
| Carte | **Carte interactive** | **Carte interactive** |
| Mise à jour | Automatique sur GitHub, à réinstaller | Instantanée |

---

## Étape 0 — Préparer la bêta (une seule fois, environ 15 minutes)

### 0-A. Mettre à jour la base de données
La bêta ajoute des tables (codes d'invitation, commentaires…). Sur le PC, dans le dossier du projet :
1. Double-clique **`scripts/supabase-login.ps1`** (clic droit → *Exécuter avec PowerShell*) si la CLI Supabase n'est pas encore connectée.
2. Ouvre un terminal dans le dossier du projet et tape :
   ```
   npx supabase db push
   ```
3. Réponds **Y** quand il demande de confirmer la migration `20260929000100_beta.sql`.

### 0-B. Activer l'IA en ligne (Claude) — pour que l'APK remplisse les annonces et lise les étiquettes
Sans cette étape, tout fonctionne quand même : l'app le détecte et propose la saisie à la main.
1. Crée une clé sur **https://console.anthropic.com** (menu *API Keys*) et ajoute un peu de crédit (5 $ suffisent largement pour des dizaines de testeurs).
2. Dans le terminal :
   ```
   npx supabase secrets set ANTHROPIC_API_KEY=ta-clé-ici
   npx supabase functions deploy analyze-meal
   ```
3. C'est tout : l'APK utilise déjà l'IA « serveur » par défaut. L'écran **Publier** affiche **« IA active »**.

### 0-C. Les codes d'invitation
- Code de lancement : **`VOISINS2026`** (100 inscriptions). Donne-le à tes premiers testeurs.
- Chaque membre a aussi **son propre code** (5 invitations) : Profil → **Invitez vos voisins** → Partager.
- Créer d'autres codes : Supabase → **SQL Editor** → colle puis *Run* :
  ```sql
  insert into public.beta_invites (code, note, max_uses) values ('FAMILLE', 'Famille et amis', 20);
  ```
- Voir qui a utilisé quoi : `select code, note, uses, max_uses from public.beta_invites;`
- Ouvrir les inscriptions à tout le monde : `update public.app_config set value = 'false' where key = 'invite_required';`

### 0-D. Donner l'app à tes testeurs
Le dépôt GitHub est **privé** : tes testeurs ne peuvent pas télécharger l'APK depuis GitHub.
1. Télécharge l'APK sur ton PC (Méthode A1, depuis ton compte).
2. Dépose-le dans **Google Drive** → clic droit → *Partager* → *Tous les utilisateurs disposant du lien*.
3. Envoie ce lien avec le code d'invitation (WhatsApp, courriel…).
4. Facultatif : sur GitHub → *Settings → Secrets and variables → Actions → Variables*, crée **`EXPO_PUBLIC_BETA_DOWNLOAD_URL`** avec ce lien : il sera ajouté automatiquement aux invitations partagées depuis l'app (à partir de l'APK suivant).

---

## Méthode A — Installer l'APK depuis GitHub

GitHub fabrique l'APK tout seul, dans le cloud, à chaque mise à jour du code. Compte 15 à 25 minutes après la mise à jour.

### A1. Télécharger l'APK sur le téléphone
1. Sur ton téléphone Android, ouvre **Chrome**.
2. Va sur : **https://github.com/Themauritian1996/homemade/releases/latest**
3. Le dépôt est **privé** : connecte-toi à GitHub avec ton compte (**Themauritian1996**) si c'est demandé.
4. Dans la section **Assets**, touche le fichier **`Homemade-test-XX.apk`** pour le télécharger (environ 60 à 90 Mo).

### A2. Installer l'APK
1. Quand le téléchargement est fini, touche la notification **« Téléchargement terminé »**, ou ouvre l'app **Fichiers** puis **Téléchargements**.
2. Touche le fichier `Homemade-test-XX.apk`.
3. Android affiche **« Pour votre sécurité, votre téléphone n'est pas autorisé à installer des applis inconnues de cette source »** : touche **Paramètres**, active **« Autoriser cette source »**, puis reviens en arrière.
4. Touche **Installer**. Si **Google Play Protect** affiche un avertissement (« App non vérifiée »), touche **Plus de détails**, puis **Installer quand même**. C'est normal pour une app de test qui ne vient pas du Play Store.
5. Touche **Ouvrir** : l'app **Homemade** apparaît aussi parmi tes applications.

### A3. Mettre à jour
Quand je modifie l'app, une nouvelle version apparaît au même lien (**releases/latest**), avec un numéro plus grand. Télécharge-la et installe-la **par-dessus** : tes comptes et tes données sont conservés, car ils sont sur Supabase.

### A4. Si l'installation échoue
| Message | Que faire |
|---|---|
| « Application non installée » ou « conflit avec un paquet existant » | Désinstalle l'ancienne version de Homemade (appui long sur l'icône → Désinstaller), puis réinstalle. |
| La page GitHub affiche « 404 » | Tu n'es pas connecté à GitHub dans Chrome, ou la première construction n'est pas terminée. |
| « IA indisponible · saisie manuelle » | Claude n'est pas encore activé (Étape 0-B). Remplis l'annonce à la main. |

➡️ Continue ensuite à la **Partie 3 — Utiliser l'app**.

---

## Méthode B — Expo Go + PC (avec l'IA sur ta carte graphique)

### B1. Préparer ton téléphone (une seule fois)

1. Sur ton téléphone Android, ouvre le **Play Store**.
2. Cherche **Expo Go** et installe l'app (gratuite, éditeur : *Expo Project*).
3. Ouvre Expo Go une première fois, puis passe les écrans d'accueil. Pas besoin de créer de compte Expo.

---

### B2. Lancer l'app (à chaque fois)

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
1. **Créer un compte** → **code d'invitation** (ex. `VOISINS2026`), prénom, courriel, mot de passe (8 caractères minimum) → coche la case → **Créer mon compte**.
2. **Profil santé** : touche tes allergies (elles deviennent rouges). Pour chacune, choisis *Allergie* ou *Intolérance*.
3. **Enregistrer et continuer**. Si l'app demande ta position, accepte : elle sert à trouver les plats près de toi.

### Les 5 onglets du bas
| Onglet | À quoi il sert |
|---|---|
| 🍴 **Découvrir** | Les plats autour de toi, avec une **barre de recherche** (plat, ingrédient, quartier). Ceux dangereux pour tes allergies sont **automatiquement cachés** ; le bandeau vert indique combien. |
| 🗺️ **Carte** | Carte interactive (OpenStreetMap) : touche une pastille de prix pour voir le plat. Bouton ☰ pour la liste, ⚙️ pour filtrer, ➤ pour te localiser. |
| 📷 **Publier** | Photographier ton plat. L'IA remplit l'annonce et peut **lire une étiquette ou une recette**. |
| 💬 **Messages** | Discuter, accepter un échange, confirmer la récupération. Une pastille rouge indique les messages non lus. |
| 👤 **Profil** | Notes, profil santé, **Mes plats**, **Mes favoris**, **Invitez vos voisins**, **Paramètres** (photo, quartier, rayon, données), **Aide**, **Donner mon avis**. |

### Publier un plat avec l'IA
> Avec l'**APK** (méthode A), l'étape 3 est sautée : le formulaire s'ouvre vide et tu remplis toi-même le titre, les ingrédients et les allergènes.

1. Onglet **Publier** → **Photographier mon plat** (ou **Choisir dans la galerie**).
2. Recadre la photo, puis valide.
3. **Analyse en cours** : environ **15 secondes**. L'IA tourne sur ton PC, gratuitement.
4. L'annonce est pré-remplie : titre, description, type de cuisine, ingrédients, allergènes.
5. **Vérifie tout** :
   - un ingrédient avec le badge **« à vérifier »** est incertain ;
   - touche un ingrédient pour modifier ses allergènes, ou 🗑️ pour le supprimer ;
   - ajoute les ingrédients oubliés dans **« Ajouter un ingrédient »** ;
   - les allergènes avec un **point jaune** ont été proposés par l'IA ;
   - tu as utilisé une **sauce, un bouillon ou un produit acheté** ? Touche **« Scanner une étiquette ou une recette »** et photographie sa liste d'ingrédients : l'IA ajoute le produit, ses allergènes (« Contient ») et ses traces (« Peut contenir »). Compare avec le texte lu, puis **Ajouter à mon annonce**.
6. **Mode** : pendant la bêta, les plats s'**échangent** (la vente viendra avec Stripe).
7. Nombre de portions, durée de disponibilité, puis le **lieu de cueillette** : touche la carte ou glisse l'épingle (ou « Utiliser ma position actuelle »). Le quartier se remplit tout seul ; ton adresse exacte reste privée.
8. Coche **« J'ai vérifié la liste des ingrédients et des allergènes »** → **Publier le plat**.

> L'IA gratuite est rapide mais peut se tromper : dans nos essais, elle a pris un curry pour une moussaka. **Ta vérification est indispensable.** C'est le principe de l'app : l'IA propose, le cuisinier valide.

### Proposer un échange
1. Ouvre un plat (Découvrir ou Carte) → **Échanger**.
2. Choisis un de **tes** plats publiés en mode Échange → écris un petit mot → **Envoyer la proposition**.
3. Le chat s'ouvre. Le Cooker voit **Accepter / Refuser** en haut de la conversation.
4. Une fois accepté, l'adresse exacte devient visible. Coordonnez l'heure dans le chat.
5. Après la récupération : **J'ai récupéré** → donne une **note** et un avis.
6. Les deux avis s'affichent **en même temps**, quand chacun a noté : personne ne voit la note de l'autre avant d'avoir donné la sienne.

### Gérer tes plats, signaler, donner ton avis
- **Profil → Mes plats** : état de chaque annonce, portions restantes, demandes en cours, bouton **Retirer**.
- Sur un plat : ♡ pour le mettre en **favori**, ⤴ pour le **partager**, et en bas **« Signaler ce plat »** (une réaction allergique ou un problème d'hygiène retire le plat immédiatement).
- **Profil → Donner mon avis sur la bêta** : bogue, idée… Tu lis tout dans Supabase (Partie 5).
- **Paramètres → Obtenir une copie de mes données / Supprimer mon compte** (Loi 25).

---

## Partie 4 — Scénario de test complet (environ 15 minutes)

On ne voit jamais **ses propres** plats dans son fil. Il faut donc **deux comptes**, avec deux adresses courriel différentes (par exemple ton courriel perso et un second).

| # | Qui | Action | Résultat attendu |
|---|---|---|---|
| 1 | Compte **A** | Créer le compte avec le code `VOISINS2026`, aucune allergie | Fil vide (normal : aucun plat encore) |
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
4. Pour la bêta : **`beta_feedback`** (commentaires des testeurs), **`reports`** (signalements), **`beta_invites`** (codes et utilisations), `ai_analyses` (analyses IA, colonne `task` = `meal` ou `ocr`).

---

## Partie 6 — En cas de problème

| Ce que tu vois | Que faire |
|---|---|
| Expo Go : « Could not connect » ou le chargement tourne sans fin | PC et téléphone sur **le même Wi-Fi** ? Pare-feu autorisé (Partie 2, étape 5) ? Ferme la fenêtre noire et relance `Lancer-Homemade.bat`. |
| Le QR code ne s'affiche pas | Agrandis la fenêtre noire, ou attends 30 s de plus. |
| « Analyse indisponible » | Méthode B : l'IA n'a pas démarré, ouvre **Ollama** depuis le menu Démarrer puis réessaie. APK : active Claude (Étape 0-B). Tu peux toujours remplir l'annonce à la main. |
| « Code d'invitation invalide » | Vérifie l'orthographe (les espaces et minuscules sont acceptés). Le code est peut-être épuisé : crée-en un autre (Étape 0-C). |
| La carte affiche « n'a pas pu se charger » | Pas d'Internet : la liste par distance s'affiche à la place. Touche l'icône carte pour réessayer. |
| Les plats sont autour de Montréal alors que tu es ailleurs | Touche le bandeau orange « utiliser votre position » dans Découvrir, ou ➤ sur la carte, et autorise la localisation. |
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
| Claude (IA en ligne, Anthropic) | Quelques cents US par photo ou étiquette (limite : 20 analyses / h / personne). Pour 30 testeurs, compter quelques dollars par mois | Idem, à surveiller dans la console Anthropic |
| Carte (OpenStreetMap / CARTO) | **0 $**, aucune clé | Au-delà de ~75 000 affichages / mois, prévoir un fournisseur payant ou un compte CARTO |
| Stripe (paiements) | Non activé | Mode test gratuit. En réel : environ 2,9 % + 0,30 $ par paiement (à vérifier sur stripe.com/ca/pricing) |

---

## Partie 9 — Avant un vrai lancement (à faire avec de l'aide)

- Déplacer la base de données vers un projet Supabase **au Canada** (Loi 25). Aujourd'hui elle est aux États-Unis, ce qui convient pour des tests.
- **Réactiver la confirmation par courriel** (désactivée pour faciliter les tests).
- Activer **Stripe** pour la vente.
- Obtenir un **avis juridique** sur la vente de plats faits maison (MAPAQ).
- Publier sur le Play Store (via EAS Build).

La documentation technique complète se trouve dans le dossier `docs/`.
