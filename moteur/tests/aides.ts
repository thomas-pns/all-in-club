import { Carte, parseCartes } from '../cartes.js';
import { Blinde, EtatMain, demarrerMain, agir, Action } from '../main.js';

/**
 * Construit un paquet qui donne des cartes précises.
 * `mains` : cartes de chaque joueur dans l'ordre de donne (à gauche du bouton d'abord).
 */
export function paquetPour(mains: string[], tableau: string): Carte[] {
  const m = mains.map(parseCartes);
  const t = parseCartes(tableau);
  const utilisees = new Set([...m.flat(), ...t]);
  const reste = Array.from({ length: 52 }, (_, i) => i).filter((c) => !utilisees.has(c));
  const brule = () => reste.shift()!;
  const p: Carte[] = [];
  for (const x of m) p.push(x[0]);
  for (const x of m) p.push(x[1]);
  p.push(brule(), t[0], t[1], t[2], brule(), t[3], brule(), t[4]);
  return [...p, ...reste];
}

export interface Config {
  tapis: number[];      // par siège 0..n-1
  bouton?: number;
  pb?: number;
  gb?: number;
  mains?: string[];     // par siège
  tableau?: string;
  blindesEnPlus?: Blinde[];
}

/** Main simple : sièges 0..n-1, blindes standards. */
export function main(cfg: Config): EtatMain {
  const n = cfg.tapis.length;
  const bouton = cfg.bouton ?? 0;
  const pbM = cfg.pb ?? 10, gbM = cfg.gb ?? 20;
  const sieges = [...Array(n).keys()];
  const ordre = [...sieges.slice(bouton + 1), ...sieges.slice(0, bouton + 1)];
  const sPB = n === 2 ? bouton : ordre[0];
  const sGB = n === 2 ? ordre[0] : ordre[1];
  const mains = cfg.mains ?? sieges.map(() => '');
  const paquet = cfg.mains
    ? paquetPour(ordre.map((s) => mains[s]), cfg.tableau ?? '2c 7d 9h Js 4c')
    : undefined;
  return demarrerMain({
    joueurs: sieges.map((s) => ({ siege: s, id: `J${s}`, tapis: cfg.tapis[s] })),
    bouton, pb: pbM, gb: gbM, siegeGB: sGB,
    blindes: [{ siege: sPB, montant: pbM, nom: 'PB' }, { siege: sGB, montant: gbM, nom: 'GB' }, ...(cfg.blindesEnPlus ?? [])],
    paquet,
    rng: paquet ? undefined : (k) => Math.floor(Math.random() * k),
  });
}

/** Joue une suite d'actions « siège:action[:montant] », ex. "2:relancer:60 0:suivre". */
export function jouer(e: EtatMain, suite: string): void {
  for (const pas of suite.trim().split(/\s+/)) {
    const [s, type, a] = pas.split(':');
    const action: Action = { type: type as Action['type'], a: a ? Number(a) : undefined };
    agir(e, Number(s), action);
  }
}

export const tapisDe = (e: EtatMain) => e.joueurs.map((p) => p.tapis);
