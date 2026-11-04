import { describe, it, expect } from 'vitest';
import { actionsLegales, ActionIllegale, agir, calculerPots, potTotal } from '../main.js';
import { main, jouer, tapisDe } from './aides.js';

describe('Blindes et ordre de parole', () => {
  it('tête-à-tête : le bouton paie la PB, parle en premier avant le flop, en dernier après', () => {
    const e = main({ tapis: [1000, 1000], bouton: 0 });
    expect(e.joueurs[0].miseTour).toBe(10);
    expect(e.joueurs[1].miseTour).toBe(20);
    expect(e.aParler).toBe(0);
    jouer(e, '0:suivre 1:parole');
    expect(e.phase).toBe('flop');
    expect(e.aParler).toBe(1);
  });

  it('3 joueurs : la parole pré-flop commence à gauche de la GB, après le flop à gauche du bouton', () => {
    const e = main({ tapis: [1000, 1000, 1000], bouton: 0 });
    expect(e.aParler).toBe(0); // bouton = UTG à 3
    jouer(e, '0:suivre 1:suivre 2:parole');
    expect(e.phase).toBe('flop');
    expect(e.aParler).toBe(1);
  });

  it('la GB a la parole quand tout le monde a suivi (option)', () => {
    const e = main({ tapis: [1000, 1000, 1000], bouton: 0 });
    jouer(e, '0:suivre 1:suivre');
    expect(e.aParler).toBe(2);
    const L = actionsLegales(e)!;
    expect(L.peutParler).toBe(true);
    expect(L.peutRelancer).toBe(true);
    jouer(e, '2:relancer:60');
    expect(e.phase).toBe('preflop');
    expect(e.aParler).toBe(0);
  });

  it('6 joueurs : UTG parle en premier', () => {
    const e = main({ tapis: Array(6).fill(1000), bouton: 3 });
    // PB = 4, GB = 5, UTG = 0
    expect(e.aParler).toBe(0);
  });
});

describe('Mises et relances', () => {
  it('mise minimum = GB, relance minimum = dernière relance', () => {
    const e = main({ tapis: [1000, 1000, 1000], bouton: 0 });
    let L = actionsLegales(e)!;
    expect(L.minA).toBe(40);
    jouer(e, '0:relancer:60'); // +40
    L = actionsLegales(e)!;
    expect(L.minA).toBe(100);
    expect(() => agir(e, 1, { type: 'relancer', a: 90 })).toThrow(ActionIllegale);
    jouer(e, '1:relancer:200'); // +140
    expect(actionsLegales(e)!.minA).toBe(340);
  });

  it('après le flop, la mise minimum est la GB', () => {
    const e = main({ tapis: [1000, 1000], bouton: 0 });
    jouer(e, '0:suivre 1:parole');
    const L = actionsLegales(e)!;
    expect(L.estMise).toBe(true);
    expect(L.minA).toBe(20);
    expect(() => agir(e, 1, { type: 'miser', a: 10 })).toThrow(ActionIllegale);
  });

  it("refuse les actions hors tour, la parole face à une mise, et les montants au-delà du tapis", () => {
    const e = main({ tapis: [1000, 1000, 1000], bouton: 0 });
    expect(() => agir(e, 1, { type: 'suivre' })).toThrow(ActionIllegale);
    expect(() => agir(e, 0, { type: 'parole' })).toThrow(ActionIllegale);
    expect(() => agir(e, 0, { type: 'relancer', a: 5000 })).toThrow(ActionIllegale);
    expect(() => agir(e, 0, { type: 'miser', a: 100 })).toThrow(ActionIllegale);
  });

  it('un tapis plus court que la relance minimum est autorisé', () => {
    const e = main({ tapis: [1000, 50, 1000], bouton: 2 });
    // PB = 0, GB = 1 (reste 30), UTG = 2
    jouer(e, '2:relancer:100 0:suivre');
    const L = actionsLegales(e)!;
    expect(L.siege).toBe(1);
    expect(L.peutRelancer).toBe(false); // ne peut que suivre à tapis (30 < 80 à suivre)
    expect(L.aSuivre).toBe(30);
  });

  it("un tapis incomplet ne rouvre pas les enchères", () => {
    // Bouton 0, PB 1, GB 2, UTG 3
    const e = main({ tapis: [1000, 1000, 1000, 1000, 150], bouton: 0 });
    // Ordre : 3, 4, 0, 1, 2
    jouer(e, '3:relancer:100 4:tapis'); // 4 : tapis 150, +50 < relance de 80 → incomplet
    expect(e.miseCourante).toBe(150);
    jouer(e, '0:coucher 1:coucher 2:coucher');
    const L = actionsLegales(e)!;
    expect(L.siege).toBe(3);
    expect(L.aSuivre).toBe(50);
    expect(L.peutRelancer).toBe(false);
  });

  it("un joueur qui n'a pas encore parlé peut relancer après un tapis incomplet", () => {
    const e = main({ tapis: [1000, 1000, 1000, 1000, 150], bouton: 0 });
    jouer(e, '3:relancer:100 4:tapis');
    const L = actionsLegales(e)!;
    expect(L.siege).toBe(0);
    expect(L.peutRelancer).toBe(true);
    expect(L.minA).toBe(150 + 80);
  });

  it('plusieurs tapis incomplets cumulés rouvrent les enchères', () => {
    // Après le flop : 0 mise 100, 1 suit, 2 tapis 150, 3 tapis 220 → +120 depuis 1 : rouvert
    const e = main({ tapis: [1000, 1000, 170, 240], bouton: 3 });
    // PB 0, GB 1, UTG 2 ; tout le monde suit pré-flop
    jouer(e, '2:suivre 3:suivre 0:suivre 1:parole');
    expect(e.phase).toBe('flop');
    expect(e.aParler).toBe(0);
    jouer(e, '0:miser:100 1:suivre 2:tapis 3:tapis');
    expect(e.miseCourante).toBe(220);
    const L0 = actionsLegales(e)!;
    expect(L0.siege).toBe(0);
    expect(L0.peutRelancer).toBe(true);
  });

  it('une relance complète met à jour la relance minimum, pas un tapis incomplet', () => {
    const e = main({ tapis: [1000, 1000, 1000, 130], bouton: 0 });
    // PB 1, GB 2, UTG 3
    jouer(e, '3:tapis'); // 130 : +110 ≥ 20 → relance complète
    expect(e.relanceMin).toBe(110);
    expect(actionsLegales(e)!.minA).toBe(240);
  });

  it('on ne peut pas relancer quand tous les autres sont à tapis', () => {
    const e = main({ tapis: [1000, 300], bouton: 0 });
    jouer(e, '0:relancer:100 1:tapis');
    const L = actionsLegales(e)!;
    expect(L.siege).toBe(0);
    expect(L.peutRelancer).toBe(false);
    expect(L.aSuivre).toBe(200);
  });
});

describe('Fin de main, pots et abattage', () => {
  it('tout le monde se couche : le dernier gagne sans montrer, la mise non suivie lui revient', () => {
    const e = main({ tapis: [1000, 1000, 1000], bouton: 0 });
    jouer(e, '0:relancer:100 1:coucher 2:coucher');
    expect(e.phase).toBe('terminee');
    expect(e.resultat!.sansAbattage).toBe(true);
    expect(e.resultat!.pots[0].montant).toBe(10 + 20 + 20);
    expect(tapisDe(e)).toEqual([1030, 990, 980]);
    expect(e.evenements.some((x) => x.t === 'remboursement' && x.siege === 0 && x.montant === 80)).toBe(true);
    expect(e.resultat!.montrees).toEqual({});
  });

  it('la meilleure main gagne à l\'abattage', () => {
    const e = main({ tapis: [1000, 1000], bouton: 0, mains: ['As Ad', 'Kc Kd'], tableau: '2c 7d 9h Js 4c' });
    jouer(e, '0:suivre 1:parole 1:parole 0:parole 1:parole 0:parole 1:parole 0:parole');
    expect(e.phase).toBe('terminee');
    expect(tapisDe(e)).toEqual([1020, 980]);
    expect(e.resultat!.pots[0].main).toBe("Paire d'as");
  });

  it('pots secondaires à trois tapis différents', () => {
    // Siège 0 : 100, siège 1 : 300, siège 2 : 1000. Mains : 0 > 1 > 2.
    const e = main({
      tapis: [100, 300, 1000], bouton: 2,
      mains: ['As Ad', 'Ks Kd', 'Qs Qd'], tableau: '2c 7d 9h 3s 4c',
    });
    // PB 0, GB 1, UTG = 2
    jouer(e, '2:tapis 0:tapis 1:tapis');
    expect(e.phase).toBe('terminee');
    const pots = e.resultat!.pots;
    expect(pots.map((p) => p.montant)).toEqual([300, 400]);
    expect(pots[0].gagnants).toEqual([0]);
    expect(pots[1].gagnants).toEqual([1]);
    // Siège 2 récupère ses 700 non suivis
    expect(tapisDe(e)).toEqual([300, 400, 700]);
  });

  it('un joueur couché alimente les pots sans pouvoir les gagner', () => {
    const e = main({
      tapis: [500, 200, 1000], bouton: 0,
      mains: ['2h 3d', 'As Ad', 'Ks Kd'], tableau: '9c 7d Jh Qs 4c',
    });
    // PB 1, GB 2, UTG 0
    jouer(e, '0:relancer:100 1:tapis 2:relancer:500 0:coucher');
    expect(e.phase).toBe('terminee');
    const pots = calculerPots(e);
    expect(pots[0]).toEqual({ montant: 100 + 200 + 200, eligibles: [1, 2] });
    expect(tapisDe(e)).toEqual([400, 500, 800]);
  });

  it('partage : jeton indivisible au premier gagnant à gauche du bouton', () => {
    // Pot de 25 = 5 unités de PB, partagé entre les sièges 0 et 2 : 3 unités au premier à gauche du bouton
    const e = main({
      tapis: [1000, 1000, 1000], bouton: 0, pb: 5, gb: 10,
      mains: ['Ac Kd', '2h 3d', 'As Kh'], tableau: 'Qc Jd Th 4s 4c',
    });
    // PB 1, GB 2, UTG 0
    jouer(e, '0:suivre 1:coucher 2:parole');
    jouer(e, '2:parole 0:parole 2:parole 0:parole 2:parole 0:parole');
    expect(e.phase).toBe('terminee');
    expect(e.resultat!.pots[0].montant).toBe(25);
    expect(e.resultat!.pots[0].gagnants).toEqual([2, 0]);
    expect(e.resultat!.gains).toEqual({ 2: 15, 0: 10 });
  });

  it("à l'abattage, le dernier agresseur de la river montre en premier ; le perdant peut jeter", () => {
    const e = main({
      tapis: [1000, 1000, 1000], bouton: 0,
      mains: ['As Ad', 'Kc Kd', '7h 2s'], tableau: '2c 3d 9h Js 4c',
    });
    jouer(e, '0:suivre 1:suivre 2:parole');           // pré-flop
    jouer(e, '1:parole 2:parole 0:parole');           // flop
    jouer(e, '1:parole 2:coucher 0:parole');          // turn
    jouer(e, '1:miser:50 0:suivre');                  // river : 1 mise, 0 suit
    const ab = e.evenements.filter((x) => x.t === 'abattage' || x.t === 'jette');
    expect(ab[0]).toMatchObject({ t: 'abattage', siege: 1 }); // l'agresseur montre d'abord
    expect(ab[1]).toMatchObject({ t: 'abattage', siege: 0 }); // le gagnant montre
    expect(tapisDe(e)).toEqual([1090, 930, 980]); // pot 60 + 50 + 50
  });

  it('sans mise à la river, premier joueur à gauche du bouton montre en premier, le perdant suivant jette', () => {
    const e = main({
      tapis: [1000, 1000, 1000], bouton: 0,
      mains: ['Kc Kd', 'As Ad', '7h 2s'], tableau: '2c 3d 9h Js 4c',
    });
    jouer(e, '0:suivre 1:suivre 2:parole 1:parole 2:parole 0:parole 1:parole 2:parole 0:parole 1:parole 2:parole 0:parole');
    const ab = e.evenements.filter((x) => x.t === 'abattage' || x.t === 'jette');
    expect(ab.map((x) => [x.t, (x as any).siege])).toEqual([['abattage', 1], ['jette', 2], ['jette', 0]]);
  });

  it('tapis avant la river : le tableau est distribué et toutes les mains sont montrées', () => {
    const e = main({ tapis: [1000, 1000], bouton: 0, mains: ['As Ad', '7h 2s'], tableau: '2c 3d 9h Js 4c' });
    jouer(e, '0:tapis 1:suivre');
    expect(e.phase).toBe('terminee');
    expect(e.tableau.length).toBe(5);
    expect(Object.keys(e.resultat!.montrees).sort()).toEqual(['0', '1']);
    expect(e.evenements.filter((x) => x.t === 'rue').length).toBe(3);
  });

  it('carte brûlée avant le flop, le turn et la river', () => {
    const e = main({ tapis: [1000, 1000], bouton: 0, mains: ['As Ad', '7h 2s'], tableau: '2c 3d 9h Js 4c' });
    jouer(e, '0:tapis 1:suivre');
    expect(e.tableau.map(String)).toEqual(['2c 3d 9h Js 4c'].flatMap((t) => t.split(' ')).map((t) => {
      const r = '23456789TJQKA'.indexOf(t[0]), s = 'shdc'.indexOf(t[1]);
      return String((r << 2) | s);
    }));
  });

  it("l'argent mort va au pot principal", () => {
    const e = main({
      tapis: [1000, 1000, 1000, 1000], bouton: 0,
      blindesEnPlus: [{ siege: 3, montant: 10, mort: true }],
      mains: ['2h 3d', '4h 5d', '7h 8s', 'As Ad'], tableau: 'Kc Jd 9h Qs 4c',
    });
    expect(potTotal(e)).toBe(40);
    jouer(e, '3:suivre 0:coucher 1:coucher 2:parole');
    jouer(e, '2:parole 3:parole 2:parole 3:parole 2:parole 3:parole');
    expect(e.resultat!.pots[0].montant).toBe(10 + 20 + 20 + 10);
    expect(tapisDe(e)[3]).toBe(1000 - 30 + 60);
  });

  it('une GB courte : les autres doivent quand même suivre la grosse blinde entière', () => {
    const e = main({ tapis: [1000, 1000, 15], bouton: 0 });
    // GB = siège 2, à tapis pour 15
    expect(e.miseCourante).toBe(20);
    expect(actionsLegales(e)!.aSuivre).toBe(20);
  });
});
