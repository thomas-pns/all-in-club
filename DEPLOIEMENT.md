# Déploiement d'All-In Club sur le NAS

Même principe que Neon Breaker : GitHub fabrique l'image Docker à chaque envoi sur `main`,
le NAS la télécharge, et le proxy inversé DSM la rend accessible en HTTPS.

Adresse finale : **https://allin.parlotte.synology.me**

## 1. Rendre l'image téléchargeable (une seule fois)

Après le premier passage du workflow **Tests et image** (onglet *Actions* du dépôt) :

1. GitHub > ton profil > **Packages** > `all-in-club`.
2. **Package settings** > *Danger Zone* > **Change visibility** > **Public**.

Le NAS peut ainsi télécharger l'image sans identifiant (le code est déjà public).

## 2. Container Manager

1. **File Station** : dans le dossier partagé `docker`, crée le dossier `all-in-club`.
2. **Container Manager > Projet > Créer** :
   - Nom du projet : `all-in-club` ;
   - Chemin : `/docker/all-in-club` ;
   - Source : **Créer docker-compose.yml**, puis colle le contenu de [`docker-compose.yml`](docker-compose.yml).
3. **Suivant**, puis **Terminé**. Le conteneur `all-in-club` démarre.

Vérification depuis un PC de la maison : `http://IP-DU-NAS:8766/api/sante` affiche `{"ok":true,...}`.

## 3. Proxy inversé

DSM > **Panneau de configuration > Portail de connexion > Avancé > Proxy inversé > Créer** :

| Champ | Valeur |
|---|---|
| Description | `all-in-club` |
| Source : protocole | HTTPS |
| Source : nom d'hôte | `allin.parlotte.synology.me` |
| Source : port | 443 |
| Destination : protocole | HTTP |
| Destination : nom d'hôte | `localhost` |
| Destination : port | 8766 |

Puis onglet **En-tête personnalisé > Créer > WebSocket** (indispensable : les tables passent par WebSocket). Enregistre.

Le certificat `*.parlotte.synology.me` déjà en place pour Neon Breaker couvre ce sous-domaine.
Le port 443 de la box pointe déjà vers le NAS : **rien d'autre à ouvrir**, et surtout pas le port 8766.

Vérification depuis un téléphone en 4G : `https://allin.parlotte.synology.me` affiche l'écran de connexion.

## 4. Installer le jeu sur un téléphone

- **iPhone** : ouvrir l'adresse dans Safari > bouton Partager > **Sur l'écran d'accueil**.
- **Android** : Chrome > menu ⋮ > **Installer l'application**.

Le mode solo fonctionne ensuite même sans connexion.

## 5. Mises à jour

Chaque envoi sur `main` publie une nouvelle image (après les tests).
Container Manager > **Projet > all-in-club > Action > Construire** récupère la dernière version (`pull_policy: always`).

Les parties en cours sont interrompues pendant le redémarrage (quelques secondes) : mieux vaut mettre à jour quand personne ne joue.

## 6. E-mail « mot de passe oublié » (facultatif)

Sans configuration, la page « Mot de passe oublié » indique de demander à l'administrateur (étape 7).
Pour activer les e-mails, avec une adresse Gmail dédiée au jeu :

1. Compte Google > Sécurité > active la **validation en deux étapes**, puis crée un **mot de passe d'application**.
2. Dans le `docker-compose.yml` du projet, décommente les lignes `SMTP_…` et remplis-les.
3. **Action > Construire**. `https://allin.parlotte.synology.me/api/sante` affiche alors `"courriel":true`.

## 7. Administration

Container Manager > **Conteneur > all-in-club > Action > Ouvrir le terminal > Créer** (sh), puis :

```sh
node dist/admin.js joueurs              # liste des comptes
node dist/admin.js reset-mdp PSEUDO     # mot de passe provisoire à donner au joueur
```

Les mots de passe sont hachés (scrypt) : personne ne peut les lire dans la base.

## 8. Sauvegarde

**Hyper Backup** : ajoute le dossier `docker/all-in-club/data` (fichier `all-in-club.db`).

## 9. En cas de problème

| Symptôme | Piste |
|---|---|
| Page inaccessible | `https://allin.parlotte.synology.me/api/sante` répond-il ? Sinon, vérifie la règle de proxy inversé. |
| « Connexion perdue… » en boucle à table | Il manque l'en-tête **WebSocket** dans la règle de proxy inversé. |
| Le conteneur s'arrête aussitôt | Container Manager > Conteneur > all-in-club > **Journal**. « unable to open database file » : le conteneur ne peut pas écrire dans `data` (ne pas ajouter de ligne `user:`). |
| « pull access denied » à la construction | L'image n'est pas encore publique (étape 1). |
