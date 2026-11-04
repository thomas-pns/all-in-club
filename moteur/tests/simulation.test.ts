/**
 * Simulation massive : des tables aléatoires jouent des mains aléatoires.
 * Vérifie qu'aucun jeton n'est créé ni perdu, et que toutes les mains se terminent.
 */
import { describe, it, expect } from 'vitest';
import { Table } from '../table.js';
import { actionsLegales, Action, calculerPots, potTotal } from '../main.js';
import { evaluer } from '../evaluation.js';

/** Générateur pseudo-aléatoire reproductible (mulberry32) */
function graine(s: number) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function actionAleatoire(t: Table, r: () => number): Action {
  const L = actionsLegales(t.main!)!;
  const x = r();
  if (L.peutRelancer && x < 0.25) {
    const a = x < 0.05 ? L.maxA : L.minA + Math.floor(r() * (L.maxA - L.minA + 1));
    return { type: L.estMise ? 'miser' : 'relancer', a };
  }
  if (x < 0.4) return { type: 'coucher' };
  if (x < 0.45) return { type: 'tapis' };
  return { type: L.peutParler ? 'parole' : 'suivre' };
}

describe('Simulation de 100 000 mains', () => {
  it('conserve les jetons et termine chaque main', () => {
    const r = graine(42);
    const rng = (n: number) => Math.floor(r() * n);
    let mains = 0;
    for (let partie = 0; mains < 100_000; partie++) {
      const pb = [1, 5, 10, 25][rng(4)];
      const t = new Table({ tapisDepart: [100, 1000, 5000][rng(3)], pb, gb: pb * 2, places: 6, recaves: 'illimitees' });
      const n = 2 + rng(5);
      for (let i = 0; i < n; i++) t.asseoir(`J${i}`, `J${i}`, { siege: i });
      let recu = t.joueurs.reduce((s, p) => s + p.recue, 0);

      for (let k = 0; k < 60; k++) {
        // Événements de table entre les mains
        for (const p of t.joueurs) {
          if (p.tapis === 0) { t.recave(p.id); recu += t.reglages.tapisDepart; }
          const y = r();
          if (y < 0.03) t.sAbsenter(p.id);
          else if (p.absent && y < 0.3) t.revenir(p.id, r() < 0.5);
        }
        if (t.joueurs.length < 6 && r() < 0.05) {
          const libre = t.siegesLibres()[0];
          if (libre !== undefined) { const id = `N${partie}-${k}`; t.asseoir(id, id); recu += t.reglages.tapisDepart; if (r() < 0.5) t.posterPourEntrer(id); }
        }
        if (!t.peutDemarrer()) {
          for (const p of t.joueurs) if (p.absent) t.revenir(p.id, true);
          if (!t.peutDemarrer()) break;
        }
        t.nouvelleMain(rng);
        let garde = 0;
        while (t.mainEnCours()) {
          const m = t.main!;
          expect(potTotal(m) + m.joueurs.reduce((s, p) => s + p.tapis, 0)).toBeGreaterThan(0);
          t.agir(t.sieges[m.aParler!]!.id, actionAleatoire(t, r));
          if (++garde > 500) throw new Error('Main sans fin');
        }
        const m = t.main!;
        // Les gains distribués égalent exactement le pot
        const distribue = Object.values(m.resultat!.gains).reduce((s, x) => s + x, 0);
        expect(distribue).toBe(potTotal(m));
        expect(calculerPots(m).reduce((s, p) => s + p.montant, 0)).toBe(potTotal(m));
        for (const p of t.joueurs) expect(p.tapis).toBeGreaterThanOrEqual(0);
        expect(t.totalJetons()).toBe(recu);
        mains++;
      }
    }
    expect(mains).toBeGreaterThanOrEqual(100_000);
  }, 300_000);
});

describe('Cohérence de l\'évaluation', () => {
  it('la valeur de 7 cartes est la meilleure des 21 combinaisons de 5 (20 000 tirages)', () => {
    const r = graine(7);
    for (let it = 0; it < 20_000; it++) {
      const p = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
      const c = p.slice(0, 7);
      let best = 0;
      for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
        best = Math.max(best, evaluer(c.filter((_, i) => i !== a && i !== b)));
      }
      expect(evaluer(c)).toBe(best);
    }
  });
});
