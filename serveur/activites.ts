/**
 * Activités du Club : les missions du jour (suivies à chaque coup joué) et les annonces des gros gains,
 * diffusées en direct à tout le monde.
 */
import { Base } from './base.js';
import type { Portefeuilles } from './portefeuille.js';
import { ActionMission, missionsDuJour } from '../moteur/missions.js';
import { jourParis } from '../moteur/bonus.js';

export interface Annonce { id: number; date: number; pseudo: string; avatar: string; texte: string; montant: number }
export interface EtatMission { cle: ActionMission; texte: string; objectif: number; progres: number; recompense: number; fait: boolean }
export interface MissionFaite { mission: EtatMission; toutes: boolean }

export function migrerActivites(db: Base) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      jour TEXT NOT NULL,
      cle TEXT NOT NULL,
      progres INTEGER NOT NULL DEFAULT 0,
      fait INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (utilisateur, jour, cle)
    );
    CREATE TABLE IF NOT EXISTS annonces (
      id INTEGER PRIMARY KEY,
      date INTEGER NOT NULL,
      utilisateur INTEGER NOT NULL,
      texte TEXT NOT NULL,
      montant INTEGER NOT NULL
    );
  `);
}

/** Minuit à Paris après l'instant t (pour le compte à rebours des nouvelles missions). */
function prochainMinuitParis(t: number) {
  const auj = jourParis(t);
  let x = t + 60_000;
  // Avance par pas d'une heure puis d'une minute jusqu'au changement de jour (gère l'heure d'été)
  while (jourParis(x + 3_600_000) === auj) x += 3_600_000;
  while (jourParis(x) === auj) x += 60_000;
  return x - (x % 60_000);
}

export class Activites {
  /** Appelés par le Hall pour prévenir les joueurs connectés. */
  surMission: ((u: number, m: MissionFaite) => void) | null = null;
  surAnnonce: ((a: Annonce) => void) | null = null;

  constructor(private db: Base, private porte: Portefeuilles | null, private horloge: () => number = Date.now) { migrerActivites(db); }

  /** Les missions du jour d'un joueur, avec où il en est. */
  missions(u: number) {
    const t = this.horloge(), jour = jourParis(t);
    const lignes = new Map((this.db.prepare('SELECT cle, progres, fait FROM missions WHERE utilisateur = ? AND jour = ?').all(u, jour) as { cle: string; progres: number; fait: number }[]).map((l) => [l.cle, l]));
    const missions: EtatMission[] = missionsDuJour(u, jour).map((d) => {
      const l = lignes.get(d.cle);
      return { cle: d.cle, texte: d.texte, objectif: d.objectif, recompense: d.recompense, progres: Math.min(d.objectif, l?.progres ?? 0), fait: !!l?.fait };
    });
    return { missions, nouvellesDans: prochainMinuitParis(t) - t };
  }

  /** Quelque chose s'est passé pour ce joueur : fait avancer ses missions du jour. */
  signaler(u: number | null, action: ActionMission, n = 1) {
    if (u === null || n <= 0) return;
    const jour = jourParis(this.horloge());
    const def = missionsDuJour(u, jour).find((m) => m.cle === action);
    if (!def) return;
    const avant = this.db.prepare('SELECT progres, fait FROM missions WHERE utilisateur = ? AND jour = ? AND cle = ?').get(u, jour, action) as { progres: number; fait: number } | undefined;
    if (avant?.fait) return;
    const progres = Math.min(def.objectif, (avant?.progres ?? 0) + n);
    const fait = progres >= def.objectif;
    this.db.prepare(`INSERT INTO missions (utilisateur, jour, cle, progres, fait) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(utilisateur, jour, cle) DO UPDATE SET progres = excluded.progres, fait = excluded.fait`).run(u, jour, action, progres, fait ? 1 : 0);
    if (!fait) return;
    this.porte?.crediter(u, def.recompense, `Mission : ${def.texte}`);
    const etat = this.missions(u).missions;
    const toutes = etat.every((m) => m.fait);
    if (toutes) this.porte?.ajouterTourBonus(u);
    this.surMission?.(u, { mission: etat.find((m) => m.cle === action)!, toutes });
  }

  /** Un gros gain : on le crie dans tout le Club. */
  annoncer(u: number, texte: string, montant: number) {
    if (this.porte?.estTest(u)) return; // les comptes de test ne font pas de bruit
    const id = Number(this.db.prepare('INSERT INTO annonces (date, utilisateur, texte, montant) VALUES (?, ?, ?, ?)').run(this.horloge(), u, texte.slice(0, 120), montant).lastInsertRowid);
    this.db.prepare('DELETE FROM annonces WHERE id <= ?').run(id - 50);
    const a = this.annonce(id);
    if (a) this.surAnnonce?.(a);
  }

  private annonce(id: number): Annonce | null {
    return (this.db.prepare('SELECT a.id, a.date, u.pseudo, u.avatar, a.texte, a.montant FROM annonces a JOIN utilisateurs u ON u.id = a.utilisateur WHERE a.id = ?').get(id) as Annonce | undefined) ?? null;
  }

  /** Les dernières annonces (les plus récentes d'abord). */
  annonces(n = 8): Annonce[] {
    return this.db.prepare('SELECT a.id, a.date, u.pseudo, u.avatar, a.texte, a.montant FROM annonces a JOIN utilisateurs u ON u.id = a.utilisateur ORDER BY a.id DESC LIMIT ?').all(n) as unknown as Annonce[];
  }
}
