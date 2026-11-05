/**
 * Portefeuille du Club (les Clubs ♣, argent fictif) : bonus du jour et coup de pouce.
 * Règles pures, sans base de données, pour être testées et partagées avec le client.
 */

export const SOLDE_DEPART = 20_000;
export const SEUIL_COUP_DE_POUCE = 100;
export const COUP_DE_POUCE = 1_000;

export interface Recompense { clubs: number; tickets: number; coffre: boolean }

/** Le calendrier : 7 jours d'affilée, un coffre tous les 3 jours et un grand coffre le 7e. */
export const CALENDRIER: Recompense[] = [
  { clubs: 250, tickets: 0, coffre: false },
  { clubs: 500, tickets: 0, coffre: false },
  { clubs: 1_500, tickets: 1, coffre: true },
  { clubs: 750, tickets: 0, coffre: false },
  { clubs: 1_000, tickets: 0, coffre: false },
  { clubs: 2_500, tickets: 1, coffre: true },
  { clubs: 10_000, tickets: 2, coffre: true },
];

/** Jour du calendrier à Paris, « AAAA-MM-JJ ». */
export function jourParis(t: number): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/** Veille d'un jour « AAAA-MM-JJ ». */
export function veille(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface EtatBonus {
  /** Jour du cycle (1 à 7) : celui à encaisser si dispo, sinon le dernier encaissé. */
  jour: number;
  dispo: boolean;
  /** La série a été interrompue (un jour manqué) : on repart au jour 1. */
  reprise: boolean;
}

/** Où en est la série : `serie` = jour du cycle encaissé en dernier (0 = jamais). */
export function etatBonus(serie: number, dernier: string | null, aujourdhui: string): EtatBonus {
  if (dernier === aujourdhui) return { jour: Math.max(1, serie), dispo: false, reprise: false };
  if (dernier && dernier === veille(aujourdhui)) return { jour: (serie % CALENDRIER.length) + 1, dispo: true, reprise: false };
  return { jour: 1, dispo: true, reprise: !!dernier };
}
