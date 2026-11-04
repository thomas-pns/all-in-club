import { Carte, rang, couleur } from './cartes.js';

/**
 * Évaluation d'une main de 5 à 7 cartes.
 * Renvoie un score entier : plus il est grand, meilleure est la main.
 *   score = catégorie × 15⁵ + départage (5 rangs en base 15)
 */
export enum Categorie {
  CarteHaute = 0,
  Paire,
  DoublePaire,
  Brelan,
  Quinte,
  Couleur,
  Full,
  Carre,
  QuinteFlush,
}

const B5 = 15 ** 5;

function encoder(cat: Categorie, ks: number[]): number {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 15 + (ks[i] ?? 0);
  return v;
}

/** Hauteur de la meilleure quinte parmi des rangs distincts, 0 s'il n'y en a pas. */
function hauteurQuinte(rangs: number[]): number {
  const set = new Set(rangs);
  if (set.has(14)) set.add(1); // As bas : A-2-3-4-5
  for (let h = 14; h >= 5; h--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!set.has(h - k)) { ok = false; break; }
    if (ok) return h;
  }
  return 0;
}

export function evaluer(cartes: Carte[]): number {
  const nb = new Array<number>(15).fill(0);
  const parCouleur: number[][] = [[], [], [], []];
  for (const c of cartes) {
    nb[rang(c)]++;
    parCouleur[couleur(c)].push(rang(c));
  }
  let flush: number[] | null = null;
  for (const s of parCouleur) if (s.length >= 5) flush = s.slice().sort((a, b) => b - a);
  if (flush) {
    const h = hauteurQuinte(flush);
    if (h) return encoder(Categorie.QuinteFlush, [h]);
  }
  const carres: number[] = [], brelans: number[] = [], paires: number[] = [], distincts: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (!nb[r]) continue;
    distincts.push(r);
    if (nb[r] === 4) carres.push(r);
    else if (nb[r] === 3) brelans.push(r);
    else if (nb[r] === 2) paires.push(r);
  }
  if (carres.length) return encoder(Categorie.Carre, [carres[0], distincts.find((r) => r !== carres[0]) ?? 0]);
  if (brelans.length && (brelans.length > 1 || paires.length))
    return encoder(Categorie.Full, [brelans[0], Math.max(brelans[1] ?? 0, paires[0] ?? 0)]);
  if (flush) return encoder(Categorie.Couleur, flush.slice(0, 5));
  const h = hauteurQuinte(distincts);
  if (h) return encoder(Categorie.Quinte, [h]);
  if (brelans.length) return encoder(Categorie.Brelan, [brelans[0], ...distincts.filter((r) => r !== brelans[0]).slice(0, 2)]);
  if (paires.length >= 2) {
    const [a, b] = paires;
    return encoder(Categorie.DoublePaire, [a, b, distincts.find((r) => r !== a && r !== b) ?? 0]);
  }
  if (paires.length) return encoder(Categorie.Paire, [paires[0], ...distincts.filter((r) => r !== paires[0]).slice(0, 3)]);
  return encoder(Categorie.CarteHaute, distincts.slice(0, 5));
}

export const categorie = (score: number): Categorie => Math.floor(score / B5);

const kicker = (score: number, i: number) => Math.floor(score / 15 ** (4 - i)) % 15;

const NOM_RANG: Record<number, string> = {
  2: 'Deux', 3: 'Trois', 4: 'Quatre', 5: 'Cinq', 6: 'Six', 7: 'Sept', 8: 'Huit', 9: 'Neuf',
  10: 'Dix', 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As',
};
const PLURIEL: Record<number, string> = {
  2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf',
  10: 'dix', 11: 'valets', 12: 'dames', 13: 'rois', 14: 'as',
};
/** « de » ou « d' » selon la première lettre. */
const de = (r: number) => (r === 14 || r === 8 ? `d'${PLURIEL[r]}` : `de ${PLURIEL[r]}`);
const auRang = (r: number) => (r === 14 ? "à l'as" : r === 11 || r === 13 ? `au ${NOM_RANG[r].toLowerCase()}` : r === 12 ? 'à la dame' : `au ${NOM_RANG[r].toLowerCase()}`);

export const NOMS_CATEGORIES = [
  'Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush',
];

/** Description en français : « Full aux rois par les sept », « Paire d'as »… */
export function decrire(score: number): string {
  const k1 = kicker(score, 0), k2 = kicker(score, 1);
  switch (categorie(score)) {
    case Categorie.CarteHaute: return `Hauteur ${NOM_RANG[k1].toLowerCase()}`;
    case Categorie.Paire: return `Paire ${de(k1)}`;
    case Categorie.DoublePaire: return `Double paire ${PLURIEL[k1]} et ${PLURIEL[k2]}`;
    case Categorie.Brelan: return `Brelan ${de(k1)}`;
    case Categorie.Quinte: return `Quinte ${auRang(k1)}`;
    case Categorie.Couleur: return `Couleur ${auRang(k1)}`;
    case Categorie.Full: return `Full aux ${PLURIEL[k1]} par les ${PLURIEL[k2]}`;
    case Categorie.Carre: return `Carré ${de(k1)}`;
    case Categorie.QuinteFlush: return k1 === 14 ? 'Quinte flush royale' : `Quinte flush ${auRang(k1)}`;
  }
}

/** Les 5 cartes qui forment la meilleure main (pour les mettre en valeur à l'écran). */
export function meilleuresCinq(cartes: Carte[]): Carte[] {
  if (cartes.length <= 5) return cartes.slice();
  const cible = evaluer(cartes);
  const n = cartes.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const m = [cartes[a], cartes[b], cartes[c], cartes[d], cartes[e]];
      if (evaluer(m) === cible) return m;
    }
  return cartes.slice(0, 5);
}
