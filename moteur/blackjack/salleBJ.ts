/**
 * Salle de Black Jack : tous contre le croupier, jusqu'à 6 joueurs.
 * Même principe que la salle de poker : elle tourne sur le serveur (en ligne) ou dans le navigateur (solo).
 */
import { Carte, Rng } from '../cartes.js';
import { AvatarId } from '../avatars.js';
import { Membre, Horloge, horlogeSysteme, ErreurSalle, Statut, MessageChat } from '../salle.js';
import { EMOTES, GestionSocial } from '../social.js';
import { Sabot, Manche, demarrerManche, agirBJ, assurer, fermerAssurance, legalesBJ, LegalesBJ, ActionBJ, ActionBJIllegale, EvenementBJ, valeurMain, Issue } from './regles.js';

export interface ReglagesBJ {
  nom: string;
  visibilite: 'publique' | 'privee';
  tapisDepart: number;
  miseMin: number;
  miseMax: number;
  places: number;          // 1 à 6
  recaves: 'interdites' | 'illimitees' | number;
  manches: number;         // 0 = illimité
  tempsReflexion: number;  // secondes, 0 = illimité
  filtreInsultes: boolean;
  abandon: boolean;
}

export const REGLAGES_BJ_DEFAUT: Omit<ReglagesBJ, 'nom'> = {
  visibilite: 'publique', tapisDepart: 1000, miseMin: 10, miseMax: 500, places: 6, recaves: 2, manches: 30,
  tempsReflexion: 20, filtreInsultes: true, abandon: true,
};

export function validerBJ(r: ReglagesBJ): ReglagesBJ {
  const ent = (x: unknown, min: number, max: number, def: number) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  const miseMin = ent(r.miseMin, 1, 100_000, 10);
  return {
    nom: String(r.nom ?? 'Black Jack').trim().slice(0, 30) || 'Black Jack',
    visibilite: r.visibilite === 'privee' ? 'privee' : 'publique',
    tapisDepart: ent(r.tapisDepart, 100, 10_000_000, 1000),
    miseMin,
    miseMax: Math.max(miseMin, ent(r.miseMax, miseMin, 10_000_000, miseMin * 50)),
    places: ent(r.places, 1, 6, 6),
    recaves: r.recaves === 'illimitees' || r.recaves === 'interdites' ? r.recaves : ent(r.recaves, 1, 5, 2),
    manches: ent(r.manches, 0, 500, 30),
    tempsReflexion: [0, 10, 20, 30].includes(Number(r.tempsReflexion)) ? Number(r.tempsReflexion) : 20,
    filtreInsultes: r.filtreInsultes !== false,
    abandon: r.abandon !== false,
  };
}

/* ------------------------------------------------------------------ */

export type PhaseBJ = 'mises' | 'assurance' | 'jeu' | 'croupier' | 'resultats';

export interface VueMainBJ { cartes: Carte[]; mise: number; double: boolean; issue: Issue | null; retour: number; total: number; souple: boolean }

export interface VueSiegeBJ {
  siege: number; id: string; nom: string; avatar: AvatarId; cadre: string;
  tapis: number; recue: number; recavesRestantes: number;
  mise: number; pret: boolean; deconnecte: boolean;
  mains: VueMainBJ[]; assurance: number;
}

export interface ResultatsBJ {
  classement: { id: string; nom: string; avatar: AvatarId; bilan: number; tapis: number; recue: number }[];
  distinctions: { titre: string; id: string; detail: string }[];
  manches: number;
  tapisDepart: number;
}

export interface VueBJ {
  jeu: 'blackjack';
  id: string; code: string; reglages: ReglagesBJ; statut: Statut; hote: string; moi: string; monSiege: number | null;
  sieges: (VueSiegeBJ | null)[];
  spectateurs: { id: string; nom: string }[];
  numeroManche: number;
  phase: PhaseBJ | null;
  croupier: { cartes: (Carte | null)[]; total: number | null; souple: boolean };
  aParler: { siege: number; main: number } | null;
  resteMs: number | null;
  legales: LegalesBJ | null;
  assuranceAMoi: boolean;
  resultats: ResultatsBJ | null;
  sabot: number;
}

export type EvenementBJPublic = EvenementBJ | { t: 'nouvelleManche'; numero: number } | { t: 'mise'; siege: number; montant: number } | { t: 'melange' };

export type CommandeBJ =
  | { c: 'miser'; montant: number }
  | { c: 'decision'; action: ActionBJ }
  | { c: 'assurance'; oui: boolean }
  | { c: 'recave' }
  | { c: 'asseoir'; siege?: number }
  | { c: 'lever' }
  | { c: 'lancer' } | { c: 'pause' } | { c: 'reprendre' } | { c: 'terminer' } | { c: 'rejouer' }
  | { c: 'reglages'; reglages: Partial<ReglagesBJ> }
  | { c: 'exclure'; id: string }
  | { c: 'accorderRecave'; id: string }
  | { c: 'chat'; texte: string }
  | { c: 'emote'; id: string };

export type MessageBJ =
  | { type: 'majBJ'; evenements: EvenementBJPublic[]; etat: VueBJ }
  | { type: 'info'; texte: string }
  | { type: 'erreur'; texte: string }
  | { type: 'exclu' }
  | { type: 'chat'; message: MessageChat }
  | { type: 'chatHistorique'; messages: MessageChat[] }
  | { type: 'emote'; siege: number | null; de: string; id: string };

export interface SortieBJ {
  envoyer(id: string, msg: MessageBJ): void;
  activite?(id: string, type: 'message' | 'emote'): void;
  modifiee?(salle: SalleBJ): void;
  vide?(salle: SalleBJ): void;
  tourDe?(id: string, salle: SalleBJ): void;
}

export interface SauvegardeBJ {
  jeu: 'blackjack'; version: 1;
  id: string; code: string; reglages: ReglagesBJ; statut: Statut; hote: string; numeroManche: number;
  joueurs: { membre: Membre; siege: number; tapis: number; recue: number; recavesUtilisees: number; arrivee: number }[];
  stats: [string, StatsPartieBJ][];
}

interface StatsPartieBJ { blackjacks: number; gagnees: number; doublesGagnes: number }
interface JoueurBJ { membre: Membre; siege: number; tapis: number; recue: number; recavesUtilisees: number; mise: number; pret: boolean; connecte: boolean; arrivee: number }

const RYTHME_BJ: Partial<Record<EvenementBJPublic['t'], number>> = {
  donne: 380, revele: 650, resultat: 380, action: 250, separe: 450, assurance: 300, resultatAssurance: 400,
  blackjackCroupier: 900, melange: 1400, mise: 250, nouvelleManche: 300,
};
export const dureeBJ = (evts: EvenementBJPublic[]) => evts.reduce((s, e) => s + (RYTHME_BJ[e.t] ?? 0), 0);

const TEMPS_MISES = 15_000, TEMPS_ASSURANCE = 9_000, PAUSE_RESULTATS = 2600;

/* ------------------------------------------------------------------ */

export class SalleBJ {
  readonly jeu = 'blackjack' as const;
  readonly id: string;
  readonly code: string;
  reglages: ReglagesBJ;
  statut: Statut = 'attente';
  hote: string;
  derniereActivite = Date.now();
  private joueurs = new Map<string, JoueurBJ>();
  private spectateurs = new Map<string, { membre: Membre; connecte: boolean }>();
  private partis = new Map<string, Membre>();
  private sortie: SortieBJ;
  private horloge: Horloge;
  private rng: Rng;
  private sabot: Sabot;
  private manche: Manche | null = null;
  private phase: PhaseBJ | null = null;
  private numeroManche = 0;
  private evenements: EvenementBJPublic[] = [];
  private dejaEnvoye = new Map<string, number>();
  private minuterie: unknown = null;
  private echeance: number | null = null;
  private occupeJusqua = 0;
  private compteurArrivee = 0;
  private finDemandee = false;
  private enPause = false;
  private resultats: ResultatsBJ | null = null;
  private stats = new Map<string, StatsPartieBJ>();
  private social = new GestionSocial();

  constructor(opts: { id: string; code: string; hote: Membre; reglages: ReglagesBJ; sortie: SortieBJ; horloge?: Horloge; rng?: Rng; sauvegarde?: SauvegardeBJ }) {
    this.id = opts.id;
    this.code = opts.code;
    this.reglages = validerBJ({ ...opts.reglages });
    this.sortie = opts.sortie;
    this.horloge = opts.horloge ?? horlogeSysteme;
    this.rng = opts.rng ?? ((n) => Math.floor(Math.random() * n));
    this.sabot = new Sabot(6, this.rng);
    this.hote = opts.hote.id;
    if (opts.sauvegarde) { this.restaurer(opts.sauvegarde); return; }
    this.rejoindre(opts.hote);
  }

  /* ----------------------------- Membres ----------------------------- */

  get nbConnectes() { return [...this.joueurs.values()].filter((j) => j.connecte).length + [...this.spectateurs.values()].filter((s) => s.connecte).length; }
  estMembre(id: string) { return this.joueurs.has(id) || this.spectateurs.has(id); }
  private membre(id: string): Membre | undefined { return this.joueurs.get(id)?.membre ?? this.spectateurs.get(id)?.membre ?? this.partis.get(id); }

  private siegesLibres(): number[] {
    const pris = new Set([...this.joueurs.values()].map((j) => j.siege));
    return Array.from({ length: this.reglages.places }, (_, i) => i).filter((i) => !pris.has(i));
  }

  rejoindre(m: Membre) {
    this.derniereActivite = Date.now();
    this.envoyerChat(m.id);
    const j = this.joueurs.get(m.id);
    if (j) { j.connecte = true; j.membre = m; this.dejaEnvoye.delete(m.id); this.diffuser(); return; }
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
    this.joueurs.set(m.id, { membre: m, siege, tapis: this.reglages.tapisDepart, recue: this.reglages.tapisDepart, recavesUtilisees: 0, mise: 0, pret: false, connecte: true, arrivee: this.compteurArrivee++ });
    this.spectateurs.delete(m.id);
  }

  partir(id: string) {
    if (this.spectateurs.delete(id)) { this.diffuser(); return; }
    const j = this.joueurs.get(id);
    if (!j) return;
    // Pendant une manche, ses mains en cours sont jouées « rester » automatiquement
    if (this.manche && this.manche.phase !== 'terminee' && this.manche.joueurs.some((x) => x.id === id)) {
      this.partis.set(id, j.membre);
      j.connecte = false;
      (j as JoueurBJ & { part?: boolean }).part = true;
      this.planifier();
    } else this.joueurs.delete(id);
    if (this.hote === id) this.changerHote();
    if (![...this.joueurs.values()].some((x) => !(x as JoueurBJ & { part?: boolean }).part)) {
      this.arreter();
      if (this.statut === 'en_jeu') this.statut = 'pause';
      this.diffuser();
      if (!this.spectateurs.size) this.sortie.vide?.(this);
      return;
    }
    this.diffuser();
  }

  connexion(id: string, connecte: boolean) {
    this.derniereActivite = Date.now();
    const j = this.joueurs.get(id);
    if (j) j.connecte = connecte;
    if (!connecte) { const s = this.spectateurs.get(id); if (s) this.spectateurs.delete(id); }
    else { this.dejaEnvoye.delete(id); this.envoyerChat(id); }
    this.diffuser();
    if (j && !connecte) this.planifier();
  }

  private changerHote() {
    const s = [...this.joueurs.values()].filter((j) => !(j as JoueurBJ & { part?: boolean }).part).sort((a, b) => a.arrivee - b.arrivee)[0];
    if (s) { this.hote = s.membre.id; this.annoncer(`${s.membre.nom} devient l'hôte de la table`); }
  }

  /* ----------------------------- Commandes ----------------------------- */

  commande(id: string, cmd: CommandeBJ) {
    try { this.executer(id, cmd); }
    catch (e) {
      if (e instanceof ErreurSalle || e instanceof ActionBJIllegale) { this.sortie.envoyer(id, { type: 'erreur', texte: e.message }); return; }
      throw e;
    }
  }

  private exigerHote(id: string) { if (id !== this.hote) throw new ErreurSalle("Seul l'hôte peut faire ça"); }

  private recavesRestantes(j: JoueurBJ) {
    const r = this.reglages.recaves;
    return r === 'illimitees' ? 99 : r === 'interdites' ? 0 : Math.max(0, r - j.recavesUtilisees);
  }

  private executer(id: string, cmd: CommandeBJ) {
    const j = this.joueurs.get(id);
    switch (cmd.c) {
      case 'miser': {
        if (!j) throw new ErreurSalle("Tu n'es pas assis");
        if (this.phase !== 'mises') throw new ErreurSalle('Les mises sont fermées');
        const m = Math.floor(Number(cmd.montant));
        if (m === 0) { j.mise = 0; j.pret = true; }
        else {
          if (!(m >= this.reglages.miseMin)) throw new ErreurSalle(`Mise minimum : ${this.reglages.miseMin}`);
          if (m > this.reglages.miseMax) throw new ErreurSalle(`Mise maximum : ${this.reglages.miseMax}`);
          if (m > j.tapis) throw new ErreurSalle("Tu n'as pas assez de jetons");
          j.mise = m; j.pret = true;
          this.evenements.push({ t: 'mise', siege: j.siege, montant: m });
        }
        if (this.tousPrets()) this.programmer(() => this.distribuer(), 350);
        this.diffuser();
        return;
      }
      case 'decision': {
        if (!j || !this.manche) throw new ErreurSalle('Pas de manche en cours');
        const cout = agirBJ(this.manche, this.sabot, j.siege, cmd.action, j.tapis);
        j.tapis -= cout;
        this.apresManche();
        return;
      }
      case 'assurance': {
        if (!j || !this.manche) throw new ErreurSalle('Pas de manche en cours');
        const mj = this.manche.joueurs.find((x) => x.id === id);
        if (!mj || mj.assuranceDecidee) return;
        const cout = Math.floor(mj.mains[0].mise / 2);
        assurer(this.manche, this.sabot, j.siege, cmd.oui && j.tapis >= cout);
        if (mj.assurance) j.tapis -= mj.assurance;
        this.apresManche();
        return;
      }
      case 'recave':
        if (!j) throw new ErreurSalle("Tu n'es pas assis");
        if (j.tapis >= this.reglages.miseMin) throw new ErreurSalle('Recave possible seulement à sec');
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
        if (this.manche && this.manche.phase !== 'terminee' && this.manche.joueurs.some((x) => x.id === id)) throw new ErreurSalle('Attends la fin de la manche');
        this.joueurs.delete(id);
        this.spectateurs.set(id, { membre: j.membre, connecte: j.connecte });
        if (this.hote === id) this.changerHote();
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
        if (this.statut === 'en_jeu') { this.enPause = true; this.annoncer('Pause demandée : la partie s\'arrête après cette manche'); if (this.phase === 'mises') this.mettreEnPause(); }
        break;
      case 'reprendre':
        this.exigerHote(id);
        this.enPause = false;
        if (this.statut === 'pause') { this.statut = 'en_jeu'; this.annoncer('La partie reprend'); this.ouvrirMises(); return; }
        break;
      case 'terminer':
        this.exigerHote(id);
        if (this.statut === 'attente' || this.statut === 'terminee') throw new ErreurSalle('Aucune partie en cours');
        if (this.manche && this.manche.phase !== 'terminee') { this.finDemandee = true; this.annoncer('La partie se termine après cette manche'); }
        else this.terminer();
        break;
      case 'rejouer':
        this.exigerHote(id);
        if (this.manche && this.manche.phase !== 'terminee') throw new ErreurSalle('Attends la fin de la manche');
        for (const x of this.joueurs.values()) Object.assign(x, { tapis: this.reglages.tapisDepart, recue: this.reglages.tapisDepart, recavesUtilisees: 0 });
        this.stats.clear(); this.resultats = null; this.numeroManche = 0; this.statut = 'en_jeu';
        this.annoncer('On remet ça ! Nouvelle partie avec des tapis neufs');
        this.ouvrirMises();
        return;
      case 'reglages': {
        this.exigerHote(id);
        if (this.manche && this.manche.phase !== 'terminee') throw new ErreurSalle('Attends la fin de la manche');
        const r = { ...cmd.reglages };
        if (this.statut !== 'attente') delete r.tapisDepart;
        if (r.places !== undefined && r.places < Math.max(...[...this.joueurs.values()].map((x) => x.siege + 1), 0)) throw new ErreurSalle('Des joueurs sont assis sur ces places');
        this.reglages = validerBJ({ ...this.reglages, ...r });
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
        if (!m || (!j && !this.spectateurs.has(id))) throw new ErreurSalle("Tu n'es pas à cette table");
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

  private eligibles(): JoueurBJ[] {
    return [...this.joueurs.values()].filter((j) => j.connecte && !(j as JoueurBJ & { part?: boolean }).part && j.tapis >= this.reglages.miseMin);
  }

  private tousPrets() {
    const e = this.eligibles();
    return e.length > 0 && e.every((j) => j.pret);
  }

  private ouvrirMises() {
    if (this.statut !== 'en_jeu') return;
    if (this.enPause) { this.mettreEnPause(); return; }
    // Joueurs partis pendant la manche : on libère leur place
    for (const [id, j] of [...this.joueurs]) if ((j as JoueurBJ & { part?: boolean }).part) this.joueurs.delete(id);
    if (this.finDemandee || (this.reglages.manches > 0 && this.numeroManche >= this.reglages.manches)) return this.terminer();
    const peutJouer = [...this.joueurs.values()].some((j) => j.tapis >= this.reglages.miseMin || this.recavesRestantes(j) > 0);
    if (!peutJouer && this.numeroManche > 0) return this.terminer();
    this.manche = null;
    this.phase = 'mises';
    this.evenements = [];
    for (const d of this.destinataires()) this.dejaEnvoye.set(d, 0);
    if (this.sabot.aRemelanger) { this.sabot.melanger(); this.evenements.push({ t: 'melange' }); }
    this.numeroManche++;
    this.evenements.push({ t: 'nouvelleManche', numero: this.numeroManche });
    for (const j of this.joueurs.values()) { j.pret = false; j.mise = Math.min(j.mise || this.reglages.miseMin, j.tapis); }
    const debut = this.horloge.maintenant() + dureeBJ(this.evenements);
    this.occupeJusqua = debut;
    // Temps illimité (solo notamment) : on attend que chacun ait misé ou passé
    if (this.reglages.tempsReflexion > 0) {
      this.echeance = debut + TEMPS_MISES;
      this.programmer(() => this.distribuer(), this.echeance - this.horloge.maintenant());
    } else this.echeance = null;
    this.diffuser();
    this.sortie.modifiee?.(this);
  }

  private mettreEnPause() {
    this.enPause = false;
    this.annulerMinuterie();
    this.phase = null;
    this.statut = 'pause';
    this.echeance = null;
    this.diffuser();
  }

  private distribuer() {
    if (this.phase !== 'mises') return;
    const mises = [...this.joueurs.values()].filter((j) => j.pret && j.mise >= this.reglages.miseMin && j.mise <= j.tapis && j.connecte);
    if (!mises.length) {
      // Personne n'a misé : on attend la prochaine ouverture
      this.annoncer('Personne n\'a misé : nouvelle tentative');
      this.numeroManche--;
      this.programmer(() => this.ouvrirMises(), 1500);
      return;
    }
    for (const j of mises) j.tapis -= j.mise;
    this.manche = demarrerManche(this.sabot, mises.map((j) => ({ siege: j.siege, id: j.membre.id, mise: j.mise })), { abandon: this.reglages.abandon });
    this.phase = this.manche.phase === 'assurance' ? 'assurance' : 'jeu';
    this.echeance = null;
    this.apresManche();
  }

  /** Après chaque changement de la manche : événements, paiements, suite. */
  private apresManche() {
    const m = this.manche!;
    const deja = this.evenements.filter((e) => e.t !== 'nouvelleManche' && e.t !== 'mise' && e.t !== 'melange').length;
    const nouveaux = m.evenements.slice(deja);
    this.evenements.push(...nouveaux);
    const t = this.horloge.maintenant();
    this.occupeJusqua = Math.max(this.occupeJusqua, t) + dureeBJ(nouveaux);
    this.phase = m.phase === 'terminee' ? 'resultats' : m.phase;
    if (m.phase === 'terminee') this.payer(m);
    this.diffuser();
    this.planifier();
  }

  private payer(m: Manche) {
    for (const mj of m.joueurs) {
      const j = this.joueurs.get(mj.id);
      const total = mj.mains.reduce((s, x) => s + x.retour, 0) + mj.retourAssurance;
      if (j) j.tapis += total;
      let st = this.stats.get(mj.id);
      if (!st) { st = { blackjacks: 0, gagnees: 0, doublesGagnes: 0 }; this.stats.set(mj.id, st); }
      for (const x of mj.mains) {
        if (x.issue === 'blackjack') st.blackjacks++;
        if (x.issue === 'gagne' || x.issue === 'blackjack') st.gagnees++;
        if (x.issue === 'gagne' && x.double) st.doublesGagnes++;
      }
    }
    this.sortie.modifiee?.(this);
  }

  private planifier() {
    this.annulerMinuterie();
    if (this.statut !== 'en_jeu' || !this.manche) return;
    const m = this.manche;
    const t = this.horloge.maintenant();
    const attente = Math.max(0, this.occupeJusqua - t);
    if (m.phase === 'terminee') {
      this.echeance = null;
      this.programmer(() => this.ouvrirMises(), attente + PAUSE_RESULTATS);
      return;
    }
    if (m.phase === 'assurance') {
      // Les joueurs absents refusent d'office
      for (const mj of m.joueurs) { const j = this.joueurs.get(mj.id); if (!j?.connecte && !mj.assuranceDecidee) assurer(m, this.sabot, mj.siege, false); }
      if (m.phase !== 'assurance') return this.apresManche();
      this.echeance = t + attente + TEMPS_ASSURANCE;
      this.programmer(() => { if (this.manche === m && m.phase === 'assurance') { fermerAssurance(m, this.sabot); this.apresManche(); } }, this.echeance - t);
      return;
    }
    if (m.phase === 'jeu' && m.aParler) {
      const mj = m.joueurs.find((x) => x.siege === m.aParler!.siege)!;
      const j = this.joueurs.get(mj.id);
      const qui = m.aParler;
      const auto = () => { if (this.manche === m && m.aParler === qui) { agirBJ(m, this.sabot, qui.siege, 'rester', 0); this.apresManche(); } };
      if (!j || !j.connecte) { this.echeance = null; this.programmer(auto, attente + 1200); return; }
      this.sortie.tourDe?.(mj.id, this);
      const tr = this.reglages.tempsReflexion;
      if (tr <= 0) { this.echeance = null; return; }
      this.echeance = t + attente + tr * 1000;
      this.programmer(auto, this.echeance - t);
    }
  }

  private terminer() {
    this.annulerMinuterie();
    this.finDemandee = false;
    this.manche = null;
    this.phase = null;
    this.echeance = null;
    this.statut = 'terminee';
    const classement = [...this.joueurs.values()].map((j) => ({ id: j.membre.id, nom: j.membre.nom, avatar: j.membre.avatar, bilan: j.tapis - j.recue, tapis: j.tapis, recue: j.recue }))
      .sort((a, b) => b.bilan - a.bilan || b.tapis - a.tapis);
    const distinctions: ResultatsBJ['distinctions'] = [];
    if (classement[0] && classement[0].bilan > 0) distinctions.push({ titre: 'Le casse de la banque', id: classement[0].id, detail: `+${classement[0].bilan} jetons` });
    const parStat = (k: keyof StatsPartieBJ) => [...this.stats.entries()].filter(([id]) => this.joueurs.has(id)).sort((a, b) => b[1][k] - a[1][k])[0];
    const bj = parStat('blackjacks'); if (bj && bj[1].blackjacks > 0) distinctions.push({ titre: 'Roi du Black Jack', id: bj[0], detail: `${bj[1].blackjacks} Black Jack` });
    const db = parStat('doublesGagnes'); if (db && db[1].doublesGagnes > 0) distinctions.push({ titre: 'Le culotté', id: db[0], detail: `${db[1].doublesGagnes} doubles gagnés` });
    const dernier = classement[classement.length - 1];
    if (classement.length > 1 && dernier.bilan < 0) distinctions.push({ titre: 'Mécène du casino', id: dernier.id, detail: `${dernier.bilan} jetons` });
    this.resultats = { classement, distinctions, manches: this.numeroManche, tapisDepart: this.reglages.tapisDepart };
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

  exporter(): SauvegardeBJ {
    // Une manche en cours est annulée : chacun récupère sa mise
    const enCours = this.manche && this.manche.phase !== 'terminee' ? this.manche : null;
    return {
      jeu: 'blackjack', version: 1, id: this.id, code: this.code, reglages: { ...this.reglages }, statut: this.statut, hote: this.hote,
      numeroManche: enCours ? this.numeroManche - 1 : this.numeroManche,
      joueurs: [...this.joueurs.values()].filter((j) => !(j as JoueurBJ & { part?: boolean }).part).map((j) => {
        const mj = enCours?.joueurs.find((x) => x.id === j.membre.id);
        const engage = mj ? mj.mains.reduce((s, x) => s + x.mise, 0) + mj.assurance : 0;
        return { membre: j.membre, siege: j.siege, tapis: j.tapis + engage, recue: j.recue, recavesUtilisees: j.recavesUtilisees, arrivee: j.arrivee };
      }),
      stats: [...this.stats.entries()],
    };
  }

  private restaurer(s: SauvegardeBJ) {
    for (const j of s.joueurs) {
      this.joueurs.set(j.membre.id, { membre: j.membre, siege: j.siege, tapis: j.tapis, recue: j.recue, recavesUtilisees: j.recavesUtilisees, mise: 0, pret: false, connecte: false, arrivee: j.arrivee });
      this.compteurArrivee = Math.max(this.compteurArrivee, j.arrivee + 1);
    }
    this.numeroManche = s.numeroManche;
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
      this.sortie.envoyer(id, { type: 'majBJ', evenements: this.evenements.slice(depuis), etat: this.vue(id) });
    }
  }

  vue(id: string): VueBJ {
    const m = this.manche;
    const moi = this.joueurs.get(id);
    const sieges: (VueSiegeBJ | null)[] = Array.from({ length: this.reglages.places }, () => null);
    for (const j of this.joueurs.values()) {
      if (j.siege >= sieges.length) continue;
      const mj = m?.joueurs.find((x) => x.id === j.membre.id);
      sieges[j.siege] = {
        siege: j.siege, id: j.membre.id, nom: j.membre.nom, avatar: j.membre.avatar, cadre: j.membre.cadre ?? 'aucun',
        tapis: j.tapis, recue: j.recue, recavesRestantes: this.recavesRestantes(j),
        mise: this.phase === 'mises' ? (j.pret ? j.mise : 0) : 0, pret: j.pret, deconnecte: !j.connecte,
        mains: (mj?.mains ?? []).map((x) => { const v = valeurMain(x.cartes); return { cartes: x.cartes.slice(), mise: x.mise, double: x.double, issue: x.issue, retour: x.retour, total: v.total, souple: v.souple }; }),
        assurance: mj?.assurance ?? 0,
      };
    }
    const croupier = m ? (m.cacheeRevelee ? m.croupier.slice() : [...m.croupier, null]) : [];
    const visibles = croupier.filter((c): c is Carte => c !== null);
    const vc = visibles.length ? valeurMain(visibles) : null;
    const moiManche = m && moi ? m.joueurs.find((x) => x.id === id) : undefined;
    const t = this.horloge.maintenant();
    return {
      jeu: 'blackjack', id: this.id, code: this.code, reglages: { ...this.reglages }, statut: this.statut, hote: this.hote, moi: id,
      monSiege: moi ? moi.siege : null, sieges,
      spectateurs: [...this.spectateurs.values()].map((s) => ({ id: s.membre.id, nom: s.membre.nom })),
      numeroManche: this.numeroManche, phase: this.phase,
      croupier: { cartes: croupier, total: vc ? vc.total : null, souple: !!vc?.souple },
      aParler: m && m.phase === 'jeu' ? m.aParler : null,
      resteMs: this.echeance !== null ? Math.max(0, this.echeance - t) : null,
      legales: m && moi && m.aParler?.siege === moi.siege ? legalesBJ(m, moi.tapis) : null,
      assuranceAMoi: !!(m && m.phase === 'assurance' && moiManche && !moiManche.assuranceDecidee),
      resultats: this.statut === 'terminee' ? this.resultats : null,
      sabot: this.sabot.proportionRestante,
    };
  }

  resume() {
    const hote = this.joueurs.get(this.hote)?.membre;
    return {
      jeu: 'blackjack' as const, id: this.id, nom: this.reglages.nom, hote: hote?.nom ?? '?', visibilite: this.reglages.visibilite,
      joueurs: this.joueurs.size, humains: this.joueurs.size, places: this.reglages.places, pb: this.reglages.miseMin, gb: this.reglages.miseMax,
      statut: this.statut, debut: null as number | null, avatars: [...this.joueurs.values()].map((j) => j.membre.avatar),
    };
  }
}
