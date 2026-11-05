/**
 * Salle de roulette : jusqu'à 6 joueurs contre la banque.
 * Chaque tour : faites vos jeux (on pose ses jetons sur le tapis), rien ne va plus, la bille tourne, on paie.
 * Elle tourne sur le serveur (en ligne) ou dans le navigateur (solo), comme les autres salles.
 */
import { Rng } from '../cartes.js';
import { AvatarId } from '../avatars.js';
import { Membre, Horloge, horlogeSysteme, ErreurSalle, Statut, MessageChat } from '../salle.js';
import { EMOTES, GestionSocial } from '../social.js';
import { estMise, resoudre, tirer, MISES } from './regles.js';

export interface ReglagesRoulette {
  nom: string;
  visibilite: 'publique' | 'privee';
  tapisDepart: number;
  miseMin: number;          // valeur du plus petit jeton
  places: number;           // 1 à 6
  recaves: 'interdites' | 'illimitees' | number;
  tours: number;            // 0 = illimité
  tempsMises: number;       // secondes pour miser, 0 = on attend que tout le monde soit prêt
  filtreInsultes: boolean;
  partage: boolean;         // chances simples : la moitié rendue sur le zéro
}

export const REGLAGES_ROULETTE_DEFAUT: Omit<ReglagesRoulette, 'nom'> = {
  visibilite: 'publique', tapisDepart: 1000, miseMin: 5, places: 6, recaves: 2, tours: 20, tempsMises: 30, filtreInsultes: true, partage: true,
};

export function validerRoulette(r: ReglagesRoulette): ReglagesRoulette {
  const ent = (x: unknown, min: number, max: number, def: number) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  return {
    nom: String(r.nom ?? 'Roulette').trim().slice(0, 30) || 'Roulette',
    visibilite: r.visibilite === 'privee' ? 'privee' : 'publique',
    tapisDepart: ent(r.tapisDepart, 100, 100_000, 1000),
    miseMin: [1, 5, 10, 25].includes(Number(r.miseMin)) ? Number(r.miseMin) : 5,
    places: ent(r.places, 1, 6, 6),
    recaves: r.recaves === 'illimitees' || r.recaves === 'interdites' ? r.recaves : ent(r.recaves, 1, 5, 2),
    tours: ent(r.tours, 0, 500, 20),
    tempsMises: [0, 15, 20, 30, 45].includes(Number(r.tempsMises)) ? Number(r.tempsMises) : 30,
    filtreInsultes: r.filtreInsultes !== false,
    partage: r.partage !== false,
  };
}

export type PhaseRoulette = 'mises' | 'tirage' | 'resultats';

export interface VueSiegeRoulette {
  siege: number; id: string; nom: string; avatar: AvatarId; cadre: string;
  tapis: number; recue: number; recavesRestantes: number; deconnecte: boolean;
  pret: boolean;
  mises: Record<string, number>;
  totalMise: number;
  /** Après le tirage : ce que les mises ont rendu (mises comprises). */
  retour: number | null;
  /** Les mises du tour précédent, pour « Rejouer mes mises ». */
  precedentes: Record<string, number>;
}

export interface ResultatsRoulette {
  classement: { id: string; nom: string; avatar: AvatarId; bilan: number; tapis: number; recue: number }[];
  distinctions: { titre: string; id: string; detail: string }[];
  tours: number;
  tapisDepart: number;
}

export interface VueRoulette {
  jeu: 'roulette';
  id: string; code: string; reglages: ReglagesRoulette; statut: Statut; hote: string; moi: string; monSiege: number | null;
  sieges: (VueSiegeRoulette | null)[];
  spectateurs: { id: string; nom: string }[];
  numeroTour: number;
  phase: PhaseRoulette | null;
  resteMs: number | null;
  /** Le numéro sorti (pendant le tirage et les résultats). */
  numero: number | null;
  /** Derniers numéros sortis, le plus récent en premier. */
  historique: number[];
  resultats: ResultatsRoulette | null;
}

export type EvenementRoulette =
  | { t: 'nouveauTour'; numero: number }
  | { t: 'pose'; siege: number; mise: string; montant: number }
  | { t: 'retire'; siege: number; mise: string; reste?: number }
  | { t: 'rienNeVaPlus' }
  | { t: 'tirage'; numero: number; tour: number }
  | { t: 'gain'; siege: number; mise: string; montant: number; retour: number }
  | { t: 'perte'; siege: number; mise: string; montant: number }
  | { t: 'bilan'; siege: number; mise: number; retour: number };

export type CommandeRoulette =
  | { c: 'poser'; mise: string; montant: number }
  | { c: 'retirer'; mise: string; montant?: number }
  | { c: 'effacer' }
  | { c: 'repeter'; double?: boolean }
  | { c: 'pret' }
  | { c: 'recave' }
  | { c: 'asseoir'; siege?: number }
  | { c: 'lever' }
  | { c: 'lancer' } | { c: 'pause' } | { c: 'reprendre' } | { c: 'terminer' } | { c: 'rejouer' }
  | { c: 'reglages'; reglages: Partial<ReglagesRoulette> }
  | { c: 'exclure'; id: string }
  | { c: 'accorderRecave'; id: string }
  | { c: 'chat'; texte: string }
  | { c: 'emote'; id: string };

export type MessageRoulette =
  | { type: 'majRoulette'; evenements: EvenementRoulette[]; etat: VueRoulette }
  | { type: 'info'; texte: string }
  | { type: 'erreur'; texte: string }
  | { type: 'exclu' }
  | { type: 'chat'; message: MessageChat }
  | { type: 'chatHistorique'; messages: MessageChat[] }
  | { type: 'emote'; siege: number | null; de: string; id: string };

export interface SortieRoulette {
  envoyer(id: string, msg: MessageRoulette): void;
  activite?(id: string, type: 'message' | 'emote'): void;
  modifiee?(salle: SalleRoulette): void;
  vide?(salle: SalleRoulette): void;
  tourDe?(id: string, salle: SalleRoulette): void;
}

export interface SauvegardeRoulette {
  jeu: 'roulette'; version: 1;
  id: string; code: string; reglages: ReglagesRoulette; statut: Statut; hote: string; numeroTour: number; historique: number[];
  joueurs: { membre: Membre; siege: number; tapis: number; recue: number; recavesUtilisees: number; arrivee: number }[];
  stats: [string, StatsRoulette][];
}

interface StatsRoulette { meilleurGain: number; pleins: number; zeros: number }
interface JoueurRoulette {
  membre: Membre; siege: number; tapis: number; recue: number; recavesUtilisees: number;
  mises: Record<string, number>; precedentes: Record<string, number>; retour: number | null;
  pret: boolean; connecte: boolean; arrivee: number; part?: boolean;
}

/** Durée d'animation de chaque événement, pour caler la suite sur l'écran des joueurs. */
const RYTHME: Partial<Record<EvenementRoulette['t'], number>> = { nouveauTour: 400, rienNeVaPlus: 700, tirage: 7200, gain: 120, bilan: 250 };
export const dureeRoulette = (evts: EvenementRoulette[]) => evts.reduce((s, e) => s + (RYTHME[e.t] ?? 0), 0);

const PAUSE_RESULTATS = 3500;
/** Une fois tout le monde prêt (ou le temps écoulé), petite marge avant « rien ne va plus ». */
const MARGE_PRETS = 600;
const MAX_MISES = 60;

/* ------------------------------------------------------------------ */

export class SalleRoulette {
  readonly jeu = 'roulette' as const;
  readonly id: string;
  readonly code: string;
  reglages: ReglagesRoulette;
  statut: Statut = 'attente';
  hote: string;
  derniereActivite = Date.now();
  private joueurs = new Map<string, JoueurRoulette>();
  private spectateurs = new Map<string, { membre: Membre; connecte: boolean }>();
  private sortie: SortieRoulette;
  private horloge: Horloge;
  private rng: Rng;
  private phase: PhaseRoulette | null = null;
  private numeroTour = 0;
  private numero: number | null = null;
  private historique: number[] = [];
  private evenements: EvenementRoulette[] = [];
  private dejaEnvoye = new Map<string, number>();
  private minuterie: unknown = null;
  private echeance: number | null = null;
  private compteurArrivee = 0;
  private finDemandee = false;
  private enPause = false;
  private resultats: ResultatsRoulette | null = null;
  private stats = new Map<string, StatsRoulette>();
  private social = new GestionSocial();

  constructor(opts: { id: string; code: string; hote: Membre; reglages: ReglagesRoulette; sortie: SortieRoulette; horloge?: Horloge; rng?: Rng; sauvegarde?: SauvegardeRoulette }) {
    this.id = opts.id;
    this.code = opts.code;
    this.reglages = validerRoulette({ ...opts.reglages });
    this.sortie = opts.sortie;
    this.horloge = opts.horloge ?? horlogeSysteme;
    this.rng = opts.rng ?? ((n) => Math.floor(Math.random() * n));
    this.hote = opts.hote.id;
    if (opts.sauvegarde) { this.restaurer(opts.sauvegarde); return; }
    this.rejoindre(opts.hote);
  }

  /* ----------------------------- Membres ----------------------------- */

  get nbConnectes() { return [...this.joueurs.values()].filter((j) => j.connecte).length + [...this.spectateurs.values()].filter((s) => s.connecte).length; }
  estMembre(id: string) { return this.joueurs.has(id) || this.spectateurs.has(id); }
  private membre(id: string): Membre | undefined { return this.joueurs.get(id)?.membre ?? this.spectateurs.get(id)?.membre; }

  private siegesLibres(): number[] {
    const pris = new Set([...this.joueurs.values()].map((j) => j.siege));
    return Array.from({ length: this.reglages.places }, (_, i) => i).filter((i) => !pris.has(i));
  }

  rejoindre(m: Membre) {
    this.derniereActivite = Date.now();
    this.envoyerChat(m.id);
    const j = this.joueurs.get(m.id);
    if (j) { j.connecte = true; j.part = false; j.membre = m; this.dejaEnvoye.delete(m.id); this.diffuser(); return; }
    const libres = this.siegesLibres();
    if (libres.length) this.asseoir(m, libres[0]);
    else this.spectateurs.set(m.id, { membre: m, connecte: true });
    this.diffuser();
  }

  regarder(m: Membre) {
    if (this.joueurs.has(m.id)) return this.rejoindre(m);
    this.envoyerChat(m.id);
    this.spectateurs.set(m.id, { membre: m, connecte: true });
    this.diffuser();
  }

  private asseoir(m: Membre, siege: number) {
    this.joueurs.set(m.id, { membre: m, siege, tapis: this.reglages.tapisDepart, recue: this.reglages.tapisDepart, recavesUtilisees: 0, mises: {}, precedentes: {}, retour: null, pret: false, connecte: true, arrivee: this.compteurArrivee++ });
    this.spectateurs.delete(m.id);
  }

  partir(id: string) {
    if (this.spectateurs.delete(id)) { this.diffuser(); return; }
    const j = this.joueurs.get(id);
    if (!j) return;
    // Pendant le tirage, ses mises restent sur le tapis jusqu'au paiement
    if (this.phase === 'tirage' && this.total(j) > 0) { j.part = true; j.connecte = false; }
    else { this.rendreMises(j); this.joueurs.delete(id); }
    if (this.hote === id) this.changerHote();
    if (![...this.joueurs.values()].some((x) => !x.part)) {
      this.arreter();
      if (this.statut === 'en_jeu') { this.statut = 'pause'; this.phase = null; this.echeance = null; }
      this.diffuser();
      if (!this.spectateurs.size) this.sortie.vide?.(this);
      return;
    }
    this.verifierPrets();
    this.diffuser();
  }

  connexion(id: string, connecte: boolean) {
    this.derniereActivite = Date.now();
    const j = this.joueurs.get(id);
    if (j) j.connecte = connecte;
    if (!connecte) this.spectateurs.delete(id);
    else { this.dejaEnvoye.delete(id); this.envoyerChat(id); }
    if (j && !connecte) this.verifierPrets();
    this.diffuser();
  }

  private changerHote() {
    const s = [...this.joueurs.values()].filter((j) => !j.part).sort((a, b) => a.arrivee - b.arrivee)[0];
    if (s) { this.hote = s.membre.id; this.annoncer(`${s.membre.nom} devient l'hôte de la table`); }
  }

  /* ----------------------------- Commandes ----------------------------- */

  commande(id: string, cmd: CommandeRoulette) {
    try { this.executer(id, cmd); }
    catch (e) {
      if (e instanceof ErreurSalle) { this.sortie.envoyer(id, { type: 'erreur', texte: e.message }); return; }
      throw e;
    }
  }

  private exigerHote(id: string) { if (id !== this.hote) throw new ErreurSalle("Seul l'hôte peut faire ça"); }

  private recavesRestantes(j: JoueurRoulette) {
    const r = this.reglages.recaves;
    return r === 'illimitees' ? 99 : r === 'interdites' ? 0 : Math.max(0, r - j.recavesUtilisees);
  }

  private total(j: JoueurRoulette) { return Object.values(j.mises).reduce((s, x) => s + x, 0); }
  private rendreMises(j: JoueurRoulette) { if (this.phase !== 'tirage') { j.tapis += this.total(j); j.mises = {}; } }

  private exigerMises(j: JoueurRoulette | undefined): JoueurRoulette {
    if (!j) throw new ErreurSalle("Tu n'es pas assis");
    if (this.phase !== 'mises') throw new ErreurSalle('Rien ne va plus !');
    return j;
  }

  private executer(id: string, cmd: CommandeRoulette) {
    const j = this.joueurs.get(id);
    switch (cmd.c) {
      case 'poser': {
        const x = this.exigerMises(j);
        if (!estMise(cmd.mise)) throw new ErreurSalle('Mise inconnue');
        const m = Math.floor(Number(cmd.montant));
        if (!(m >= this.reglages.miseMin)) throw new ErreurSalle(`Jeton minimum : ${this.reglages.miseMin}`);
        if (m > x.tapis) throw new ErreurSalle("Tu n'as pas assez de jetons");
        if (!x.mises[cmd.mise] && Object.keys(x.mises).length >= MAX_MISES) throw new ErreurSalle('Trop de mises sur le tapis');
        x.tapis -= m;
        x.mises[cmd.mise] = (x.mises[cmd.mise] ?? 0) + m;
        x.pret = false;
        this.evenements.push({ t: 'pose', siege: x.siege, mise: cmd.mise, montant: m });
        this.diffuser();
        return;
      }
      case 'retirer': {
        const x = this.exigerMises(j);
        const m = x.mises[cmd.mise];
        if (!m) return;
        // Sans montant : toute la mise. Avec : seulement ce montant (annuler le dernier jeton).
        const r = cmd.montant !== undefined ? Math.min(m, Math.max(0, Math.floor(Number(cmd.montant)) || 0)) : m;
        if (!r) return;
        x.tapis += r;
        if (r >= m) delete x.mises[cmd.mise]; else x.mises[cmd.mise] = m - r;
        x.pret = false;
        this.evenements.push({ t: 'retire', siege: x.siege, mise: cmd.mise, reste: m - r });
        this.diffuser();
        return;
      }
      case 'effacer': {
        const x = this.exigerMises(j);
        for (const mise of Object.keys(x.mises)) this.evenements.push({ t: 'retire', siege: x.siege, mise });
        x.tapis += this.total(x);
        x.mises = {};
        x.pret = false;
        this.diffuser();
        return;
      }
      case 'repeter': {
        const x = this.exigerMises(j);
        // « Rejouer » : les mises du tour d'avant. « Doubler » : double ce qui est sur le tapis (ou les mises d'avant ×2).
        const surTapis = this.total(x) > 0;
        const source = cmd.double && surTapis ? { ...x.mises } : Object.fromEntries(Object.entries(x.precedentes).map(([k2, v]) => [k2, v * (cmd.double ? 2 : 1)]));
        const cout = Object.values(source).reduce((a, v) => a + v, 0);
        if (!cout) throw new ErreurSalle('Aucune mise à rejouer');
        if (cout > x.tapis) throw new ErreurSalle('Pas assez de jetons pour ça');
        for (const [mise, montant] of Object.entries(source)) {
          x.mises[mise] = (x.mises[mise] ?? 0) + montant;
          this.evenements.push({ t: 'pose', siege: x.siege, mise, montant });
        }
        x.tapis -= cout;
        x.pret = false;
        this.diffuser();
        return;
      }
      case 'pret': {
        const x = this.exigerMises(j);
        x.pret = true;
        this.verifierPrets();
        this.diffuser();
        return;
      }
      case 'recave':
        if (!j) throw new ErreurSalle("Tu n'es pas assis");
        if (j.tapis + this.total(j) >= this.reglages.miseMin) throw new ErreurSalle('Recave possible seulement à sec');
        if (this.recavesRestantes(j) <= 0) throw new ErreurSalle('Plus de recave disponible');
        j.tapis += this.reglages.tapisDepart; j.recue += this.reglages.tapisDepart; j.recavesUtilisees++;
        this.annoncer(`${j.membre.nom} se recave`);
        break;
      case 'asseoir': {
        const s = this.spectateurs.get(id);
        if (!s) throw new ErreurSalle('Déjà assis');
        const libres = this.siegesLibres();
        const siege = cmd.siege !== undefined && libres.includes(cmd.siege) ? cmd.siege : libres[0];
        if (siege === undefined) throw new ErreurSalle('Aucune place libre');
        this.asseoir(s.membre, siege);
        break;
      }
      case 'lever': {
        if (!j) return;
        if (this.phase === 'tirage' && this.total(j) > 0) throw new ErreurSalle('Attends la fin du tirage');
        this.rendreMises(j);
        this.joueurs.delete(id);
        this.spectateurs.set(id, { membre: j.membre, connecte: j.connecte });
        if (this.hote === id) this.changerHote();
        this.verifierPrets();
        break;
      }
      case 'lancer':
        this.exigerHote(id);
        if (this.statut !== 'attente') throw new ErreurSalle('Partie déjà lancée');
        this.statut = 'en_jeu';
        this.ouvrirMises();
        return;
      case 'pause':
        this.exigerHote(id);
        if (this.statut !== 'en_jeu') break;
        if (this.phase === 'mises') { this.mettreEnPause(); return; }
        this.enPause = true;
        this.annoncer('Pause demandée : la partie s\'arrête après ce tour');
        break;
      case 'reprendre':
        this.exigerHote(id);
        this.enPause = false;
        if (this.statut === 'pause') { this.statut = 'en_jeu'; this.annoncer('La partie reprend'); this.ouvrirMises(); return; }
        break;
      case 'terminer':
        this.exigerHote(id);
        if (this.statut === 'attente' || this.statut === 'terminee') throw new ErreurSalle('Aucune partie en cours');
        if (this.phase === 'tirage') { this.finDemandee = true; this.annoncer('La partie se termine après ce tour'); }
        else this.terminer();
        return;
      case 'rejouer':
        this.exigerHote(id);
        if (this.phase === 'tirage') throw new ErreurSalle('Attends la fin du tirage');
        for (const x of this.joueurs.values()) Object.assign(x, { tapis: this.reglages.tapisDepart, recue: this.reglages.tapisDepart, recavesUtilisees: 0, mises: {}, precedentes: {}, retour: null, pret: false });
        this.stats.clear(); this.resultats = null; this.numeroTour = 0; this.historique = []; this.numero = null; this.statut = 'en_jeu';
        this.annoncer('On remet ça ! Nouvelle partie avec des jetons neufs');
        this.ouvrirMises();
        return;
      case 'reglages': {
        this.exigerHote(id);
        if (this.phase === 'tirage') throw new ErreurSalle('Attends la fin du tirage');
        const r = { ...cmd.reglages };
        if (this.statut !== 'attente') delete r.tapisDepart;
        if (r.places !== undefined && r.places < Math.max(...[...this.joueurs.values()].map((x) => x.siege + 1), 0)) throw new ErreurSalle('Des joueurs sont assis sur ces places');
        this.reglages = validerRoulette({ ...this.reglages, ...r });
        if (this.statut === 'attente') for (const x of this.joueurs.values()) { x.tapis = x.recue = this.reglages.tapisDepart; }
        this.annoncer('Réglages de la table modifiés');
        break;
      }
      case 'exclure': {
        this.exigerHote(id);
        if (cmd.id === id) throw new ErreurSalle("Impossible de t'exclure toi-même");
        const nom = this.membre(cmd.id)?.nom;
        this.partir(cmd.id);
        this.sortie.envoyer(cmd.id, { type: 'exclu' });
        if (nom) this.annoncer(`${nom} a été exclu de la table`);
        return;
      }
      case 'accorderRecave': {
        this.exigerHote(id);
        const x = this.joueurs.get(cmd.id);
        if (!x) throw new ErreurSalle('Joueur inconnu');
        x.tapis += this.reglages.tapisDepart; x.recue += this.reglages.tapisDepart; x.recavesUtilisees++;
        this.annoncer(`L'hôte offre une recave à ${x.membre.nom}`);
        break;
      }
      case 'chat': {
        const m = this.membre(id);
        if (!m) throw new ErreurSalle("Tu n'es pas à cette table");
        const r = this.social.ecrire(m, cmd.texte, this.horloge.maintenant(), this.reglages.filtreInsultes);
        if (typeof r === 'string') throw new ErreurSalle(r);
        if (!r) return;
        for (const d of this.destinataires()) this.sortie.envoyer(d, { type: 'chat', message: r as MessageChat });
        this.sortie.activite?.(id, 'message');
        return;
      }
      case 'emote': {
        if (!EMOTES.some((e) => e.id === cmd.id)) throw new ErreurSalle('Émote inconnue');
        if (!j && !this.spectateurs.has(id)) return;
        if (!this.social.emoteAutorisee(id, this.horloge.maintenant())) return;
        for (const d of this.destinataires()) this.sortie.envoyer(d, { type: 'emote', siege: j ? j.siege : null, de: id, id: cmd.id });
        this.sortie.activite?.(id, 'emote');
        return;
      }
    }
    this.diffuser();
    this.sortie.modifiee?.(this);
  }

  /* ----------------------------- Déroulement ----------------------------- */

  /** Joueurs dont on attend le « prêt » : connectés et capables de miser. */
  private actifs() { return [...this.joueurs.values()].filter((j) => j.connecte && !j.part && (j.tapis + this.total(j) >= this.reglages.miseMin)); }

  private verifierPrets() {
    if (this.phase !== 'mises' || this.statut !== 'en_jeu') return;
    const a = this.actifs();
    if (a.length && a.every((j) => j.pret)) {
      this.echeance = this.horloge.maintenant() + MARGE_PRETS;
      this.programmer(() => this.fermerMises(), MARGE_PRETS);
    }
  }

  private ouvrirMises() {
    if (this.statut !== 'en_jeu') return;
    if (this.enPause) { this.mettreEnPause(); return; }
    for (const [id, j] of [...this.joueurs]) if (j.part) this.joueurs.delete(id);
    if (this.finDemandee || (this.reglages.tours > 0 && this.numeroTour >= this.reglages.tours)) return this.terminer();
    const peutJouer = [...this.joueurs.values()].some((j) => j.tapis >= this.reglages.miseMin || this.recavesRestantes(j) > 0);
    if (!peutJouer && this.numeroTour > 0) return this.terminer();
    this.phase = 'mises';
    this.numero = null;
    this.evenements = [];
    for (const d of this.destinataires()) this.dejaEnvoye.set(d, 0);
    this.numeroTour++;
    this.evenements.push({ t: 'nouveauTour', numero: this.numeroTour });
    for (const j of this.joueurs.values()) { j.pret = false; j.retour = null; j.mises = {}; }
    if (this.reglages.tempsMises > 0) {
      this.echeance = this.horloge.maintenant() + dureeRoulette(this.evenements) + this.reglages.tempsMises * 1000;
      this.programmer(() => this.fermerMises(), this.echeance - this.horloge.maintenant());
    } else { this.echeance = null; this.annulerMinuterie(); }
    for (const j of this.joueurs.values()) if (j.connecte) this.sortie.tourDe?.(j.membre.id, this);
    this.diffuser();
    this.sortie.modifiee?.(this);
  }

  private mettreEnPause() {
    this.enPause = false;
    this.annulerMinuterie();
    for (const j of this.joueurs.values()) { j.tapis += this.total(j); j.mises = {}; j.pret = false; }
    this.phase = null;
    this.statut = 'pause';
    this.echeance = null;
    this.diffuser();
  }

  private fermerMises() {
    if (this.phase !== 'mises') return;
    const joueurs = [...this.joueurs.values()].filter((j) => this.total(j) > 0);
    if (!joueurs.length) {
      // Personne n'a misé : on garde la table ouverte
      for (const j of this.joueurs.values()) j.pret = false;
      this.echeance = this.reglages.tempsMises > 0 ? this.horloge.maintenant() + this.reglages.tempsMises * 1000 : null;
      if (this.echeance !== null) this.programmer(() => this.fermerMises(), this.reglages.tempsMises * 1000);
      this.annoncer('Personne n\'a misé : faites vos jeux !');
      this.diffuser();
      return;
    }
    this.phase = 'tirage';
    this.echeance = null;
    const numero = tirer(this.rng);
    this.numero = numero;
    this.evenements.push({ t: 'rienNeVaPlus' }, { t: 'tirage', numero, tour: this.numeroTour });
    // Paiement
    for (const j of this.joueurs.values()) {
      const mise = this.total(j);
      if (!mise) { j.retour = null; continue; }
      const r = resoudre(j.mises, numero, this.reglages.partage);
      for (const d of r.detail) {
        if (d.retour > 0) this.evenements.push({ t: 'gain', siege: j.siege, mise: d.id, montant: d.montant, retour: d.retour });
        else this.evenements.push({ t: 'perte', siege: j.siege, mise: d.id, montant: d.montant });
      }
      this.evenements.push({ t: 'bilan', siege: j.siege, mise, retour: r.total });
      j.retour = r.total;
      j.tapis += r.total;
      j.precedentes = { ...j.mises };
      let st = this.stats.get(j.membre.id);
      if (!st) { st = { meilleurGain: 0, pleins: 0, zeros: 0 }; this.stats.set(j.membre.id, st); }
      st.meilleurGain = Math.max(st.meilleurGain, r.total - mise);
      if (r.detail.some((d) => d.retour > 0 && MISES.get(d.id)!.type === 'plein')) st.pleins++;
      if (numero === 0 && j.mises['0']) st.zeros++;
    }
    this.historique.unshift(numero);
    this.historique.length = Math.min(this.historique.length, 40);
    this.diffuser();
    this.programmer(() => { this.phase = 'resultats'; this.diffuser(); this.programmer(() => this.ouvrirMises(), PAUSE_RESULTATS); },
      dureeRoulette(this.evenements.slice(this.evenements.findIndex((e) => e.t === 'rienNeVaPlus'))));
    this.sortie.modifiee?.(this);
  }

  private terminer() {
    this.annulerMinuterie();
    for (const j of this.joueurs.values()) if (this.phase !== 'tirage') { j.tapis += this.total(j); j.mises = {}; }
    this.finDemandee = false;
    this.phase = null;
    this.echeance = null;
    this.statut = 'terminee';
    const classement = [...this.joueurs.values()].filter((j) => !j.part).map((j) => ({ id: j.membre.id, nom: j.membre.nom, avatar: j.membre.avatar, bilan: j.tapis - j.recue, tapis: j.tapis, recue: j.recue }))
      .sort((a, b) => b.bilan - a.bilan || b.tapis - a.tapis);
    const distinctions: ResultatsRoulette['distinctions'] = [];
    if (classement[0] && classement[0].bilan > 0) distinctions.push({ titre: 'Le casse de la banque', id: classement[0].id, detail: `+${classement[0].bilan} jetons` });
    const parStat = (k: keyof StatsRoulette) => [...this.stats.entries()].filter(([id]) => this.joueurs.has(id)).sort((a, b) => b[1][k] - a[1][k])[0];
    const g = parStat('meilleurGain'); if (g && g[1].meilleurGain > 0) distinctions.push({ titre: 'Le coup de la soirée', id: g[0], detail: `+${g[1].meilleurGain} en un tour` });
    const p = parStat('pleins'); if (p && p[1].pleins > 0) distinctions.push({ titre: 'Sniper', id: p[0], detail: `${p[1].pleins} plein${p[1].pleins > 1 ? 's' : ''} touché${p[1].pleins > 1 ? 's' : ''}` });
    const z = parStat('zeros'); if (z && z[1].zeros > 0) distinctions.push({ titre: 'Ami du zéro', id: z[0], detail: `${z[1].zeros} fois sur le zéro` });
    const dernier = classement[classement.length - 1];
    if (classement.length > 1 && dernier.bilan < 0) distinctions.push({ titre: 'Mécène du casino', id: dernier.id, detail: `${dernier.bilan} jetons` });
    this.resultats = { classement, distinctions, tours: this.numeroTour, tapisDepart: this.reglages.tapisDepart };
    this.diffuser();
    this.sortie.modifiee?.(this);
  }

  arreter() { this.annulerMinuterie(); }

  private programmer(fn: () => void, ms: number) {
    this.annulerMinuterie();
    this.minuterie = this.horloge.planifier(() => { this.minuterie = null; fn(); }, Math.max(0, ms));
  }
  private annulerMinuterie() { if (this.minuterie !== null) { this.horloge.annuler(this.minuterie); this.minuterie = null; } }

  /* ----------------------------- Sauvegarde ----------------------------- */

  exporter(): SauvegardeRoulette {
    // Mises posées mais pas encore jouées : rendues à leur propriétaire
    const enMises = this.phase === 'mises';
    return {
      jeu: 'roulette', version: 1, id: this.id, code: this.code, reglages: { ...this.reglages }, statut: this.statut, hote: this.hote,
      numeroTour: enMises ? Math.max(0, this.numeroTour - 1) : this.numeroTour, historique: this.historique.slice(),
      joueurs: [...this.joueurs.values()].filter((j) => !j.part).map((j) => ({
        membre: j.membre, siege: j.siege, tapis: j.tapis + (enMises ? this.total(j) : 0), recue: j.recue, recavesUtilisees: j.recavesUtilisees, arrivee: j.arrivee,
      })),
      stats: [...this.stats.entries()],
    };
  }

  private restaurer(s: SauvegardeRoulette) {
    for (const j of s.joueurs) {
      this.joueurs.set(j.membre.id, { membre: j.membre, siege: j.siege, tapis: j.tapis, recue: j.recue, recavesUtilisees: j.recavesUtilisees, mises: {}, precedentes: {}, retour: null, pret: false, connecte: false, arrivee: j.arrivee });
      this.compteurArrivee = Math.max(this.compteurArrivee, j.arrivee + 1);
    }
    this.numeroTour = s.numeroTour;
    this.historique = s.historique ?? [];
    this.stats = new Map(s.stats);
    this.statut = s.statut === 'en_jeu' ? 'pause' : s.statut;
    if (this.statut === 'terminee') this.terminer();
    if (!this.joueurs.has(this.hote)) this.changerHote();
  }

  /* ----------------------------- Vues ----------------------------- */

  private annoncer(texte: string) { for (const d of this.destinataires()) this.sortie.envoyer(d, { type: 'info', texte }); }
  private destinataires() {
    return [...[...this.joueurs.entries()].filter(([, j]) => j.connecte).map(([id]) => id), ...[...this.spectateurs.entries()].filter(([, s]) => s.connecte).map(([id]) => id)];
  }
  private envoyerChat(id: string) { if (this.social.messages.length) this.sortie.envoyer(id, { type: 'chatHistorique', messages: this.social.messages.slice(-30) as MessageChat[] }); }

  diffuser() {
    for (const id of this.destinataires()) {
      const deja = this.dejaEnvoye.get(id);
      const depuis = deja ?? this.evenements.length;
      this.dejaEnvoye.set(id, this.evenements.length);
      this.sortie.envoyer(id, { type: 'majRoulette', evenements: this.evenements.slice(depuis), etat: this.vue(id) });
    }
  }

  vue(id: string): VueRoulette {
    const moi = this.joueurs.get(id);
    const sieges: (VueSiegeRoulette | null)[] = Array.from({ length: this.reglages.places }, () => null);
    // Pendant le tirage, le numéro n'est connu des écrans qu'à travers l'animation : on le transmet quand même,
    // l'interface attend la fin de la roue pour l'afficher.
    for (const j of this.joueurs.values()) {
      if (j.siege >= sieges.length || j.part) continue;
      sieges[j.siege] = {
        siege: j.siege, id: j.membre.id, nom: j.membre.nom, avatar: j.membre.avatar, cadre: j.membre.cadre ?? 'aucun',
        tapis: j.tapis, recue: j.recue, recavesRestantes: this.recavesRestantes(j), deconnecte: !j.connecte,
        pret: j.pret, mises: { ...j.mises }, totalMise: this.total(j), retour: this.phase === 'mises' ? null : j.retour,
        precedentes: j.membre.id === id ? { ...j.precedentes } : {},
      };
    }
    return {
      jeu: 'roulette', id: this.id, code: this.code, reglages: { ...this.reglages }, statut: this.statut, hote: this.hote, moi: id,
      monSiege: moi && !moi.part ? moi.siege : null, sieges,
      spectateurs: [...this.spectateurs.values()].map((s) => ({ id: s.membre.id, nom: s.membre.nom })),
      numeroTour: this.numeroTour, phase: this.phase,
      resteMs: this.echeance !== null ? Math.max(0, this.echeance - this.horloge.maintenant()) : null,
      numero: this.phase === 'mises' ? null : this.numero,
      historique: this.historique.slice(0, 18),
      resultats: this.statut === 'terminee' ? this.resultats : null,
    };
  }

  resume() {
    const hote = this.joueurs.get(this.hote)?.membre;
    return {
      jeu: 'roulette' as const, id: this.id, nom: this.reglages.nom, hote: hote?.nom ?? '?', visibilite: this.reglages.visibilite,
      joueurs: this.joueurs.size, humains: this.joueurs.size, places: this.reglages.places, pb: this.reglages.miseMin, gb: 0,
      statut: this.statut, debut: null as number | null, avatars: [...this.joueurs.values()].map((j) => j.membre.avatar),
    };
  }
}
