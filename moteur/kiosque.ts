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

export type TypeTicket = 'banco' | 'coffre' | 'trefle' | 'millionnaire';

export interface DefTicket {
  type: TypeTicket; nom: string; prix: number; regle: string;
  /** [gain, chance sur 1 000 000] */
  gains: [number, number][];
}

export const TICKETS: Record<TypeTicket, DefTicket> = {
  banco: {
    type: 'banco', nom: 'Le Banco', prix: 100, regle: 'Gratte les 6 cases : 3 montants identiques et tu gagnes ce montant.',
    gains: [[100, 250_000], [200, 100_000], [500, 30_000], [1_000, 10_000], [5_000, 1_000], [20_000, 100]],
  },
  coffre: {
    type: 'coffre', nom: 'Le Coffre', prix: 500, regle: 'Si l\'un de tes 10 lingots porte un des 3 numéros gagnants, tu gagnes le lot écrit dessous.',
    gains: [[500, 220_000], [1_000, 100_000], [2_000, 40_000], [5_000, 12_000], [20_000, 1_500], [100_000, 100]],
  },
  trefle: {
    type: 'trefle', nom: 'Trèfle Cash', prix: 1_000, regle: 'Chacun de tes 20 numéros qui est un des 5 numéros gagnants rapporte son lot. Un ♣ gagne directement son lot.',
    gains: [[1_000, 170_000], [2_000, 60_000], [5_000, 30_000], [10_000, 15_000], [20_000, 4_000], [50_000, 1_500], [250_000, 100]],
  },
  millionnaire: {
    type: 'millionnaire', nom: 'Le Millionnaire', prix: 5_000, regle: '3 jeux sur un ticket, chacun avec son lot : 3 symboles identiques, un de tes numéros plus grand que le sien, ou une 👑 dans la dernière ligne. Les gains s\'additionnent.',
    gains: [[5_000, 220_000], [10_000, 100_000], [25_000, 35_000], [50_000, 12_000], [200_000, 1_500], [1_000_000, 100]],
  },
};

/** Gain moyen rendu par ticket (pour vérifier que le Kiosque ne distribue pas d'argent gratuit). */
export const tauxRetour = (d: DefTicket) => d.gains.reduce((s, [g, p]) => s + g * p, 0) / 1_000_000 / d.prix;
/** Chance de gagner quelque chose (de 0 à 1). */
export const chanceGain = (d: DefTicket) => d.gains.reduce((s, [, p]) => s + p, 0) / 1_000_000;

/** Tire le gain d'un ticket (0 = perdu). */
export function tirerGain(d: DefTicket, h: Hasard): number {
  let x = h(1_000_000);
  for (const [g, p] of d.gains) { if (x < p) return g; x -= p; }
  return 0;
}

const melanger = <T>(l: T[], h: Hasard) => { const r = l.slice(); for (let i = r.length - 1; i > 0; i--) { const j = h(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const piocher = <T>(l: T[], h: Hasard) => l[h(l.length)];
const lotsDe = (d: DefTicket) => d.gains.map(([g]) => g);

/* ---- Le Banco : 6 montants, 3 identiques = gagné ---- */
export interface ContenuBanco { cases: number[] }
function banco(gain: number, h: Hasard, d: DefTicket): ContenuBanco {
  const lots = lotsDe(d);
  for (;;) {
    let cases: number[];
    if (gain) {
      const autres = lots.filter((l) => l !== gain);
      cases = [gain, gain, gain, piocher(autres, h), piocher(autres, h), piocher(autres, h)];
    } else cases = Array.from({ length: 6 }, () => piocher(lots, h));
    cases = melanger(cases, h);
    if (gainBanco(cases) === gain) return { cases };
  }
}
const gainBanco = (cases: number[]) => {
  const n = new Map<number, number>(); cases.forEach((c) => n.set(c, (n.get(c) ?? 0) + 1));
  const gagnants = [...n].filter(([, k]) => k >= 3).map(([c]) => c);
  return gagnants.length === 1 ? gagnants[0] : gagnants.length ? -1 : 0;
};

/* ---- Le Coffre : 3 numéros gagnants, 10 lingots ---- */
export interface ContenuCoffre { gagnants: number[]; lingots: { n: number; lot: number }[] }
function coffre(gain: number, h: Hasard, d: DefTicket): ContenuCoffre {
  const tous = melanger(Array.from({ length: 40 }, (_, i) => i + 1), h);
  const gagnants = tous.slice(0, 3), autres = tous.slice(3);
  const lots = lotsDe(d);
  const lingots = Array.from({ length: 10 }, (_, i) => ({ n: autres[i], lot: piocher(lots, h) }));
  if (gain) lingots[h(10)] = { n: piocher(gagnants, h), lot: gain };
  return { gagnants, lingots };
}

/* ---- Trèfle Cash : 5 numéros gagnants, 20 numéros, ♣ = gagné direct ---- */
export const LOTS_TREFLE = [20, 50, 100, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 250_000];
export interface ContenuTrefle { gagnants: number[]; cases: { n: number | null; lot: number }[] }
function trefle(gain: number, h: Hasard): ContenuTrefle {
  const tous = melanger(Array.from({ length: 40 }, (_, i) => i + 1), h);
  const gagnants = tous.slice(0, 5), autres = tous.slice(5);
  const cases: ContenuTrefle['cases'] = Array.from({ length: 20 }, (_, i) => ({ n: autres[i], lot: piocher(LOTS_TREFLE, h) }));
  if (gain) {
    // Le gain tombe sur une case, ou se partage en deux quand c'est possible
    const parts = gain >= 2_000 && LOTS_TREFLE.includes(gain / 2) && h(2) ? [gain / 2, gain / 2] : [gain];
    const places = melanger(Array.from({ length: 20 }, (_, i) => i), h);
    parts.forEach((lot, k) => { cases[places[k]] = { n: h(3) ? piocher(gagnants, h) : null, lot }; });
  }
  return { gagnants, cases };
}

/* ---- Le Millionnaire : 3 jeux sur un ticket ---- */
export const SYMBOLES_MILLION = ['💎', '🍒', '🔔', '⭐', '🍀', '7️⃣'];
export interface ContenuMillionnaire {
  symboles: { cases: string[]; lot: number };
  duel: { mes: number[]; sien: number; lot: number };
  couronne: { cases: string[]; lot: number };
}
function millionnaire(gain: number, h: Hasard, d: DefTicket): ContenuMillionnaire {
  const lots = lotsDe(d).filter((l) => l < 200_000);
  // Le gros lot se gagne à la couronne, les autres à l'un des deux premiers jeux
  const jeu = !gain ? -1 : gain >= 200_000 ? 2 : h(2);
  const lot = (j: number) => (j === jeu ? gain : j === 2 ? piocher([200_000, 1_000_000], h) : piocher(lots, h));
  // Jeu 1 : trois symboles
  let cases1: string[];
  if (jeu === 0) { const s = piocher(SYMBOLES_MILLION, h); cases1 = [s, s, s]; }
  else do { cases1 = Array.from({ length: 3 }, () => piocher(SYMBOLES_MILLION, h)); } while (cases1[0] === cases1[1] && cases1[1] === cases1[2]);
  // Jeu 2 : un de mes numéros plus grand que le sien
  let mes: number[], sien: number;
  do {
    sien = 5 + h(20);
    mes = Array.from({ length: 3 }, () => 1 + h(30));
  } while ((jeu === 1) !== mes.some((n) => n > sien) || mes.includes(sien));
  // Jeu 3 : la couronne
  const decor = ['🪙', '💰', '🎩', '🍾', '🏆'];
  const cases3 = Array.from({ length: 6 }, () => piocher(decor, h));
  if (jeu === 2) cases3[h(6)] = '👑';
  return { symboles: { cases: cases1, lot: lot(0) }, duel: { mes, sien, lot: lot(1) }, couronne: { cases: cases3, lot: lot(2) } };
}

export interface Ticket { type: TypeTicket; gain: number; contenu: unknown }

export function fabriquerTicket(type: TypeTicket, h: Hasard): Ticket {
  const d = TICKETS[type];
  const gain = tirerGain(d, h);
  const contenu = type === 'banco' ? banco(gain, h, d) : type === 'coffre' ? coffre(gain, h, d) : type === 'trefle' ? trefle(gain, h) : millionnaire(gain, h, d);
  return { type, gain, contenu };
}

/** Recalcule le gain d'après le contenu : le contenu fait foi, c'est ce que voit le joueur. */
export function gainDuContenu(t: Ticket): number {
  if (t.type === 'banco') return Math.max(0, gainBanco((t.contenu as ContenuBanco).cases));
  if (t.type === 'coffre') { const c = t.contenu as ContenuCoffre; return c.lingots.filter((l) => c.gagnants.includes(l.n)).reduce((s, l) => s + l.lot, 0); }
  if (t.type === 'trefle') { const c = t.contenu as ContenuTrefle; return c.cases.filter((x) => x.n === null || c.gagnants.includes(x.n)).reduce((s, x) => s + x.lot, 0); }
  const c = t.contenu as ContenuMillionnaire;
  const [a, b, x] = c.symboles.cases;
  return (a === b && b === x ? c.symboles.lot : 0) + (c.duel.mes.some((n) => n > c.duel.sien) ? c.duel.lot : 0) + (c.couronne.cases.includes('👑') ? c.couronne.lot : 0);
}

/** Les cases gagnantes d'un ticket (pour les faire briller une fois grattées). */
export function casesGagnantes(t: Ticket): string[] {
  if (t.type === 'banco') { const c = t.contenu as ContenuBanco; const g = gainBanco(c.cases); return c.cases.flatMap((v, i) => (v === g ? [`c${i}`] : [])); }
  if (t.type === 'coffre') { const c = t.contenu as ContenuCoffre; return c.lingots.flatMap((l, i) => (c.gagnants.includes(l.n) ? [`l${i}`] : [])); }
  if (t.type === 'trefle') { const c = t.contenu as ContenuTrefle; return c.cases.flatMap((x, i) => (x.n === null || c.gagnants.includes(x.n) ? [`c${i}`] : [])); }
  const c = t.contenu as ContenuMillionnaire, r: string[] = [];
  const [a, b, x] = c.symboles.cases; if (a === b && b === x) r.push('s0', 's1', 's2');
  c.duel.mes.forEach((n, i) => { if (n > c.duel.sien) r.push(`d${i}`); });
  c.couronne.cases.forEach((s, i) => { if (s === '👑') r.push(`k${i}`); });
  return r;
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
