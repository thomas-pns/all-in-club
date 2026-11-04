/**
 * Cartes : un entier de 0 à 51.
 *   rang    = (c >> 2) + 2   → 2..14 (14 = As)
 *   couleur = c & 3          → 0 pique, 1 cœur, 2 carreau, 3 trèfle
 */
export type Carte = number;

/** Générateur aléatoire : renvoie un entier dans [0, n[. Le serveur utilise crypto.randomInt. */
export type Rng = (n: number) => number;

export const rngMath: Rng = (n) => Math.floor(Math.random() * n);

export const RANGS = '23456789TJQKA';
export const COULEURS = 'shdc';
export const SYMBOLES = ['♠', '♥', '♦', '♣'];

export const rang = (c: Carte): number => (c >> 2) + 2;
export const couleur = (c: Carte): number => c & 3;

/** "As", "Td", "2c"… */
export function carteTexte(c: Carte): string {
  return RANGS[rang(c) - 2] + COULEURS[couleur(c)];
}

export function parseCarte(t: string): Carte {
  const r = RANGS.indexOf(t[0].toUpperCase());
  const s = COULEURS.indexOf(t[1].toLowerCase());
  if (r < 0 || s < 0 || t.length !== 2) throw new Error(`Carte invalide : ${t}`);
  return (r << 2) | s;
}

export const parseCartes = (t: string): Carte[] =>
  t.trim() ? t.trim().split(/\s+/).map(parseCarte) : [];

/** Paquet de 52 cartes mélangé (Fisher-Yates). */
export function paquetMelange(rng: Rng): Carte[] {
  const p = Array.from({ length: 52 }, (_, i) => i);
  for (let i = p.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}
