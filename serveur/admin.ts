/**
 * Commandes d'administration, à lancer dans le conteneur :
 *   node admin.js reset-mdp PSEUDO     → génère un nouveau mot de passe provisoire
 *   node admin.js joueurs              → liste des comptes
 */
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ouvrirBase } from './base.js';
import { Comptes } from './comptes.js';

const donnees = process.env.DOSSIER_DONNEES ?? join(process.cwd(), 'data');
const db = ouvrirBase(join(donnees, 'all-in-club.db'));
const comptes = new Comptes(db);
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'reset-mdp' && arg) {
  const u = comptes.parPseudo(arg);
  if (!u) { console.error(`Aucun joueur nommé « ${arg} »`); process.exit(1); }
  const mdp = randomBytes(6).toString('base64url');
  await comptes.definirMotDePasse(u.id, mdp);
  console.log(`Nouveau mot de passe provisoire de ${u.pseudo} : ${mdp}`);
  console.log('Il pourra le changer dans son profil.');
} else if (cmd === 'joueurs') {
  for (const r of db.prepare('SELECT pseudo, email, cree FROM utilisateurs ORDER BY cree').all() as any[])
    console.log(`${r.pseudo.padEnd(18)} ${r.email ? 'e-mail ✓' : '        '}  inscrit le ${new Date(r.cree).toLocaleDateString('fr-FR')}`);
} else {
  console.log('Commandes : reset-mdp PSEUDO | joueurs');
}
db.close();
