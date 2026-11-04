/**
 * Moteur d'une main de Texas Hold'em No-Limit (règles TDA).
 * Pur : pas d'affichage, pas de réseau, pas d'horloge. Utilisé par le serveur et le mode solo.
 *
 * Usage :
 *   const m = demarrerMain({...});
 *   while (m.phase !== 'terminee') agir(m, m.aParler!, { type: 'suivre' });
 *   m.resultat → gains, pots, mains montrées
 * Chaque changement est aussi décrit dans m.evenements (pour les animations).
 */
import { Carte, Rng, paquetMelange } from './cartes.js';
import { evaluer, decrire, meilleuresCinq } from './evaluation.js';

export type Phase = 'preflop' | 'flop' | 'turn' | 'river' | 'terminee';

export interface JoueurMain {
  siege: number;
  id: string;
  tapis: number;          // jetons devant le joueur (hors mises)
  cartes: Carte[];
  miseTour: number;       // misé pendant le tour d'enchères en cours
  miseTotale: number;     // misé pendant toute la main (hors argent mort)
  couche: boolean;
  aTapis: boolean;        // all-in
  aParle: boolean;        // a parlé depuis le début du tour
  niveauVu: number;       // mise à suivre au moment où il a parlé pour la dernière fois
  toujoursMontrer: boolean;
}

export type TypeAction = 'coucher' | 'parole' | 'suivre' | 'miser' | 'relancer' | 'tapis';
export interface Action { type: TypeAction; /** mise totale visée pour le tour (miser / relancer) */ a?: number }

export type Evenement =
  | { t: 'blinde'; siege: number; montant: number; mort: boolean; nom: 'PB' | 'GB' | 'poste' | 'morte' }
  | { t: 'donne'; ordre: number[] }
  | { t: 'action'; siege: number; action: TypeAction; montant: number; miseTour: number; tapis: boolean }
  | { t: 'rue'; phase: Phase; cartes: Carte[] }
  | { t: 'ramassage'; pot: number }
  | { t: 'remboursement'; siege: number; montant: number }
  | { t: 'abattage'; siege: number; cartes: Carte[]; main: string; meilleures: Carte[] }
  | { t: 'jette'; siege: number }
  | { t: 'pot'; index: number; montant: number; gagnants: { siege: number; montant: number }[]; main: string | null }
  | { t: 'fin' };

export interface Pot { montant: number; eligibles: number[] /* sièges */ }

export interface Resultat {
  /** Jetons gagnés par siège dans les pots (les mises non suivies sont rendues à part). */
  gains: Record<number, number>;
  pots: { montant: number; gagnants: number[]; main: string | null }[];
  montrees: Record<number, { cartes: Carte[]; main: string; score: number }>;
  sansAbattage: boolean;
}

export interface Blinde { siege: number; montant: number; mort?: boolean; nom?: 'PB' | 'GB' | 'poste' | 'morte' }

export interface ParamsMain {
  joueurs: { siege: number; id: string; tapis: number; toujoursMontrer?: boolean }[];
  bouton: number;          // siège du bouton
  pb: number;              // montant de la petite blinde (unité de jeton)
  gb: number;              // montant de la grosse blinde
  blindes: Blinde[];       // dans l'ordre : PB, GB, puis postes éventuels
  siegeGB: number;         // la parole pré-flop commence après ce siège
  rng?: Rng;
  paquet?: Carte[];        // ordre de tirage imposé (tests)
}

export interface EtatMain {
  joueurs: JoueurMain[];   // triés par siège
  bouton: number;
  pb: number;
  gb: number;
  phase: Phase;
  tableau: Carte[];
  paquet: Carte[];
  miseCourante: number;
  relanceMin: number;      // taille de la dernière relance complète
  aParler: number | null;  // siège qui doit parler
  dernierAgresseur: number | null; // dernier à miser/relancer dans le tour en cours
  argentMort: number;
  tapisAvantRiver: boolean; // enchères terminées avant la river (tout le monde à tapis)
  evenements: Evenement[];
  resultat: Resultat | null;
}

/* ------------------------------------------------------------------ */

const j = (e: EtatMain, siege: number) => {
  const p = e.joueurs.find((x) => x.siege === siege);
  if (!p) throw new Error(`Siège ${siege} absent de la main`);
  return p;
};
const enJeu = (e: EtatMain) => e.joueurs.filter((p) => !p.couche);
const peuventAgir = (e: EtatMain) => e.joueurs.filter((p) => !p.couche && !p.aTapis);

/** Sièges dans l'ordre de jeu en partant juste après `depuis`. */
function ordreApres(e: EtatMain, depuis: number): JoueurMain[] {
  const tri = e.joueurs.slice().sort((a, b) => a.siege - b.siege);
  const i = tri.findIndex((p) => p.siege > depuis);
  return i < 0 ? tri : [...tri.slice(i), ...tri.slice(0, i)];
}

function payer(p: JoueurMain, montant: number): number {
  const x = Math.min(montant, p.tapis);
  p.tapis -= x;
  p.miseTour += x;
  p.miseTotale += x;
  if (p.tapis === 0) p.aTapis = true;
  return x;
}

export const potTotal = (e: EtatMain) =>
  e.joueurs.reduce((s, p) => s + p.miseTotale, 0) + e.argentMort;

/** Pot déjà ramassé au centre (sans les mises du tour en cours). */
export const potAuCentre = (e: EtatMain) =>
  potTotal(e) - e.joueurs.reduce((s, p) => s + p.miseTour, 0);

/* ------------------------------------------------------------------ */

export function demarrerMain(params: ParamsMain): EtatMain {
  if (params.joueurs.length < 2) throw new Error('Il faut au moins 2 joueurs');
  const e: EtatMain = {
    joueurs: params.joueurs
      .slice()
      .sort((a, b) => a.siege - b.siege)
      .map((p) => ({
        siege: p.siege, id: p.id, tapis: p.tapis, cartes: [], miseTour: 0, miseTotale: 0,
        couche: false, aTapis: p.tapis === 0, aParle: false, niveauVu: 0, toujoursMontrer: !!p.toujoursMontrer,
      })),
    bouton: params.bouton,
    pb: params.pb,
    gb: params.gb,
    phase: 'preflop',
    tableau: [],
    paquet: params.paquet ? params.paquet.slice() : paquetMelange(params.rng ?? (() => { throw new Error('rng manquant'); })),
    miseCourante: 0,
    relanceMin: params.gb,
    aParler: null,
    dernierAgresseur: null,
    argentMort: 0,
    tapisAvantRiver: false,
    evenements: [],
    resultat: null,
  };

  // Blindes et postes
  for (const b of params.blindes) {
    const p = j(e, b.siege);
    if (b.mort) {
      const x = Math.min(b.montant, p.tapis);
      p.tapis -= x;
      e.argentMort += x;
      if (p.tapis === 0) p.aTapis = true;
      e.evenements.push({ t: 'blinde', siege: p.siege, montant: x, mort: true, nom: b.nom ?? 'morte' });
    } else {
      const x = payer(p, b.montant);
      e.evenements.push({ t: 'blinde', siege: p.siege, montant: x, mort: false, nom: b.nom ?? 'poste' });
    }
  }
  // Une grosse blinde courte n'abaisse pas la mise à suivre.
  e.miseCourante = Math.max(e.gb, ...e.joueurs.map((p) => p.miseTour));

  // Donne : une carte à la fois, en commençant à gauche du bouton
  const ordre = ordreApres(e, e.bouton);
  for (let tour = 0; tour < 2; tour++) for (const p of ordre) p.cartes.push(tirer(e));
  e.evenements.push({ t: 'donne', ordre: ordre.map((p) => p.siege) });

  e.aParler = prochainAParler(e, params.siegeGB);
  if (e.aParler === null) finDuTour(e);
  return e;
}

function tirer(e: EtatMain): Carte {
  const c = e.paquet.shift();
  if (c === undefined) throw new Error('Paquet vide');
  return c;
}

function doitParler(e: EtatMain, p: JoueurMain): boolean {
  if (p.couche || p.aTapis) return false;
  const actifs = peuventAgir(e);
  // Seul joueur capable d'agir et déjà à niveau : rien à décider.
  if (actifs.length === 1 && p.miseTour >= e.miseCourante) return false;
  return !p.aParle || p.miseTour < e.miseCourante;
}

function prochainAParler(e: EtatMain, apres: number): number | null {
  if (enJeu(e).length <= 1) return null;
  for (const p of ordreApres(e, apres)) if (doitParler(e, p)) return p.siege;
  return null;
}

/* ------------------------------------------------------------------ */

export interface Legales {
  siege: number;
  peutParler: boolean;      // check
  aSuivre: number;          // montant à ajouter pour suivre (0 si parole possible)
  peutRelancer: boolean;    // miser ou relancer (y compris tapis)
  estMise: boolean;         // true : personne n'a encore misé dans ce tour → « miser »
  minA: number;             // mise totale minimum pour miser/relancer
  maxA: number;             // mise totale maximum (tapis)
}

export function actionsLegales(e: EtatMain): Legales | null {
  if (e.aParler === null || e.phase === 'terminee') return null;
  const p = j(e, e.aParler);
  const aSuivre = Math.min(e.miseCourante - p.miseTour, p.tapis);
  const maxA = p.miseTour + p.tapis;
  const autresPeuventAgir = peuventAgir(e).some((q) => q !== p);
  // Les enchères sont rouvertes si le joueur n'a pas encore parlé, ou si la mise a augmenté
  // depuis d'au moins une relance complète (tapis incomplets cumulés compris).
  const rouvert = !p.aParle || e.miseCourante - p.niveauVu >= e.relanceMin;
  const peutRelancer = maxA > e.miseCourante && rouvert && autresPeuventAgir;
  const estMise = e.miseCourante === 0;
  const minComplet = estMise ? e.gb : e.miseCourante + e.relanceMin;
  return {
    siege: p.siege,
    peutParler: p.miseTour >= e.miseCourante,
    aSuivre: Math.max(0, aSuivre),
    peutRelancer,
    estMise,
    minA: Math.min(minComplet, maxA),
    maxA,
  };
}

export class ActionIllegale extends Error {}

export function agir(e: EtatMain, siege: number, action: Action): void {
  if (e.phase === 'terminee') throw new ActionIllegale('La main est terminée');
  if (e.aParler !== siege) throw new ActionIllegale("Ce n'est pas à ce joueur de parler");
  const L = actionsLegales(e)!;
  const p = j(e, siege);
  let type = action.type;

  if (type === 'tapis') {
    if (L.peutRelancer) { type = e.miseCourante === 0 ? 'miser' : 'relancer'; action = { type, a: L.maxA }; }
    else type = L.aSuivre > 0 ? 'suivre' : 'parole';
  }
  if (type === 'suivre' && L.aSuivre === 0) type = 'parole';

  switch (type) {
    case 'coucher':
      p.couche = true;
      e.evenements.push({ t: 'action', siege, action: 'coucher', montant: 0, miseTour: p.miseTour, tapis: false });
      break;
    case 'parole':
      if (!L.peutParler) throw new ActionIllegale('Impossible de parler : il y a une mise à suivre');
      e.evenements.push({ t: 'action', siege, action: 'parole', montant: 0, miseTour: p.miseTour, tapis: false });
      break;
    case 'suivre': {
      const x = payer(p, L.aSuivre);
      e.evenements.push({ t: 'action', siege, action: 'suivre', montant: x, miseTour: p.miseTour, tapis: p.aTapis });
      break;
    }
    case 'miser':
    case 'relancer': {
      if (!L.peutRelancer) throw new ActionIllegale('Relance impossible');
      if ((type === 'miser') !== L.estMise) throw new ActionIllegale(L.estMise ? 'Personne n\'a misé : utiliser « miser »' : 'Il y a déjà une mise : utiliser « relancer »');
      const a = Math.floor(action.a ?? NaN);
      if (!Number.isFinite(a)) throw new ActionIllegale('Montant manquant');
      if (a > L.maxA) throw new ActionIllegale('Montant supérieur au tapis');
      if (a < L.minA) throw new ActionIllegale(`Mise minimum : ${L.minA}`);
      const increment = a - e.miseCourante;
      payer(p, a - p.miseTour);
      if (increment >= e.relanceMin) e.relanceMin = increment; // relance complète
      e.miseCourante = a;
      e.dernierAgresseur = siege;
      e.evenements.push({ t: 'action', siege, action: type, montant: a, miseTour: p.miseTour, tapis: p.aTapis });
      break;
    }
    default:
      throw new ActionIllegale(`Action inconnue : ${type}`);
  }
  p.aParle = true;
  p.niveauVu = e.miseCourante;

  e.aParler = prochainAParler(e, siege);
  if (e.aParler === null) finDuTour(e);
}

/** Action automatique quand le temps est écoulé ou que le joueur est déconnecté. */
export function actionParDefaut(e: EtatMain): Action {
  const L = actionsLegales(e);
  return L && L.peutParler ? { type: 'parole' } : { type: 'coucher' };
}

/* ------------------------------------------------------------------ */

function rembourserMiseNonSuivie(e: EtatMain) {
  const tri = e.joueurs.slice().sort((a, b) => b.miseTotale - a.miseTotale);
  const [haut, second] = tri;
  if (!haut || !second) return;
  const exces = haut.miseTotale - second.miseTotale;
  if (exces > 0 && !haut.couche) {
    haut.miseTotale -= exces;
    haut.miseTour = Math.max(0, haut.miseTour - exces);
    haut.tapis += exces;
    if (haut.tapis > 0) haut.aTapis = false;
    e.evenements.push({ t: 'remboursement', siege: haut.siege, montant: exces });
  }
}

function ramasser(e: EtatMain) {
  for (const p of e.joueurs) { p.miseTour = 0; p.aParle = false; p.niveauVu = 0; }
  e.miseCourante = 0;
  e.relanceMin = e.gb;
  e.evenements.push({ t: 'ramassage', pot: potTotal(e) });
}

const SUIVANTE: Record<string, Phase> = { preflop: 'flop', flop: 'turn', turn: 'river' };

function distribuerRue(e: EtatMain) {
  const phase = SUIVANTE[e.phase];
  tirer(e); // carte brûlée
  const n = phase === 'flop' ? 3 : 1;
  const nouvelles: Carte[] = [];
  for (let i = 0; i < n; i++) nouvelles.push(tirer(e));
  e.tableau.push(...nouvelles);
  e.phase = phase;
  e.dernierAgresseur = null;
  e.evenements.push({ t: 'rue', phase, cartes: nouvelles });
}

function finDuTour(e: EtatMain) {
  if (enJeu(e).length === 1) {
    rembourserMiseNonSuivie(e);
    ramasser(e);
    return terminerSansAbattage(e);
  }
  if (e.phase === 'river') {
    rembourserMiseNonSuivie(e);
    const agresseurRiver = e.dernierAgresseur;
    ramasser(e);
    return abattage(e, agresseurRiver);
  }
  // Plus personne (ou un seul) ne peut agir : on retourne le reste du tableau.
  if (peuventAgir(e).length <= 1) {
    rembourserMiseNonSuivie(e);
    ramasser(e);
    e.tapisAvantRiver = true;
    while ((e.phase as Phase) !== 'river') distribuerRue(e);
    return abattage(e, null);
  }
  ramasser(e);
  distribuerRue(e);
  e.aParler = prochainAParler(e, e.bouton);
  if (e.aParler === null) finDuTour(e);
}

/* ------------------------------------------------------------------ */

/** Pots principal et secondaires, à partir des mises totales. L'argent mort va au pot principal. */
export function calculerPots(e: EtatMain): Pot[] {
  const niveaux = [...new Set(e.joueurs.map((p) => p.miseTotale).filter((x) => x > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prec = 0;
  for (const nv of niveaux) {
    let montant = 0;
    for (const p of e.joueurs) montant += Math.min(p.miseTotale, nv) - Math.min(p.miseTotale, prec);
    const eligibles = e.joueurs.filter((p) => !p.couche && p.miseTotale >= nv).map((p) => p.siege);
    const dernier = pots[pots.length - 1];
    if (dernier && (eligibles.length === 0 || memesSieges(dernier.eligibles, eligibles))) dernier.montant += montant;
    else if (eligibles.length) pots.push({ montant, eligibles });
    prec = nv;
  }
  if (e.argentMort) {
    if (pots.length) pots[0].montant += e.argentMort;
    else pots.push({ montant: e.argentMort, eligibles: enJeu(e).map((p) => p.siege) });
  }
  return pots;
}
const memesSieges = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

function terminerSansAbattage(e: EtatMain) {
  const g = enJeu(e)[0];
  const montant = potTotal(e);
  g.tapis += montant;
  e.phase = 'terminee';
  e.aParler = null;
  e.evenements.push({ t: 'pot', index: 0, montant, gagnants: [{ siege: g.siege, montant }], main: null });
  e.evenements.push({ t: 'fin' });
  e.resultat = {
    gains: { [g.siege]: montant },
    pots: [{ montant, gagnants: [g.siege], main: null }],
    montrees: {},
    sansAbattage: true,
  };
}

function abattage(e: EtatMain, agresseurRiver: number | null) {
  e.phase = 'terminee';
  e.aParler = null;
  const restants = enJeu(e);
  const scores = new Map<number, number>(restants.map((p) => [p.siege, evaluer(p.cartes.concat(e.tableau))]));
  const pots = calculerPots(e);

  // Gagnants de chaque pot
  const gainsPots = pots.map((pot) => {
    const meilleur = Math.max(...pot.eligibles.map((s) => scores.get(s)!));
    return { pot, meilleur, gagnants: pot.eligibles.filter((s) => scores.get(s) === meilleur) };
  });
  const gagneQuelqueChose = new Set(gainsPots.flatMap((g) => g.gagnants));

  // Ordre d'abattage : dernier agresseur à la river, sinon premier à gauche du bouton
  let ordre = ordreApres(e, e.bouton).filter((p) => !p.couche);
  if (agresseurRiver !== null) {
    const i = ordre.findIndex((p) => p.siege === agresseurRiver);
    if (i > 0) ordre = [...ordre.slice(i), ...ordre.slice(0, i)];
  }
  const montrees: Resultat['montrees'] = {};
  ordre.forEach((p, i) => {
    const montre = i === 0 || e.tapisAvantRiver || p.toujoursMontrer || gagneQuelqueChose.has(p.siege);
    if (montre) {
      const score = scores.get(p.siege)!;
      const main = decrire(score);
      montrees[p.siege] = { cartes: p.cartes.slice(), main, score };
      e.evenements.push({ t: 'abattage', siege: p.siege, cartes: p.cartes.slice(), main, meilleures: meilleuresCinq(p.cartes.concat(e.tableau)) });
    } else {
      e.evenements.push({ t: 'jette', siege: p.siege });
    }
  });

  // Distribution, jeton indivisible au premier gagnant à gauche du bouton
  const gains: Record<number, number> = {};
  const ordreBouton = ordreApres(e, e.bouton).map((p) => p.siege);
  const resPots: Resultat['pots'] = [];
  gainsPots.forEach(({ pot, meilleur, gagnants }, index) => {
    const tries = gagnants.slice().sort((a, b) => ordreBouton.indexOf(a) - ordreBouton.indexOf(b));
    const unite = e.pb > 0 ? e.pb : 1;
    // On partage en unités de petite blinde quand c'est possible, sinon en jetons de 1.
    const u = pot.montant % unite === 0 ? unite : 1;
    const parts = Math.floor(pot.montant / u / tries.length);
    let reste = pot.montant - parts * u * tries.length;
    const detail: { siege: number; montant: number }[] = [];
    for (const s of tries) {
      let x = parts * u;
      if (reste > 0) { const r = Math.min(u, reste); x += r; reste -= r; }
      j(e, s).tapis += x;
      gains[s] = (gains[s] ?? 0) + x;
      detail.push({ siege: s, montant: x });
    }
    const main = decrire(meilleur);
    resPots.push({ montant: pot.montant, gagnants: tries, main });
    e.evenements.push({ t: 'pot', index, montant: pot.montant, gagnants: detail, main });
  });
  e.evenements.push({ t: 'fin' });
  e.resultat = { gains, pots: resPots, montrees, sansAbattage: false };
}
