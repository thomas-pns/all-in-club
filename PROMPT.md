# PROMPT — ALL-IN CLUB

> Cahier des charges du projet. Rédigé avec Thomas le 04/11/2026, **à valider**.
> Variantes (Omaha, tournois, etc.) : plus tard, hors de ce document.

## 1. Objectif

Un jeu de **poker Texas Hold'em No-Limit en cash game**, pro et soigné, dans un style **cartoon coloré et chaleureux** (dans l'esprit de Monopoly Poker, sans rien en reprendre) :

- jouable **en ligne entre amis** sur des tables de **6 joueurs maximum**, complétées par des **bots** si on le souhaite ;
- jouable **en solo contre les bots, même hors ligne** ;
- avec **chat, émotes, historique des mains, statistiques et succès** ;
- **jeu web** (PC, Mac, téléphone, installable sur l'écran d'accueil), hébergé dans **un conteneur sur le NAS Synology** de Thomas, à l'adresse **`allin.parlotte.synology.me`** ;
- code dans un **dépôt GitHub public** `all-in-club`.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Jeu | Texas Hold'em No-Limit, cash game uniquement, règles officielles (TDA), 2 à 6 joueurs par table |
| Argent | Jetons fictifs uniquement, **remis à zéro à chaque partie**. Aucun argent réel, aucune monnaie qui suit le joueur |
| Comptes | Pseudo (3 à 16 caractères, unique) + mot de passe (8 caractères minimum, haché avec scrypt) + **e-mail facultatif** pour réinitialiser le mot de passe |
| Mot de passe perdu | Lien par e-mail valable 30 minutes si une adresse est enregistrée, sinon commande d'administration dans le conteneur (`reset-mdp PSEUDO`) |
| Profil | Permanent : avatar, statistiques, succès, historique. Seuls les jetons repartent de zéro |
| Bots | Facultatifs, 3 niveaux (facile, moyen, difficile), chacun avec une personnalité |
| Rendu | 2D, PixiJS, personnages et décor dessinés pour le projet. Pas d'image ni de marque reprise d'un autre jeu |
| Autorité | Le serveur mélange, distribue et arbitre. Un joueur ne reçoit jamais les cartes cachées des autres avant l'abattage |
| Hébergement | 1 conteneur (Node.js + SQLite) dans Container Manager, derrière le proxy inversé DSM déjà en place (WebSocket activé) |
| Hors ligne | Le mode solo contre les bots fonctionne sans connexion (application web installable avec cache hors ligne) |

## 3. Règles du jeu

Le moteur de règles est un module indépendant, sans affichage ni réseau, utilisé à la fois par le serveur et par le mode solo. Il suit les règles du **Tournament Directors Association (TDA)** adaptées au cash game.

### 3.1 Déroulement d'une main

1. **Bouton** : il avance d'un joueur actif à chaque main. La petite blinde est à sa gauche, la grosse blinde ensuite.
2. **Tête-à-tête** (2 joueurs) : le bouton paie la petite blinde, parle **en premier avant le flop** et **en dernier après**.
3. **Donne** : 2 cartes fermées par joueur, une par une, en commençant à gauche du bouton.
4. **Tours d'enchères** : pré-flop, flop (3 cartes), turn (1), river (1). Une **carte est brûlée** avant le flop, le turn et la river.
5. **Ordre de parole** : avant le flop, à gauche de la grosse blinde. Après le flop, premier joueur actif à gauche du bouton.
6. **Fin d'un tour** : chaque joueur encore en jeu a parlé et a misé autant que les autres, ou est à tapis.
7. Si **tout le monde sauf un** se couche, il gagne le pot sans montrer ses cartes (il peut choisir de les montrer).
8. Si les joueurs restants sont **à tapis** (ou tous sauf un), le tableau est distribué jusqu'à la river et **toutes les mains sont retournées** immédiatement.

### 3.2 Enchères

- Actions : **parole** (check), **miser** (bet), **suivre** (call), **relancer** (raise), **se coucher** (fold), **tapis** (all-in).
- Mise minimum : la grosse blinde.
- **Relance minimum** : le montant de la dernière mise ou relance complète du tour. Exemple : blindes 10/20, relance à 60 (+40) → la relance suivante est d'au moins 100.
- **Tapis incomplet** : un tapis qui ne fait pas une relance complète **ne rouvre pas les enchères** pour les joueurs qui ont déjà parlé. Ils peuvent seulement suivre ou se coucher, sauf si plusieurs tapis incomplets cumulés atteignent une relance complète.
- Pas de limite au nombre de relances (No-Limit).
- **Mise non suivie** : la part d'une mise que personne n'a suivie est rendue à son auteur.

### 3.3 Abattage

- Si une mise a été faite à la river, le **dernier joueur à avoir misé ou relancé montre en premier**. Sinon, le premier joueur actif à gauche du bouton.
- Les joueurs suivants montrent s'ils gagnent ou partagent, sinon ils peuvent **jeter leur main sans la montrer** (option « toujours montrer » dans les réglages).
- Meilleure combinaison de 5 cartes parmi les 7 (2 cartes + 5 du tableau). Les couleurs n'ont pas de valeur. L'As compte en haut et en bas (quinte A-2-3-4-5).
- Ordre : quinte flush, carré, full, couleur, quinte, brelan, double paire, paire, carte haute, avec départage aux kickers.

### 3.4 Pots

- **Pots secondaires** calculés à chaque tapis. Chaque pot est attribué aux meilleures mains parmi les joueurs qui y ont contribué.
- **Partage** : en cas d'égalité, le pot est divisé. Le **jeton indivisible** va au premier gagnant à gauche du bouton.
- Plus petite unité de jeton : la petite blinde.

### 3.5 Vie de la table (cash game)

- **Arrivée en cours de partie** : le joueur entre à la main suivante. Il **attend que la grosse blinde lui arrive**, ou il **paie une grosse blinde pour jouer tout de suite**.
- **Absent** (« je m'absente ») : le joueur ne reçoit plus de cartes. À son retour, il paie les blindes manquées ou attend la grosse blinde.
- **Temps de réflexion** : 20 s par décision (réglable), avec une **banque de temps** de 30 s par joueur, rechargée de 5 s toutes les 10 mains. Temps écoulé : parole si possible, sinon couché. Après 2 temps écoulés d'affilée, le joueur passe absent.
- **Déconnexion** : même traitement que le temps écoulé. Le joueur retrouve sa place et ses jetons en se reconnectant.
- **Mélange** : générateur cryptographique du serveur (`crypto.randomInt`) et mélange de Fisher-Yates à chaque main.

## 4. Parties

### 4.1 Création

Un joueur connecté crée une table et choisit :

| Paramètre | Choix | Défaut |
|---|---|---|
| Nom de la table | texte libre | « Table de PSEUDO » |
| Visibilité | publique (dans la liste) ou privée (rejoindre avec un **code de 5 lettres**) | publique |
| Tapis de départ | 500 à 100 000 | 1 000 |
| Blindes | 5/10 à 500/1 000 | 10/20 |
| Places | 2 à 6 | 6 |
| Bots | 0 à 5, et leur niveau | 0 |
| Recaves | interdites, limitées (1 à 5 par joueur) ou illimitées | limitées à 2 |
| Fin automatique | quand un seul joueur a des jetons et qu'aucune recave n'est possible, ou après une durée (30 min à 3 h), ou jamais | un seul joueur restant |
| Temps de réflexion | 10, 20 ou 30 s | 20 s |

Le créateur est **l'hôte**. Il peut modifier les paramètres entre deux mains (sauf le tapis de départ), mettre en pause, retirer un bot, exclure un joueur, et **accorder une recave à un joueur** même si les recaves sont épuisées.

### 4.2 Pendant la partie

- **Liste des tables ouvertes** dans le hall : nom, hôte, places libres, blindes, durée écoulée. On peut aussi y **regarder une partie en spectateur**, sans voir les cartes cachées.
- **Recave** : un joueur à sec reprend un tapis de départ, s'il lui en reste, entre deux mains.
- **Classement de la table** en direct : jetons actuels moins jetons reçus (départ + recaves).

### 4.3 Fin et « Rejouer »

- La partie s'arrête **automatiquement** selon le réglage choisi, ou quand l'hôte clique sur **Terminer**.
- Écran de fin : podium avec les avatars, gains et pertes de chacun, plus gros pot, meilleure main, distinctions amusantes (« Le requin », « Le poisson », « Le bluffeur »).
- Le bouton **Rejouer** de l'hôte relance une partie **à la même table, avec les mêmes joueurs et des tapis neufs**, sans repasser par le hall. Les autres joueurs voient « On remet ça ? » et restent assis ou quittent.
- L'hôte peut aussi **redémarrer depuis le menu de la table** à tout moment, après confirmation.
- Si l'hôte quitte, la table passe au joueur assis depuis le plus longtemps.

## 5. Bots

- Les bots décident à partir de la **probabilité de gagner** (simulation de Monte-Carlo sur les cartes qu'ils connaissent), de la **cote du pot**, de leur **position**, de la **taille des tapis** et de la **personnalité**.
- Ils ne trichent jamais : ils ne voient que leurs propres cartes et le tableau.
- **Niveaux** :
  - **Facile** : joue trop de mains, suit trop souvent, bluffe au hasard.
  - **Moyen** : sélection des mains de départ selon la position, mises proportionnelles au pot, quelques bluffs.
  - **Difficile** : plages de mains par position, relances de valeur et semi-bluffs, adapte son jeu aux statistiques des adversaires à la table (joueur trop passif, trop agressif…).
- **Personnalités** (une par avatar de bot) : prudent, agressif, bluffeur, suiveur, imprévisible.
- Temps de réflexion humain : 0,8 à 3 s, plus long pour les grosses décisions.
- Ils utilisent les émotes de temps en temps (désactivable).

## 6. Comptes et profil

- **Inscription** : pseudo, mot de passe, e-mail facultatif. **Connexion** qui reste active 30 jours sur l'appareil.
- **Mot de passe oublié** : lien envoyé par e-mail (expéditeur configuré dans le conteneur). Sans e-mail : commande d'administration.
- **Profil** : avatar choisi, cadre débloqué par les succès, statistiques, succès, 50 dernières mains.
- **Liste des joueurs** et page de profil de chacun.
- **Sécurité** : HTTPS uniquement, limite de tentatives de connexion et d'inscription par adresse IP, aucun mot de passe ni e-mail dans les journaux.

## 7. Autour de la table

### 7.1 Chat et émotes

- **Chat de table** : 200 caractères, anti-spam (1 message/s, 5 en 10 s), bouton **Masquer ce joueur**, filtre d'insultes désactivable par l'hôte.
- **Émotes** : roue de 12 émotes animées dessinées pour le jeu (pouce, éclat de rire, larme, colère, cœur, applaudissements, « bien joué », lunettes de soleil, poisson, requin, sablier pour presser, champagne). Elles s'affichent en grand au-dessus de l'avatar. Une toutes les 3 s maximum.
- **Réactions automatiques** des avatars : joie quand ils gagnent un gros pot, abattement quand ils perdent, regard concentré quand c'est leur tour, sueur à tapis.

### 7.2 Historique des mains

- Chaque main est enregistrée : positions, cartes, actions, tableau, pots, cartes montrées.
- Écran **Historique** : liste des mains de la partie, puis des 50 dernières du joueur, avec un **lecteur pas à pas** qui rejoue la main sur la table.
- On ne voit que les cartes que l'on avait le droit de voir.

### 7.3 Statistiques

Par joueur, toutes parties confondues, et par partie :

- mains jouées, parties jouées, parties gagnées (1er à la fin) ;
- **VPIP** (mains où l'on met des jetons volontairement), **PFR** (relances avant le flop), **facteur d'agressivité** ;
- % d'abattages gagnés, % de mains gagnées sans abattage ;
- plus gros pot gagné, meilleure main obtenue, meilleure partie ;
- bilan cumulé en **multiples du tapis de départ** (les tapis changent d'une partie à l'autre).

### 7.4 Succès

25 succès définis côté serveur (on peut en ajouter sans redéployer le jeu), chacun avec une icône. Exemples :

| Succès | Condition |
|---|---|
| Première donne | Jouer sa première main |
| Royal ! | Obtenir une quinte flush royale |
| Carré d'as | Gagner avec un carré d'as |
| Full house | Gagner 10 fois avec un full |
| Coup de bluff | Gagner sans abattage après une relance à la river avec une main plus faible qu'une paire |
| Double ou rien | Doubler son tapis à tapis |
| Le retour | Gagner une partie après être descendu sous 10 % du tapis de départ |
| Coup double | Éliminer 2 joueurs dans la même main |
| Bad beat | Perdre avec un full ou mieux |
| Gros poisson | Gagner un pot de plus de 5 tapis de départ |
| Marathon | Jouer 1 000 mains |
| Patron de la table | Gagner 10 parties |
| Bavard | Envoyer 100 émotes |

Les succès débloquent des **cadres d'avatar** et des **dos de cartes**.

## 8. Direction artistique

- **Ambiance** : un club de poker cartoon, chaleureux et coloré : lumière dorée au-dessus de la table, feutre vert profond (ou bleu nuit, rouge bordeaux au choix), rebord en bois rond, contours épais, ombres douces, couleurs saturées mais pas criardes.
- **Avatars** : 12 personnages originaux dessinés en vectoriel, avec plusieurs expressions chacun (neutre, concentré, content, ravi, déçu, en sueur). Par exemple : renard, ours, raton laveur, pingouin, grenouille, hibou, chat, robot, mamie, cow-boy, pieuvre, croco.
- **Cartes** : grandes, très lisibles sur téléphone, option **4 couleurs** (pique noir, cœur rouge, carreau bleu, trèfle vert).
- **Jetons** : piles en relief avec des couleurs selon la valeur, montants toujours affichés en clair.
- **Animations** (60 images/s, fluides sur iPhone) :
  - distribution en arc depuis le croupier, retournement des cartes avec effet de profondeur ;
  - jetons qui glissent vers le centre en fin de tour, puis le pot qui file vers le gagnant ;
  - anneau de temps autour de l'avatar qui passe du vert au rouge, vibration sur téléphone à 5 s ;
  - projecteur et tremblement léger sur un tapis ;
  - pluie de jetons et confettis sur les grosses victoires ;
  - mise en valeur des 5 cartes gagnantes ;
  - transitions douces entre les écrans.
- **Sons** : cartes, jetons, parole (petits coups sur la table), tapis, victoire, tic-tac de fin de temps, émotes. Musique d'ambiance jazz lounge, réglable séparément. Sons créés pour le projet ou libres de droits (CC0).
- **Interface** : boutons d'action grands en bas, curseur de mise avec raccourcis (min, ½ pot, ¾ pot, pot, tapis), **actions anticipées** (« parole/couché », « suivre tout »). Raccourcis clavier sur ordinateur.
- **Affichage** : en paysage sur ordinateur, en **portrait sur téléphone**, avec le joueur toujours en bas au centre. Zones de sécurité de l'iPhone respectées (encoche, barre d'accueil).
- Ressources libres possibles : packs CC0 de Kenney (cartes, jetons, sons), retouchés pour coller au style.

## 9. Technique

| Partie | Choix |
|---|---|
| Langage | TypeScript partout |
| Moteur de règles | Module `moteur/` pur, sans dépendance, partagé par le serveur et le client solo |
| Serveur | Node.js 22, Fastify (pages, API REST), `ws` (WebSocket pour les tables) |
| Base de données | SQLite (better-sqlite3), mode WAL, un fichier dans `data/` |
| Client | Vite + PixiJS 8, interface des menus en HTML/CSS |
| Hors ligne | Service worker qui met le jeu en cache : le mode solo tourne entièrement dans le navigateur |
| E-mail | Nodemailer, compte SMTP configuré par variables d'environnement (facultatif) |
| Mémoire | Moins de 150 Mo pour le conteneur (le NAS a 2 Go) |

- Le serveur garde l'état de chaque table en mémoire et l'enregistre après chaque main, pour pouvoir **reprendre après un redémarrage du conteneur**.
- Chaque message envoyé à un joueur est filtré : ses cartes, jamais celles des autres avant l'abattage.
- Toute action reçue est revalidée par le moteur (tour, montant, légalité).

## 10. Hébergement et dépôt

- **Dépôt GitHub public** `all-in-club`, sans aucun secret.
- **GitHub Actions** : tests du moteur et du serveur à chaque envoi, puis construction de l'image Docker publiée sur GitHub Container Registry.
- **NAS** : projet Container Manager dans `docker/all-in-club`, avec `docker-compose.yml` prêt à coller, données dans `./data`, port interne unique.
- **Proxy inversé DSM** : `allin.parlotte.synology.me` (443) vers le conteneur, WebSocket activé.
- **`DEPLOIEMENT.md`** pas à pas : installation, mise à jour, sauvegarde (copier `data/`), configuration de l'e-mail, commandes d'administration.

## 11. Jalons

1. **Moteur de règles** : donne, enchères, tapis incomplets, pots secondaires, abattage, évaluation des mains. Tests de chaque règle de la section 3, et 100 000 mains aléatoires simulées sans qu'aucun jeton ne se perde ni ne se crée.
2. **Table et mode solo** : table PixiJS, avatars, cartes, jetons, animations, sons, bots des 3 niveaux, jouable hors ligne.
3. **En ligne** : comptes, hall, création et paramètres de table, tables privées, spectateurs, recaves, rejouer, fin de partie, reconnexion.
4. **Autour de la table** : chat, émotes, réactions des avatars, historique et lecteur de mains, statistiques, succès, profils.
5. **Mise en ligne** : Docker, GitHub Actions, déploiement sur le NAS, e-mail, finitions téléphone.

Chaque jalon se termine par une version jouable, des tests qui passent et des captures d'écran.

## 12. Critères de réussite

- Une partie à 6 (amis et bots) se joue du début à la fin sans blocage, sur PC et iPhone en même temps.
- Toutes les situations de la section 3 sont couvertes par des tests automatiques.
- Aucune information cachée ne sort du serveur avant l'abattage (vérifié par un test qui inspecte les messages envoyés).
- Une coupure de connexion de 30 s ne fait perdre ni sa place ni ses jetons.
- Les animations restent fluides sur un iPhone récent, et le jeu se charge en moins de 3 s.
