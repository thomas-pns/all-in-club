import { describe, it, expect } from 'vitest';
import { MISES, ROUE, ROUGES, retourMise, resoudre, couleurNumero, estMise, annonce } from '../roulette/regles.js';

const parType = (t: string) => [...MISES.values()].filter((m) => m.type === t);

describe('Roulette : le tapis', () => {
  it('a le bon nombre de mises de chaque sorte', () => {
    expect(parType('plein')).toHaveLength(37);
    expect(parType('cheval')).toHaveLength(60);
    expect(parType('transversale')).toHaveLength(14);
    expect(parType('carre')).toHaveLength(23);
    expect(parType('sixain')).toHaveLength(11);
    expect(parType('douzaine')).toHaveLength(3);
    expect(parType('colonne')).toHaveLength(3);
    expect(parType('simple')).toHaveLength(6);
  });

  it('le cylindre contient chaque numéro une fois, rouges et noirs alternés', () => {
    expect([...ROUE].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
    for (let i = 1; i < ROUE.length - 1; i++) expect(ROUGES.has(ROUE[i])).not.toBe(ROUGES.has(ROUE[i + 1]));
    expect(ROUGES.size).toBe(18);
  });

  it('refuse les mises qui n\'existent pas', () => {
    expect(estMise('1-5')).toBe(false);      // pas voisins
    expect(estMise('3-4')).toBe(false);      // fin de ligne
    expect(estMise('3-4-6-7')).toBe(false);
    expect(estMise('1-2-4-5')).toBe(true);
    expect(estMise('0-2-3')).toBe(true);
    expect(estMise('34-35-36')).toBe(true);
    expect(estMise('vert')).toBe(false);
  });
});

describe('Roulette : les gains', () => {
  it('paie chaque mise selon le nombre de numéros couverts', () => {
    expect(retourMise('17', 10, 17, true)).toBe(360);        // plein 35 contre 1
    expect(retourMise('17-20', 10, 20, true)).toBe(180);     // cheval 17
    expect(retourMise('16-17-18', 10, 18, true)).toBe(120);  // transversale 11
    expect(retourMise('17-18-20-21', 10, 21, true)).toBe(90); // carré 8
    expect(retourMise('13-14-15-16-17-18', 10, 13, true)).toBe(60); // sixain 5
    expect(retourMise('d2', 10, 24, true)).toBe(30);
    expect(retourMise('c3', 10, 36, true)).toBe(30);
    expect(retourMise('c1', 10, 36, true)).toBe(0);
    expect(retourMise('rouge', 10, 1, true)).toBe(20);
    expect(retourMise('noir', 10, 1, true)).toBe(0);
    expect(retourMise('passe', 10, 19, true)).toBe(20);
  });

  it('applique la partage sur le zéro, seulement aux chances simples', () => {
    expect(retourMise('rouge', 10, 0, true)).toBe(5);
    expect(retourMise('pair', 10, 0, true)).toBe(5);
    expect(retourMise('rouge', 10, 0, false)).toBe(0);
    expect(retourMise('d1', 10, 0, true)).toBe(0);
    expect(retourMise('0', 10, 0, true)).toBe(360);
    expect(retourMise('0-1-2-3', 10, 0, true)).toBe(90);
  });

  it('l\'avantage de la maison est de 1/37 (et moitié moins sur les chances simples avec la partage)', () => {
    for (const m of MISES.values()) {
      let total = 0;
      for (let n = 0; n <= 36; n++) total += retourMise(m.id, 100, n, true);
      const attendu = m.type === 'simple' ? 3650 : 3600;
      expect(total, m.id).toBe(attendu);
    }
  });

  it('résout plusieurs mises à la fois', () => {
    const r = resoudre({ '7': 5, rouge: 20, d1: 10 }, 7, true);
    expect(r.mise).toBe(35);
    expect(r.total).toBe(180 + 40 + 30);
  });

  it('annonce le numéro comme un croupier', () => {
    expect(couleurNumero(0)).toBe('vert');
    expect(annonce(17)).toBe('17 noir, impair et manque');
    expect(annonce(0)).toBe('Zéro !');
  });
});
