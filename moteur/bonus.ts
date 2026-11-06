/**
 * Portefeuille du Club (les Clubs ♣, argent fictif) : la série du bonus du jour, la Grande Roue et le coup de pouce.
 * Règles pures, sans base de données, pour être testées et partagées avec le client.
 */

export const SOLDE_DEPART = 20_000;
export const SEUIL_COUP_DE_POUCE = 100;
export const COUP_DE_POUCE = 1_000;

/** Un jour de la série : il multiplie le tour de Grande Roue et peut offrir des tickets Banco. */
export interface JourSerie { multiplicateur: number; tickets: number }

/** La série de 7 jours : plus on vient d'affilée, plus le tour de roue rapporte. */
export const CALENDRIER: JourSerie[] = [
  { multiplicateur: 1, tickets: 0 },
  { multiplicateur: 1, tickets: 0 },
  { multiplicateur: 1.5, tickets: 1 },
  { multiplicateur: 2, tickets: 0 },
  { multiplicateur: 2, tickets: 0 },
  { multiplicateur: 3, tickets: 1 },
  { multiplicateur: 5, tickets: 2 },
];

/* ================================ La Grande Roue ================================ */

export interface SegmentRoue { label: string; clubs: number; tickets: number; poids: number; couleur: string }

/** Les 12 cases, dans l'ordre sur la roue (de midi, dans le sens des aiguilles d'une montre). */
export const ROUE: SegmentRoue[] = [
  { label: '250', clubs: 250, tickets: 0, poids: 16, couleur: '#FF6B5B' },
  { label: '1 000', clubs: 1_000, tickets: 0, poids: 8, couleur: '#FFC23D' },
  { label: '500', clubs: 500, tickets: 0, poids: 12, couleur: '#46C2F0' },
  { label: '🎟️', clubs: 0, tickets: 1, poids: 8, couleur: '#43B072' },
  { label: '250', clubs: 250, tickets: 0, poids: 16, couleur: '#8E5BD6' },
  { label: '2 500', clubs: 2_500, tickets: 0, poids: 4, couleur: '#FF9AC1' },
  { label: '500', clubs: 500, tickets: 0, poids: 12, couleur: '#FF6B5B' },
  { label: 'JACKPOT', clubs: 25_000, tickets: 0, poids: 1, couleur: '#FFC23D' },
  { label: '250', clubs: 250, tickets: 0, poids: 16, couleur: '#46C2F0' },
  { label: '1 000', clubs: 1_000, tickets: 0, poids: 8, couleur: '#43B072' },
  { label: '500', clubs: 500, tickets: 0, poids: 12, couleur: '#8E5BD6' },
  { label: '5 000', clubs: 5_000, tickets: 0, poids: 2, couleur: '#FF9AC1' },
];

/** Tire une case de la roue d'après les poids (hasard : un entier dans [0, n)). */
export function tirerRoue(h: (n: number) => number): number {
  let x = h(ROUE.reduce((t, s) => t + s.poids, 0));
  for (let i = 0; i < ROUE.length; i++) { if (x < ROUE[i].poids) return i; x -= ROUE[i].poids; }
  return 0;
}

/** Ce que rapporte une case, multipliée par le jour de la série. */
export function gainRoue(i: number, multiplicateur: number) {
  const s = ROUE[i];
  return { clubs: Math.round(s.clubs * multiplicateur), tickets: s.tickets ? Math.max(1, Math.floor(multiplicateur)) : 0 };
}

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
