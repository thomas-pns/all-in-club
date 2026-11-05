/**
 * Règles de la roulette européenne (un seul zéro), à la française.
 *
 * Une mise est identifiée par une chaîne :
 * - à l'intérieur du tapis : les numéros couverts, triés et séparés par « - » (« 17 », « 0-1 », « 1-2-3 », « 1-2-4-5 »…) ;
 * - à l'extérieur : « rouge », « noir », « pair », « impair », « manque » (1-18), « passe » (19-36),
 *   « d1 » « d2 » « d3 » (douzaines) et « c1 » « c2 » « c3 » (colonnes, c1 = 1, 4, 7… 34).
 *
 * Gain : une mise qui couvre n numéros rapporte 36/n − 1 fois la mise (plein 35, cheval 17, transversale 11,
 * carré 8, sixain 5, douzaine et colonne 2, chances simples 1). Avec « la partage », une chance simple
 * perdue sur le zéro rend la moitié de la mise.
 */

/** Ordre des cases sur le cylindre, dans le sens des aiguilles d'une montre. */
export const ROUE = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26] as const;

export const ROUGES = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export type Couleur = 'rouge' | 'noir' | 'vert';
export const couleurNumero = (n: number): Couleur => (n === 0 ? 'vert' : ROUGES.has(n) ? 'rouge' : 'noir');

export type TypeMise = 'plein' | 'cheval' | 'transversale' | 'carre' | 'sixain' | 'douzaine' | 'colonne' | 'simple';

export interface DefinitionMise { id: string; numeros: number[]; type: TypeMise; gain: number; nom: string }

const SIMPLES: Record<string, [string, (n: number) => boolean]> = {
  rouge: ['Rouge', (n) => ROUGES.has(n)],
  noir: ['Noir', (n) => n > 0 && !ROUGES.has(n)],
  pair: ['Pair', (n) => n > 0 && n % 2 === 0],
  impair: ['Impair', (n) => n % 2 === 1],
  manque: ['Manque (1 à 18)', (n) => n >= 1 && n <= 18],
  passe: ['Passe (19 à 36)', (n) => n >= 19],
};

/** Toutes les mises possibles, par identifiant. */
export const MISES: ReadonlyMap<string, DefinitionMise> = (() => {
  const m = new Map<string, DefinitionMise>();
  const ajouter = (numeros: number[], type: TypeMise, nom: string) => {
    const tri = [...numeros].sort((a, b) => a - b);
    const id = tri.join('-');
    if (!m.has(id)) m.set(id, { id, numeros: tri, type, gain: 36 / tri.length - 1, nom });
  };
  for (let n = 0; n <= 36; n++) ajouter([n], 'plein', `Plein ${n}`);
  // Chevaux : deux numéros voisins sur le tapis
  for (let n = 1; n <= 36; n++) {
    if (n % 3 !== 0) ajouter([n, n + 1], 'cheval', `Cheval ${n}/${n + 1}`);
    if (n <= 33) ajouter([n, n + 3], 'cheval', `Cheval ${n}/${n + 3}`);
  }
  for (const n of [1, 2, 3]) ajouter([0, n], 'cheval', `Cheval 0/${n}`);
  // Transversales (une ligne de 3) et les deux triplets avec le zéro
  for (let k = 1; k <= 34; k += 3) ajouter([k, k + 1, k + 2], 'transversale', `Transversale ${k}-${k + 2}`);
  ajouter([0, 1, 2], 'transversale', 'Transversale 0-1-2');
  ajouter([0, 2, 3], 'transversale', 'Transversale 0-2-3');
  // Carrés et « les quatre premiers »
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) ajouter([n, n + 1, n + 3, n + 4], 'carre', `Carré ${n}-${n + 4}`);
  ajouter([0, 1, 2, 3], 'carre', 'Les quatre premiers');
  // Sixains : deux lignes voisines
  for (let k = 1; k <= 31; k += 3) ajouter([k, k + 1, k + 2, k + 3, k + 4, k + 5], 'sixain', `Sixain ${k}-${k + 5}`);
  // Douzaines, colonnes, chances simples
  for (let d = 1; d <= 3; d++) {
    const nums = Array.from({ length: 12 }, (_, i) => (d - 1) * 12 + i + 1);
    m.set(`d${d}`, { id: `d${d}`, numeros: nums, type: 'douzaine', gain: 2, nom: `${['1re', '2e', '3e'][d - 1]} douzaine` });
    const col = Array.from({ length: 12 }, (_, i) => i * 3 + d);
    m.set(`c${d}`, { id: `c${d}`, numeros: col, type: 'colonne', gain: 2, nom: `${['1re', '2e', '3e'][d - 1]} colonne` });
  }
  for (const [id, [nom, f]] of Object.entries(SIMPLES)) {
    m.set(id, { id, numeros: Array.from({ length: 37 }, (_, i) => i).filter(f), type: 'simple', gain: 1, nom });
  }
  return m;
})();

export const estMise = (id: unknown): id is string => typeof id === 'string' && MISES.has(id);

/** Ce que rend une mise (mise comprise) quand le numéro sort. 0 si perdue. */
export function retourMise(id: string, montant: number, numero: number, partage: boolean): number {
  const d = MISES.get(id);
  if (!d) return 0;
  if (d.numeros.includes(numero)) return montant * (d.gain + 1);
  if (numero === 0 && partage && d.type === 'simple') return Math.floor(montant / 2);
  return 0;
}

export interface ResultatMise { id: string; montant: number; retour: number }

/** Résout toutes les mises d'un joueur. */
export function resoudre(mises: Record<string, number>, numero: number, partage: boolean): { detail: ResultatMise[]; total: number; mise: number } {
  const detail = Object.entries(mises).map(([id, montant]) => ({ id, montant, retour: retourMise(id, montant, numero, partage) }));
  return { detail, total: detail.reduce((s, x) => s + x.retour, 0), mise: detail.reduce((s, x) => s + x.montant, 0) };
}

/** Tirage : un entier uniforme entre 0 et 36. */
export const tirer = (rng: (n: number) => number) => rng(37);

/** Description d'un numéro, pour l'annonce du croupier : « 17 noir, impair et manque ». */
export function annonce(n: number): string {
  if (n === 0) return 'Zéro !';
  return `${n} ${couleurNumero(n)}, ${n % 2 ? 'impair' : 'pair'} et ${n <= 18 ? 'manque' : 'passe'}`;
}
