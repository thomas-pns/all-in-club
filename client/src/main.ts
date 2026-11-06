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
import { EcranBJ, CanalBJ } from './ui/blackjack';
import { SalleBJ, ReglagesBJ, MessageBJ } from '../../moteur/blackjack/salleBJ';
import { EcranRoulette, CanalRoulette } from './ui/roulette';
import { SalleRoulette, ReglagesRoulette, MessageRoulette } from '../../moteur/roulette/salleRoulette';
import { EcranHall } from './ui/club';
import { ecranBienvenue } from './ui/bienvenue';
import { carteInvitation } from './ui/amis';
import type { JeuCasino } from './ui/ecrans';
import { ecranConnexion, ecranReinitialiser, ecranCreation, ecranJoueurs, ecranProfilJoueur, annoncerSucces, afficherBanniere } from './ui/ecrans';
import { toast, html, esc, suspense, avecPieces } from './ui/commun';
import { debloquerSon, reglerSon, jouerSon } from './vue/son';
import { volumeMusique } from './vue/musique';
import { lirePrefs, suivrePrefs, definirNotifications, ecrirePrefs } from './ui/commun';

const app = document.getElementById('app')!;
let utilisateur: Utilisateur | null = null;
let reseau: Reseau | null = null;
let table: EcranTable | EcranBJ | EcranRoulette | null = null;
let hall: EcranHall | null = null;
let ecouteReseau: (() => void) | null = null;
let horsLigne = false;

function fermerTable() { table?.detruire(); table = null; }

/* ------------------------------ Démarrage ------------------------------ */

async function demarrer() {
  const params = new URLSearchParams(location.search);
  if (location.pathname.replace(/\/$/, '') === '/bienvenue') return ecranBienvenue(app, () => { history.replaceState(null, '', '/'); void demarrer(); });
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

suspense.table = () => !!table?.occupe;

function surMessage(m: MessageServeur) {
  switch (m.type) {
    case 'hall': hall?.majTables(m.tables, m.enLigne, m.villes); break;
    // (Re)connexion : la demande de liste a pu partir avant l'ouverture du WebSocket
    case 'bienvenue': if (hall) reseau?.envoyer({ type: 'hall' }); break;
    case 'succes': annoncerSucces(m.succes); break;
    case 'annonce': {
      const a = m.annonce;
      // Pas la peine de se l'annoncer à soi-même : on vient de le voir
      if (a.pseudo.toLowerCase() === utilisateur?.pseudo.toLowerCase()) { hall?.nouvelleAnnonce(a); break; }
      afficherBanniere({ icone: '🎉', surtitre: 'Gros gain au Club', titre: esc(a.pseudo), texte: avecPieces(esc(a.texte)), genre: 'gain', son: null, avant: () => hall?.nouvelleAnnonce(a) });
      break;
    }
    case 'amis': {
      const d = m.de;
      if (m.evenement === 'invitation') {
        carteInvitation(m, (code) => { if (table) fermerTable(); reseau?.envoyer({ type: 'rejoindre', code }); });
        break;
      }
      hall?.evenementAmi();
      if (m.evenement === 'demande') afficherBanniere({ icone: '👋', surtitre: "Demande d'ami", titre: esc(d.pseudo), texte: "veut être ton ami · réponds dans l'onglet Amis", genre: 'gain', son: 'gagne' });
      else if (m.evenement === 'accepte') afficherBanniere({ icone: '🤝', surtitre: 'Nouvel ami', titre: esc(d.pseudo), texte: 'a accepté ta demande', genre: 'gain', son: 'gagne' });
      else if (m.evenement === 'cadeau') afficherBanniere({ icone: '🎁', surtitre: 'Cadeau !', titre: `${esc(d.pseudo)} t'offre ${(m.montant ?? 0).toLocaleString('fr-FR')} <i class="pc"></i>`, genre: 'gain', son: 'grosGain', avant: () => hall?.rafraichirPortefeuille() });
      break;
    }
    case 'notif': hall?.nouvelleNotif(m.notif, m.nonLues); break;
    case 'mission': {
      const etat = m.etat;
      // La récompense (et le solde) n'apparaît qu'une fois le résultat vu à l'écran
      afficherBanniere({
        icone: '✅', surtitre: 'Mission réussie !', titre: avecPieces(esc(m.mission.texte)), genre: 'mission', son: 'gagne',
        texte: `+${m.mission.recompense.toLocaleString('fr-FR')} <i class="pc"></i>${m.toutes ? ' · les 3 sont faites : un tour de Grande Roue en plus !' : ''}`,
        avant: () => hall?.missionFaite(etat),
      });
      break;
    }
    case 'entre': if (m.jeu === 'blackjack') allerBJEnLigne(m.casino); else if (m.jeu === 'roulette') allerRouletteEnLigne(m.casino); else allerTableEnLigne(m.casino); break;
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
    creer: (jeu) => allerCreation(jeu),
    rejoindreCode: (code) => r.envoyer({ type: 'rejoindre', code }),
    rejoindre: (id) => { debloquerSon(); r.envoyer({ type: 'rejoindre', id }); },
    regarder: (id) => r.envoyer({ type: 'regarder', id }),
    solo: (jeu) => allerSolo(jeu),
    profil: () => allerProfil(),
    joueurs: () => allerJoueurs(),
    casino: (jeu, ville, inviter) => { debloquerSon(); r.envoyer({ type: 'casino', jeu, ville, inviter }); },
    creerPrivee: (jeu, ville, inviter) => { debloquerSon(); r.envoyer({ type: 'creer', jeu, casino: ville, inviter, reglages: {} }); },
  });
  r.envoyer({ type: 'hall' });
}

function allerCreation(jeu?: JeuCasino) {
  hall = null;
  ecranCreation(app, {
    jeu,
    solo: false,
    nomParDefaut: `Table de ${utilisateur?.pseudo ?? 'moi'}`,
    onRetour: () => allerHall(),
    onValider: (reglages) => { debloquerSon(); reseau?.envoyer({ type: 'creer', jeu: 'poker', reglages }); },
    onValiderBJ: (reglages) => { debloquerSon(); reseau?.envoyer({ type: 'creer', jeu: 'blackjack', reglages }); },
    onValiderRoulette: (reglages) => { debloquerSon(); reseau?.envoyer({ type: 'creer', jeu: 'roulette', reglages }); },
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

function allerTableEnLigne(casino?: string) {
  if (!reseau) return;
  hall = null;
  if (table) return; // déjà à table (reconnexion)
  const r = reseau;
  const ecouteurs = new Set<(m: MessageSalle) => void>();
  const stop = r.ecouter((m) => { if (m.type === 'salle' && m.msg.type !== 'majBJ' && m.msg.type !== 'majRoulette') ecouteurs.forEach((f) => f(m.msg as MessageSalle)); });
  const canal: Canal = {
    enLigne: true,
    casino,
    envoyer: (cmd) => r.envoyer({ type: 'cmd', cmd }),
    quitter: () => { r.envoyer({ type: 'quitter' }); stop(); },
    brancher: (f) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; },
  };
  table = new EcranTable(app, canal, () => { stop(); table = null; allerHall(); }, {
    dos: utilisateur?.dos,
    mesMains: () => api<{ mains: { main: EnregistrementMain }[] }>('/api/mes-mains').then((r) => r.mains.map((x) => x.main).reverse()),
  });
}

function allerBJEnLigne(casino?: string) {
  if (!reseau) return;
  hall = null;
  if (table) return;
  const r = reseau;
  const ecouteurs = new Set<(m: MessageBJ) => void>();
  const stop = r.ecouter((m) => { if (m.type === 'salle' && m.msg.type !== 'maj' && m.msg.type !== 'historique' && m.msg.type !== 'majRoulette') ecouteurs.forEach((f) => f(m.msg as MessageBJ)); });
  const canal: CanalBJ = {
    enLigne: true,
    casino,
    envoyer: (cmd) => r.envoyer({ type: 'cmd', cmd }),
    quitter: () => { r.envoyer({ type: 'quitter' }); stop(); },
    brancher: (f) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; },
  };
  table = new EcranBJ(app, canal, () => { stop(); table = null; allerHall(); });
}

function allerRouletteEnLigne(casino?: string) {
  if (!reseau) return;
  hall = null;
  if (table) return;
  const r = reseau;
  const ecouteurs = new Set<(m: MessageRoulette) => void>();
  const stop = r.ecouter((m) => { if (m.type === 'salle' && m.msg.type !== 'maj' && m.msg.type !== 'historique' && m.msg.type !== 'majBJ') ecouteurs.forEach((f) => f(m.msg as MessageRoulette)); });
  const canal: CanalRoulette = {
    enLigne: true,
    casino,
    envoyer: (cmd) => r.envoyer({ type: 'cmd', cmd }),
    quitter: () => { r.envoyer({ type: 'quitter' }); stop(); },
    brancher: (f) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; },
  };
  table = new EcranRoulette(app, canal, () => { stop(); table = null; allerHall(); });
}

/* ------------------------------ Solo ------------------------------ */

const CLE_SOLO = 'aic-solo-avatar';
function avatarSolo(): AvatarId {
  try { const a = localStorage.getItem(CLE_SOLO); if (estAvatar(a)) return a; } catch { /* rien */ }
  return utilisateur?.avatar ?? 'renard';
}

function allerSolo(jeu?: JeuCasino) {
  hall = null;
  ecranCreation(app, {
    jeu,
    solo: true,
    nomParDefaut: 'Partie solo',
    avatarSolo: avatarSolo(),
    onAvatarSolo: (a) => { try { localStorage.setItem(CLE_SOLO, a); } catch { /* rien */ } },
    onRetour: () => (utilisateur ? allerHall() : allerConnexion()),
    onValider: (reglages) => { debloquerSon(); lancerSolo(reglages); },
    onValiderBJ: (reglages) => { debloquerSon(); lancerSoloBJ(reglages); },
    onValiderRoulette: (reglages) => { debloquerSon(); lancerSoloRoulette(reglages); },
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

function lancerSoloBJ(reglages: ReglagesBJ) {
  const moi: Membre = { id: 'moi', nom: utilisateur?.pseudo ?? 'Toi', avatar: avatarSolo() };
  const ecouteurs = new Set<(m: MessageBJ) => void>();
  const salle = new SalleBJ({
    id: 'solo', code: 'SOLO', hote: moi, reglages,
    sortie: { envoyer: (id, m) => { if (id === moi.id) queueMicrotask(() => ecouteurs.forEach((f) => f(m))); } },
  });
  const canal: CanalBJ = {
    enLigne: false,
    envoyer: (cmd) => salle.commande(moi.id, cmd),
    quitter: () => salle.arreter(),
    brancher: (f) => { ecouteurs.add(f); salle.diffuser(); return () => { ecouteurs.delete(f); }; },
  };
  table = new EcranBJ(app, canal, () => { table = null; utilisateur ? allerHall() : allerConnexion(); });
  salle.commande(moi.id, { c: 'lancer' });
}

function lancerSoloRoulette(reglages: ReglagesRoulette) {
  const moi: Membre = { id: 'moi', nom: utilisateur?.pseudo ?? 'Toi', avatar: avatarSolo() };
  const ecouteurs = new Set<(m: MessageRoulette) => void>();
  const salle = new SalleRoulette({
    id: 'solo', code: 'SOLO', hote: moi, reglages,
    sortie: { envoyer: (id, m) => { if (id === moi.id) queueMicrotask(() => ecouteurs.forEach((f) => f(m))); } },
  });
  const canal: CanalRoulette = {
    enLigne: false,
    envoyer: (cmd) => salle.commande(moi.id, cmd),
    quitter: () => salle.arreter(),
    brancher: (f) => { ecouteurs.add(f); salle.diffuser(); return () => { ecouteurs.delete(f); }; },
  };
  table = new EcranRoulette(app, canal, () => { table = null; utilisateur ? allerHall() : allerConnexion(); });
  salle.commande(moi.id, { c: 'lancer' });
}

// Son : les navigateurs exigent un geste de l'utilisateur avant de jouer quoi que ce soit.
const appliquerVolumes = () => { const p = lirePrefs(); reglerSon(p.effets > 0, p.effets); volumeMusique(p.musique); };
document.addEventListener('pointerdown', () => { debloquerSon(); appliquerVolumes(); }, { capture: true });
document.addEventListener('keydown', () => { debloquerSon(); appliquerVolumes(); }, { capture: true });
suivrePrefs(() => appliquerVolumes());

void demarrer();
