/**
 * La boîte de notifications (la cloche) : ce qui est arrivé à un joueur pendant qu'il n'était pas là
 * ou qu'il n'a pas encore vu : demandes d'amis, cadeaux, invitations, gains aux tirages…
 */
import { Base } from './base.js';

export type GenreNotif = 'demande' | 'accepte' | 'cadeau' | 'invitation' | 'tirage' | 'club';
export interface Notif { id: number; genre: GenreNotif; titre: string; texte: string; date: number; lu: boolean; code: string | null }

export function migrerBoite(db: Base) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boite (
      id INTEGER PRIMARY KEY,
      utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      genre TEXT NOT NULL,
      titre TEXT NOT NULL,
      texte TEXT NOT NULL,
      date INTEGER NOT NULL,
      lu INTEGER NOT NULL DEFAULT 0,
      code TEXT
    );
    CREATE INDEX IF NOT EXISTS boite_utilisateur ON boite(utilisateur, id);
  `);
}

export class Boite {
  /** Prévenu à chaque nouvelle notification (pour mettre à jour la cloche en direct). */
  surNouvelle: ((u: number, n: Notif) => void) | null = null;

  constructor(private db: Base, private horloge: () => number = Date.now) { migrerBoite(db); }

  ajouter(u: number, genre: GenreNotif, titre: string, texte: string, code: string | null = null): Notif {
    const date = this.horloge();
    const id = Number(this.db.prepare('INSERT INTO boite (utilisateur, genre, titre, texte, date, code) VALUES (?, ?, ?, ?, ?, ?)')
      .run(u, genre, titre.slice(0, 80), texte.slice(0, 200), date, code).lastInsertRowid);
    // On garde les 60 dernières
    this.db.prepare('DELETE FROM boite WHERE utilisateur = ? AND id <= ?').run(u, id - 60);
    const n: Notif = { id, genre, titre, texte, date, lu: false, code };
    this.surNouvelle?.(u, n);
    return n;
  }

  liste(u: number, max = 40) {
    const notifs = (this.db.prepare('SELECT id, genre, titre, texte, date, lu, code FROM boite WHERE utilisateur = ? ORDER BY id DESC LIMIT ?').all(u, max) as unknown as (Omit<Notif, 'lu'> & { lu: number })[])
      .map((n) => ({ ...n, lu: !!n.lu }));
    return { notifs, nonLues: this.nonLues(u) };
  }

  nonLues(u: number) {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM boite WHERE utilisateur = ? AND lu = 0').get(u) as { n: number }).n;
  }

  toutLu(u: number) {
    this.db.prepare('UPDATE boite SET lu = 1 WHERE utilisateur = ? AND lu = 0').run(u);
    return { ok: true };
  }
}
