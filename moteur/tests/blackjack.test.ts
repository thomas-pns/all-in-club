import { describe, it, expect } from 'vitest';
import { valeurMain, estBlackJack, Sabot, demarrerManche, agirBJ, assurer, legalesBJ, Manche, valeurCarte } from '../blackjack/regles.js';
import { conseil } from '../blackjack/strategie.js';
import { parseCartes, Carte } from '../cartes.js';

const v = (t: string) => valeurMain(parseCartes(t));

/** Sabot truqué : les cartes sortent dans l'ordre donné. */
function sabot(t: string): Sabot {
  const s = new Sabot(1, () => 0);
  s.cartes = parseCartes(t).reverse();
  return s;
}
// Ordre de donne pour 1 joueur : J1, croupier visible, J1, croupier caché, puis les tirages
const manche1 = (t: string, mise = 100, abandon = true) => {
  const s = sabot(t);
  return { s, m: demarrerManche(s, [{ siege: 0, id: 'a', mise }], { abandon }) };
};
const res = (m: Manche) => m.joueurs[0].mains.map((x) => [x.issue, x.retour]);

describe('Black Jack : valeurs', () => {
  it('As souples et durs, Black Jack', () => {
    expect(v('As Kd')).toEqual({ total: 21, souple: true });
    expect(v('As 6d')).toEqual({ total: 17, souple: true });
    expect(v('As 6d 9c')).toEqual({ total: 16, souple: false });
    expect(v('As Ad 9c')).toEqual({ total: 21, souple: true });
    expect(v('Ks Qd 5c')).toEqual({ total: 25, souple: false });
    expect(estBlackJack(parseCartes('As Td'))).toBe(true);
    expect(estBlackJack(parseCartes('As 5d 5c'))).toBe(false);
  });

  it('sabot de 6 jeux : 312 cartes, toutes présentes 6 fois', () => {
    const s = new Sabot(6, (n) => Math.floor(Math.random() * n));
    expect(s.cartes).toHaveLength(312);
    const comptes = new Map<Carte, number>();
    for (const c of s.cartes) comptes.set(c, (comptes.get(c) ?? 0) + 1);
    expect([...comptes.values()].every((x) => x === 6)).toBe(true);
  });
});

describe('Black Jack : manches', () => {
  it('Black Jack du joueur payé 3 contre 2', () => {
    const { m } = manche1('As 9c Kd 7h');
    expect(m.phase).toBe('terminee');
    expect(res(m)).toEqual([['blackjack', 250]]);
  });

  it('gagner, perdre, égalité, dépasser', () => {
    let { m, s } = manche1('Ts 9c 8d 7h'); // 18 contre 16 → le croupier tire
    s.cartes.push(parseCartes('6c')[0]); // le croupier tirera un 6 → 22
    agirBJ(m, s, 0, 'rester', 1000);
    expect(res(m)).toEqual([['gagne', 200]]);
    ({ m, s } = manche1('Ts 9c 8d 9h')); // 18 contre 18
    agirBJ(m, s, 0, 'rester', 1000);
    expect(res(m)).toEqual([['egalite', 100]]);
    ({ m, s } = manche1('Ts 9c 6d 9h Kc')); // 16, tire K → 26
    agirBJ(m, s, 0, 'tirer', 1000);
    expect(res(m)).toEqual([['depasse', 0]]);
    expect(m.croupier).toHaveLength(2); // le croupier ne tire pas si tout le monde a dépassé
  });

  it('le croupier tire jusqu\'à 17 et s\'arrête à 17 souple', () => {
    const { m, s } = manche1('Ts 6c 9d As 5h');
    agirBJ(m, s, 0, 'rester', 1000); // 19 contre 6+A = 17 souple : le croupier s'arrête
    expect(valeurMain(m.croupier).total).toBe(17);
    expect(res(m)).toEqual([['gagne', 200]]);
  });

  it('doubler : une seule carte, mise doublée', () => {
    const { m, s } = manche1('6s 9c 5d 7h Kc Qd'); // 11 contre 16 ; double → K = 21 ; croupier tire Q → 26
    const cout = agirBJ(m, s, 0, 'doubler', 1000);
    expect(cout).toBe(100);
    expect(m.joueurs[0].mains[0].cartes).toHaveLength(3);
    expect(res(m)).toEqual([['gagne', 400]]);
  });

  it('séparer une paire, puis jouer chaque main ; As séparés : une carte chacune', () => {
    let { m, s } = manche1('8s 9c 8d 8h 3c Kd'); // croupier 9+8 = 17
    const cout = agirBJ(m, s, 0, 'separer', 1000);
    expect(cout).toBe(100);
    expect(m.joueurs[0].mains.map((x) => x.cartes.length)).toEqual([2, 2]);
    expect(m.aParler).toEqual({ siege: 0, main: 0 });
    agirBJ(m, s, 0, 'rester', 1000); // 8+3 = 11
    agirBJ(m, s, 0, 'rester', 1000); // 8+K = 18
    expect(m.phase).toBe('terminee');
    expect(res(m)).toEqual([['perd', 0], ['gagne', 200]]);

    ({ m, s } = manche1('As 9c Ad 8h Kc 9d'));
    agirBJ(m, s, 0, 'separer', 1000);
    // A+K = 21 après séparation : pas un Black Jack, payé 1 contre 1
    expect(m.phase).toBe('terminee');
    expect(res(m)).toEqual([['gagne', 200], ['gagne', 200]]);
  });

  it('abandon : la moitié de la mise revient', () => {
    const { m, s } = manche1('Ts 9c 6d 9h');
    expect(legalesBJ(m, 1000)!.abandonner).toBe(true);
    agirBJ(m, s, 0, 'abandonner', 1000);
    expect(res(m)).toEqual([['abandon', 50]]);
  });

  it('assurance contre un As : payée 2 contre 1 si le croupier a Black Jack', () => {
    const s = sabot('9s Ac 8d Kh');
    const m = demarrerManche(s, [{ siege: 0, id: 'a', mise: 100 }], { abandon: true });
    expect(m.phase).toBe('assurance');
    assurer(m, s, 0, true);
    expect(m.joueurs[0].assurance).toBe(50);
    expect(m.joueurs[0].retourAssurance).toBe(150);
    expect(res(m)).toEqual([['perd', 0]]);
  });

  it('le croupier vérifie son Black Jack avec un 10 visible', () => {
    const { m } = manche1('9s Kc 8d Ah');
    expect(m.phase).toBe('terminee');
    expect(m.evenements.some((e) => e.t === 'blackjackCroupier')).toBe(true);
  });

  it('plusieurs joueurs jouent chacun leur tour', () => {
    const s = sabot('9s Ts 6c 7h 2d 3c 9d');
    const m = demarrerManche(s, [{ siege: 2, id: 'b', mise: 50 }, { siege: 0, id: 'a', mise: 100 }], { abandon: false });
    expect(m.aParler).toEqual({ siege: 0, main: 0 }); // 9+7 = 16
    expect(() => agirBJ(m, s, 2, 'rester', 1000)).toThrow();
    agirBJ(m, s, 0, 'rester', 1000);
    expect(m.aParler).toEqual({ siege: 2, main: 0 }); // T+2 = 12
    expect(legalesBJ(m, 1000)!.abandonner).toBe(false);
    agirBJ(m, s, 2, 'rester', 1000);
    expect(m.phase).toBe('terminee'); // croupier 6+3+9 = 18
  });
});

describe('Black Jack : conseil (stratégie de base)', () => {
  const L = { tirer: true, rester: true, doubler: true, separer: true, abandonner: true };
  const c = (main: string, croupier: string) => conseil(parseCartes(main), parseCartes(croupier)[0], L).action;
  it('quelques coups classiques', () => {
    expect(c('As Ad', '6h')).toBe('separer');
    expect(c('8s 8d', 'Th')).toBe('separer');
    expect(c('Ts Td', '6h')).toBe('rester');
    expect(c('6s 5d', '6h')).toBe('doubler');
    expect(c('Ts 6d', 'Th')).toBe('abandonner');
    expect(c('Ts 6d', '6h')).toBe('rester');
    expect(c('Ts 2d', '2h')).toBe('tirer');
    expect(c('As 7d', '9h')).toBe('tirer');
    expect(c('As 7d', '5h')).toBe('doubler');
    expect(conseil(parseCartes('Ts 6d'), parseCartes('Th')[0], { ...L, abandonner: false }).action).toBe('tirer');
  });

  it("simulation : la stratégie de base perd peu (avantage de la maison < 2 %)", () => {
    let mise = 0, retour = 0;
    let graine = 12345;
    const rng = (n: number) => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine % n; };
    const s = new Sabot(6, rng);
    for (let i = 0; i < 20000; i++) {
      if (s.aRemelanger) s.melanger();
      const m = demarrerManche(s, [{ siege: 0, id: 'a', mise: 100 }], { abandon: true });
      mise += 100;
      if (m.phase === 'assurance') assurer(m, s, 0, false);
      while (m.phase === 'jeu') {
        const j = m.joueurs[0];
        const main = j.mains[m.aParler!.main];
        const leg = legalesBJ(m, 1e9)!;
        const a = conseil(main.cartes, m.croupier[0], leg).action;
        mise += agirBJ(m, s, 0, a, 1e9);
      }
      for (const main of m.joueurs[0].mains) retour += main.retour;
      expect(valeurCarte(m.croupier[0])).toBeGreaterThan(1);
    }
    const avantageMaison = (mise - retour) / mise;
    expect(avantageMaison).toBeGreaterThan(-0.03);
    expect(avantageMaison).toBeLessThan(0.03);
  });
});
