import { describe, it, expect } from 'vitest';
import { etatBonus, veille, jourParis, CALENDRIER } from '../bonus.js';

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
  it('a un coffre tous les 3 jours', () => {
    expect(CALENDRIER.map((r) => r.coffre)).toEqual([false, false, true, false, false, true, true]);
  });
});
