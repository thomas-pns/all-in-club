import { describe, it, expect } from 'vitest';
import { parseCartes, carteTexte } from '../cartes.js';
import { evaluer, categorie, Categorie, decrire, meilleuresCinq } from '../evaluation.js';

const ev = (t: string) => evaluer(parseCartes(t));
const cat = (t: string) => categorie(ev(t));

describe('Évaluation des mains', () => {
  it('reconnaît chaque catégorie', () => {
    expect(cat('As Ks Qs Js Ts 2c 3d')).toBe(Categorie.QuinteFlush);
    expect(cat('9h 9d 9s 9c Kd 2c 3d')).toBe(Categorie.Carre);
    expect(cat('9h 9d 9s Kc Kd 2c 3d')).toBe(Categorie.Full);
    expect(cat('2h 7h 9h Jh Kh 2c 3d')).toBe(Categorie.Couleur);
    expect(cat('5h 6d 7s 8c 9d 2c Kd')).toBe(Categorie.Quinte);
    expect(cat('9h 9d 9s Kc Qd 2c 3d')).toBe(Categorie.Brelan);
    expect(cat('9h 9d Ks Kc Qd 2c 3d')).toBe(Categorie.DoublePaire);
    expect(cat('9h 9d As Kc Qd 2c 3d')).toBe(Categorie.Paire);
    expect(cat('9h 7d As Kc Qd 2c 3d')).toBe(Categorie.CarteHaute);
  });

  it("l'As compte en bas dans la roue A-2-3-4-5, et la roue est la plus petite quinte", () => {
    expect(cat('Ah 2d 3s 4c 5d Kc Kd')).toBe(Categorie.Quinte);
    expect(ev('Ah 2d 3s 4c 5d Kc Qd')).toBeLessThan(ev('2h 3d 4s 5c 6d Kc Qd'));
    expect(cat('As 2s 3s 4s 5s Kc Kd')).toBe(Categorie.QuinteFlush);
  });

  it("pas de quinte qui passe par l'As (Q-K-A-2-3)", () => {
    expect(cat('Qh Kd As 2c 3d 8c 9d')).toBe(Categorie.CarteHaute);
  });

  it('départage aux kickers', () => {
    expect(ev('Ah Ad Kc 7d 5s 3c 2d')).toBeGreaterThan(ev('Ah Ad Qc 7d 5s 3c 2d'));
    expect(ev('Kh Kd 9c 9d As 3c 2d')).toBeGreaterThan(ev('Kh Kd 9c 9d Qs 3c 2d'));
    // Seules 5 cartes comptent : le 6e kicker n'a pas d'influence
    expect(ev('Ah Kd Qc Jd 9s 3c 2d')).toBe(ev('Ah Kd Qc Jd 9s 4c 2d'));
  });

  it('double paire : la troisième paire sert de kicker au mieux', () => {
    expect(ev('Kh Kd 9c 9d 5s 5c Ad')).toBe(ev('Kh Kd 9c 9d As 3c 2d'));
    expect(ev('Kh Kd 9c 9d 5s 5c 2d')).toBe(ev('Kh Kd 9c 9d 5s 3c 2d'));
  });

  it('full : deux brelans donnent le meilleur full', () => {
    expect(ev('9h 9d 9s Kc Kd Ks 2d')).toBe(ev('Kh Kd Ks 9c 9d 3s 2d'));
  });

  it('couleur : les 5 plus hautes de la couleur', () => {
    expect(ev('Ah 2h 3h 4h 9h Kh 2d')).toBeGreaterThan(ev('Ah 2h 3h 4h 9h Qh 2d'));
  });

  it('les couleurs n\'ont pas de valeur', () => {
    expect(ev('Ah Kh Qd Jc 9s 3c 2d')).toBe(ev('As Ks Qh Jd 9c 3d 2c'));
  });

  it('décrit les mains en français', () => {
    expect(decrire(ev('As Ad Kc 7d 5s'))).toBe("Paire d'as");
    expect(decrire(ev('Kh Kd Ks 7c 7d'))).toBe('Full aux rois par les sept');
    expect(decrire(ev('As Ks Qs Js Ts'))).toBe('Quinte flush royale');
    expect(decrire(ev('Ah 2d 3s 4c 5d'))).toBe('Quinte au cinq');
    expect(decrire(ev('Qh Qd 8s 8c 2d'))).toBe('Double paire dames et huit');
    expect(decrire(ev('8h 8d 8s Kc 2d'))).toBe("Brelan d'huit");
  });

  it('trouve les 5 cartes gagnantes', () => {
    const m = meilleuresCinq(parseCartes('9h 9d 9s Kc Kd 2c 3d')).map(carteTexte).sort();
    expect(m).toEqual(['9d', '9h', '9s', 'Kc', 'Kd']);
  });
});
