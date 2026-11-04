import { describe, it, expect } from 'vitest';
import { Table } from '../table.js';
import { deciderBot, chen, equite, Observateur, ProfilBot } from '../bots.js';
import { parseCartes, parseCarte } from '../cartes.js';

function graine(s: number) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Bots', () => {
  it('formule de Chen', () => {
    const c = (t: string) => { const [a, b] = parseCartes(t); return chen(a, b); };
    expect(c('As Ah')).toBe(20);
    expect(c('Ks Kh')).toBe(16);
    expect(c('2s 2h')).toBe(5);
    expect(c('As Ks')).toBe(12);
    expect(c('7d 2c')).toBe(-1);
  });

  it('équité : AA contre une main au hasard ≈ 85 %', () => {
    const eq = equite(parseCartes('As Ah'), [], 1, 4000, graine(1));
    expect(eq).toBeGreaterThan(0.82);
    expect(eq).toBeLessThan(0.88);
    expect(equite([parseCarte('As'), parseCarte('Ah')], parseCartes('Ad Ac Kd'), 3, 300, graine(2))).toBeGreaterThan(0.97);
  });

  it('jouent des milliers de mains sans action illégale, et les difficiles battent les faciles', () => {
    const alea = graine(99);
    const rng = (n: number) => Math.floor(alea() * n);
    const bilan: Record<string, number> = { facile: 0, moyen: 0, difficile: 0 };
    const obs = new Observateur();
    let mains = 0;
    for (let partie = 0; partie < 40; partie++) {
      const t = new Table({ tapisDepart: 2000, pb: 10, gb: 20, places: 6, recaves: 'illimitees' });
      const profils: Record<string, ProfilBot> = {};
      const niveaux = ['facile', 'facile', 'moyen', 'moyen', 'difficile', 'difficile'] as const;
      const persos = ['prudent', 'agressif', 'bluffeur', 'suiveur', 'imprevisible'] as const;
      niveaux.forEach((n, i) => {
        const id = `${n}-${partie}-${i}`;
        profils[id] = { niveau: n, personnalite: persos[(i + partie) % 5] };
        t.asseoir(id, id, { siege: i, bot: true });
      });
      for (let k = 0; k < 60; k++) {
        for (const p of t.joueurs) if (p.tapis === 0) t.recave(p.id);
        t.nouvelleMain(rng);
        while (t.mainEnCours()) {
          const m = t.main!;
          const p = t.sieges[m.aParler!]!;
          const d = deciderBot({ main: m, siege: p.siege, profil: profils[p.id], alea, observateur: obs, humeur: 0 });
          expect(d.reflexion).toBeGreaterThan(0);
          t.agir(p.id, d.action); // lève une erreur si l'action est illégale
        }
        obs.observer(t.main!);
        mains++;
      }
      for (const p of t.joueurs) bilan[profils[p.id].niveau] += p.tapis - p.recue;
    }
    expect(mains).toBe(2400);
    // Jeu à somme nulle : la somme des bilans est nulle
    expect(bilan.facile + bilan.moyen + bilan.difficile).toBe(0);
    expect(bilan.difficile).toBeGreaterThan(bilan.facile);
  }, 120_000);
});
