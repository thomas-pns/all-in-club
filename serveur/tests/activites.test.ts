import { describe, it, expect } from 'vitest';
import { ouvrirBase } from '../base.js';
import { Portefeuilles } from '../portefeuille.js';
import { Activites } from '../activites.js';
import { migrer } from '../donnees.js';
import { missionsDuJour } from '../../moteur/missions.js';
import { SOLDE_DEPART, jourParis } from '../../moteur/bonus.js';

function creer() {
  const db = ouvrirBase(':memory:');
  migrer(db);
  db.prepare("INSERT INTO utilisateurs (id, pseudo, hash, cree) VALUES (1, 'thomas', 'x', 0), (2, 'leo', 'x', 0)").run();
  let t = Date.UTC(2026, 10, 5, 10);
  const porte = new Portefeuilles(db, () => t, () => 0);
  const a = new Activites(db, porte, () => t);
  return { a, porte, avancer: (j: number) => { t += j * 86_400_000; } };
}

describe('Missions du jour', () => {
  it('donne 3 missions différentes (2 Casino, 1 Kiosque), les mêmes toute la journée', () => {
    const m = missionsDuJour(1, '2026-11-05');
    expect(new Set(m.map((x) => x.cle)).size).toBe(3);
    expect(m.map((x) => x.groupe)).toEqual(['casino', 'casino', 'kiosque']);
    expect(missionsDuJour(1, '2026-11-05')).toEqual(m);
  });

  it('avance, paie la récompense une seule fois et offre un tour de roue quand tout est fait', () => {
    const { a, porte } = creer();
    const recus: string[] = [];
    a.surMission = (_u, m) => recus.push(`${m.mission.cle}${m.toutes ? '+' : ''}`);
    const ms = a.missions(1).missions;
    let attendu = SOLDE_DEPART;
    for (const m of ms) {
      for (let i = 0; i < m.objectif + 2; i++) a.signaler(1, m.cle);
      attendu += m.recompense;
    }
    a.signaler(1, ms[0].cle);
    expect(porte.etat(1).solde).toBe(attendu);
    expect(a.missions(1).missions.every((m) => m.fait && m.progres === m.objectif)).toBe(true);
    expect(recus).toEqual([ms[0].cle, ms[1].cle, `${ms[2].cle}+`]);
    expect(porte.etat(1).toursBonus).toBe(1);
    // Une action hors missions ne change rien
    expect(a.missions(2).missions.every((m) => m.progres === 0)).toBe(true);
    expect(a.missions(1).nouvellesDans).toBeGreaterThan(0);
  });

  it('annonce les gros gains à tout le monde', () => {
    const { a } = creer();
    const vues: string[] = [];
    a.surAnnonce = (x) => vues.push(`${x.pseudo} ${x.texte}`);
    a.annoncer(2, 'a gagné 50 000 ♣ au Coffre', 50_000);
    expect(vues).toEqual(['leo a gagné 50 000 ♣ au Coffre']);
    expect(a.annonces()[0]).toMatchObject({ pseudo: 'leo', montant: 50_000 });
    expect(jourParis(Date.now())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
