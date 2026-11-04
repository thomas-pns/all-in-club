/**
 * Point d'entrée du serveur.
 *   PORT (3000), DOSSIER_DONNEES (./data), URL_PUBLIQUE, SMTP_* (facultatif)
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirBase } from './base.js';
import { creerServeur, VERSION } from './app.js';
import { creerCourriel } from './courriel.js';

const ici = dirname(fileURLToPath(import.meta.url));
const donnees = process.env.DOSSIER_DONNEES ?? join(process.cwd(), 'data');
const port = Number(process.env.PORT ?? 3000);

const db = ouvrirBase(join(donnees, 'all-in-club.db'));
const courriel = creerCourriel();
const { app } = await creerServeur({
  db,
  courriel,
  dossierClient: process.env.DOSSIER_CLIENT ?? join(ici, 'client'),
  urlPublique: process.env.URL_PUBLIQUE,
  journal: true,
});

await app.listen({ port, host: '0.0.0.0' });
app.log.info(`All-In Club ${VERSION} prêt sur le port ${port} — e-mail ${courriel.actif ? 'activé' : 'non configuré'}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
