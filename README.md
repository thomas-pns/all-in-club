# All-In Club

Un casino entre potes, dans un style cartoon coloré et chaleureux : **Poker** Texas Hold'em No-Limit en cash game
et **Black Jack** (tous contre le croupier). Tables de 6 joueurs maximum, bots facultatifs au poker, mode solo
hors ligne. Hébergé sur un NAS Synology.

> Le cahier des charges complet est dans [`PROMPT.md`](PROMPT.md). Déploiement sur le NAS : [`DEPLOIEMENT.md`](DEPLOIEMENT.md).
> **État actuel : jalons 1 à 4 terminés.** Moteur de règles, bots, multijoueur en ligne (comptes, hall, tables
> publiques/privées), table animée PixiJS (12 personnages), mode solo hors ligne, chat et 12 émotes, historique
> avec lecteur pas à pas, statistiques, 25 succès (cadres et dos de cartes à débloquer), tables restaurées après
> un redémarrage du serveur. **Black Jack** : 6 jeux de cartes, Black Jack payé 3 contre 2, croupier qui s'arrête
à 17, assurance, doubler, séparer, abandon, bouton « Conseil » (stratégie de base) et règles expliquées en jeu.

## Lancer en développement

```bash
npm install
npm run dev:serveur   # serveur sur le port 3000
npm run dev:client    # jeu sur http://localhost:5173
```

Production : `npm run build && npm start` (ou l'image Docker, voir `DEPLOIEMENT.md`).

## Organisation

| Dossier | Contenu |
|---|---|
| `moteur/` | Règles, bots, « cerveau » de table (`salle.ts`) partagé par le serveur et le mode solo |
| `serveur/` | Fastify + WebSocket + SQLite : comptes, hall, tables en ligne, commande d'administration |
| `client/` | Jeu web : écrans, table animée PixiJS, personnages, sons, mode hors ligne |
| `direction/` | Planche de direction visuelle |

## Moteur de règles (`moteur/`)

Module TypeScript pur, sans affichage ni réseau, partagé par le serveur et le mode solo.

| Fichier | Rôle |
|---|---|
| `cartes.ts` | Cartes, paquet, mélange de Fisher-Yates |
| `evaluation.ts` | Valeur d'une main de 5 à 7 cartes, description en français, 5 cartes gagnantes |
| `main.ts` | Une main complète : blindes, donne, enchères, tapis, pots secondaires, abattage |
| `table.ts` | Table de cash game : bouton, arrivées, absences, blindes manquées, recaves, « Rejouer » |

Règles appliquées (TDA) : tête-à-tête, relance minimum, tapis incomplet qui ne rouvre pas les enchères
(sauf cumul atteignant une relance complète), mise non suivie rendue, carte brûlée, ordre d'abattage
(dernier agresseur de la river d'abord), mains perdantes jetées sans être montrées, toutes les mains
retournées en cas de tapis, jeton indivisible au premier gagnant à gauche du bouton, argent mort,
nouveau venu qui attend la grosse blinde ou la paie pour entrer.

## Tests

```bash
npm install
npm test          # 87 tests, dont 100 000 mains aléatoires simulées et une partie en ligne de bout en bout
npm run typecheck
```

La simulation vérifie qu'aucun jeton n'est créé ni perdu, que chaque main se termine et que les pots
distribués correspondent exactement aux mises.
