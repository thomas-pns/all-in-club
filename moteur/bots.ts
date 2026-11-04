/**
 * Bots d'All-In Club. Partagés par le serveur (tables en ligne) et le mode solo.
 * Un bot ne voit que ses cartes, le tableau et les actions publiques : il ne triche jamais.
 */
import { Carte, rang, couleur } from './cartes.js';
import { evaluer, categorie, Categorie } from './evaluation.js';
import { Action, EtatMain, actionsLegales, potTotal, Evenement } from './main.js';

export type Niveau = 'facile' | 'moyen' | 'difficile';
export type Personnalite = 'prudent' | 'agressif' | 'bluffeur' | 'suiveur' | 'imprevisible';

export interface ProfilBot { niveau: Niveau; personnalite: Personnalite }

export interface DecisionBot { action: Action; reflexion: number /* ms */ }

interface Traits {
  serrage: number;     // + : joue moins de mains
  agressivite: number; // 0..1 : préfère miser/relancer à suivre
  bluff: number;       // 0..1 : fréquence de bluff
  appel: number;       // >1 : suit plus volontiers
}

const TRAITS: Record<Personnalite, Traits> = {
  prudent:      { serrage: 1.5,  agressivite: 0.35, bluff: 0.03, appel: 0.9 },
  agressif:     { serrage: -1,   agressivite: 0.8,  bluff: 0.12, appel: 1.0 },
  bluffeur:     { serrage: -0.5, agressivite: 0.65, bluff: 0.25, appel: 1.0 },
  suiveur:      { serrage: -1,   agressivite: 0.2,  bluff: 0.02, appel: 1.35 },
  imprevisible: { serrage: 0,    agressivite: 0.6,  bluff: 0.15, appel: 1.1 },
};

/* ------------------------------------------------------------------ */
/* Force des mains de départ : formule de Chen                          */

export function chen(c1: Carte, c2: Carte): number {
  const pts = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  const [h, b] = rang(c1) >= rang(c2) ? [rang(c1), rang(c2)] : [rang(c2), rang(c1)];
  if (h === b) return Math.max(5, pts(h) * 2);
  let s = pts(h);
  if (couleur(c1) === couleur(c2)) s += 2;
  const ecart = h - b - 1;
  s -= ecart === 0 ? 0 : ecart === 1 ? 1 : ecart === 2 ? 2 : ecart === 3 ? 4 : 5;
  if (ecart <= 1 && h < 12) s += 1;
  return Math.ceil(s);
}

/* ------------------------------------------------------------------ */
/* Probabilité de gagner (Monte-Carlo)                                  */

export function equite(cartes: Carte[], tableau: Carte[], adversaires: number, iterations: number, alea: () => number): number {
  if (adversaires <= 0) return 1;
  const pris = new Set([...cartes, ...tableau]);
  const reste: Carte[] = [];
  for (let c = 0; c < 52; c++) if (!pris.has(c)) reste.push(c);
  const manque = 5 - tableau.length;
  const besoin = manque + 2 * adversaires;
  let gagne = 0;
  const t = tableau.slice();
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < besoin; i++) {
      const j = i + Math.floor(alea() * (reste.length - i));
      const x = reste[i]; reste[i] = reste[j]; reste[j] = x;
    }
    t.length = tableau.length;
    for (let i = 0; i < manque; i++) t.push(reste[i]);
    const moi = evaluer(cartes.concat(t));
    let egalites = 0, perdu = false;
    for (let o = 0; o < adversaires; o++) {
      const k = manque + 2 * o;
      const s = evaluer([reste[k], reste[k + 1], ...t]);
      if (s > moi) { perdu = true; break; }
      if (s === moi) egalites++;
    }
    if (!perdu) gagne += 1 / (egalites + 1);
  }
  return gagne / iterations;
}

/* ------------------------------------------------------------------ */
/* Observation des adversaires (utilisée par le niveau difficile)       */

export interface StatsJoueur { mains: number; vpip: number; pfr: number; agressions: number; passifs: number }

export class Observateur {
  stats = new Map<string, StatsJoueur>();

  get(id: string): StatsJoueur {
    let s = this.stats.get(id);
    if (!s) { s = { mains: 0, vpip: 0, pfr: 0, agressions: 0, passifs: 0 }; this.stats.set(id, s); }
    return s;
  }

  /** À appeler une fois par main terminée. */
  observer(main: EtatMain): void {
    const idDe = new Map(main.joueurs.map((p) => [p.siege, p.id]));
    let rue = 'preflop';
    const vpip = new Set<number>(), pfr = new Set<number>();
    for (const e of main.evenements) {
      if (e.t === 'rue') rue = e.phase;
      if (e.t !== 'action') continue;
      const s = this.get(idDe.get(e.siege)!);
      const agressif = e.action === 'miser' || e.action === 'relancer';
      if (rue === 'preflop') {
        if (agressif || e.action === 'suivre') vpip.add(e.siege);
        if (agressif) pfr.add(e.siege);
      } else if (agressif) s.agressions++;
      else if (e.action === 'suivre' || e.action === 'parole') s.passifs++;
    }
    for (const p of main.joueurs) {
      const s = this.get(p.id);
      s.mains++;
      if (vpip.has(p.siege)) s.vpip++;
      if (pfr.has(p.siege)) s.pfr++;
    }
  }

  /** Lecture d'un joueur : 'serre', 'large' ou 'inconnu' ; agressif ou passif. */
  lire(id: string): { large: number; agressif: number; fiable: boolean } {
    const s = this.get(id);
    const fiable = s.mains >= 12;
    const large = s.mains ? s.vpip / s.mains : 0.3;
    const agressif = (s.agressions + 1) / (s.agressions + s.passifs + 2);
    return { large, agressif, fiable };
  }
}

/* ------------------------------------------------------------------ */
/* Décision                                                             */

export interface ContexteBot {
  main: EtatMain;
  siege: number;
  profil: ProfilBot;
  alea: () => number;           // réel dans [0, 1[
  observateur?: Observateur;
  /** Variation de serrage pour la main en cours (personnalité « imprévisible »). */
  humeur?: number;
}

export function deciderBot(ctx: ContexteBot): DecisionBot {
  const { main, siege, profil, alea } = ctx;
  const L = actionsLegales(main);
  if (!L || L.siege !== siege) throw new Error('Ce bot ne doit pas parler');
  const moi = main.joueurs.find((p) => p.siege === siege)!;
  const tr = { ...TRAITS[profil.personnalite] };
  if (profil.personnalite === 'imprevisible') tr.serrage += ctx.humeur ?? 0;
  if (profil.niveau === 'facile') { tr.serrage -= 2; tr.appel *= 1.3; }

  const gb = main.gb;
  const pot = potTotal(main);
  const aSuivre = L.aSuivre;
  const adversaires = main.joueurs.filter((p) => !p.couche && p.siege !== siege);
  const nAdv = adversaires.length;
  const tapisEffectif = Math.min(moi.tapis + moi.miseTour, Math.max(...adversaires.map((p) => p.tapis + p.miseTour)));
  const mesRelances = relancesDansLeTour(main, siege);

  // Montant d'une mise/relance : fraction du pot, bornée et arrondie à la petite blinde
  const taille = (fracPot: number): number => {
    const base = L.estMise ? pot * fracPot : main.miseCourante + (pot + aSuivre) * fracPot;
    let a = Math.round(base / main.pb) * main.pb;
    a = Math.max(L.minA, Math.min(L.maxA, a));
    if (a > L.maxA * 0.7) a = L.maxA; // trop engagé : autant faire tapis
    return a;
  };
  const relancer = (fracPot: number): Action =>
    L.peutRelancer ? { type: L.estMise ? 'miser' : 'relancer', a: taille(fracPot) } : passif();
  const passif = (): Action => (L.peutParler ? { type: 'parole' } : { type: 'suivre' });
  const coucher = (): Action => (L.peutParler ? { type: 'parole' } : { type: 'coucher' });
  const decision = (action: Action, dur = 0): DecisionBot => ({ action, reflexion: reflexion(profil, alea, dur) });

  /* ---------------- Avant le flop ---------------- */
  if (main.phase === 'preflop') {
    const c = chen(moi.cartes[0], moi.cartes[1]);
    const apresMoi = joueursAPres(main, siege);
    const niveauMise = main.miseCourante / gb;     // 1 = seulement la GB
    const relances = nombreRelancesPreflop(main);
    const bruit = profil.niveau === 'facile' ? (alea() - 0.5) * 4 : (alea() - 0.5) * 1.2;
    const force = c + bruit - tr.serrage;
    const courtTapis = tapisEffectif / gb <= 12;

    if (courtTapis && L.peutRelancer) {
      return force >= 9 - apresMoi * 0.3 ? decision({ type: 'tapis' }, 1) : (L.peutParler ? decision({ type: 'parole' }) : decision({ type: 'coucher' }));
    }

    const seuilOuverture = 5.5 + apresMoi * 0.9;
    if (relances === 0) {
      // Personne n'a relancé (seulement des suiveurs éventuellement)
      if (force >= seuilOuverture) {
        if (alea() < 0.55 + tr.agressivite * 0.45 || force >= seuilOuverture + 3) {
          const suiveurs = main.joueurs.filter((p) => p.miseTour === main.miseCourante && p.siege !== siege).length - 1;
          const a = Math.max(L.minA, Math.round(((2.5 + Math.max(0, suiveurs)) * gb) / main.pb) * main.pb);
          return decision(L.peutRelancer ? { type: 'relancer', a: Math.min(a, L.maxA) } : passif());
        }
        return decision(passif());
      }
      // Suivre pour pas cher (suiveurs, petite blinde, débutants)
      if (L.peutParler) return decision({ type: 'parole' });
      const prixBas = aSuivre <= gb;
      if (prixBas && force >= seuilOuverture - 2 - (tr.appel - 1) * 4) return decision({ type: 'suivre' });
      return decision({ type: 'coucher' });
    }

    // Face à une relance
    const cote = aSuivre / (pot + aSuivre);
    const seuil3bet = relances >= 2 ? 13 : 11;
    const seuilAppel = (relances >= 2 ? 11 : 8) - (tr.appel - 1) * 4 + (aSuivre > tapisEffectif * 0.3 ? 1.5 : 0);
    if (force >= seuil3bet && mesRelances < 2) {
      if (force >= 14 && niveauMise * gb > tapisEffectif * 0.25) return decision({ type: 'tapis' }, 2);
      return decision(relancer(0.9), 1);
    }
    if (force >= seuilAppel || (cote < 0.2 && force >= seuilAppel - 2)) return decision(passif(), 1);
    if (L.peutParler) return decision({ type: 'parole' });
    if (alea() < tr.bluff * 0.15 && L.peutRelancer && nAdv <= 2) return decision(relancer(1), 2); // 3-bet bluff
    return decision({ type: 'coucher' });
  }

  /* ---------------- Après le flop ---------------- */
  const iterations = profil.niveau === 'facile' ? 150 : profil.niveau === 'moyen' ? 350 : 700;
  let eq = equite(moi.cartes, main.tableau, nAdv, iterations, alea);
  if (profil.niveau === 'facile') eq = Math.min(1, Math.max(0, eq + (alea() - 0.5) * 0.25));

  // Un joueur qui mise a en moyenne une meilleure main qu'une main au hasard.
  if (aSuivre > 0 && profil.niveau !== 'facile') {
    const agresseur = main.joueurs.find((p) => p.siege === main.dernierAgresseur);
    let prudence = Math.min(0.35, (aSuivre / Math.max(pot - aSuivre, 1)) * 0.25) + (main.phase === 'river' ? 0.06 : 0);
    if (profil.niveau === 'difficile' && agresseur && ctx.observateur) {
      const lu = ctx.observateur.lire(agresseur.id);
      if (lu.fiable) {
        if (lu.agressif > 0.6 || lu.large > 0.45) prudence *= 0.4;      // agresseur qui mise tout le temps
        else if (lu.agressif < 0.35 && lu.large < 0.25) prudence *= 1.6; // joueur serré qui mise rarement
      }
    }
    eq = eq * (1 - prudence);
  }

  const juste = 1 / (nAdv + 1);
  const s = (eq - juste) / (1 - juste); // force relative : 0 = moyenne, 1 = imbattable
  const maMain = categorie(evaluer(moi.cartes.concat(main.tableau)));
  const tirage = main.phase !== 'river' && maMain <= Categorie.CarteHaute && eq > juste * 0.85;

  if (aSuivre === 0) {
    if (s > 0.5) {
      const piege = profil.niveau === 'difficile' && s > 0.8 && alea() < 0.25; // laisser venir
      if (!piege && alea() < 0.6 + tr.agressivite * 0.4) return decision(relancer(0.55 + alea() * 0.3), 1);
      return decision({ type: 'parole' });
    }
    if (s > 0.2 && alea() < tr.agressivite * 0.6) return decision(relancer(0.4 + alea() * 0.2));
    if (tirage && profil.niveau !== 'facile' && alea() < tr.agressivite * 0.5) return decision(relancer(0.5 + alea() * 0.2), 1);
    if (alea() < tr.bluff / nAdv) return decision(relancer(0.5 + alea() * 0.25), 1);
    return decision({ type: 'parole' });
  }

  const cote = aSuivre / (pot + aSuivre);
  if (s > 0.62 && L.peutRelancer && (mesRelances < 2 || s > 0.85) && alea() < 0.45 + tr.agressivite * 0.45) {
    return decision(relancer(0.7 + alea() * 0.3), 2);
  }
  const marge = 0.02 + tr.serrage * 0.015;
  if (eq * tr.appel > cote + marge) return decision({ type: 'suivre' }, aSuivre > pot * 0.5 ? 2 : 1);
  if (nAdv === 1 && L.peutRelancer && main.phase !== 'river' && alea() < tr.bluff * 0.3) return decision(relancer(0.9), 2);
  return decision(coucher(), aSuivre > pot * 0.4 ? 1 : 0);
}

/* ------------------------------------------------------------------ */

function reflexion(p: ProfilBot, alea: () => number, difficulte: number): number {
  const base = p.niveau === 'facile' ? 700 : 900;
  return Math.round(base + alea() * 900 + difficulte * (400 + alea() * 700));
}

/** Nombre de joueurs encore à parler après moi avant le flop (pour la position). */
function joueursAPres(main: EtatMain, siege: number): number {
  const enJeu = main.joueurs.filter((p) => !p.couche).map((p) => p.siege).sort((a, b) => a - b);
  const ordre = [...enJeu.filter((s) => s > main.bouton), ...enJeu.filter((s) => s <= main.bouton)];
  // Pré-flop, les blindes parlent en dernier : ordre = UTG … bouton, PB, GB
  const blindes = ordre.slice(0, 2);
  const avant = [...ordre.slice(2), ...blindes];
  const i = avant.indexOf(siege);
  return i < 0 ? 0 : avant.length - 1 - i;
}

function nombreRelancesPreflop(main: EtatMain): number {
  let n = 0;
  for (const e of main.evenements) {
    if (e.t === 'rue') break;
    if (e.t === 'action' && (e.action === 'relancer' || e.action === 'miser')) n++;
  }
  return n;
}

function relancesDansLeTour(main: EtatMain, siege: number): number {
  let n = 0;
  for (let i = main.evenements.length - 1; i >= 0; i--) {
    const e: Evenement = main.evenements[i];
    if (e.t === 'rue') break;
    if (e.t === 'action' && e.siege === siege && (e.action === 'relancer' || e.action === 'miser')) n++;
  }
  return n;
}
