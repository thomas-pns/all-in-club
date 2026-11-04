/**
 * Table de cash game : sièges, bouton, blindes, arrivées, absences, recaves.
 * Elle prépare chaque main pour `demarrerMain` puis met les tapis à jour à la fin.
 */
import { Rng } from './cartes.js';
import { Action, EtatMain, agir, demarrerMain, Blinde } from './main.js';

export const SIEGES = 6;

export interface ReglagesTable {
  tapisDepart: number;
  pb: number;
  gb: number;
  places: number;              // 2 à 6
  recaves: 'interdites' | 'illimitees' | number;
}

export interface JoueurTable {
  id: string;
  nom: string;
  bot: boolean;
  siege: number;
  tapis: number;
  recue: number;               // tapis de départ + recaves reçues
  recavesUtilisees: number;
  absent: boolean;             // ne reçoit pas de cartes
  attendGB: boolean;           // nouveau ou de retour : attend la grosse blinde
  posteGB: boolean;            // a choisi de payer une grosse blinde pour jouer tout de suite
  pbManquee: boolean;
  gbManquee: boolean;
  quitte: boolean;             // part à la fin de la main en cours
  aJoue: boolean;              // a déjà reçu des cartes (un nouveau venu ne peut pas prendre le bouton)
  toujoursMontrer: boolean;
}

export class ErreurTable extends Error {}

export class Table {
  reglages: ReglagesTable;
  sieges: (JoueurTable | null)[] = Array(SIEGES).fill(null);
  bouton = -1;
  main: EtatMain | null = null;
  numeroMain = 0;
  /** Joueurs présents dans la main en cours (sièges). */
  dansLaMain: number[] = [];

  constructor(reglages: ReglagesTable) {
    this.reglages = { ...reglages };
  }

  get joueurs(): JoueurTable[] {
    return this.sieges.filter((p): p is JoueurTable => p !== null);
  }

  joueur(id: string): JoueurTable | undefined {
    return this.joueurs.find((p) => p.id === id);
  }

  siegesLibres(): number[] {
    const r: number[] = [];
    for (let i = 0; i < this.reglages.places; i++) if (!this.sieges[i]) r.push(i);
    return r;
  }

  /** Asseoir un joueur avec un tapis de départ. */
  asseoir(id: string, nom: string, opts: { siege?: number; bot?: boolean } = {}): JoueurTable {
    if (this.joueur(id)) throw new ErreurTable('Déjà assis à cette table');
    const libres = this.siegesLibres();
    const siege = opts.siege ?? libres[0];
    if (siege === undefined || !libres.includes(siege)) throw new ErreurTable('Aucune place libre');
    // Pendant la partie (une main déjà jouée), un nouveau venu attend la grosse blinde.
    const enCours = this.numeroMain > 0;
    const p: JoueurTable = {
      id, nom, bot: !!opts.bot, siege, tapis: this.reglages.tapisDepart, recue: this.reglages.tapisDepart,
      recavesUtilisees: 0, absent: false, attendGB: enCours, posteGB: false, pbManquee: false, gbManquee: false,
      quitte: false, toujoursMontrer: false, aJoue: false,
    };
    this.sieges[siege] = p;
    return p;
  }

  /** Quitter : immédiatement hors main, sinon à la fin de la main (le joueur se couche s'il doit parler). */
  quitter(id: string): void {
    const p = this.joueur(id);
    if (!p) return;
    if (this.main && this.dansLaMain.includes(p.siege) && this.main.phase !== 'terminee') {
      p.quitte = true;
      const mj = this.main.joueurs.find((x) => x.siege === p.siege);
      if (mj && !mj.couche && this.main.aParler === p.siege) this.agir(id, { type: 'coucher' });
      return;
    }
    this.sieges[p.siege] = null;
  }

  sAbsenter(id: string): void {
    const p = this.joueur(id);
    if (p) p.absent = true;
  }

  /** Revenir. `posterMaintenant` : payer les blindes manquées pour rejouer dès la main suivante. */
  revenir(id: string, posterMaintenant: boolean): void {
    const p = this.joueur(id);
    if (!p) return;
    p.absent = false;
    if (p.pbManquee || p.gbManquee) {
      p.attendGB = !posterMaintenant;
      p.posteGB = posterMaintenant;
    }
  }

  /** Nouveau venu qui choisit de payer une grosse blinde pour jouer tout de suite. */
  posterPourEntrer(id: string): void {
    const p = this.joueur(id);
    if (p && p.attendGB) { p.posteGB = true; p.attendGB = false; }
  }

  recavesRestantes(p: JoueurTable): number {
    const r = this.reglages.recaves;
    if (r === 'illimitees') return Infinity;
    if (r === 'interdites') return 0;
    return Math.max(0, r - p.recavesUtilisees);
  }

  /** Recave entre deux mains. `parHote` : accordée par l'hôte même si les recaves sont épuisées. */
  recave(id: string, parHote = false): void {
    const p = this.joueur(id);
    if (!p) throw new ErreurTable('Joueur inconnu');
    if (p.tapis > 0) throw new ErreurTable('Recave possible seulement à sec');
    if (this.mainEnCours() && this.dansLaMain.includes(p.siege)) throw new ErreurTable('Attendre la fin de la main');
    if (!parHote && this.recavesRestantes(p) <= 0) throw new ErreurTable('Plus de recave disponible');
    p.tapis = this.reglages.tapisDepart;
    p.recue += this.reglages.tapisDepart;
    p.recavesUtilisees++;
  }

  mainEnCours(): boolean {
    return !!this.main && this.main.phase !== 'terminee';
  }

  /** Joueurs qui peuvent recevoir des cartes (hors attente de la GB). */
  private presents(): JoueurTable[] {
    return this.joueurs.filter((p) => !p.absent && !p.quitte && p.tapis > 0);
  }

  peutDemarrer(): boolean {
    return !this.mainEnCours() && this.presents().length >= 2;
  }

  /** Prépare et lance la main suivante. */
  nouvelleMain(rng: Rng): EtatMain {
    if (this.mainEnCours()) throw new ErreurTable('Une main est déjà en cours');
    const presents = this.presents();
    if (presents.length < 2) throw new ErreurTable('Il faut au moins 2 joueurs');

    // Pas assez de joueurs prêts : personne n'attend la grosse blinde.
    let prets = presents.filter((p) => !p.attendGB);
    if (prets.length < 2) {
      for (const p of presents) { p.attendGB = false; p.pbManquee = p.gbManquee = false; }
      prets = presents;
    }

    const apres = (liste: JoueurTable[], s: number) => {
      const tri = liste.slice().sort((a, b) => a.siege - b.siege);
      return tri.find((p) => p.siege > s) ?? tri[0];
    };

    // Bouton : prochain joueur prêt (au tout début, un joueur au hasard)
    const anciens = prets.filter((p) => p.aJoue);
    const bouton = this.bouton < 0 ? prets[rng(prets.length)] : apres(anciens.length ? anciens : prets, this.bouton);
    this.bouton = bouton.siege;

    // Blindes. La grosse blinde peut faire entrer un joueur qui l'attendait.
    const attente = presents.filter((p) => p.attendGB);
    let pb = apres(prets, bouton.siege);
    let gb = apres([...prets, ...attente], pb.siege);
    if (gb === bouton) {
      // Tête-à-tête : le bouton paie la petite blinde.
      gb = pb;
      pb = bouton;
    } else if (gb.attendGB) {
      gb.attendGB = false;
      prets.push(gb);
    }

    // Blindes manquées par les absents (là où PB/GB seraient passées s'ils avaient joué)
    const absents = this.joueurs.filter((p) => p.absent && p.tapis > 0);
    if (absents.length) {
      const tous = [...prets, ...absents];
      const pbSiTous = apres(tous, bouton.siege), gbSiTous = apres(tous, pbSiTous.siege);
      if (pbSiTous.absent) pbSiTous.pbManquee = true;
      if (gbSiTous.absent) gbSiTous.gbManquee = true;
    }

    const R = this.reglages;
    const blindes: Blinde[] = [
      { siege: pb.siege, montant: R.pb, nom: 'PB' },
      { siege: gb.siege, montant: R.gb, nom: 'GB' },
    ];
    for (const p of prets) {
      if (p === pb || p === gb) { p.posteGB = false; p.pbManquee = p.gbManquee = false; continue; }
      if (p.posteGB) {
        blindes.push({ siege: p.siege, montant: R.gb, nom: 'poste' });
        if (p.pbManquee) blindes.push({ siege: p.siege, montant: R.pb, mort: true, nom: 'morte' });
        p.posteGB = false;
        p.pbManquee = p.gbManquee = false;
      }
    }

    for (const p of prets) p.aJoue = true;
    this.dansLaMain = prets.map((p) => p.siege).sort((a, b) => a - b);
    this.numeroMain++;
    this.main = demarrerMain({
      joueurs: prets.map((p) => ({ siege: p.siege, id: p.id, tapis: p.tapis, toujoursMontrer: p.toujoursMontrer })),
      bouton: this.bouton,
      pb: R.pb,
      gb: R.gb,
      blindes,
      siegeGB: gb.siege,
      rng,
    });
    this.synchroniser();
    return this.main;
  }

  agir(id: string, action: Action): void {
    const p = this.joueur(id);
    if (!p || !this.main) throw new ErreurTable('Pas de main en cours');
    agir(this.main, p.siege, action);
    this.synchroniser();
  }

  /** Recopie les tapis de la main vers les sièges ; à la fin, retire ceux qui partent. */
  private synchroniser(): void {
    if (!this.main) return;
    for (const mj of this.main.joueurs) {
      const p = this.sieges[mj.siege];
      if (p) p.tapis = mj.tapis;
    }
    if (this.main.phase === 'terminee') {
      for (const p of this.joueurs) if (p.quitte) this.sieges[p.siege] = null;
    }
  }

  /** Total de jetons sur la table (contrôle d'intégrité). */
  totalJetons(): number {
    const enMain = this.main && this.main.phase !== 'terminee'
      ? this.main.joueurs.reduce((s, p) => s + p.miseTotale, 0) + this.main.argentMort : 0;
    return this.joueurs.reduce((s, p) => s + p.tapis, 0) + enMain;
  }

  /** Remet tout le monde à zéro pour « Rejouer » : tapis neufs, recaves remises à zéro. */
  rejouer(): void {
    if (this.mainEnCours()) throw new ErreurTable('Attendre la fin de la main');
    for (const p of this.joueurs) {
      Object.assign(p, {
        tapis: this.reglages.tapisDepart, recue: this.reglages.tapisDepart, recavesUtilisees: 0,
        attendGB: false, posteGB: false, pbManquee: false, gbManquee: false, aJoue: false,
      });
    }
    this.bouton = -1;
    this.numeroMain = 0;
    this.main = null;
    this.dansLaMain = [];
  }
}
