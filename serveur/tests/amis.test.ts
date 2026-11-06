import { describe, it, expect } from 'vitest';
import { ouvrirBase } from '../base.js';
import { Portefeuilles } from '../portefeuille.js';
import { Amis, CADEAU_MAX_JOUR, MessageAmi } from '../amis.js';
import { migrer } from '../donnees.js';
import { SOLDE_DEPART } from '../../moteur/bonus.js';

function creer() {
  const db = ouvrirBase(':memory:');
  migrer(db);
  db.prepare("INSERT INTO utilisateurs (id, pseudo, hash, cree) VALUES (1, 'Thomas', 'x', 0), (2, 'Camil', 'x', 0), (3, 'Leo', 'x', 0)").run();
  let t = Date.UTC(2026, 10, 6, 10);
  const porte = new Portefeuilles(db, () => t, () => 0);
  const a = new Amis(db, porte, () => t);
  const recus: [number, MessageAmi][] = [];
  a.notifier = (u, m) => recus.push([u, m]);
  return { a, porte, recus, avancer: (j: number) => { t += j * 86_400_000; } };
}

describe('Amis', () => {
  it('demande (pseudo sans tenir compte des majuscules), accepte, refuse les doublons', () => {
    const { a, recus } = creer();
    expect(a.demander(1, 'camil')).toEqual({ statut: 'envoyee', pseudo: 'Camil' });
    expect(recus.at(-1)).toMatchObject([2, { evenement: 'demande', de: { pseudo: 'Thomas' } }]);
    expect(() => a.demander(1, 'Camil')).toThrow('déjà envoyée');
    expect(() => a.demander(1, 'thomas')).toThrow('propre ami');
    expect(() => a.demander(1, 'personne')).toThrow('Aucun joueur');
    expect(a.liste(2).recues.map((p) => p.pseudo)).toEqual(['Thomas']);
    a.accepter(2, 'Thomas');
    expect(recus.at(-1)).toMatchObject([1, { evenement: 'accepte' }]);
    expect(a.sontAmis(1, 2) && a.sontAmis(2, 1)).toBe(true);
    expect(a.liste(1).amis.map((p) => p.pseudo)).toEqual(['Camil']);
    // Se demander l'un l'autre = accepté directement
    a.demander(3, 'Thomas');
    expect(a.demander(1, 'Leo')).toMatchObject({ statut: 'ok' });
    a.retirer(1, 'Leo');
    expect(a.sontAmis(3, 1)).toBe(false);
  });

  it('cadeaux : seulement entre amis, plafond par jour, solde jamais négatif', () => {
    const { a, porte, recus, avancer } = creer();
    expect(() => a.offrir(1, 'Camil', 1_000)).toThrow('amis');
    a.demander(1, 'Camil'); a.accepter(2, 'Camil'.replace('Camil', 'Thomas'));
    expect(a.offrir(1, 'Camil', 4_000).reste).toBe(CADEAU_MAX_JOUR - 4_000);
    expect(porte.etat(2).solde).toBe(SOLDE_DEPART + 4_000);
    expect(recus.at(-1)).toMatchObject([2, { evenement: 'cadeau', montant: 4_000 }]);
    expect(() => a.offrir(1, 'Camil', CADEAU_MAX_JOUR)).toThrow('encore offrir');
    expect(() => a.offrir(1, 'Camil', 50)).toThrow('Au moins');
    avancer(1);
    porte.crediter(1, -(porte.etat(1).solde - 500), 'test');
    expect(() => a.offrir(1, 'Camil', 1_000)).toThrow('Pas assez');
    expect(porte.etat(1).solde).toBe(500);
  });

  it('invitation : seulement depuis une table, vers un ami connecté', () => {
    const { a, recus } = creer();
    a.demander(1, 'Camil'); a.accepter(2, 'Thomas');
    expect(() => a.inviter(1, 'Camil')).toThrow('être à une table');
    const table = { code: 'ABCDE', nom: 'La table', jeu: 'poker', ville: null, joueurs: 2, places: 6, rejoignable: true };
    a.presence = (u) => ({ enLigne: true, table: u === 1 ? table : null });
    a.inviter(1, 'Camil');
    expect(recus.at(-1)).toMatchObject([2, { evenement: 'invitation', table: { code: 'ABCDE' } }]);
  });
});
