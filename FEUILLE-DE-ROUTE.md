# All-In Club : feuille de route

Retours de Thomas du 06/11/2026 (version 0.3.1). Cocher au fur et à mesure.

## Retouches rapides
- [ ] Kiosque : remplacer l'étoile à pics « jusqu'à 20 000 » par quelque chose de plus beau, animation plus soignée (garder les badges en diagonale « + d'1 chance sur 4 », « Gros lot » : ils plaisent).
- [ ] Carte Loto Flash : une animation à elle (ou le tambour de boules), et trouver autre chose d'attrayant pour le Keno.
- [ ] Villes du Casino : changer aussi les illustrations selon le jeu (poker / black jack / roulette), pas seulement le décor de la salle.
- [ ] Bouton retour d'une page de bâtiment : animation inverse du zoom d'entrée (dézoom vers la rue).
- [ ] PC : agrandir la zone de jeu (plus large que le téléphone), réorganiser les missions en conséquence.
- [ ] PC : faire défiler la rue à la souris (glisser, molette) ; la flèche ne permet pas de revenir au début. Trouver mieux que les flèches pour donner envie de voir la suite (bâtiments qui dépassent, ciel qui continue, petit mouvement d'invite…).
- [ ] PC : enlever le cadre de sélection qui apparaît au survol/clic des bâtiments (garder le contour au clavier : la navigation Tab est appréciée).

## Fonctions
- [x] (v0.4.0) **Notifications** : un petit menu sobre (cloche) avec l'historique : gains au Loto/Keno quand on n'était pas là, invitations, demandes d'amis, cadeaux, gros gains des autres (gain très improbable, au-dessus d'un seuil). Notification push sur téléphone si le joueur est parti (ex. tirage du Loto).
- [ ] **Boutique** (5ᵉ onglet) : avatars, cadres, tapis, dos de cartes, jetons, émotes ; éléments visibles chez les amis ; personnages personnalisés. Objectif : des choses à faire avec beaucoup de Clubs.
- [x] (v0.4.0) **Mode administrateur** (compte de Thomas seulement) :
  - gérer les missions du jour (ajouter/modifier la liste des missions possibles, récompenses) ;
  - régler la Grande Roue et la série (cases, multiplicateurs, tickets) ;
  - mode test : ne pas perdre de Clubs, créer des comptes de test (ex. pour tester les amis sans jouer à deux endroits) ;
  - gestion des joueurs.
- [x] (v0.4.0) **Page de bienvenue** `/bienvenue` : ce qu'est l'appli (jeux avec de l'argent fictif), comment l'installer sur iPhone (Partager > Sur l'écran d'accueil) et Android.
- [ ] **Paris sportifs** avec les Clubs : matchs et résultats réels (foot, basket, tennis, chevaux…) via une API de données sportives ; cotes, paris simples/combinés, règlement automatique. À étudier : source des données (gratuite, fiable), fréquence de mise à jour.
- [ ] Amis : messages entre amis ? (pas prioritaire, utilité à confirmer).

## Économie (à rediscuter)
- Le multiplicateur de série (×1 à ×5) ne s'applique **qu'au tour de Grande Roue**, pas aux autres jeux.
- Les missions sont tirées **par joueur** (3 par jour, chacune différente selon le joueur).
- Devenir millionnaire est très long avec les vraies probabilités : réfléchir à des objectifs de fin de partie (bâtiments à débloquer, trophées, boutique de luxe, saisons/classements).
