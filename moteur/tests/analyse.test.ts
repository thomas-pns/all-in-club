import { describe, it, expect } from 'vitest';
import { analyserMain, enregistrerMain, filtrerEnregistrement } from '../analyse.js';
import { cumulerMain, STATS_VIDES, nouveauxSucces, SUCCES, CADRES, DOS } from '../succes.js';
import { Categorie } from '../evaluation.js';
import { main, jouer } from './aides.js';

const faitsDe = (m: ReturnType<typeof main>, siege: number) => analyserMain(m).find((f) => f.siege === siege)!;

describe('Analyse des mains', () => {
  it('VPIP, PFR, abattage gagné avec la catégorie de la main', () => {
    const m = main({ tapis: [1000, 1000, 1000], bouton: 0, mains: ['As Ad', 'Kc Kd', '7h 2s'], tableau: 'Ah Ac 9h Js 4c' });
    jouer(m, '0:relancer:60 1:suivre 2:coucher');
    jouer(m, '1:parole 0:parole 1:parole 0:parole 1:parole 0:parole');
    const f0 = faitsDe(m, 0), f1 = faitsDe(m, 1), f2 = faitsDe(m, 2);
    expect(f0).toMatchObject({ vpip: true, pfr: true, abattage: true, gagneAbattage: true, categorieGagnante: Categorie.Carre, carreAs: true, net: 80 });
    expect(f1).toMatchObject({ vpip: true, pfr: false, abattage: true, gagneAbattage: false, net: -60 });
    expect(f2).toMatchObject({ vpip: false, abattage: false, net: -20 });
  });

  it('bluff : gagne sans abattage après une mise à la river avec moins qu\'une paire', () => {
    const m = main({ tapis: [1000, 1000], bouton: 0, mains: ['7h 2s', 'Kc Qd'], tableau: 'Ah 9c 5d Js 3c' });
    jouer(m, '0:suivre 1:parole 1:parole 0:parole 1:parole 0:parole 1:parole 0:miser:40 1:coucher');
    expect(faitsDe(m, 0)).toMatchObject({ bluff: true, gagneSansAbattage: true });
  });

  it('tapis gagné, éliminations et bad beat', () => {
    const m = main({ tapis: [300, 300, 1000], bouton: 2, mains: ['Kc Kd', 'Qh Qd', 'As Ad'], tableau: 'Ah Kh 9h Ks 4c' });
    // PB 0, GB 1, UTG 2
    jouer(m, '2:tapis 0:tapis 1:tapis');
    const f = analyserMain(m);
    const ga = f.find((x) => x.siege === 0)!; // carré de rois : gagne
    expect(ga.tapisGagne).toBe(true);
    const as = f.find((x) => x.siege === 2)!; // full aux as… battu par le carré
    expect(as.badBeat).toBe(true);
    const q = f.find((x) => x.siege === 1)!;
    expect(q.net).toBe(-300);
    // Le siège 1 est à sec : éliminé par le plus gros gagnant (siège 0)
    expect(ga.elimines).toBe(1);
  });

  it("l'historique ne montre que ses cartes et celles montrées à l'abattage", () => {
    const m = main({ tapis: [1000, 1000, 1000], bouton: 0, mains: ['As Ad', 'Kc Kd', '7h 2s'], tableau: '2c 3d 9h Js 4c' });
    jouer(m, '0:suivre 1:suivre 2:parole 1:parole 2:parole 0:parole 1:parole 2:parole 0:parole 1:parole 2:parole 0:parole');
    const rec = enregistrerMain(m, { table: 'T', numero: 1, places: 3, membre: (id) => ({ nom: id, avatar: 'renard' }) });
    const vu = filtrerEnregistrement(rec, 'J2');
    const montres = new Set(rec.evenements.filter((e) => e.t === 'abattage').map((e: any) => e.siege));
    for (const j of vu.joueurs) {
      if (j.id === 'J2' || montres.has(j.siege)) expect(j.cartes).not.toBeNull();
      else expect(j.cartes).toBeNull();
    }
    expect(rec.gagnants[0].siege).toBe(0);
    expect(rec.pot).toBe(60);
  });
});

describe('Succès', () => {
  it('25 succès, ids uniques, récompenses listées', () => {
    expect(SUCCES).toHaveLength(25);
    expect(new Set(SUCCES.map((s) => s.id)).size).toBe(25);
    expect(CADRES[0].id).toBe('aucun');
    expect(DOS[0].id).toBe('prune');
    expect(CADRES.length + DOS.length).toBeGreaterThan(8);
  });

  it('se débloquent au bon moment et une seule fois', () => {
    const m = main({ tapis: [1000, 1000], bouton: 0, mains: ['As Ad', '7h 2s'], tableau: 'Ac Ah 9h Js 4c' });
    jouer(m, '0:tapis 1:suivre');
    const f = faitsDe(m, 0);
    const stats = cumulerMain(STATS_VIDES, f);
    const ctx = { stats, main: { ...f, tapisDepartTable: 1000, royale: false } };
    const ids = nouveauxSucces(ctx, new Set()).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['premiere-donne', 'premier-pot', 'double-ou-rien', 'carre', 'carre-as']));
    expect(ids).not.toContain('habitue');
    expect(nouveauxSucces(ctx, new Set(ids))).toHaveLength(0);
    expect(nouveauxSucces({ stats: { ...stats, partiesGagnees: 1 }, partie: { gagnee: true, comeback: true } }, new Set(ids)).map((s) => s.id))
      .toEqual(expect.arrayContaining(['patron', 'le-retour']));
  });
});
