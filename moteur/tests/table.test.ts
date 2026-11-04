import { describe, it, expect } from 'vitest';
import { Table, ErreurTable } from '../table.js';
import { actionsLegales, actionParDefaut } from '../main.js';

const reglages = { tapisDepart: 1000, pb: 10, gb: 20, places: 6, recaves: 2 as const };
/** rng déterministe : toujours 0 (le premier bouton est le premier joueur assis) */
const rng0 = () => 0;

function finirMain(t: Table) {
  while (t.mainEnCours()) {
    const m = t.main!;
    const p = t.sieges[m.aParler!]!;
    t.agir(p.id, actionParDefaut(m));
  }
}
const blindes = (t: Table) =>
  t.main!.evenements.filter((x) => x.t === 'blinde').map((x: any) => [x.siege, x.nom, x.montant]);

describe('Table de cash game', () => {
  it('le bouton avance à chaque main et les blindes suivent', () => {
    const t = new Table(reglages);
    ['A', 'B', 'C'].forEach((n) => t.asseoir(n, n));
    t.nouvelleMain(rng0);
    expect(t.bouton).toBe(0);
    expect(blindes(t)).toEqual([[1, 'PB', 10], [2, 'GB', 20]]);
    finirMain(t);
    t.nouvelleMain(rng0);
    expect(t.bouton).toBe(1);
    expect(blindes(t)).toEqual([[2, 'PB', 10], [0, 'GB', 20]]);
  });

  it('tête-à-tête : le bouton paie la petite blinde', () => {
    const t = new Table(reglages);
    t.asseoir('A', 'A'); t.asseoir('B', 'B');
    t.nouvelleMain(rng0);
    expect(blindes(t)).toEqual([[0, 'PB', 10], [1, 'GB', 20]]);
    expect(t.main!.aParler).toBe(0);
  });

  it('un nouveau venu attend la grosse blinde', () => {
    const t = new Table(reglages);
    ['A', 'B', 'C'].forEach((n) => t.asseoir(n, n, { siege: 'ABC'.indexOf(n) }));
    t.nouvelleMain(rng0); finirMain(t);           // bouton 0
    t.asseoir('D', 'D', { siege: 4 });
    t.nouvelleMain(rng0);                          // bouton 1, PB 2, GB = D (siège 4) qui attendait
    expect(t.dansLaMain).toEqual([0, 1, 2, 4]);
    expect(blindes(t)).toEqual([[2, 'PB', 10], [4, 'GB', 20]]);
  });

  it("un nouveau venu qui n'est pas en position de GB ne reçoit pas de cartes", () => {
    const t = new Table(reglages);
    ['A', 'B', 'C'].forEach((n, i) => t.asseoir(n, n, { siege: i * 2 })); // sièges 0, 2, 4
    t.nouvelleMain(rng0); finirMain(t);           // bouton 0
    t.asseoir('D', 'D', { siege: 3 });             // entre 2 et 4
    t.nouvelleMain(rng0);                          // bouton 2, PB 4, GB 0 → D attend
    expect(t.dansLaMain).toEqual([0, 2, 4]);
    expect(t.joueur('D')!.attendGB).toBe(true);
  });

  it('payer une grosse blinde pour entrer tout de suite', () => {
    const t = new Table(reglages);
    ['A', 'B', 'C'].forEach((n, i) => t.asseoir(n, n, { siege: i * 2 })); // sièges 0, 2, 4
    t.nouvelleMain(rng0); finirMain(t);           // bouton 0
    t.asseoir('D', 'D', { siege: 1 });
    t.posterPourEntrer('D');
    t.nouvelleMain(rng0);                          // bouton 2, PB 4, GB 0, D poste au siège 1
    expect(t.dansLaMain).toEqual([0, 1, 2, 4]);
    expect(blindes(t)).toEqual([[4, 'PB', 10], [0, 'GB', 20], [1, 'poste', 20]]);
    // La poste est vivante : si tout le monde suit, D peut encore relancer
    t.agir('D', { type: 'parole' });
    expect(t.main!.aParler).toBe(2);
  });

  it('un absent manque les blindes et doit les payer pour revenir', () => {
    const t = new Table(reglages);
    ['A', 'B', 'C', 'D'].forEach((n) => t.asseoir(n, n));
    t.nouvelleMain(rng0); finirMain(t);           // bouton 0, PB 1, GB 2
    t.sAbsenter('D');
    t.nouvelleMain(rng0); finirMain(t);           // bouton 1, PB 2, GB serait 3 (D) → manquée
    expect(t.joueur('D')!.gbManquee).toBe(true);
    t.nouvelleMain(rng0); finirMain(t);           // bouton 2, PB serait 3 → manquée
    expect(t.joueur('D')!.pbManquee).toBe(true);
    t.revenir('D', true);
    t.nouvelleMain(rng0);                          // bouton 0 (D sauté ? non : bouton suit les prêts)
    const b = blindes(t);
    expect(b).toContainEqual([3, 'poste', 20]);
    expect(b).toContainEqual([3, 'morte', 10]);
    expect(t.totalJetons()).toBe(4000);
  });

  it('recaves : seulement à sec, entre deux mains, dans la limite fixée sauf accord de l\'hôte', () => {
    const t = new Table({ ...reglages, recaves: 1 });
    t.asseoir('A', 'A'); t.asseoir('B', 'B');
    expect(() => t.recave('A')).toThrow(ErreurTable);
    t.joueur('A')!.tapis = 0;
    t.recave('A');
    expect(t.joueur('A')!.tapis).toBe(1000);
    expect(t.joueur('A')!.recue).toBe(2000);
    t.joueur('A')!.tapis = 0;
    expect(() => t.recave('A')).toThrow(ErreurTable);
    t.recave('A', true);
    expect(t.joueur('A')!.recavesUtilisees).toBe(2);
  });

  it('quitter pendant la main : le joueur se couche et part à la fin', () => {
    const t = new Table(reglages);
    ['A', 'B', 'C'].forEach((n) => t.asseoir(n, n));
    t.nouvelleMain(rng0); // A (bouton, UTG à 3) parle
    t.quitter('A');
    expect(t.main!.joueurs[0].couche).toBe(true);
    finirMain(t);
    expect(t.joueur('A')).toBeUndefined();
  });

  it('Rejouer : tapis neufs, recaves remises à zéro', () => {
    const t = new Table(reglages);
    t.asseoir('A', 'A'); t.asseoir('B', 'B');
    t.nouvelleMain(rng0);
    t.agir('A', { type: 'tapis' }); t.agir('B', { type: 'suivre' });
    t.rejouer();
    expect(t.joueurs.map((p) => p.tapis)).toEqual([1000, 1000]);
    expect(t.numeroMain).toBe(0);
  });

  it("actionParDefaut : parole si possible, sinon couché", () => {
    const t = new Table(reglages);
    t.asseoir('A', 'A'); t.asseoir('B', 'B');
    t.nouvelleMain(rng0);
    expect(actionParDefaut(t.main!)).toEqual({ type: 'coucher' });
    t.agir('A', { type: 'suivre' });
    expect(actionsLegales(t.main!)!.peutParler).toBe(true);
    expect(actionParDefaut(t.main!)).toEqual({ type: 'parole' });
  });
});
