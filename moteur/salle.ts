/**
 * Salle : le « cerveau » d'une table. Il fait tourner la partie (mains, bots, temps de réflexion,
 * hôte, recaves, fin, Rejouer) et produit pour chaque joueur une vue filtrée.
 * Il tourne sur le serveur pour les tables en ligne, et dans le navigateur pour le mode solo.
 */
import { Carte, Rng } from './cartes.js';
import { Action, ActionIllegale, EtatMain, Evenement, Legales, actionsLegales, actionParDefaut, potAuCentre, potTotal } from './main.js';
import { ErreurTable, JoueurTable, Table } from './table.js';
import { Niveau, Observateur, ProfilBot, deciderBot } from './bots.js';
import { AVATARS, AvatarId } from './avatars.js';
import { RYTHME, dureeAnimation } from './rythme.js';
import { evaluer } from './evaluation.js';
import { EnregistrementMain, enregistrerMain, filtrerEnregistrement } from './analyse.js';
import { EMOTES, filtrerTexte } from './social.js';

/* ------------------------------------------------------------------ */
/* Types partagés avec le client                                        */

export type FinAuto = { type: 'dernier' } | { type: 'duree'; minutes: number } | { type: 'jamais' };

export interface ReglagesSalle {
  nom: string;
  visibilite: 'publique' | 'privee';
  tapisDepart: number;
  pb: number;
  gb: number;
  places: number;
  recaves: 'interdites' | 'illimitees' | number;
  bots: number;
  niveauBots: Niveau;
  fin: FinAuto;
  tempsReflexion: number;   // secondes, 0 = illimité (solo)
  filtreInsultes: boolean;
}

export const REGLAGES_DEFAUT: Omit<ReglagesSalle, 'nom'> = {
  visibilite: 'publique', tapisDepart: 1000, pb: 10, gb: 20, places: 6, recaves: 2,
  bots: 0, niveauBots: 'moyen', fin: { type: 'dernier' }, tempsReflexion: 20, filtreInsultes: true,
};

export interface Membre { id: string; nom: string; avatar: AvatarId; cadre?: string }

export type Statut = 'attente' | 'en_jeu' | 'pause' | 'terminee';

export interface VueSiege {
  siege: number;
  id: string;
  nom: string;
  avatar: AvatarId;
  bot: boolean;
  niveau?: Niveau;
  tapis: number;
  mise: number;            // mise du tour en cours
  dansLaMain: boolean;
  couche: boolean;
  aTapis: boolean;
  absent: boolean;
  deconnecte: boolean;
  attendGB: boolean;
  cartes: Carte[] | null;  // visibles par ce destinataire
  aDesCartes: boolean;     // a des cartes (cachées ou non)
  main: string | null;     // description de la main montrée
  recue: number;
  recavesRestantes: number;
  cadre: string;
}

export interface Resultats {
  classement: { id: string; nom: string; avatar: AvatarId; bot: boolean; bilan: number; recue: number; tapis: number; comeback: boolean }[];
  tapisDepart: number;
  distinctions: { titre: string; id: string; detail: string }[];
  mains: number;
  plusGrosPot: { id: string; montant: number } | null;
  meilleureMain: { id: string; main: string } | null;
}

export interface VueSalle {
  id: string;
  code: string;
  reglages: ReglagesSalle;
  statut: Statut;
  hote: string;
  moi: string;
  monSiege: number | null;
  sieges: (VueSiege | null)[];
  spectateurs: { id: string; nom: string }[];
  numeroMain: number;
  mainEnCours: boolean;
  bouton: number;
  tableau: Carte[];
  pot: number;              // jetons ramassés au centre
  potTotal: number;
  aParler: number | null;
  resteMs: number | null;   // temps restant pour la décision en cours
  banqueMs: number | null;  // en train d'utiliser la banque de temps
  maBanque: number;         // secondes de banque restantes
  legales: Legales | null;  // seulement quand c'est à moi
  resultats: Resultats | null;
  debut: number | null;     // horodatage du lancement
  finPrevue: number | null; // ms restantes avant la fin automatique (durée)
}

/** Évènement envoyé au client, sans information cachée. */
export type EvenementPublic = Evenement | { t: 'mesCartes'; cartes: Carte[] } | { t: 'nouvelleMain'; numero: number; bouton: number };

export type CommandeClient =
  | { c: 'action'; action: Action }
  | { c: 'recave' }
  | { c: 'absent' }
  | { c: 'retour'; poster: boolean }
  | { c: 'poster' }
  | { c: 'toujoursMontrer'; oui: boolean }
  | { c: 'asseoir'; siege?: number }
  | { c: 'lever' }
  | { c: 'lancer' }
  | { c: 'pause' }
  | { c: 'reprendre' }
  | { c: 'reglages'; reglages: Partial<ReglagesSalle> }
  | { c: 'ajouterBot'; niveau?: Niveau }
  | { c: 'retirerBot'; id: string }
  | { c: 'exclure'; id: string }
  | { c: 'accorderRecave'; id: string }
  | { c: 'terminer' }
  | { c: 'rejouer' }
  | { c: 'chat'; texte: string }
  | { c: 'emote'; id: string }
  | { c: 'historique' };

export type MessageSalle =
  | { type: 'maj'; evenements: EvenementPublic[]; etat: VueSalle }
  | { type: 'info'; texte: string }
  | { type: 'erreur'; texte: string }
  | { type: 'exclu' }
  | { type: 'chat'; message: MessageChat }
  | { type: 'chatHistorique'; messages: MessageChat[] }
  | { type: 'emote'; siege: number | null; de: string; id: string }
  | { type: 'historique'; mains: EnregistrementMain[] };

export interface MessageChat { de: string; nom: string; avatar: AvatarId; texte: string; t: number; systeme?: boolean }

export interface Sortie {
  envoyer(id: string, msg: MessageSalle): void;
  /** Main terminée : pour l'historique et les statistiques. */
  mainTerminee?(main: EtatMain, table: Table, salle: Salle, enregistrement: EnregistrementMain): void;
  /** Un humain a écrit dans le chat ou envoyé une émote (statistiques). */
  activite?(id: string, type: 'message' | 'emote'): void;
  /** L'état de la salle a changé (pour la sauvegarde). */
  modifiee?(salle: Salle): void;
  partieTerminee?(r: Resultats, salle: Salle): void;
  /** Plus aucun humain dans la salle. */
  vide?(salle: Salle): void;
}

export interface Horloge {
  maintenant(): number;
  planifier(fn: () => void, ms: number): unknown;
  annuler(h: unknown): void;
}
export const horlogeSysteme: Horloge = {
  maintenant: () => Date.now(),
  planifier: (fn, ms) => setTimeout(fn, ms),
  annuler: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class ErreurSalle extends Error {}

export interface SauvegardeSalle {
  version: 1;
  id: string; code: string; reglages: ReglagesSalle; statut: Statut; hote: string;
  debut: number | null; numeroMain: number; bouton: number; compteurBots: number;
  joueurs: { membre: Membre; bot: boolean; profil?: ProfilBot; siege: number; tapis: number; recue: number; recavesUtilisees: number; absent: boolean; attendGB: boolean; arrivee: number; banque: number }[];
  statsPartie: [string, { gains: number; sansAbattage: number; plusGrosPot: number; meilleure: number; meilleureTexte: string }][];
  minTapis: [string, number][];
  chat: MessageChat[];
}

const BANQUE_DEPART = 30, BANQUE_MAX = 60, BANQUE_RECHARGE = 5;

interface InfoHumain { membre: Membre; connecte: boolean; arrivee: number; banque: number; tempsEcoules: number }
interface InfoBot { membre: Membre; profil: ProfilBot; humeur: number }

/* ------------------------------------------------------------------ */

export class Salle {
  readonly id: string;
  readonly code: string;
  reglages: ReglagesSalle;
  statut: Statut = 'attente';
  hote: string;
  table: Table;
  private humains = new Map<string, InfoHumain>();
  private bots = new Map<string, InfoBot>();
  private spectateurs = new Map<string, { membre: Membre; connecte: boolean }>();
  private observateur = new Observateur();
  private sortie: Sortie;
  private horloge: Horloge;
  private alea: () => number;
  private rng: Rng;
  private minuterie: unknown = null;
  private occupeJusqua = 0;
  private decision: { siege: number; fin: number; banque: boolean; debutBanque: number } | null = null;
  private dernierEnvoi = new Map<string, number>(); // index d'événement déjà envoyé, par destinataire
  private evenementsMain: EvenementPublic[] = [];
  private compteurArrivee = 0;
  private compteurBots = 0;
  debut: number | null = null;
  private resultats: Resultats | null = null;
  private statsPartie = new Map<string, { gains: number; sansAbattage: number; plusGrosPot: number; meilleure: number; meilleureTexte: string }>();
  private enPause = false;
  private historique: EnregistrementMain[] = [];
  private chat: MessageChat[] = [];
  private antiSpam = new Map<string, { messages: number[]; emote: number }>();
  /** Plus petit tapis atteint pendant la partie (pour le succès « Le retour »). */
  private minTapis = new Map<string, number>();
  derniereActivite = Date.now();

  constructor(opts: {
    id: string; code: string; hote: Membre; reglages: ReglagesSalle; sortie: Sortie;
    horloge?: Horloge; alea?: () => number; rng?: Rng; sauvegarde?: SauvegardeSalle;
  }) {
    this.id = opts.id;
    this.code = opts.code;
    this.reglages = valider({ ...opts.reglages });
    this.sortie = opts.sortie;
    this.horloge = opts.horloge ?? horlogeSysteme;
    this.alea = opts.alea ?? Math.random;
    this.rng = opts.rng ?? ((n) => Math.floor(this.alea() * n));
    this.table = new Table(this.reglages);
    this.hote = opts.hote.id;
    if (opts.sauvegarde) { this.restaurer(opts.sauvegarde); return; }
    this.rejoindre(opts.hote);
    for (let i = 0; i < this.reglages.bots; i++) this.ajouterBot(this.reglages.niveauBots);
  }

  /* ----------------------------- Sauvegarde ----------------------------- */

  /** État de la salle entre deux mains (une main en cours repart de son début). */
  exporter(): SauvegardeSalle {
    const m = this.table.main && this.table.main.phase !== 'terminee' ? this.table.main : null;
    return {
      version: 1,
      id: this.id, code: this.code, reglages: { ...this.reglages }, statut: this.statut, hote: this.hote,
      debut: this.debut, numeroMain: this.table.numeroMain, bouton: this.table.bouton, compteurBots: this.compteurBots,
      joueurs: this.table.joueurs.map((p) => {
        const enMain = m?.joueurs.find((x) => x.siege === p.siege);
        const h = this.humains.get(p.id), b = this.bots.get(p.id);
        return {
          membre: (h?.membre ?? b?.membre)!, bot: !!b, profil: b?.profil, siege: p.siege,
          tapis: enMain ? enMain.tapisDepart : p.tapis, recue: p.recue, recavesUtilisees: p.recavesUtilisees,
          absent: p.absent, attendGB: p.attendGB, arrivee: h?.arrivee ?? 0, banque: h?.banque ?? BANQUE_DEPART,
        };
      }),
      statsPartie: [...this.statsPartie.entries()],
      minTapis: [...this.minTapis.entries()],
      chat: this.chat.slice(-30),
    };
  }

  private restaurer(s: SauvegardeSalle) {
    this.compteurBots = s.compteurBots;
    this.debut = s.debut;
    for (const j of s.joueurs) {
      const p = this.table.asseoir(j.membre.id, j.membre.nom, { siege: j.siege, bot: j.bot });
      Object.assign(p, { tapis: j.tapis, recue: j.recue, recavesUtilisees: j.recavesUtilisees, absent: j.absent, attendGB: j.attendGB, aJoue: true });
      if (j.bot) this.bots.set(j.membre.id, { membre: j.membre, profil: j.profil!, humeur: 0 });
      else {
        this.humains.set(j.membre.id, { membre: j.membre, connecte: false, arrivee: j.arrivee, banque: j.banque, tempsEcoules: 0 });
        this.compteurArrivee = Math.max(this.compteurArrivee, j.arrivee + 1);
      }
    }
    this.table.numeroMain = s.numeroMain;
    this.table.bouton = s.bouton;
    this.statsPartie = new Map(s.statsPartie);
    this.minTapis = new Map(s.minTapis);
    this.chat = s.chat ?? [];
    // Après un redémarrage, la partie attend que l'hôte la relance
    this.statut = s.statut === 'en_jeu' ? 'pause' : s.statut;
    if (this.statut === 'terminee') this.resultats = this.calculerResultats();
    if (!this.humains.has(this.hote)) this.changerHote();
  }

  get nbConnectes(): number { return [...this.humains.values()].filter((h) => h.connecte).length + [...this.spectateurs.values()].filter((s) => s.connecte).length; }

  /* ----------------------------- Membres ----------------------------- */

  get nbHumains(): number { return this.humains.size; }
  get nbAssis(): number { return this.table.joueurs.length; }
  estMembre(id: string): boolean { return this.humains.has(id) || this.spectateurs.has(id); }

  /** Rejoindre : s'asseoir s'il reste une place, sinon regarder. */
  rejoindre(m: Membre): void {
    this.derniereActivite = Date.now();
    this.envoyerChatHistorique(m.id);
    const dejaAssis = this.humains.get(m.id);
    if (dejaAssis) { dejaAssis.connecte = true; dejaAssis.membre = m; this.diffuser(); return; }
    if (this.table.siegesLibres().length) this.asseoirHumain(m);
    else this.spectateurs.set(m.id, { membre: m, connecte: true });
    this.diffuser();
  }

  regarder(m: Membre): void {
    if (this.humains.has(m.id)) return this.rejoindre(m);
    this.envoyerChatHistorique(m.id);
    this.spectateurs.set(m.id, { membre: m, connecte: true });
    this.diffuser();
  }

  private asseoirHumain(m: Membre, siege?: number) {
    this.table.asseoir(m.id, m.nom, { siege });
    this.humains.set(m.id, { membre: m, connecte: true, arrivee: this.compteurArrivee++, banque: BANQUE_DEPART, tempsEcoules: 0 });
    this.spectateurs.delete(m.id);
  }

  partir(id: string): void {
    if (this.spectateurs.delete(id)) { this.diffuser(); return; }
    if (!this.humains.has(id)) return;
    this.humains.delete(id);
    this.table.quitter(id);
    if (this.hote === id) this.changerHote();
    if (this.humains.size === 0) {
      // Plus personne d'assis : les bots ne jouent pas seuls
      if (this.statut === 'en_jeu') this.statut = 'pause';
      this.arreter();
      this.diffuser();
      if (this.spectateurs.size === 0) this.sortie.vide?.(this);
      return;
    }
    this.apresChangement();
  }

  connexion(id: string, connecte: boolean): void {
    this.derniereActivite = Date.now();
    if (connecte) this.envoyerChatHistorique(id);
    const h = this.humains.get(id);
    if (h) h.connecte = connecte;
    const s = this.spectateurs.get(id);
    if (s && !connecte) this.spectateurs.delete(id);
    if (h && connecte) this.dernierEnvoi.delete(id); // renvoyer un état complet
    this.diffuser();
  }

  private changerHote() {
    const suivant = [...this.humains.values()].sort((a, b) => a.arrivee - b.arrivee)[0];
    if (suivant) {
      this.hote = suivant.membre.id;
      this.annoncer(`${suivant.membre.nom} devient l'hôte de la table`);
    }
  }

  private ajouterBot(niveau: Niveau): void {
    const libres = this.table.siegesLibres();
    if (!libres.length) throw new ErreurSalle('Plus de place pour un bot');
    const pris = new Set([...this.humains.values()].map((h) => h.membre.avatar).concat([...this.bots.values()].map((b) => b.membre.avatar)));
    const dispo = AVATARS.filter((a) => !pris.has(a.id));
    const a = dispo.length ? dispo[Math.floor(this.alea() * dispo.length)] : AVATARS[Math.floor(this.alea() * AVATARS.length)];
    const id = `bot-${this.id}-${++this.compteurBots}`;
    const membre: Membre = { id, nom: a.nom, avatar: a.id };
    this.table.asseoir(id, a.nom, { bot: true, siege: libres[0] });
    this.bots.set(id, { membre, profil: { niveau, personnalite: a.personnalite }, humeur: 0 });
  }

  /* ----------------------------- Commandes ----------------------------- */

  commande(id: string, cmd: CommandeClient): void {
    try {
      this.executer(id, cmd);
    } catch (e) {
      if (e instanceof ErreurSalle || e instanceof ErreurTable || e instanceof ActionIllegale) {
        this.sortie.envoyer(id, { type: 'erreur', texte: e.message });
        return;
      }
      throw e;
    }
  }

  private exigerHote(id: string) {
    if (id !== this.hote) throw new ErreurSalle("Seul l'hôte peut faire ça");
  }

  private executer(id: string, cmd: CommandeClient): void {
    const p = this.table.joueur(id);
    switch (cmd.c) {
      case 'action': {
        if (!p || !this.humains.has(id)) throw new ErreurSalle("Tu n'es pas assis à la table");
        if (this.statut !== 'en_jeu') throw new ErreurSalle('La partie est en pause');
        this.jouer(p, cmd.action);
        return;
      }
      case 'recave':
        if (!p) throw new ErreurSalle("Tu n'es pas assis");
        this.table.recave(id);
        this.annoncer(`${p.nom} se recave`);
        break;
      case 'absent':
        if (p) this.table.sAbsenter(id);
        break;
      case 'retour':
        if (p) { this.table.revenir(id, cmd.poster); const h = this.humains.get(id); if (h) h.tempsEcoules = 0; }
        break;
      case 'poster':
        if (p) this.table.posterPourEntrer(id);
        break;
      case 'toujoursMontrer':
        if (p) p.toujoursMontrer = cmd.oui;
        break;
      case 'asseoir': {
        const s = this.spectateurs.get(id);
        if (!s) throw new ErreurSalle('Déjà assis');
        if (!this.table.siegesLibres().length) throw new ErreurSalle('Aucune place libre');
        this.asseoirHumain(s.membre, cmd.siege);
        break;
      }
      case 'lever': {
        const h = this.humains.get(id);
        if (!h) return;
        this.humains.delete(id);
        this.table.quitter(id);
        this.spectateurs.set(id, { membre: h.membre, connecte: h.connecte });
        if (this.hote === id) this.changerHote();
        break;
      }
      case 'lancer':
        this.exigerHote(id);
        if (this.statut !== 'attente') throw new ErreurSalle('Partie déjà lancée');
        if (this.table.joueurs.length < 2) throw new ErreurSalle('Il faut au moins 2 joueurs (ajoute un bot)');
        this.statut = 'en_jeu';
        this.debut = this.horloge.maintenant();
        break;
      case 'pause':
        this.exigerHote(id);
        if (this.statut === 'en_jeu') { this.enPause = true; this.annoncer('Pause demandée : la partie s\'arrête après cette main'); }
        break;
      case 'reprendre':
        this.exigerHote(id);
        this.enPause = false;
        if (this.statut === 'pause') { this.statut = 'en_jeu'; this.annoncer('La partie reprend'); }
        break;
      case 'reglages': {
        this.exigerHote(id);
        if (this.table.mainEnCours()) throw new ErreurSalle('Attendre la fin de la main');
        const r = { ...cmd.reglages };
        if (this.statut !== 'attente') delete r.tapisDepart;
        delete r.bots;
        if (r.places !== undefined && r.places < this.table.joueurs.length) throw new ErreurSalle('Trop de joueurs assis pour réduire les places');
        this.reglages = valider({ ...this.reglages, ...r });
        Object.assign(this.table.reglages, {
          tapisDepart: this.reglages.tapisDepart, pb: this.reglages.pb, gb: this.reglages.gb,
          places: this.reglages.places, recaves: this.reglages.recaves,
        });
        if (this.statut === 'attente') for (const j of this.table.joueurs) { j.tapis = this.reglages.tapisDepart; j.recue = this.reglages.tapisDepart; }
        this.annoncer('Réglages de la table modifiés');
        break;
      }
      case 'ajouterBot':
        this.exigerHote(id);
        this.ajouterBot(cmd.niveau ?? this.reglages.niveauBots);
        break;
      case 'retirerBot': {
        this.exigerHote(id);
        if (!this.bots.has(cmd.id)) throw new ErreurSalle('Bot inconnu');
        this.bots.delete(cmd.id);
        this.table.quitter(cmd.id);
        break;
      }
      case 'exclure': {
        this.exigerHote(id);
        if (cmd.id === id) throw new ErreurSalle('Impossible de t\'exclure toi-même');
        const nom = this.humains.get(cmd.id)?.membre.nom ?? this.spectateurs.get(cmd.id)?.membre.nom;
        this.partir(cmd.id);
        this.sortie.envoyer(cmd.id, { type: 'exclu' });
        if (nom) this.annoncer(`${nom} a été exclu de la table`);
        return;
      }
      case 'accorderRecave': {
        this.exigerHote(id);
        const cible = this.table.joueur(cmd.id);
        if (!cible) throw new ErreurSalle('Joueur inconnu');
        this.table.recave(cmd.id, true);
        this.annoncer(`L'hôte offre une recave à ${cible.nom}`);
        break;
      }
      case 'terminer':
        this.exigerHote(id);
        if (this.statut === 'attente' || this.statut === 'terminee') throw new ErreurSalle('Aucune partie en cours');
        if (this.table.mainEnCours()) { this.finDemandee = true; this.annoncer('La partie se termine après cette main'); }
        else this.terminer();
        break;
      case 'chat': return this.ecrire(id, cmd.texte);
      case 'emote': return this.emote(id, cmd.id);
      case 'historique': {
        const pour = this.historique.filter((h) => h.joueurs.some((j) => j.id === id) || this.spectateurs.has(id) || this.humains.has(id));
        this.sortie.envoyer(id, { type: 'historique', mains: pour.map((h) => filtrerEnregistrement(h, id)) });
        return;
      }
      case 'rejouer':
        this.exigerHote(id);
        if (this.table.mainEnCours()) throw new ErreurSalle('Attendre la fin de la main');
        this.rejouer();
        break;
    }
    this.apresChangement();
  }

  private finDemandee = false;

  /* ----------------------------- Déroulement ----------------------------- */

  private jouer(p: JoueurTable, action: Action) {
    const m = this.table.main;
    if (!m || m.aParler !== p.siege) throw new ErreurSalle("Ce n'est pas ton tour");
    const h = this.humains.get(p.id);
    if (h && this.decision?.siege === p.siege) {
      if (this.decision.banque) {
        const utilise = (this.horloge.maintenant() - this.decision.debutBanque) / 1000;
        h.banque = Math.max(0, h.banque - utilise);
      }
      h.tempsEcoules = 0;
    }
    this.table.agir(p.id, action);
    this.decision = null;
    this.apresChangement();
  }

  /** Après chaque changement : envoyer les vues et planifier la suite. */
  private apresChangement() {
    this.annulerMinuterie();
    this.decision = null;
    const m = this.table.main;
    if (m) this.collecterEvenements(m);
    this.diffuser();
    this.planifier();
    if (!this.table.mainEnCours()) this.sortie.modifiee?.(this);
  }

  private collecterEvenements(m: EtatMain) {
    const deja = this.evenementsMain.filter((e) => e.t !== 'mesCartes' && e.t !== 'nouvelleMain').length;
    const nouveaux = m.evenements.slice(deja);
    if (!nouveaux.length) return;
    this.evenementsMain.push(...nouveaux);
    const maintenant = this.horloge.maintenant();
    this.occupeJusqua = Math.max(this.occupeJusqua, maintenant) + dureeAnimation(nouveaux);
    if (m.phase === 'terminee') this.surFinDeMain(m);
  }

  private planifier() {
    if (this.statut !== 'en_jeu') return;
    const maintenant = this.horloge.maintenant();
    const attente = Math.max(0, this.occupeJusqua - maintenant);
    const m = this.table.main;

    if (m && m.phase !== 'terminee' && m.aParler !== null) {
      const p = this.table.sieges[m.aParler]!;
      const bot = this.bots.get(p.id);
      if (bot) {
        const d = deciderBot({ main: m, siege: p.siege, profil: bot.profil, alea: this.alea, observateur: this.observateur, humeur: bot.humeur });
        this.programmer(() => { if (this.table.main === m && m.aParler === p.siege) { this.table.agir(p.id, d.action); this.apresChangement(); } }, attente + d.reflexion);
        return;
      }
      const h = this.humains.get(p.id);
      const t = this.reglages.tempsReflexion;
      if (!h || t <= 0) return; // pas de limite de temps
      const fin = maintenant + attente + t * 1000;
      this.decision = { siege: p.siege, fin, banque: false, debutBanque: 0 };
      this.programmer(() => this.tempsEcoule(p.siege), fin - maintenant);
      return;
    }

    // Entre deux mains
    if (this.finDemandee || this.finAutomatique()) {
      this.programmer(() => this.terminer(), attente + 800);
      return;
    }
    if (this.enPause) { this.enPause = false; this.statut = 'pause'; this.diffuser(); return; }
    this.gererBotsASec();
    if (this.table.peutDemarrer()) {
      const delai = this.table.numeroMain === 0 ? 600 : attente + RYTHME.entreMains;
      this.programmer(() => this.nouvelleMain(), delai);
    }
  }

  private tempsEcoule(siege: number) {
    const m = this.table.main;
    const d = this.decision;
    if (!m || !d || m.aParler !== siege) return;
    const p = this.table.sieges[siege]!;
    const h = this.humains.get(p.id);
    if (h && !d.banque && h.banque >= 1 && h.connecte) {
      // On entame la banque de temps
      d.banque = true;
      d.debutBanque = this.horloge.maintenant();
      d.fin = d.debutBanque + h.banque * 1000;
      this.diffuser();
      this.programmer(() => this.tempsEcoule(siege), h.banque * 1000);
      return;
    }
    if (h) {
      if (d.banque) h.banque = 0;
      h.tempsEcoules++;
    }
    this.table.agir(p.id, actionParDefaut(m));
    if (h && (h.tempsEcoules >= 2 || !h.connecte)) {
      this.table.sAbsenter(p.id);
      this.annoncer(`${p.nom} est absent`);
    }
    this.apresChangement();
  }

  private nouvelleMain() {
    if (this.statut !== 'en_jeu' || this.table.mainEnCours()) return;
    if (!this.table.peutDemarrer()) return;
    for (const b of this.bots.values()) b.humeur = b.profil.personnalite === 'imprevisible' ? (this.alea() - 0.5) * 5 : 0;
    // Recharge de la banque de temps toutes les 10 mains
    if (this.table.numeroMain > 0 && this.table.numeroMain % 10 === 0)
      for (const h of this.humains.values()) h.banque = Math.min(BANQUE_MAX, h.banque + BANQUE_RECHARGE);
    this.evenementsMain = [];
    for (const id of this.destinataires()) this.dernierEnvoi.set(id, 0);
    const m = this.table.nouvelleMain(this.rng);
    this.evenementsMain.push({ t: 'nouvelleMain', numero: this.table.numeroMain, bouton: m.bouton });
    this.occupeJusqua = this.horloge.maintenant();
    this.apresChangement();
  }

  private surFinDeMain(m: EtatMain) {
    this.observateur.observer(m);
    // Statistiques de la partie (distinctions de fin)
    const r = m.resultat!;
    for (const [s, g] of Object.entries(r.gains)) {
      const id = m.joueurs.find((p) => p.siege === Number(s))!.id;
      const st = this.statPartie(id);
      st.gains++;
      if (r.sansAbattage) st.sansAbattage++;
      st.plusGrosPot = Math.max(st.plusGrosPot, g);
    }
    for (const [s, v] of Object.entries(r.montrees)) {
      const id = m.joueurs.find((p) => p.siege === Number(s))!.id;
      const st = this.statPartie(id);
      if (v.score > st.meilleure) { st.meilleure = v.score; st.meilleureTexte = v.main; }
    }
    const rec = enregistrerMain(m, {
      table: this.reglages.nom, numero: this.table.numeroMain, places: this.reglages.places,
      membre: (id) => { const mb = this.membre(id); return { nom: mb?.nom ?? '?', avatar: mb?.avatar ?? 'renard' }; },
    });
    this.historique.push(rec);
    if (this.historique.length > 50) this.historique.shift();
    for (const p of m.joueurs) {
      const ratio = p.tapis / Math.max(1, this.reglages.tapisDepart);
      this.minTapis.set(p.id, Math.min(this.minTapis.get(p.id) ?? Infinity, ratio));
    }
    this.emotesDesBots(m);
    this.sortie.mainTerminee?.(m, this.table, this, rec);
    this.sortie.modifiee?.(this);
  }

  private statPartie(id: string) {
    let s = this.statsPartie.get(id);
    if (!s) { s = { gains: 0, sansAbattage: 0, plusGrosPot: 0, meilleure: -1, meilleureTexte: '' }; this.statsPartie.set(id, s); }
    return s;
  }

  /** Bots à sec : recave s'il en reste, sinon ils quittent la table. */
  private gererBotsASec() {
    for (const [id, b] of [...this.bots]) {
      const p = this.table.joueur(id);
      if (!p || p.tapis > 0) continue;
      if (this.table.recavesRestantes(p) > 0) { this.table.recave(id); this.annoncer(`${b.membre.nom} se recave`); }
      else {
        this.bots.delete(id);
        this.table.quitter(id);
        this.annoncer(`${b.membre.nom} quitte la table`);
      }
    }
  }

  private finAutomatique(): boolean {
    if (this.table.numeroMain === 0) return false;
    const f = this.reglages.fin;
    if (f.type === 'duree' && this.debut !== null && this.horloge.maintenant() - this.debut >= f.minutes * 60_000) return true;
    if (f.type === 'dernier') {
      const avecJetons = this.table.joueurs.filter((p) => p.tapis > 0);
      const peuventRevenir = this.table.joueurs.filter((p) => p.tapis === 0 && this.table.recavesRestantes(p) > 0);
      return avecJetons.length <= 1 && peuventRevenir.length === 0;
    }
    return false;
  }

  private terminer() {
    if (this.statut === 'terminee') return;
    this.finDemandee = false;
    this.enPause = false;
    this.annulerMinuterie();
    this.statut = 'terminee';
    this.resultats = this.calculerResultats();
    this.sortie.partieTerminee?.(this.resultats, this);
    this.sortie.modifiee?.(this);
    this.diffuser();
  }

  private calculerResultats(): Resultats {
    const classement = this.table.joueurs.map((p) => {
      const m = this.membre(p.id)!;
      return { id: p.id, nom: p.nom, avatar: m.avatar, bot: p.bot, bilan: p.tapis - p.recue, recue: p.recue, tapis: p.tapis, comeback: (this.minTapis.get(p.id) ?? 1) < 0.1 };
    }).sort((a, b) => b.bilan - a.bilan || b.tapis - a.tapis);
    const distinctions: Resultats['distinctions'] = [];
    let plusGrosPot: Resultats['plusGrosPot'] = null, meilleureMain: Resultats['meilleureMain'] = null;
    let meilleurScore = -1, bluffeur: { id: string; n: number } | null = null;
    for (const [id, s] of this.statsPartie) {
      if (!this.membre(id)) continue;
      if (!plusGrosPot || s.plusGrosPot > plusGrosPot.montant) plusGrosPot = { id, montant: s.plusGrosPot };
      if (s.meilleure > meilleurScore) { meilleurScore = s.meilleure; meilleureMain = { id, main: s.meilleureTexte }; }
      if (s.sansAbattage > (bluffeur?.n ?? 0)) bluffeur = { id, n: s.sansAbattage };
    }
    if (classement.length >= 2) {
      const premier = classement[0], dernier = classement[classement.length - 1];
      if (premier.bilan > 0) distinctions.push({ titre: 'Le requin', id: premier.id, detail: `+${premier.bilan} jetons` });
      if (dernier.bilan < 0) distinctions.push({ titre: 'Le poisson', id: dernier.id, detail: `${dernier.bilan} jetons` });
    }
    if (bluffeur && bluffeur.n >= 2) distinctions.push({ titre: 'Le bluffeur', id: bluffeur.id, detail: `${bluffeur.n} pots gagnés sans montrer` });
    if (meilleureMain) distinctions.push({ titre: 'La plus belle main', id: meilleureMain.id, detail: meilleureMain.main });
    return { classement, distinctions, mains: this.table.numeroMain, plusGrosPot, meilleureMain, tapisDepart: this.reglages.tapisDepart };
  }

  private rejouer() {
    this.table.rejouer();
    this.minTapis.clear();
    for (const b of [...this.bots.keys()]) if (!this.table.joueur(b)) this.bots.delete(b);
    this.statsPartie.clear();
    this.resultats = null;
    this.evenementsMain = [];
    for (const id of this.destinataires()) this.dernierEnvoi.set(id, 0);
    for (const h of this.humains.values()) { h.banque = BANQUE_DEPART; h.tempsEcoules = 0; }
    for (const p of this.table.joueurs) p.absent = !!(this.humains.get(p.id) && !this.humains.get(p.id)!.connecte);
    this.statut = 'en_jeu';
    this.debut = this.horloge.maintenant();
    this.annoncer('On remet ça ! Nouvelle partie avec des tapis neufs');
  }

  arreter() { this.annulerMinuterie(); }

  /* ----------------------------- Chat et émotes ----------------------------- */

  private envoyerChatHistorique(id: string) {
    if (this.chat.length) this.sortie.envoyer(id, { type: 'chatHistorique', messages: this.chat.slice(-30) });
  }

  private limite(id: string, type: 'message' | 'emote'): boolean {
    const t = this.horloge.maintenant();
    let a = this.antiSpam.get(id);
    if (!a) { a = { messages: [], emote: -Infinity }; this.antiSpam.set(id, a); }
    if (type === 'emote') {
      if (t - a.emote < 3000) return false;
      a.emote = t;
      return true;
    }
    a.messages = a.messages.filter((x) => t - x < 10_000);
    if (a.messages.length >= 5 || (a.messages.length && t - a.messages[a.messages.length - 1] < 1000)) return false;
    a.messages.push(t);
    return true;
  }

  private ecrire(id: string, texte: string) {
    const m = this.humains.get(id)?.membre ?? this.spectateurs.get(id)?.membre;
    if (!m) throw new ErreurSalle("Tu n'es pas à cette table");
    let propre = String(texte ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!propre) return;
    if (!this.limite(id, 'message')) throw new ErreurSalle('Doucement ! Un message par seconde au maximum');
    if (this.reglages.filtreInsultes) propre = filtrerTexte(propre);
    const msg: MessageChat = { de: id, nom: m.nom, avatar: m.avatar, texte: propre, t: this.horloge.maintenant() };
    this.chat.push(msg);
    if (this.chat.length > 100) this.chat.shift();
    for (const d of this.destinataires()) this.sortie.envoyer(d, { type: 'chat', message: msg });
    this.sortie.activite?.(id, 'message');
  }

  private emote(id: string, emote: string) {
    if (!EMOTES.some((e) => e.id === emote)) throw new ErreurSalle('Émote inconnue');
    const p = this.table.joueur(id);
    if (!p && !this.spectateurs.has(id)) throw new ErreurSalle("Tu n'es pas à cette table");
    if (!this.limite(id, 'emote')) return;
    this.diffuserEmote(p ? p.siege : null, id, emote);
    if (this.humains.has(id)) this.sortie.activite?.(id, 'emote');
  }

  private diffuserEmote(siege: number | null, de: string, emote: string) {
    for (const d of this.destinataires()) this.sortie.envoyer(d, { type: 'emote', siege, de, id: emote });
  }

  /** De temps en temps, les bots réagissent à la fin d'une main. */
  private emotesDesBots(m: EtatMain) {
    const r = m.resultat;
    if (!r) return;
    const animation = Math.max(0, this.occupeJusqua - this.horloge.maintenant());
    for (const p of m.joueurs) {
      const b = this.bots.get(p.id);
      if (!b || this.alea() > 0.18) continue;
      const gagne = (r.gains[p.siege] ?? 0) > 0;
      const perdu = !gagne && !p.couche && !r.sansAbattage;
      const choix = gagne ? (r.sansAbattage ? ['lunettes', 'rire'] : ['champagne', 'applaudir', 'rire', 'requin']) : perdu ? ['larme', 'colere', 'bienjoue'] : [];
      if (!choix.length) continue;
      const e = choix[Math.floor(this.alea() * choix.length)];
      this.horloge.planifier(() => { if (this.table.joueur(p.id)) this.diffuserEmote(p.siege, p.id, e); }, animation + 300 + this.alea() * 1200);
    }
  }

  private programmer(fn: () => void, ms: number) {
    this.annulerMinuterie();
    this.minuterie = this.horloge.planifier(() => { this.minuterie = null; fn(); }, Math.max(0, ms));
  }
  private annulerMinuterie() {
    if (this.minuterie !== null) { this.horloge.annuler(this.minuterie); this.minuterie = null; }
  }

  /* ----------------------------- Vues ----------------------------- */

  private membre(id: string): Membre | undefined {
    return this.humains.get(id)?.membre ?? this.bots.get(id)?.membre ?? this.spectateurs.get(id)?.membre;
  }

  private annoncer(texte: string) {
    for (const id of this.destinataires()) this.sortie.envoyer(id, { type: 'info', texte });
  }

  private destinataires(): string[] {
    return [
      ...[...this.humains.entries()].filter(([, h]) => h.connecte).map(([id]) => id),
      ...[...this.spectateurs.entries()].filter(([, s]) => s.connecte).map(([id]) => id),
    ];
  }

  /** Envoie à chacun les événements qu'il n'a pas encore vus et sa vue. */
  diffuser() {
    for (const id of this.destinataires()) {
      const deja = this.dernierEnvoi.get(id);
      const depuis = deja ?? this.evenementsMain.length; // nouvelle connexion : état seul
      const evts = this.filtrer(this.evenementsMain.slice(depuis), id, deja === undefined);
      this.dernierEnvoi.set(id, this.evenementsMain.length);
      this.sortie.envoyer(id, { type: 'maj', evenements: evts, etat: this.vue(id) });
    }
  }

  private filtrer(evts: EvenementPublic[], id: string, _complet: boolean): EvenementPublic[] {
    const out: EvenementPublic[] = [];
    const m = this.table.main;
    const moi = m?.joueurs.find((p) => p.id === id);
    for (const e of evts) {
      out.push(e);
      if (e.t === 'donne' && moi) out.push({ t: 'mesCartes', cartes: moi.cartes.slice() });
    }
    return out;
  }

  vue(id: string): VueSalle {
    const t = this.table, m = t.main;
    const maintenant = this.horloge.maintenant();
    const sieges: (VueSiege | null)[] = t.sieges.slice(0, Math.max(this.reglages.places, t.sieges.findLastIndex((x) => x) + 1)).map((p) => {
      if (!p) return null;
      const mj = m?.joueurs.find((x) => x.siege === p.siege);
      const montree = m?.resultat?.montrees[p.siege];
      const visible = mj && (p.id === id || montree) ? mj.cartes.slice() : null;
      const membre = this.membre(p.id)!;
      const h = this.humains.get(p.id);
      const b = this.bots.get(p.id);
      return {
        siege: p.siege, id: p.id, nom: p.nom, avatar: membre.avatar, bot: p.bot, niveau: b?.profil.niveau,
        tapis: p.tapis, mise: mj && m!.phase !== 'terminee' ? mj.miseTour : 0,
        dansLaMain: !!mj, couche: !!mj?.couche, aTapis: !!mj?.aTapis && mj.tapis === 0,
        absent: p.absent, deconnecte: !!h && !h.connecte, attendGB: p.attendGB,
        cartes: visible, aDesCartes: !!mj && !mj.couche, main: montree?.main ?? null,
        recue: p.recue, recavesRestantes: Math.min(99, t.recavesRestantes(p)), cadre: membre.cadre ?? 'aucun',
      };
    });
    const monJoueur = t.joueur(id);
    const d = this.decision;
    const L = m && m.phase !== 'terminee' ? actionsLegales(m) : null;
    const f = this.reglages.fin;
    return {
      id: this.id, code: this.code, reglages: { ...this.reglages }, statut: this.statut, hote: this.hote, moi: id,
      monSiege: monJoueur ? monJoueur.siege : null,
      sieges,
      spectateurs: [...this.spectateurs.values()].map((s) => ({ id: s.membre.id, nom: s.membre.nom })),
      numeroMain: t.numeroMain,
      mainEnCours: t.mainEnCours(),
      bouton: t.bouton,
      tableau: m ? m.tableau.slice() : [],
      pot: m ? (m.phase === 'terminee' ? 0 : potAuCentre(m)) : 0,
      potTotal: m && m.phase !== 'terminee' ? potTotal(m) : 0,
      aParler: m && m.phase !== 'terminee' ? m.aParler : null,
      resteMs: d ? Math.max(0, d.fin - maintenant) : null,
      banqueMs: d?.banque ? Math.max(0, d.fin - maintenant) : null,
      maBanque: Math.floor(this.humains.get(id)?.banque ?? 0),
      legales: L && monJoueur && L.siege === monJoueur.siege ? L : null,
      resultats: this.resultats,
      debut: this.debut,
      finPrevue: f.type === 'duree' && this.debut !== null ? Math.max(0, this.debut + f.minutes * 60_000 - maintenant) : null,
    };
  }

  /** Résumé pour la liste des tables du hall. */
  resume() {
    const hote = this.humains.get(this.hote)?.membre;
    return {
      id: this.id,
      nom: this.reglages.nom,
      hote: hote?.nom ?? '?',
      visibilite: this.reglages.visibilite,
      joueurs: this.table.joueurs.length,
      humains: this.humains.size,
      places: this.reglages.places,
      pb: this.reglages.pb,
      gb: this.reglages.gb,
      statut: this.statut,
      debut: this.debut,
      avatars: this.table.joueurs.map((p) => this.membre(p.id)!.avatar),
    };
  }
}

/* ------------------------------------------------------------------ */

export function valider(r: ReglagesSalle): ReglagesSalle {
  const ent = (x: unknown, min: number, max: number, def: number) => {
    const n = Math.floor(Number(x));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const out: ReglagesSalle = {
    nom: String(r.nom ?? 'Table').trim().slice(0, 30) || 'Table',
    visibilite: r.visibilite === 'privee' ? 'privee' : 'publique',
    tapisDepart: ent(r.tapisDepart, 100, 100_000, 1000),
    pb: ent(r.pb, 1, 500, 10),
    gb: 0,
    places: ent(r.places, 2, 6, 6),
    recaves: r.recaves === 'illimitees' || r.recaves === 'interdites' ? r.recaves : ent(r.recaves, 1, 5, 2),
    bots: ent(r.bots, 0, 5, 0),
    niveauBots: (['facile', 'moyen', 'difficile'] as const).includes(r.niveauBots) ? r.niveauBots : 'moyen',
    fin: r.fin?.type === 'duree' ? { type: 'duree', minutes: ent(r.fin.minutes, 5, 600, 60) } : r.fin?.type === 'jamais' ? { type: 'jamais' } : { type: 'dernier' },
    tempsReflexion: [0, 10, 20, 30].includes(Number(r.tempsReflexion)) ? Number(r.tempsReflexion) : 20,
    filtreInsultes: r.filtreInsultes !== false,
  };
  out.gb = ent(r.gb, out.pb * 2, out.pb * 2, out.pb * 2);
  out.bots = Math.min(out.bots, out.places - 1);
  return out;
}

/** Code de table privée : 5 lettres sans ambiguïté. */
export function genererCode(alea: () => number = Math.random): string {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => L[Math.floor(alea() * L.length)]).join('');
}

/** Pour les tests et le solo : meilleure main en cours d'un joueur. */
export const forceActuelle = (cartes: Carte[], tableau: Carte[]) => evaluer(cartes.concat(tableau));
