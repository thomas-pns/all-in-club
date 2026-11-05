/**
 * Le Casino : les tables par ville, où l'on joue avec ses Clubs ♣.
 * S'asseoir coûte la cave (prélevée sur le portefeuille, convertie en jetons) ;
 * en se levant, les jetons qui restent retournent au portefeuille.
 */
import type { ReglagesSalle } from './salle.js';
import type { ReglagesBJ } from './blackjack/salleBJ.js';
import type { ReglagesRoulette } from './roulette/salleRoulette.js';

export type JeuCasino = 'poker' | 'blackjack' | 'roulette';
export type IdVille = 'bistrot' | 'vegas' | 'monaco' | 'macao';

export interface Ville {
  id: IdVille; nom: string; couleur: string; accroche: string;
  poker: { pb: number; cave: number };
  blackjack: { miseMin: number; miseMax: number; cave: number };
  roulette: { miseMin: number; cave: number };
}

export const VILLES: Ville[] = [
  { id: 'bistrot', nom: 'Le Bistrot', couleur: '#43B072', accroche: 'Pour se mettre en jambes',
    poker: { pb: 5, cave: 1_000 }, blackjack: { miseMin: 10, miseMax: 200, cave: 1_000 }, roulette: { miseMin: 5, cave: 1_000 } },
  { id: 'vegas', nom: 'Las Vegas', couleur: '#FF6B5B', accroche: 'Les néons et les vraies mises',
    poker: { pb: 50, cave: 10_000 }, blackjack: { miseMin: 100, miseMax: 2_000, cave: 10_000 }, roulette: { miseMin: 100, cave: 10_000 } },
  { id: 'monaco', nom: 'Monaco', couleur: '#46C2F0', accroche: 'Smoking exigé',
    poker: { pb: 500, cave: 100_000 }, blackjack: { miseMin: 1_000, miseMax: 20_000, cave: 100_000 }, roulette: { miseMin: 1_000, cave: 100_000 } },
  { id: 'macao', nom: 'Macao', couleur: '#8E5BD6', accroche: 'Réservé aux millionnaires du Club',
    poker: { pb: 5_000, cave: 1_000_000 }, blackjack: { miseMin: 10_000, miseMax: 200_000, cave: 1_000_000 }, roulette: { miseMin: 10_000, cave: 1_000_000 } },
];

export const ville = (id: unknown): Ville | undefined => VILLES.find((v) => v.id === id);
export const caveDe = (v: Ville, jeu: JeuCasino) => v[jeu].cave;

/** Réglages d'une table du Casino : pas de fin, recaves illimitées (payées en Clubs), publique. */
export function reglagesCasino(v: Ville, jeu: JeuCasino): Partial<ReglagesSalle> | Partial<ReglagesBJ> | Partial<ReglagesRoulette> {
  const commun = { nom: `${v.nom} · ${jeu === 'poker' ? 'Poker' : jeu === 'blackjack' ? 'Black Jack' : 'Roulette'}`, visibilite: 'publique' as const, recaves: 'illimitees' as const, filtreInsultes: true };
  if (jeu === 'poker') return { ...commun, tapisDepart: v.poker.cave, pb: v.poker.pb, gb: v.poker.pb * 2, places: 6, bots: 0, fin: { type: 'jamais' }, tempsReflexion: 20 };
  if (jeu === 'blackjack') return { ...commun, tapisDepart: v.blackjack.cave, miseMin: v.blackjack.miseMin, miseMax: v.blackjack.miseMax, places: 6, manches: 0, tempsReflexion: 20, abandon: true };
  return { ...commun, tapisDepart: v.roulette.cave, miseMin: v.roulette.miseMin, places: 6, tours: 0, tempsMises: 30, partage: true };
}

/** Commandes d'hôte interdites aux tables du Casino (personne n'en est le patron). */
export const COMMANDES_HOTE_CASINO = ['reglages', 'terminer', 'rejouer', 'pause', 'reprendre', 'exclure', 'accorderRecave', 'ajouterBot', 'retirerBot'];
