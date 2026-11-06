import { describe, it, expect } from 'vitest';
import { TICKETS, tauxRetour, chanceGain, casesGagnantes, fabriquerTicket, gainDuContenu, KENO, KENO_GAINS, gainKeno, validerGrilleKeno, LOTO, LOTO_GAINS, rangLoto, validerGrilleLoto, tirerKeno, tirerLoto, prochainTirage, TypeTicket } from '../kiosque.js';

let graine = 12345;
const h = (n: number) => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine % n; };
const C = (n: number, k: number): number => (k < 0 || k > n ? 0 : k === 0 ? 1 : (C(n - 1, k - 1) * n) / k);

describe('Tickets à gratter', () => {
  it('rendent entre 70 et 90 % des mises en moyenne', () => {
    for (const d of Object.values(TICKETS)) {
      const r = tauxRetour(d);
      expect(r, d.nom).toBeGreaterThan(0.7);
      expect(r, d.nom).toBeLessThan(0.9);
    }
  });
  it('ont toujours un contenu qui correspond exactement au gain tiré', () => {
    for (const type of Object.keys(TICKETS) as TypeTicket[]) {
      for (let i = 0; i < 1500; i++) {
        const t = fabriquerTicket(type, h);
        expect(gainDuContenu(t), `${type} n°${i}`).toBe(t.gain);
      }
    }
  });
  it('Trèfle Cash : plus d\'une chance sur 4 de gagner', () => {
    expect(chanceGain(TICKETS.trefle)).toBeGreaterThan(0.25);
  });
  it('signalent des cases gagnantes seulement sur les tickets gagnants', () => {
    for (const type of Object.keys(TICKETS) as TypeTicket[]) {
      for (let i = 0; i < 300; i++) {
        const t = fabriquerTicket(type, h);
        expect(casesGagnantes(t).length > 0, `${type} n°${i}`).toBe(t.gain > 0);
      }
    }
  });
  it('savent fabriquer chaque lot, même le plus gros', () => {
    for (const d of Object.values(TICKETS)) {
      for (const [g] of d.gains) {
        // On force le tirage du lot en remplaçant le hasard du premier appel
        let premier = true;
        const force = (n: number) => { if (premier) { premier = false; let x = 0; for (const [gg, p] of d.gains) { if (gg === g) return x; x += p; } } return h(n); };
        const t = fabriquerTicket(d.type, force);
        expect(t.gain).toBe(g);
        expect(gainDuContenu(t)).toBe(g);
      }
    }
  });
});

describe('Keno', () => {
  it('rend entre 80 et 95 % des mises, quel que soit le nombre de numéros cochés', () => {
    for (let n = 1; n <= 10; n++) {
      let ev = 0;
      for (const [k, m] of Object.entries(KENO_GAINS[n])) ev += (C(KENO.tires, +k) * C(KENO.numeros - KENO.tires, n - +k)) / C(KENO.numeros, n) * m;
      expect(ev, `${n} numéros`).toBeGreaterThan(0.8);
      expect(ev, `${n} numéros`).toBeLessThan(0.95);
    }
  });
  it('tire 20 numéros différents et paie selon le nombre de bons', () => {
    const t = tirerKeno(h);
    expect(new Set(t).size).toBe(20);
    expect(gainKeno([t[0], t[1], t[2]], t, 100)).toBe(2500);
    expect(gainKeno([t[0]], [], 100)).toBe(0);
  });
  it('refuse les grilles invalides', () => {
    expect(validerGrilleKeno([1, 2, 3], 100)).toEqual({ numeros: [1, 2, 3], mise: 100 });
    expect(validerGrilleKeno([1, 1], 100)).toBeNull();
    expect(validerGrilleKeno([0], 100)).toBeNull();
    expect(validerGrilleKeno([1, 2], 7)).toBeNull();
    expect(validerGrilleKeno(Array.from({ length: 11 }, (_, i) => i + 1), 100)).toBeNull();
  });
  it('numérote les tirages par tranche de 4 minutes', () => {
    expect(prochainTirage(0, KENO.periode)).toBe(1);
    expect(prochainTirage(KENO.periode - 1, KENO.periode)).toBe(1);
    expect(prochainTirage(KENO.periode, KENO.periode)).toBe(2);
  });
});

describe('Loto Flash', () => {
  it('classe les grilles par rang', () => {
    const t = { numeros: [1, 2, 3, 4, 5], etoile: 3 };
    expect(rangLoto([1, 2, 3, 4, 5], 3, t)?.gain).toBe('cagnotte');
    expect(rangLoto([1, 2, 3, 4, 9], 3, t)?.gain).toBe(8000);
    expect(rangLoto([1, 2, 10, 11, 12], 1, t)?.gain).toBe(100);
    expect(rangLoto([1, 10, 11, 12, 13], 3, t)).toBeNull();
    const l = tirerLoto(h);
    expect(new Set(l.numeros).size).toBe(5);
    expect(l.etoile).toBeGreaterThanOrEqual(1);
    expect(l.etoile).toBeLessThanOrEqual(LOTO.etoiles);
  });
  it('rend une bonne part des mises, hors cagnotte', () => {
    const tot = C(LOTO.numeros, LOTO.choix);
    let ev = 0;
    for (const r of LOTO_GAINS) {
      if (r.gain === 'cagnotte') continue;
      const p = (C(5, r.bons) * C(LOTO.numeros - 5, 5 - r.bons)) / tot * (r.etoile ? 1 / LOTO.etoiles : 1 - 1 / LOTO.etoiles);
      ev += p * r.gain;
    }
    expect(ev / LOTO.prix).toBeGreaterThan(0.4);
    expect((ev + LOTO.partCagnotte) / LOTO.prix).toBeLessThan(0.9);
  });
  it('refuse les grilles invalides', () => {
    expect(validerGrilleLoto([5, 4, 3, 2, 1], 2)).toEqual({ numeros: [1, 2, 3, 4, 5], etoile: 2 });
    expect(validerGrilleLoto([1, 2, 3, 4], 2)).toBeNull();
    expect(validerGrilleLoto([1, 2, 3, 4, 26], 2)).toBeNull();
    expect(validerGrilleLoto([1, 2, 3, 4, 5], 7)).toBeNull();
  });
});
