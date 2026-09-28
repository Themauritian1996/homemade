# 7. Tester l'app (sans savoir coder)

## Ce qui est déjà prêt
- **Base de données Supabase** en ligne : comptes, profils santé, plats, échanges, chat, avis.
- **IA gratuite sur ton PC** : Qwen3-VL (via Ollama) analyse les photos de plats. Compter environ 1 minute par photo.
- **Paiements Stripe** : pas encore activés. On teste donc avec le mode **Échange**.

## Une seule fois : installer Expo Go sur ton téléphone
Play Store (Android) ou App Store (iPhone) : cherche **Expo Go** et installe-la.

## À chaque test
1. Vérifie qu'**Ollama** tourne sur le PC (icône de lama près de l'horloge Windows). Sinon, ouvre Ollama depuis le menu Démarrer.
2. Dans le dossier `C:\Users\Cahya\Projects\homemade`, **double-clique sur `Lancer-Homemade.bat`**.
3. Attends le **QR code** dans la fenêtre noire.
4. Téléphone sur le **même Wi-Fi** que le PC → ouvre **Expo Go** → **Scan QR code**.
5. La première ouverture prend 1 à 2 minutes. Ensuite c'est rapide.

> Si Windows affiche « Autoriser Node.js sur les réseaux privés ? » → **Autoriser**.

## Scénario de test complet (environ 15 minutes)
Tu ne vois jamais tes propres plats dans ton fil : il faut **deux comptes**. Utilise deux adresses courriel, par exemple ton courriel perso et un second.

**Compte A — la cuisinière (Cooker)**
1. **Créer un compte** (courriel A + mot de passe de 8 caractères minimum). Aucun courriel de confirmation n'est demandé pendant la phase de test.
2. Profil santé : choisis par exemple « Arachides », puis **Enregistrer**.
3. Onglet **Publier** → photographie un vrai plat (ou choisis une photo).
4. Patiente pendant l'analyse, environ 1 minute (l'IA tourne sur ton PC).
5. **Vérifie** ce que l'IA propose : titre, ingrédients, allergènes. Corrige si besoin.
6. Mode **Échange**, coche l'attestation → **Publier le plat**.
7. Profil → **Se déconnecter**.

**Compte B — le mangeur (Eater)**
1. **Créer un compte** avec le courriel B. Au profil santé, choisis un allergène présent dans le plat de A (ex. Lait) : le plat de A doit **disparaître** du fil, avec la mention « 1 plat masqué pour votre sécurité ». C'est le test clé.
2. Profil → **Profil santé** → retire cet allergène → le plat de A **réapparaît** dans le fil et sur la carte.
3. Pour proposer un échange, B doit aussi avoir un plat : publie-en un en mode Échange.
4. Ouvre le plat de A → **Échanger** → choisis ton plat → **Envoyer la proposition**. Le chat s'ouvre.

**Retour sur A** (déconnecte B, reconnecte A)
1. Onglet **Messages** → la conversation → **Accepter** → écris un message.
2. Reconnecte B → **J'ai récupéré** → laisse un **avis**.
3. Reconnecte A → laisse un avis à B. Les deux avis deviennent visibles en même temps (double-aveugle).

## Voir les données dans Supabase
https://supabase.com/dashboard → ton projet → **Table Editor** : tables `profiles`, `meals`, `meal_allergens`, `orders`, `messages`, `reviews`.

## En cas de souci
| Problème | Solution |
|---|---|
| « Analyse indisponible » | Ollama n'est pas lancé : ouvre-le depuis le menu Démarrer. Tu peux aussi remplir l'annonce à la main. |
| Le QR code ne marche pas | Même Wi-Fi ? Sinon ferme la fenêtre et relance `Lancer-Homemade.bat`. |
| « STRIPE_ONBOARDING_REQUIRED » | Normal : la vente exige Stripe. Choisis le mode **Échange**. |
| Envie de revoir les données fictives | Renomme le fichier `.env` en `.env.off` puis relance : l'app repasse en mode démo. |

## Pour plus tard
- **Claude (IA payante, plus précise et plus rapide)** : ajouter une clé Anthropic et passer `EXPO_PUBLIC_AI_PROVIDER` à `server`. Ordre de grandeur : quelques cents US par photo analysée.
- **Stripe** : créer un compte, rester en mode test (gratuit, fausses cartes).
- **Avant le lancement** : projet Supabase au **Canada**, réactiver la confirmation par courriel, avis juridique MAPAQ.
