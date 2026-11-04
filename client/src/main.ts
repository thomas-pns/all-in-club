/**
 * All-In Club : point d'entrée du client.
 */
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/500.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './style.css';

import { Salle, ReglagesSalle, MessageSalle, Membre } from '../../moteur/salle';
import type { AvatarId } from '../../moteur/avatars';
import { estAvatar } from '../../moteur/avatars';
import type { Utilisateur } from '../../serveur/comptes';
import type { MessageServeur } from '../../serveur/hall';
import { Reseau, api, ErreurApi, jetonEnregistre, enregistrerJeton } from './reseau';
import { EcranTable, Canal } from './ui/table';
import { ecranConnexion, ecranReinitialiser, EcranHall, ecranCreation, ecranProfil } from './ui/ecrans';
import { toast, html } from './ui/commun';
import { debloquerSon } from './vue/son';

const app = document.getElementById('app')!;
let utilisateur: Utilisateur | null = null;
let reseau: Reseau | null = null;
let table: EcranTable | null = null;
let hall: EcranHall | null = null;
let ecouteReseau: (() => void) | null = null;
let horsLigne = false;

function fermerTable() { table?.detruire(); table = null; }

/* ------------------------------ Démarrage ------------------------------ */

async function demarrer() {
  const params = new URLSearchParams(location.search);
  const reinit = params.get('reinitialiser');
  if (reinit) return ecranReinitialiser(app, reinit, () => allerConnexion());
  const jeton = jetonEnregistre();
  if (!jeton) return allerConnexion();
  app.replaceChildren(html('<div class="chargement">Chargement…</div>'));
  try {
    const r = await api<{ utilisateur: Utilisateur }>('/api/moi');
    connecte(r.utilisateur, jeton);
  } catch (e) {
    if (e instanceof ErreurApi && e.statut === 401) { enregistrerJeton(null); return allerConnexion(); }
    horsLigne = true;
    allerConnexion();
  }
}

function allerConnexion() {
  fermerTable();
  ecranConnexion(app, { onConnecte: connecte, onSolo: () => allerSolo(), horsLigne });
}

function connecte(u: Utilisateur, jeton: string) {
  utilisateur = u;
  horsLigne = false;
  reseau?.fermer();
  ecouteReseau?.();
  reseau = new Reseau(jeton);
  ecouteReseau = reseau.ecouter(surMessage);
  reseau.onEtatConnexion = (ok) => {
    document.querySelector('.bandeau-reseau')?.remove();
    if (!ok) document.body.appendChild(html('<div class="bandeau-reseau">Connexion perdue… reconnexion en cours</div>'));
  };
  allerHall();
}

function surMessage(m: MessageServeur) {
  switch (m.type) {
    case 'hall': hall?.majTables(m.tables, m.enLigne); break;
    case 'entre': allerTableEnLigne(); break;
    case 'sorti': if (m.raison) toast(m.raison, true); if (table) { fermerTable(); allerHall(); } break;
    case 'erreur':
      toast(m.texte, true);
      if (m.texte.startsWith('Session expirée')) deconnexion();
      break;
    case 'remplace':
      fermerTable();
      app.replaceChildren(html(`<div class="ecran"><div class="etroit boite" style="text-align:center;margin-top:20vh"><h2>Ouvert ailleurs</h2>
        <p class="doux">All-In Club est ouvert sur un autre appareil ou un autre onglet.</p><button class="btn btn-or" onclick="location.reload()">Jouer ici</button></div></div>`));
      break;
  }
}

/* ------------------------------ Hall ------------------------------ */

function allerHall() {
  fermerTable();
  if (!utilisateur || !reseau) return allerConnexion();
  const r = reseau;
  hall = new EcranHall(app, utilisateur, {
    creer: () => allerCreation(),
    rejoindreCode: (code) => r.envoyer({ type: 'rejoindre', code }),
    rejoindre: (id) => { debloquerSon(); r.envoyer({ type: 'rejoindre', id }); },
    regarder: (id) => r.envoyer({ type: 'regarder', id }),
    solo: () => allerSolo(),
    profil: () => allerProfil(),
  });
  r.envoyer({ type: 'hall' });
}

function allerCreation() {
  hall = null;
  ecranCreation(app, {
    solo: false,
    nomParDefaut: `Table de ${utilisateur?.pseudo ?? 'moi'}`,
    onRetour: () => allerHall(),
    onValider: (reglages) => { debloquerSon(); reseau?.envoyer({ type: 'creer', reglages }); },
  });
}

function allerProfil() {
  hall = null;
  if (!utilisateur) return;
  ecranProfil(app, utilisateur, {
    onRetour: () => allerHall(),
    onMaj: (u) => { utilisateur = u; },
    onDeconnexion: () => deconnexion(),
  });
}

async function deconnexion() {
  fermerTable();
  await api('/api/deconnexion', {}).catch(() => {});
  enregistrerJeton(null);
  reseau?.fermer(); reseau = null;
  ecouteReseau?.(); ecouteReseau = null;
  utilisateur = null;
  allerConnexion();
}

/* ------------------------------ Tables ------------------------------ */

function allerTableEnLigne() {
  if (!reseau) return;
  hall = null;
  if (table) return; // déjà à table (reconnexion)
  const r = reseau;
  const ecouteurs = new Set<(m: MessageSalle) => void>();
  const stop = r.ecouter((m) => { if (m.type === 'salle') ecouteurs.forEach((f) => f(m.msg)); });
  const canal: Canal = {
    enLigne: true,
    envoyer: (cmd) => r.envoyer({ type: 'cmd', cmd }),
    quitter: () => { r.envoyer({ type: 'quitter' }); stop(); },
    brancher: (f) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; },
  };
  table = new EcranTable(app, canal, () => { stop(); table = null; allerHall(); });
}

/* ------------------------------ Solo ------------------------------ */

const CLE_SOLO = 'aic-solo-avatar';
function avatarSolo(): AvatarId {
  try { const a = localStorage.getItem(CLE_SOLO); if (estAvatar(a)) return a; } catch { /* rien */ }
  return utilisateur?.avatar ?? 'renard';
}

function allerSolo() {
  hall = null;
  ecranCreation(app, {
    solo: true,
    nomParDefaut: 'Partie solo',
    avatarSolo: avatarSolo(),
    onAvatarSolo: (a) => { try { localStorage.setItem(CLE_SOLO, a); } catch { /* rien */ } },
    onRetour: () => (utilisateur ? allerHall() : allerConnexion()),
    onValider: (reglages) => { debloquerSon(); lancerSolo(reglages); },
  });
}

function lancerSolo(reglages: ReglagesSalle) {
  const moi: Membre = { id: 'moi', nom: utilisateur?.pseudo ?? 'Toi', avatar: avatarSolo() };
  const ecouteurs = new Set<(m: MessageSalle) => void>();
  const salle = new Salle({
    id: 'solo', code: 'SOLO', hote: moi, reglages,
    sortie: { envoyer: (id, m) => { if (id === moi.id) queueMicrotask(() => ecouteurs.forEach((f) => f(m))); } },
  });
  const canal: Canal = {
    enLigne: false,
    envoyer: (cmd) => salle.commande(moi.id, cmd),
    quitter: () => salle.arreter(),
    brancher: (f) => { ecouteurs.add(f); salle.diffuser(); return () => { ecouteurs.delete(f); }; },
  };
  table = new EcranTable(app, canal, () => { table = null; utilisateur ? allerHall() : allerConnexion(); });
  salle.commande(moi.id, { c: 'lancer' });
}

void demarrer();
