import { describe, it, expect } from 'vitest';
import { ouvrirBase } from '../base.js';
import { migrer } from '../donnees.js';
import { Portefeuilles } from '../portefeuille.js';
import { Kiosque } from '../kiosque.js';
import { KENO, LOTO, TICKETS } from '../../moteur/kiosque.js';
import { SOLDE_DEPART } from '../../moteur/bonus.js';

function creer() {
  const db = ouvrirBase(':memory:');
  migrer(db);
  db.prepare("INSERT INTO utilisateurs (id, pseudo, hash, cree) VALUES (1, 'thomas', 'x', 0), (2, 'leo', 'x', 0)").run();
  let t = Date.UTC(2026, 10, 5, 18, 0, 30);
  let graine = 99;
  const h = (n: number) => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine % n; };
  const porte = new Portefeuilles(db, () => t);
  const k = new Kiosque(db, porte, () => t, h);
  return { k, porte, db, avancer: (ms: number) => { t += ms; } };
}

describe('Kiosque (serveur)', () => {
  it('vend un ticket, prélève son prix et paie son gain', () => {
    const { k, porte } = creer();
    let attendu = SOLDE_DEPART;
    for (let i = 0; i < 30; i++) {
      const r = k.acheterTicket(1, 'banco');
      attendu += r.gain - TICKETS.banco.prix;
      expect(r.etat.solde).toBe(attendu);
    }
    expect(porte.etat(1).solde).toBe(attendu);
  });

  it('utilise les tickets offerts (Banco seulement)', () => {
    const { k, porte, db } = creer();
    expect(() => k.acheterTicket(1, 'banco', true)).toThrow('Aucun ticket');
    porte.etat(1);
    db.prepare('UPDATE portefeuilles SET tickets = 1 WHERE utilisateur = 1').run();
    expect(() => k.acheterTicket(1, 'coffre', true)).toThrow('Banco');
    const r = k.acheterTicket(1, 'banco', true);
    expect(r.etat.tickets).toBe(0);
    expect(r.etat.solde).toBe(SOLDE_DEPART + r.gain);
  });

  it('refuse un achat sans assez de Clubs', () => {
    const { k, porte } = creer();
    porte.crediter(1, -SOLDE_DEPART + 100, 'Test');
    expect(() => k.acheterTicket(1, 'millionnaire')).toThrow('Pas assez');
  });

  it('joue une grille de Keno, tire au bon moment et paie', () => {
    const { k, porte, avancer } = creer();
    const r = k.jouerKeno(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 100, 3);
    expect(r.etat.solde).toBe(SOLDE_DEPART - 300);
    expect(k.etatKeno(1).grilles).toHaveLength(3);
    k.tirer();
    expect(k.tirageKeno(r.tirage)).toBeNull();
    for (let i = 0; i < 3; i++) { avancer(KENO.periode); k.tirer(); }
    const grilles = k.etatKeno(1).grilles;
    expect(grilles.every((g) => g.gain !== null)).toBe(true);
    const gains = grilles.reduce((s, g) => s + (g.gain ?? 0), 0);
    expect(porte.etat(1).solde).toBe(SOLDE_DEPART - 300 + gains);
    expect(k.tirageKeno(r.tirage)?.numeros).toHaveLength(20);
  });

  it('Loto Flash : la grille alimente la cagnotte, le tirage paie les rangs', () => {
    const { k, porte, avancer } = creer();
    const avant = k.etatLoto(1).cagnotte;
    const r = k.jouerLoto(2, [1, 2, 3, 4, 5], 1);
    expect(r.cagnotte).toBe(avant + LOTO.partCagnotte);
    avancer(LOTO.periode + 1000); k.tirer();
    const g = k.etatLoto(2).grilles[0];
    expect(g.gain).not.toBeNull();
    expect(porte.etat(2).solde).toBe(SOLDE_DEPART - LOTO.prix + (g.gain ?? 0));
    expect(() => k.jouerLoto(2, [1, 2, 3], 1)).toThrow('invalide');
  });

  it('une grille jouée juste avant la fermeture part au tirage suivant', () => {
    const { k, avancer } = creer();
    const prochain = k.etatKeno(1).prochain;
    avancer(prochain.fermeture + 2000 - k.etatKeno(1).maintenant);
    expect(k.jouerKeno(1, [7], 50).tirage).toBe(prochain.id + 1);
  });
});
