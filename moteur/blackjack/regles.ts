/**
 * Black Jack, règles « casino » :
 *   - sabot de 6 jeux, remélangé quand il reste environ un quart des cartes ;
 *   - le croupier tire jusqu'à 16 et s'arrête à 17, même « souple » (As compté 11) ;
 *   - Black Jack payé 3 contre 2, assurance 2 contre 1 ;
 *   - le croupier vérifie s'il a Black Jack quand il montre un As ou une figure/10 ;
 *   - doubler sur les deux premières cartes (aussi après une séparation) ;
 *   - séparer une paire jusqu'à 4 mains ; As séparés : une seule carte chacun ;
 *   - abandon : sur les deux premières cartes, on récupère la moitié de sa mise.
 */
import { Carte, Rng, paquetMelange } from '../cartes.js';

export const valeurCarte = (c: Carte): number => {
  const r = (c >> 2) + 2;
  return r === 14 ? 11 : r >= 10 ? 10 : r;
};
/** Rang « Black Jack » : toutes les figures et le 10 se valent pour séparer. */
const rangBJ = (c: Carte) => valeurCarte(c);

export interface Valeur { total: number; souple: boolean }

export function valeurMain(cartes: Carte[]): Valeur {
  let total = 0, as = 0;
  for (const c of cartes) { const v = valeurCarte(c); total += v; if (v === 11) as++; }
  while (total > 21 && as > 0) { total -= 10; as--; }
  return { total, souple: as > 0 };
}

export const estBlackJack = (cartes: Carte[]) => cartes.length === 2 && valeurMain(cartes).total === 21;

/* ------------------------------------------------------------------ */

export class Sabot {
  cartes: Carte[] = [];
  private coupe = 0;
  constructor(public jeux = 6, private rng: Rng) { this.melanger(); }
  melanger() {
    this.cartes = [];
    for (let j = 0; j < this.jeux; j++) this.cartes.push(...paquetMelange(this.rng));
    // Mélange de l'ensemble (les jeux ne restent pas séparés)
    for (let i = this.cartes.length - 1; i > 0; i--) { const k = this.rng(i + 1); [this.cartes[i], this.cartes[k]] = [this.cartes[k], this.cartes[i]]; }
    this.coupe = Math.floor(this.cartes.length * (0.22 + this.rng(8) / 100)); // carte de coupe vers 75 %
  }
  get aRemelanger() { return this.cartes.length <= this.coupe; }
  get proportionRestante() { return this.cartes.length / (this.jeux * 52); }
  tirer(): Carte {
    const c = this.cartes.pop();
    if (c === undefined) { this.melanger(); return this.tirer(); }
    return c;
  }
}

/* ------------------------------------------------------------------ */

export type Issue = 'blackjack' | 'gagne' | 'egalite' | 'perd' | 'depasse' | 'abandon';
export type ActionBJ = 'tirer' | 'rester' | 'doubler' | 'separer' | 'abandonner';

export interface MainBJ {
  cartes: Carte[];
  mise: number;
  double: boolean;
  separee: boolean;        // issue d'une séparation (pas de Black Jack possible)
  asSepares: boolean;
  terminee: boolean;
  issue: Issue | null;
  retour: number;          // jetons rendus au joueur (mise comprise)
}

export interface JoueurManche {
  siege: number;
  id: string;
  mains: MainBJ[];
  assurance: number;       // montant de l'assurance prise (0 sinon)
  assuranceDecidee: boolean;
  retourAssurance: number;
}

export type EvenementBJ =
  | { t: 'donne'; siege: number | null; main: number; carte: Carte | null } // null = croupier ; carte null = face cachée
  | { t: 'assurance'; siege: number; montant: number }
  | { t: 'action'; siege: number; main: number; action: ActionBJ }
  | { t: 'separe'; siege: number; main: number }
  | { t: 'revele'; carte: Carte }
  | { t: 'blackjackCroupier' }
  | { t: 'resultat'; siege: number; main: number; issue: Issue; retour: number; mise: number }
  | { t: 'resultatAssurance'; siege: number; retour: number }
  | { t: 'fin' };

export type PhaseManche = 'assurance' | 'jeu' | 'croupier' | 'terminee';

export interface Manche {
  joueurs: JoueurManche[];        // dans l'ordre de jeu (siège croissant)
  croupier: Carte[];               // la deuxième carte est cachée jusqu'au tour du croupier
  carteCachee: Carte;
  cacheeRevelee: boolean;
  phase: PhaseManche;
  aParler: { siege: number; main: number } | null;
  abandonPermis: boolean;
  evenements: EvenementBJ[];
}

export class ActionBJIllegale extends Error {}

const nouvelleMain = (mise: number, cartes: Carte[] = [], separee = false): MainBJ =>
  ({ cartes, mise, double: false, separee, asSepares: false, terminee: false, issue: null, retour: 0 });

export function demarrerManche(sabot: Sabot, mises: { siege: number; id: string; mise: number }[], opts: { abandon: boolean }): Manche {
  if (!mises.length) throw new Error('Aucune mise');
  const m: Manche = {
    joueurs: mises.slice().sort((a, b) => a.siege - b.siege).map((x) => ({ siege: x.siege, id: x.id, mains: [nouvelleMain(x.mise)], assurance: 0, assuranceDecidee: false, retourAssurance: 0 })),
    croupier: [], carteCachee: -1, cacheeRevelee: false, phase: 'jeu', aParler: null, abandonPermis: opts.abandon, evenements: [],
  };
  // Donne : une carte à chacun, une au croupier (visible), une deuxième à chacun, la deuxième du croupier cachée
  for (const j of m.joueurs) { const c = sabot.tirer(); j.mains[0].cartes.push(c); m.evenements.push({ t: 'donne', siege: j.siege, main: 0, carte: c }); }
  const visible = sabot.tirer();
  m.croupier.push(visible);
  m.evenements.push({ t: 'donne', siege: null, main: 0, carte: visible });
  for (const j of m.joueurs) { const c = sabot.tirer(); j.mains[0].cartes.push(c); m.evenements.push({ t: 'donne', siege: j.siege, main: 0, carte: c }); }
  m.carteCachee = sabot.tirer();
  m.evenements.push({ t: 'donne', siege: null, main: 0, carte: null });

  if (valeurCarte(visible) === 11) { m.phase = 'assurance'; return m; }
  verifierBlackJackCroupier(m, sabot);
  return m;
}

/** Assurance (seulement quand le croupier montre un As). Montant = moitié de la mise. */
export function assurer(m: Manche, sabot: Sabot, siege: number, oui: boolean): void {
  if (m.phase !== 'assurance') throw new ActionBJIllegale("L'assurance n'est pas proposée");
  const j = m.joueurs.find((x) => x.siege === siege);
  if (!j || j.assuranceDecidee) return;
  j.assuranceDecidee = true;
  if (oui) {
    j.assurance = Math.floor(j.mains[0].mise / 2);
    m.evenements.push({ t: 'assurance', siege, montant: j.assurance });
  }
  if (m.joueurs.every((x) => x.assuranceDecidee)) verifierBlackJackCroupier(m, sabot);
}

/** Clôt la fenêtre d'assurance (temps écoulé) : ceux qui n'ont rien dit refusent. */
export function fermerAssurance(m: Manche, sabot: Sabot): void {
  if (m.phase !== 'assurance') return;
  for (const j of m.joueurs) j.assuranceDecidee = true;
  verifierBlackJackCroupier(m, sabot);
}

function verifierBlackJackCroupier(m: Manche, sabot: Sabot) {
  const v = valeurCarte(m.croupier[0]);
  const bjCroupier = (v === 11 || v === 10) && estBlackJack([m.croupier[0], m.carteCachee]);
  // Paiement des assurances
  for (const j of m.joueurs) if (j.assurance > 0) {
    j.retourAssurance = bjCroupier ? j.assurance * 3 : 0;
    m.evenements.push({ t: 'resultatAssurance', siege: j.siege, retour: j.retourAssurance });
  }
  if (bjCroupier) {
    reveler(m);
    m.evenements.push({ t: 'blackjackCroupier' });
    for (const j of m.joueurs) for (const main of j.mains) main.terminee = true;
    regler(m);
    return;
  }
  m.phase = 'jeu';
  // Les Black Jack des joueurs sont terminés d'office
  for (const j of m.joueurs) if (estBlackJack(j.mains[0].cartes)) j.mains[0].terminee = true;
  avancer(m, sabot);
}

function reveler(m: Manche) {
  if (m.cacheeRevelee) return;
  m.croupier.push(m.carteCachee);
  m.cacheeRevelee = true;
  m.evenements.push({ t: 'revele', carte: m.carteCachee });
}

export interface LegalesBJ { tirer: boolean; rester: boolean; doubler: boolean; separer: boolean; abandonner: boolean }

/** Actions possibles pour la main en cours, selon ce que le joueur peut encore miser. */
export function legalesBJ(m: Manche, jetonsDisponibles: number): LegalesBJ | null {
  if (m.phase !== 'jeu' || !m.aParler) return null;
  const j = m.joueurs.find((x) => x.siege === m.aParler!.siege)!;
  const main = j.mains[m.aParler.main];
  const deux = main.cartes.length === 2;
  return {
    tirer: true,
    rester: true,
    doubler: deux && jetonsDisponibles >= main.mise,
    separer: deux && rangBJ(main.cartes[0]) === rangBJ(main.cartes[1]) && j.mains.length < 4 && jetonsDisponibles >= main.mise && !(main.asSepares),
    abandonner: m.abandonPermis && deux && j.mains.length === 1 && !main.separee,
  };
}

/**
 * Joue une action. `jetonsDisponibles` : ce que le joueur a encore devant lui (pour doubler/séparer).
 * Renvoie le montant à retirer de son tapis (mise supplémentaire), 0 sinon.
 */
export function agirBJ(m: Manche, sabot: Sabot, siege: number, action: ActionBJ, jetonsDisponibles: number): number {
  if (!m.aParler || m.aParler.siege !== siege) throw new ActionBJIllegale("Ce n'est pas ton tour");
  const L = legalesBJ(m, jetonsDisponibles)!;
  if (!L[action]) throw new ActionBJIllegale('Action impossible');
  const j = m.joueurs.find((x) => x.siege === siege)!;
  const idx = m.aParler.main;
  const main = j.mains[idx];
  let coute = 0;
  m.evenements.push({ t: 'action', siege, main: idx, action });
  const donner = (mainIdx: number) => {
    const c = sabot.tirer();
    j.mains[mainIdx].cartes.push(c);
    m.evenements.push({ t: 'donne', siege, main: mainIdx, carte: c });
  };
  switch (action) {
    case 'tirer':
      donner(idx);
      if (valeurMain(main.cartes).total >= 21) main.terminee = true;
      break;
    case 'rester':
      main.terminee = true;
      break;
    case 'doubler':
      coute = main.mise;
      main.mise *= 2;
      main.double = true;
      donner(idx);
      main.terminee = true;
      break;
    case 'abandonner':
      main.terminee = true;
      main.issue = 'abandon';
      break;
    case 'separer': {
      coute = main.mise;
      const as = valeurCarte(main.cartes[0]) === 11;
      const seconde = nouvelleMain(main.mise, [main.cartes.pop()!], true);
      main.separee = true;
      main.asSepares = seconde.asSepares = as;
      j.mains.splice(idx + 1, 0, seconde);
      m.evenements.push({ t: 'separe', siege, main: idx });
      donner(idx);
      donner(idx + 1);
      if (as) { main.terminee = true; seconde.terminee = true; } // As séparés : une carte chacun
      else {
        if (valeurMain(main.cartes).total === 21) main.terminee = true;
        if (valeurMain(seconde.cartes).total === 21) seconde.terminee = true;
      }
      break;
    }
  }
  avancer(m, sabot);
  return coute;
}

/** Passe à la prochaine main à jouer, ou au croupier. */
function avancer(m: Manche, sabot: Sabot) {
  for (const j of m.joueurs) for (let i = 0; i < j.mains.length; i++) {
    if (!j.mains[i].terminee) { m.aParler = { siege: j.siege, main: i }; return; }
  }
  m.aParler = null;
  m.phase = 'croupier';
  reveler(m);
  // Le croupier ne tire que si au moins une main est encore en jeu
  const enJeu = m.joueurs.some((j) => j.mains.some((x) => x.issue !== 'abandon' && valeurMain(x.cartes).total <= 21 && !(estBlackJack(x.cartes) && !x.separee)));
  if (enJeu) {
    while (valeurMain(m.croupier).total < 17) {
      const c = sabot.tirer();
      m.croupier.push(c);
      m.evenements.push({ t: 'donne', siege: null, main: 0, carte: c });
    }
  }
  regler(m);
}

function regler(m: Manche) {
  const vc = valeurMain(m.croupier).total;
  const bjC = estBlackJack(m.croupier);
  for (const j of m.joueurs) j.mains.forEach((main, i) => {
    const v = valeurMain(main.cartes).total;
    const bj = estBlackJack(main.cartes) && !main.separee;
    let issue: Issue, retour: number;
    if (main.issue === 'abandon') { issue = 'abandon'; retour = Math.floor(main.mise / 2); }
    else if (v > 21) { issue = 'depasse'; retour = 0; }
    else if (bj && bjC) { issue = 'egalite'; retour = main.mise; }
    else if (bj) { issue = 'blackjack'; retour = main.mise + Math.floor((main.mise * 3) / 2); }
    else if (bjC) { issue = 'perd'; retour = 0; }
    else if (vc > 21 || v > vc) { issue = 'gagne'; retour = main.mise * 2; }
    else if (v === vc) { issue = 'egalite'; retour = main.mise; }
    else { issue = 'perd'; retour = 0; }
    main.issue = issue;
    main.retour = retour;
    main.terminee = true;
    m.evenements.push({ t: 'resultat', siege: j.siege, main: i, issue, retour, mise: main.mise });
  });
  m.phase = 'terminee';
  m.aParler = null;
  m.evenements.push({ t: 'fin' });
}
