# All-In Club

Poker Texas Hold'em No-Limit en cash game, entre amis, dans un style cartoon coloré et chaleureux.
Tables de 6 joueurs maximum, bots facultatifs, mode solo hors ligne. Hébergé sur un NAS Synology.

> Le cahier des charges complet est dans [`PROMPT.md`](PROMPT.md).
> **État actuel : jalon 1 terminé** (moteur de règles). Prochain jalon : la table et le mode solo.

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
npm test          # 46 tests, dont 100 000 mains aléatoires simulées
npm run typecheck
```

La simulation vérifie qu'aucun jeton n'est créé ni perdu, que chaque main se termine et que les pots
distribués correspondent exactement aux mises.
