# 📱 Guide d'utilisation — Homemade

**Pour tester l'app sur ton téléphone Android, sans savoir coder.**

Tout fonctionne **gratuitement** : la base de données (Supabase, offre gratuite), l'intelligence artificielle qui remplit les annonces et lit les étiquettes (**Gemini de Google**, offre gratuite, avec **Groq** gratuit en secours), la carte (OpenStreetMap) et la fabrication de l'APK (GitHub).

> 💡 **Ton abonnement Gemini Pro n'est pas nécessaire.** L'app utilise l'**API** Gemini, qui a sa propre offre gratuite sur Google AI Studio (sans carte bancaire). Tant que tu n'actives pas la facturation dans AI Studio, **rien ne peut t'être facturé** : si le quota gratuit du jour est atteint, l'app passe au secours gratuit (Groq), puis à la saisie à la main.

## Deux façons de tester

| | **Méthode A — APK (recommandée)** | **Méthode B — Expo Go + PC** |
|---|---|---|
| Principe | L'app est **installée** sur le téléphone, comme une vraie app | Le téléphone affiche l'app pendant que le PC la fait tourner |
| Pour qui ? | **Toi et tous tes testeurs** | Toi seulement (développement) |
| PC allumé ? | **Non** | Oui, avec la fenêtre noire ouverte |
| IA (annonce + étiquettes) | **Oui**, Gemini gratuit en ligne | **Oui**, Qwen gratuit sur ta RTX (environ 15 s) |
| Carte | **Carte interactive** | **Carte interactive** |
| Mise à jour | Automatique : nouvelle version à réinstaller | Instantanée |

---

# 🚀 Mettre la bêta en ligne — gratuit, sans coder (une seule fois, environ 30 minutes)

Tu vas seulement **copier-coller des clés** dans des pages web. GitHub fait ensuite tout le travail technique : mettre à jour la base de données, installer l'IA et fabriquer l'APK.

Obligatoire : **3 secrets** (`GEMINI_API_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`). Facultatif : `GROQ_API_KEY`.

> 🔐 Les clés sont des mots de passe : ne les envoie à personne, ne les colle jamais dans un fichier du projet. On les range uniquement dans les **Secrets** de GitHub (Étape 2), qui sont chiffrés et invisibles.

## Étape 1 — Obtenir une clé d'IA gratuite (5 min)

**Gemini (obligatoire) :**
1. Va sur **https://aistudio.google.com/apikey** et connecte-toi avec ton compte Google (celui de Gemini Pro convient).
2. Accepte les conditions si c'est demandé.
3. Clique **Create API key** (Créer une clé API) → choisis ou crée un projet → la clé s'affiche (elle commence par `AIza…`).
4. Clique **Copier** et garde-la dans un coin (Bloc-notes) pour l'Étape 2.
5. ⚠️ **Ne clique pas** sur « Set up billing » / « Configurer la facturation » : c'est ce qui garantit que c'est gratuit.

**Groq (facultatif, recommandé comme secours gratuit) :**
1. Va sur **https://console.groq.com/keys**, crée un compte (Google accepté).
2. **Create API Key** → donne un nom (ex. `homemade`) → **Submit** → copie la clé (`gsk_…`).

## Étape 2 — Ranger les clés dans GitHub (10 min)

### 2-A. Le jeton Supabase (pour que GitHub mette le serveur à jour)
1. Va sur **https://supabase.com/dashboard/account/tokens** → **Generate new token** → nom : `github` → **Generate** → copie le jeton (`sbp_…`).

### 2-B. Le mot de passe de la base de données
1. Sur **https://supabase.com/dashboard**, ouvre ton projet Homemade → ⚙️ **Project Settings** → **Database**.
2. Si tu ne connais plus le mot de passe : **Reset database password** → **Generate a password** → copie-le → **Reset password**. (Sans risque : l'app n'utilise pas ce mot de passe.)

### 2-C. Tout coller dans GitHub
1. Va sur **https://github.com/Themauritian1996/homemade/settings/secrets/actions**.
2. Pour chaque ligne du tableau : **New repository secret** → *Name* = le nom exact → *Secret* = la valeur → **Add secret**.

| Name (exactement) | Valeur |
|---|---|
| `GEMINI_API_KEY` | la clé Gemini (`AIza…`) |
| `GROQ_API_KEY` | la clé Groq (`gsk_…`) — facultatif |
| `SUPABASE_ACCESS_TOKEN` | le jeton Supabase (`sbp_…`) |
| `SUPABASE_DB_PASSWORD` | le mot de passe de la base |

3. Clique ensuite l'onglet **Variables** (même page) et vérifie que **`EXPO_PUBLIC_SUPABASE_URL`** et **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** existent déjà (elles servent à l'APK depuis le début). S'il en manque une : Supabase → ⚙️ **Project Settings** → **API** → copie *Project URL* et la clé *anon / publishable*, puis **New repository variable**.

## Étape 3 — Lancer la mise à jour du serveur (2 min, puis 3 min d'attente)

La nouvelle version est déjà dans la branche principale (`main`) : l'APK se fabrique tout seul (≈ 25 min, robot **APK Android**).
Une fois tes clés rangées (Étape 2), lance le robot du serveur :
1. Va sur **https://github.com/Themauritian1996/homemade/actions/workflows/supabase-deploy.yml**
2. À droite, clique **Run workflow**, puis le bouton vert **Run workflow**.
3. Attends ≈ 3 minutes : une ✅ verte = base de données à jour, clé d'IA installée, fonction d'IA en ligne.

Si une ❌ rouge apparaît : clique dessus, puis sur l'étape en rouge ; le message indique ce qui manque (souvent un secret mal nommé). Corrige-le, puis **Re-run jobs**.

> Plus tard, chaque changement du serveur relance ce robot automatiquement. Tu peux aussi le relancer à la main de la même façon.

## Étape 4 — Rendre l'APK téléchargeable par tes testeurs (2 à 10 min)

Ton dépôt est **privé** : pour l'instant, toi seul peux télécharger l'APK. Deux options :

**Option A — la plus simple : rendre le dépôt public (2 min).** Le code devient visible, mais il ne contient **aucun secret** (je l'ai vérifié : les clés sont dans les Secrets GitHub, invisibles). Bonus : GitHub Actions devient illimité.
1. **https://github.com/Themauritian1996/homemade/settings** → tout en bas, *Danger Zone* → **Change visibility** → **Make public** → confirme.
2. Lien à donner à tes testeurs (toujours la dernière version) :
   **https://github.com/Themauritian1996/homemade/releases/latest/download/Homemade.apk**

**Option B — garder le code privé (10 min).** Un petit dépôt public ne contiendra que l'APK.
1. **https://github.com/new** → *Repository name* : `homemade-app` → **Public** → coche **Add a README file** → **Create repository**.
2. Jeton : **https://github.com/settings/personal-access-tokens/new** → *Token name* `homemade-releases` → *Expiration* 1 an → *Repository access* : **Only select repositories** → `homemade-app` → *Permissions* → *Repository permissions* → **Contents : Read and write** → **Generate token** → copie-le (`github_pat_…`).
3. Dans **https://github.com/Themauritian1996/homemade/settings/secrets/actions** : secret **`PUBLIC_RELEASES_TOKEN`** = ce jeton ; puis onglet **Variables** → variable **`PUBLIC_RELEASES_REPO`** = `Themauritian1996/homemade-app`.
4. Relance **Actions → APK Android → Run workflow**. Lien pour tes testeurs :
   **https://github.com/Themauritian1996/homemade-app/releases/latest/download/Homemade.apk**

Dans les deux cas, le lien est aussi ajouté automatiquement aux invitations envoyées depuis l'app (Profil → Invitez vos voisins).

## Étape 5 — Inviter tes testeurs

Envoie-leur par WhatsApp ou courriel, par exemple :

> Salut ! Je teste **Homemade**, une app pour échanger des repas faits maison entre voisins 🍲
> 1. Sur ton Android, ouvre ce lien et installe l'app : *(le lien de l'Étape 4)*
> 2. Crée ton compte avec le code : **VOISINS2026**

- Le code `VOISINS2026` permet **100 inscriptions**. Chaque membre a aussi son propre code (5 invitations).
- Créer d'autres codes : Supabase → **SQL Editor** → colle puis **Run** :
  ```sql
  insert into public.beta_invites (code, note, max_uses) values ('FAMILLE', 'Famille et amis', 20);
  ```
- Voir les utilisations : `select code, note, uses, max_uses from public.beta_invites;`
- Ouvrir les inscriptions à tout le monde : `update public.app_config set value = 'false' where key = 'invite_required';`

## Étape 6 — Suivre ta bêta
- **Commentaires des testeurs** : Supabase → **Table Editor** → `beta_feedback`. **Signalements** : `reports`.
- **L'IA fonctionne-t-elle ?** Dans l'app, onglet **Publier** : « IA active » = oui. Détail de chaque analyse : table `ai_analyses` (colonne `provider` = gemini ou groq, `status` = ok ou failed).
- **Mettre à jour l'app** : chaque changement fusionné dans `main` refait automatiquement un APK au même lien. Tes testeurs l'installent par-dessus.
- iPhone : l'APK est pour Android seulement (une version iPhone demande un compte Apple Developer payant).

---

## Méthode A — Installer l'APK (toi et tes testeurs)

GitHub fabrique l'APK tout seul, dans le cloud, à chaque mise à jour du code. Compte 15 à 25 minutes après la mise à jour.

### A1. Télécharger l'APK sur le téléphone
1. Sur ton téléphone Android, ouvre **Chrome**.
2. Ouvre le **lien de téléchargement de l'Étape 4** (il se termine par `/releases/latest/download/Homemade.apk`) : le téléchargement démarre directement (environ 60 à 90 Mo).
3. Tant que le dépôt est privé et sans l'option B, seul toi peux télécharger : connecte-toi à GitHub (**Themauritian1996**) si c'est demandé.

### A2. Installer l'APK
1. Quand le téléchargement est fini, touche la notification **« Téléchargement terminé »**, ou ouvre l'app **Fichiers** puis **Téléchargements**.
2. Touche le fichier `Homemade.apk`.
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
| « IA indisponible · saisie manuelle » | La clé Gemini n'est pas encore installée (Étapes 1 à 3). Remplis l'annonce à la main en attendant. |

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
| « Analyse indisponible » | Méthode B : l'IA n'a pas démarré, ouvre **Ollama** depuis le menu Démarrer puis réessaie. APK : vérifie la clé Gemini (Étapes 1 à 3) ; le quota gratuit du jour est peut-être atteint (il revient le lendemain). Tu peux toujours remplir l'annonce à la main. |
| « Code d'invitation invalide » | Vérifie l'orthographe (les espaces et minuscules sont acceptés). Le code est peut-être épuisé : crée-en un autre (Étape 5). |
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
| IA en ligne : Gemini (Google AI Studio) | **0 $** — offre gratuite, sans carte bancaire (quotas par minute et par jour, largement suffisants pour des dizaines de testeurs ; limite de l'app : 20 analyses / h / personne) | Rester sans facturation, ou passer à l'offre payante si l'app grandit |
| IA de secours : Groq | **0 $** — offre gratuite | Idem |
| GitHub (APK et robots) | **0 $** — dépôt public : illimité ; dépôt privé : 2 000 minutes / mois (≈ 70 APK) | Idem |
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
