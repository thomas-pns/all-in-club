/**
 * Portefeuilles du Club : le solde en Clubs ♣ de chaque compte, la série du bonus du jour,
 * le coup de pouce quand on est à sec, et l'historique des mouvements.
 * Argent fictif : il ne s'achète pas et ne se retire jamais.
 */
import { Base } from './base.js';
import { CALENDRIER, COUP_DE_POUCE, EtatBonus, Recompense, SEUIL_COUP_DE_POUCE, SOLDE_DEPART, etatBonus, jourParis } from '../moteur/bonus.js';

export interface EtatPortefeuille {
  solde: number;
  tickets: number;
  bonus: EtatBonus & { calendrier: Recompense[] };
  coupDePouce: boolean;
}

export class ErreurPortefeuille extends Error {}

interface Ligne { solde: number; tickets: number; serie: number; dernier_bonus: string | null; dernier_coup: string | null }

export function migrerPortefeuilles(db: Base) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portefeuilles (
      utilisateur INTEGER PRIMARY KEY REFERENCES utilisateurs(id) ON DELETE CASCADE,
      solde INTEGER NOT NULL,
      tickets INTEGER NOT NULL DEFAULT 0,
      serie INTEGER NOT NULL DEFAULT 0,
      dernier_bonus TEXT,
      dernier_coup TEXT
    );
    CREATE TABLE IF NOT EXISTS mouvements (
      id INTEGER PRIMARY KEY,
      utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      date INTEGER NOT NULL,
      montant INTEGER NOT NULL,
      motif TEXT NOT NULL,
      solde INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mouvements_utilisateur ON mouvements(utilisateur, id);
  `);
}

export class Portefeuilles {
  constructor(private db: Base, private horloge: () => number = Date.now) { migrerPortefeuilles(db); }

  private ligne(u: number): Ligne {
    let l = this.db.prepare('SELECT solde, tickets, serie, dernier_bonus, dernier_coup FROM portefeuilles WHERE utilisateur = ?').get(u) as Ligne | undefined;
    if (!l) {
      this.db.prepare('INSERT INTO portefeuilles (utilisateur, solde) VALUES (?, ?)').run(u, SOLDE_DEPART);
      this.db.prepare('INSERT INTO mouvements (utilisateur, date, montant, motif, solde) VALUES (?, ?, ?, ?, ?)').run(u, this.horloge(), SOLDE_DEPART, 'Bienvenue au Club', SOLDE_DEPART);
      l = { solde: SOLDE_DEPART, tickets: 0, serie: 0, dernier_bonus: null, dernier_coup: null };
    }
    return l;
  }

  etat(u: number): EtatPortefeuille {
    const l = this.ligne(u);
    const auj = jourParis(this.horloge());
    return {
      solde: l.solde, tickets: l.tickets,
      bonus: { ...etatBonus(l.serie, l.dernier_bonus, auj), calendrier: CALENDRIER },
      coupDePouce: l.solde < SEUIL_COUP_DE_POUCE && l.dernier_coup !== auj,
    };
  }

  /** Ajoute (ou retire, si négatif) des Clubs. Refuse de passer sous zéro. */
  crediter(u: number, montant: number, motif: string): number {
    const l = this.ligne(u);
    const solde = l.solde + Math.trunc(montant);
    if (solde < 0) throw new ErreurPortefeuille('Pas assez de Clubs');
    this.db.prepare('UPDATE portefeuilles SET solde = ? WHERE utilisateur = ?').run(solde, u);
    this.db.prepare('INSERT INTO mouvements (utilisateur, date, montant, motif, solde) VALUES (?, ?, ?, ?, ?)').run(u, this.horloge(), Math.trunc(montant), motif.slice(0, 80), solde);
    return solde;
  }

  encaisserBonus(u: number): { recompense: Recompense; jour: number; etat: EtatPortefeuille } {
    const e = this.etat(u);
    if (!e.bonus.dispo) throw new ErreurPortefeuille('Bonus déjà récupéré aujourd\'hui');
    const r = CALENDRIER[e.bonus.jour - 1];
    const auj = jourParis(this.horloge());
    this.db.prepare('UPDATE portefeuilles SET serie = ?, dernier_bonus = ?, tickets = tickets + ? WHERE utilisateur = ?').run(e.bonus.jour, auj, r.tickets, u);
    this.crediter(u, r.clubs, `Bonus du jour ${e.bonus.jour}`);
    return { recompense: r, jour: e.bonus.jour, etat: this.etat(u) };
  }

  coupDePouce(u: number): EtatPortefeuille {
    const e = this.etat(u);
    if (!e.coupDePouce) throw new ErreurPortefeuille(e.solde >= SEUIL_COUP_DE_POUCE ? 'Le coup de pouce est réservé aux portefeuilles à sec' : 'Coup de pouce déjà reçu aujourd\'hui');
    this.db.prepare('UPDATE portefeuilles SET dernier_coup = ? WHERE utilisateur = ?').run(jourParis(this.horloge()), u);
    this.crediter(u, COUP_DE_POUCE, 'Coup de pouce du Club');
    return this.etat(u);
  }

  mouvements(u: number, n = 30) {
    return this.db.prepare('SELECT date, montant, motif, solde FROM mouvements WHERE utilisateur = ? ORDER BY id DESC LIMIT ?').all(u, n) as { date: number; montant: number; motif: string; solde: number }[];
  }

  /** Les plus riches du Club. */
  classement(n = 50) {
    return this.db.prepare(`SELECT u.pseudo, u.avatar, u.cadre, p.solde FROM portefeuilles p JOIN utilisateurs u ON u.id = p.utilisateur ORDER BY p.solde DESC, u.pseudo LIMIT ?`).all(n) as { pseudo: string; avatar: string; cadre: string; solde: number }[];
  }
}
