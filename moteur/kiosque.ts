/**
 * Le Kiosque du Club : tickets à gratter, Keno et Loto Flash, joués en Clubs ♣ (argent fictif).
 * Les règles et les gains sont ici ; le serveur s'occupe des paiements et des tirages programmés.
 *
 * Un ticket est tiré au sort au moment de l'achat : son gain est fixé d'après la table des gains,
 * puis son contenu (la grille à gratter) est fabriqué pour correspondre à ce gain.
 */

/** Hasard : un entier dans [0, n). */
export type Hasard = (n: number) => number;

/* ============================ Tickets à gratter ============================ */

export type TypeTicket = 'morpion' | 'numeros' | 'mots';

export interface DefTicket {
  type: TypeTicket; nom: string; prix: number; regle: string;
  /** [gain, chance sur 1 000 000] */
  gains: [number, number][];
}

export const TICKETS: Record<TypeTicket, DefTicket> = {
  morpion: {
    type: 'morpion', nom: 'Morpion', prix: 200, regle: 'Aligne 3 ♣ en ligne, en colonne ou en diagonale : tu gagnes le lot du ticket.',
    gains: [[200, 200_000], [400, 80_000], [1_000, 40_000], [2_000, 15_000], [5_000, 4_000], [20_000, 500]],
  },
  numeros: {
    type: 'numeros', nom: 'Numéros Gagnants', prix: 500, regle: 'Si l\'un de tes numéros est un des 2 numéros gagnants, tu gagnes le lot écrit dessous.',
    gains: [[500, 220_000], [1_000, 100_000], [2_500, 30_000], [5_000, 12_000], [20_000, 2_000], [100_000, 200]],
  },
  mots: {
    type: 'mots', nom: 'Mots Croisés', prix: 1_000, regle: 'Gratte tes lettres : chaque mot entièrement formé compte. 2 mots ou plus et tu gagnes.',
    gains: [[1_000, 250_000], [2_500, 80_000], [6_000, 25_000], [25_000, 4_000], [150_000, 300]],
  },
};

/** Gain moyen rendu par ticket (pour vérifier que le Kiosque ne distribue pas d'argent gratuit). */
export const tauxRetour = (d: DefTicket) => d.gains.reduce((s, [g, p]) => s + g * p, 0) / 1_000_000 / d.prix;

/** Tire le gain d'un ticket (0 = perdu). */
export function tirerGain(d: DefTicket, h: Hasard): number {
  let x = h(1_000_000);
  for (const [g, p] of d.gains) { if (x < p) return g; x -= p; }
  return 0;
}

const melanger = <T>(l: T[], h: Hasard) => { const r = l.slice(); for (let i = r.length - 1; i > 0; i--) { const j = h(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/* ---- Morpion ---- */
const LIGNES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export type SymboleMorpion = '♣' | '✕' | '○';
export const lignesMorpion = (g: SymboleMorpion[]) => LIGNES.filter((l) => l.every((i) => g[i] === '♣'));

function morpion(gain: number, h: Hasard, d: DefTicket) {
  // Le lot affiché : le gain s'il y en a un, sinon un lot qu'on aurait pu gagner
  const lot = gain || d.gains[h(d.gains.length)][0];
  for (;;) {
    const g: SymboleMorpion[] = Array.from({ length: 9 }, () => (['♣', '✕', '○'] as const)[h(3)]);
    if (gain) { const l = LIGNES[h(LIGNES.length)]; l.forEach((i) => (g[i] = '♣')); }
    const n = lignesMorpion(g).length;
    if (gain ? n === 1 : n === 0) return { grille: g, lot };
  }
}

/* ---- Numéros Gagnants ---- */
function numeros(gain: number, h: Hasard, d: DefTicket) {
  const tous = melanger(Array.from({ length: 30 }, (_, i) => i + 1), h);
  const gagnants = tous.slice(0, 2);
  const autres = tous.slice(2);
  const leurres = d.gains.map(([g]) => g);
  const mes = Array.from({ length: 8 }, (_, i) => ({ n: autres[i], lot: leurres[h(leurres.length)] }));
  if (gain) { const i = h(8); mes[i] = { n: gagnants[h(2)], lot: gain }; }
  return { gagnants, mes };
}

/* ---- Mots Croisés ---- */
export const MOTS = ['CLUB', 'CARTE', 'POKER', 'JETON', 'ROUGE', 'NOIR', 'TAPIS', 'MISE', 'GAIN', 'ROI', 'DAME', 'BILLE', 'PIQUE', 'COEUR', 'TREFLE', 'DES', 'AS', 'PARI', 'SORT', 'RIRE', 'TOUR', 'ROSE', 'NOTE', 'TRIO', 'PORTE', 'SOIR', 'LUNE', 'ETOILE', 'TIGRE', 'OSER', 'RIEN', 'PRIME', 'SOLEIL', 'MARIN', 'TRESOR', 'PIRATE', 'ROTI', 'TROU', 'POIRE', 'PISTE', 'SIESTE', 'STOP', 'TOPS'];
export const motForme = (mot: string, lettres: string[]) => [...mot].every((c) => lettres.includes(c));
const ALPHABET = 'ABCDEFGHIJKLMNOPRSTUVZ';

function mots(gain: number, h: Hasard, d: DefTicket) {
  // Nombre de mots formés : 2 à 6 selon le lot (0 ou 1 quand c'est perdu)
  const k = gain ? 2 + d.gains.findIndex(([g]) => g === gain) : h(2);
  for (let essai = 0; essai < 5000; essai++) {
    const choisis: string[] = [];
    let lettres = new Set<string>();
    const pool = melanger(MOTS, h);
    // Des mots qui partagent beaucoup de lettres, pour que k mots tiennent en 14 lettres
    choisis.push(pool[0]); [...pool[0]].forEach((c) => lettres.add(c));
    while (choisis.length < k) {
      const restants = pool.filter((m) => !choisis.includes(m)).sort((a, b) => [...new Set(a)].filter((c) => !lettres.has(c)).length - [...new Set(b)].filter((c) => !lettres.has(c)).length);
      const m = restants[h(Math.min(3, restants.length))];
      choisis.push(m); [...m].forEach((c) => lettres.add(c));
    }
    if (k === 0) lettres = new Set();
    if (lettres.size > 14) continue;
    const autres = pool.filter((m) => !choisis.includes(m) && !motForme(m, [...lettres])).slice(0, 6 - choisis.length);
    const liste = [...lettres];
    let garde = 0;
    while (liste.length < 14 && garde++ < 200) {
      const c = ALPHABET[h(ALPHABET.length)];
      if (liste.includes(c)) continue;
      if (autres.some((m) => motForme(m, [...liste, c]))) continue;
      liste.push(c);
    }
    const affiches = melanger([...choisis, ...autres], h);
    if (liste.length === 14 && affiches.length === 6 && affiches.filter((m) => motForme(m, liste)).length === Math.max(k, 0)) {
      return { lettres: melanger(liste, h), mots: affiches };
    }
  }
  throw new Error('Ticket Mots Croisés impossible à fabriquer');
}

export interface Ticket { type: TypeTicket; gain: number; contenu: unknown }

export function fabriquerTicket(type: TypeTicket, h: Hasard): Ticket {
  const d = TICKETS[type];
  const gain = tirerGain(d, h);
  const contenu = type === 'morpion' ? morpion(gain, h, d) : type === 'numeros' ? numeros(gain, h, d) : mots(gain, h, d);
  return { type, gain, contenu };
}

/** Recalcule le gain d'après le contenu : le contenu fait foi, c'est ce que voit le joueur. */
export function gainDuContenu(t: Ticket): number {
  if (t.type === 'morpion') { const c = t.contenu as ReturnType<typeof morpion>; return lignesMorpion(c.grille).length ? c.lot : 0; }
  if (t.type === 'numeros') { const c = t.contenu as ReturnType<typeof numeros>; return c.mes.filter((m) => c.gagnants.includes(m.n)).reduce((s, m) => s + m.lot, 0); }
  const c = t.contenu as ReturnType<typeof mots>;
  const n = c.mots.filter((m) => motForme(m, c.lettres)).length;
  return n >= 2 ? TICKETS.mots.gains[n - 2][0] : 0;
}

/* ================================ Keno ================================ */

export const KENO = { numeros: 70, tires: 20, periode: 4 * 60_000, fermeture: 10_000, mises: [50, 100, 500, 1_000] };

/** Multiplicateur de la mise selon le nombre de numéros cochés, puis le nombre de bons. */
export const KENO_GAINS: Record<number, Record<number, number>> = {
  1: { 1: 3 }, 2: { 2: 11 }, 3: { 3: 25, 2: 2 }, 4: { 4: 60, 3: 5, 2: 1 }, 5: { 5: 200, 4: 12, 3: 3 },
  6: { 6: 600, 5: 40, 4: 6, 3: 1 }, 7: { 7: 1_500, 6: 80, 5: 12, 4: 3, 3: 1 }, 8: { 8: 5_000, 7: 300, 6: 40, 5: 8, 4: 2 },
  9: { 9: 15_000, 8: 1_000, 7: 100, 6: 18, 5: 4, 4: 1 }, 10: { 10: 50_000, 9: 3_000, 8: 300, 7: 50, 6: 10, 5: 2, 0: 2 },
};

export const tirerNumeros = (n: number, k: number, h: Hasard) => melanger(Array.from({ length: n }, (_, i) => i + 1), h).slice(0, k).sort((a, b) => a - b);
export const tirerKeno = (h: Hasard) => tirerNumeros(KENO.numeros, KENO.tires, h);

export function gainKeno(choix: number[], tirage: number[], mise: number): number {
  const bons = choix.filter((n) => tirage.includes(n)).length;
  return (KENO_GAINS[choix.length]?.[bons] ?? 0) * mise;
}

export function validerGrilleKeno(numeros: unknown, mise: unknown): { numeros: number[]; mise: number } | null {
  if (!Array.isArray(numeros) || !KENO.mises.includes(Number(mise))) return null;
  const n = [...new Set(numeros.map(Number))].sort((a, b) => a - b);
  if (n.length < 1 || n.length > 10 || n.length !== numeros.length || n.some((x) => !Number.isInteger(x) || x < 1 || x > KENO.numeros)) return null;
  return { numeros: n, mise: Number(mise) };
}

/* ============================== Loto Flash ============================== */

export const LOTO = { numeros: 25, choix: 5, etoiles: 6, periode: 10 * 60_000, fermeture: 15_000, prix: 100, cagnotteDepart: 50_000, partCagnotte: 25 };

/** Gains par rang : [bons numéros, étoile ?] → Clubs. 5 + étoile : la cagnotte. */
export const LOTO_GAINS: { bons: number; etoile: boolean; gain: number | 'cagnotte'; nom: string }[] = [
  { bons: 5, etoile: true, gain: 'cagnotte', nom: '5 numéros + étoile' },
  { bons: 5, etoile: false, gain: 15_000, nom: '5 numéros' },
  { bons: 4, etoile: true, gain: 8_000, nom: '4 numéros + étoile' },
  { bons: 4, etoile: false, gain: 1_500, nom: '4 numéros' },
  { bons: 3, etoile: true, gain: 800, nom: '3 numéros + étoile' },
  { bons: 3, etoile: false, gain: 300, nom: '3 numéros' },
  { bons: 2, etoile: true, gain: 250, nom: '2 numéros + étoile' },
  { bons: 2, etoile: false, gain: 100, nom: '2 numéros' },
];

export interface TirageLoto { numeros: number[]; etoile: number }
export const tirerLoto = (h: Hasard): TirageLoto => ({ numeros: tirerNumeros(LOTO.numeros, LOTO.choix, h), etoile: 1 + h(LOTO.etoiles) });

export function rangLoto(numeros: number[], etoile: number, t: TirageLoto) {
  const bons = numeros.filter((n) => t.numeros.includes(n)).length;
  return LOTO_GAINS.find((r) => r.bons === bons && r.etoile === (etoile === t.etoile)) ?? null;
}

export function validerGrilleLoto(numeros: unknown, etoile: unknown): { numeros: number[]; etoile: number } | null {
  if (!Array.isArray(numeros)) return null;
  const n = [...new Set(numeros.map(Number))].sort((a, b) => a - b);
  const e = Number(etoile);
  if (n.length !== LOTO.choix || numeros.length !== LOTO.choix || n.some((x) => !Number.isInteger(x) || x < 1 || x > LOTO.numeros)) return null;
  if (!Number.isInteger(e) || e < 1 || e > LOTO.etoiles) return null;
  return { numeros: n, etoile: e };
}

/** Numéro du tirage suivant (le tirage n a lieu à l'instant n × période). */
export const prochainTirage = (t: number, periode: number) => Math.floor(t / periode) + 1;
