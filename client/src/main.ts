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
import type { EnregistrementMain } from '../../moteur/analyse';
import { Reseau, api, ErreurApi, jetonEnregistre, enregistrerJeton } from './reseau';
import { EcranTable, Canal } from './ui/table';
import { ecranConnexion, ecranReinitialiser, EcranHall, ecranCreation, ecranJoueurs, ecranProfilJoueur, annoncerSucces } from './ui/ecrans';
import { toast, html } from './ui/commun';
import { debloquerSon, reglerSon } from './vue/son';
import { volumeMusique } from './vue/musique';
import { lirePrefs, suivrePrefs, definirNotifications, ecrirePrefs } from './ui/commun';

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

/** Notifications « c'est ton tour » : abonnement Web Push auprès du serveur. */
async function notifications(oui: boolean): Promise<boolean> {
  const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
      toast(/iPhone|iPad/.test(navigator.userAgent) ? "Sur iPhone : ajoute d'abord le jeu à l'écran d'accueil (Partager > Sur l'écran d'accueil), puis ouvre-le depuis l'icône" : 'Ton navigateur ne gère pas les notifications', true, 6000);
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    if (!oui) {
      const ab = await reg.pushManager.getSubscription();
      if (ab) { await api('/api/push/abonnement', { endpoint: ab.endpoint }, 'DELETE').catch(() => {}); await ab.unsubscribe(); }
      return false;
    }
    if ((await Notification.requestPermission()) !== 'granted') { toast('Notifications refusées : autorise-les dans les réglages du navigateur', true, 5000); return false; }
    const { cle } = await api<{ cle: string }>('/api/push/cle');
    const ab = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(cle) }));
    await api('/api/push/abonnement', { abonnement: ab.toJSON() });
    toast("C'est noté : tu seras prévenu quand c'est ton tour");
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Notifications impossibles', true);
    return false;
  }
}

function connecte(u: Utilisateur, jeton: string) {
  utilisateur = u;
  definirNotifications(notifications);
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
    case 'succes': annoncerSucces(m.succes); break;
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
    joueurs: () => allerJoueurs(),
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

function allerProfil(pseudo?: string, retour: () => void = allerHall) {
  hall = null;
  if (!utilisateur) return;
  void ecranProfilJoueur(app, pseudo ?? utilisateur.pseudo, utilisateur, {
    onRetour: retour,
    onMaj: (u) => { utilisateur = u; },
    onDeconnexion: () => deconnexion(),
  });
}

function allerJoueurs() {
  hall = null;
  void ecranJoueurs(app, { onRetour: () => allerHall(), onProfil: (p) => allerProfil(p, allerJoueurs) });
}

async function deconnexion() {
  fermerTable();
  await api('/api/deconnexion', {}).catch(() => {});
  enregistrerJeton(null);
  definirNotifications(null);
  if (lirePrefs().notifications) { void notifications(false); ecrirePrefs({ notifications: false }); }
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
  table = new EcranTable(app, canal, () => { stop(); table = null; allerHall(); }, {
    dos: utilisateur?.dos,
    mesMains: () => api<{ mains: { main: EnregistrementMain }[] }>('/api/mes-mains').then((r) => r.mains.map((x) => x.main).reverse()),
  });
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

// Son : les navigateurs exigent un geste de l'utilisateur avant de jouer quoi que ce soit.
const appliquerVolumes = () => { const p = lirePrefs(); reglerSon(p.effets > 0, p.effets); volumeMusique(p.musique); };
document.addEventListener('pointerdown', () => { debloquerSon(); appliquerVolumes(); }, { capture: true });
document.addEventListener('keydown', () => { debloquerSon(); appliquerVolumes(); }, { capture: true });
suivrePrefs(() => appliquerVolumes());

void demarrer();
