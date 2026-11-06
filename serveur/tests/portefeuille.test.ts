import { describe, it, expect } from 'vitest';
import { ouvrirBase } from '../base.js';
import { Portefeuilles } from '../portefeuille.js';
import { migrer } from '../donnees.js';
import { SOLDE_DEPART } from '../../moteur/bonus.js';

function creer() {
  const db = ouvrirBase(':memory:');
  migrer(db);
  db.prepare("INSERT INTO utilisateurs (id, pseudo, hash, cree) VALUES (1, 'thomas', 'x', 0), (2, 'leo', 'x', 0)").run();
  let t = Date.UTC(2026, 10, 5, 10);
  // Hasard truqué : toujours la première case de la roue (250 ♣)
  const p = new Portefeuilles(db, () => t, () => 0);
  return { p, avancer: (jours: number) => { t += jours * 86_400_000; } };
}

describe('Portefeuilles', () => {
  it('commence avec le solde de bienvenue et fait tourner la roue une fois par jour, multipliée par la série', () => {
    const { p, avancer } = creer();
    expect(p.etat(1).solde).toBe(SOLDE_DEPART);
    const r = p.tournerRoue(1);
    expect(r).toMatchObject({ jour: 1, segment: 0, clubs: 250, quotidien: true });
    expect(r.etat.solde).toBe(SOLDE_DEPART + 250);
    expect(() => p.tournerRoue(1)).toThrow('demain');
    avancer(1); p.tournerRoue(1);
    avancer(1); const j3 = p.tournerRoue(1);
    expect(j3).toMatchObject({ jour: 3, multiplicateur: 1.5, clubs: 375, tickets: 1 });
    expect(j3.etat.tickets).toBe(1);
    // Un tour en plus gagné avec les missions
    p.ajouterTourBonus(1);
    expect(p.tournerRoue(1)).toMatchObject({ quotidien: false, jour: 3, clubs: 375 });
    expect(() => p.tournerRoue(1)).toThrow('demain');
    // Un jour raté : retour au jour 1
    avancer(2);
    expect(p.etat(1).bonus).toMatchObject({ jour: 1, dispo: true, reprise: true });
  });

  it('offre un coup de pouce seulement à sec, une fois par jour', () => {
    const { p, avancer } = creer();
    expect(() => p.coupDePouce(1)).toThrow('à sec');
    p.crediter(1, -SOLDE_DEPART + 50, 'Test');
    expect(p.etat(1).coupDePouce).toBe(true);
    expect(p.coupDePouce(1).solde).toBe(1050);
    p.crediter(1, -1050, 'Test');
    expect(() => p.coupDePouce(1)).toThrow('déjà');
    avancer(1);
    expect(p.coupDePouce(1).solde).toBe(1000);
  });

  it('refuse un solde négatif et classe les plus riches', () => {
    const { p } = creer();
    expect(() => p.crediter(2, -SOLDE_DEPART - 1, 'Test')).toThrow('Pas assez');
    p.crediter(2, 5000, 'Gain');
    p.etat(1);
    expect(p.classement().map((c) => c.pseudo)).toEqual(['leo', 'thomas']);
    expect(p.mouvements(2)[0]).toMatchObject({ montant: 5000, motif: 'Gain' });
  });
});
