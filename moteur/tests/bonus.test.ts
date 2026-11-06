import { describe, it, expect } from 'vitest';
import { etatBonus, veille, jourParis, CALENDRIER, ROUE, tirerRoue, gainRoue } from '../bonus.js';

describe('Bonus du jour', () => {
  it('calcule la veille, même en changeant de mois ou d\'année', () => {
    expect(veille('2026-03-01')).toBe('2026-02-28');
    expect(veille('2027-01-01')).toBe('2026-12-31');
  });
  it('donne le jour à Paris (minuit passé en France, pas encore en UTC)', () => {
    expect(jourParis(Date.UTC(2026, 10, 5, 23, 30))).toBe('2026-11-06');
    expect(jourParis(Date.UTC(2026, 6, 5, 21, 30))).toBe('2026-07-05');
    expect(jourParis(Date.UTC(2026, 6, 5, 22, 30))).toBe('2026-07-06');
  });
  it('avance d\'un jour, boucle après 7 jours et repart à 1 si on rate un jour', () => {
    expect(etatBonus(0, null, '2026-11-05')).toEqual({ jour: 1, dispo: true, reprise: false });
    expect(etatBonus(1, '2026-11-05', '2026-11-05')).toEqual({ jour: 1, dispo: false, reprise: false });
    expect(etatBonus(3, '2026-11-04', '2026-11-05')).toEqual({ jour: 4, dispo: true, reprise: false });
    expect(etatBonus(7, '2026-11-04', '2026-11-05')).toEqual({ jour: 1, dispo: true, reprise: false });
    expect(etatBonus(5, '2026-11-02', '2026-11-05')).toEqual({ jour: 1, dispo: true, reprise: true });
  });
  it('multiplie la roue de ×1 à ×5 au fil de la série', () => {
    expect(CALENDRIER.map((r) => r.multiplicateur)).toEqual([1, 1, 1.5, 2, 2, 3, 5]);
  });
  it('Grande Roue : 12 cases, jackpot rare, gain moyen raisonnable', () => {
    expect(ROUE).toHaveLength(12);
    const total = ROUE.reduce((t, s) => t + s.poids, 0);
    const moyen = ROUE.reduce((t, s) => t + s.clubs * s.poids, 0) / total;
    expect(moyen).toBeGreaterThan(500);
    expect(moyen).toBeLessThan(1_200);
    expect(ROUE.find((s) => s.label === 'JACKPOT')!.poids / total).toBeLessThan(0.01);
    const vus = new Set<number>(); let x = 0;
    for (let i = 0; i < total; i++) vus.add(tirerRoue(() => x++));
    expect(vus.size).toBe(12);
    expect(gainRoue(7, 5)).toEqual({ clubs: 125_000, tickets: 0 });
    expect(gainRoue(3, 3)).toEqual({ clubs: 0, tickets: 3 });
  });
});
