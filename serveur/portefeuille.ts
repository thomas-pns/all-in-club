/**
 * Portefeuilles du Club : le solde en Clubs ♣ de chaque compte, la série du bonus du jour (la Grande Roue),
 * le coup de pouce quand on est à sec, et l'historique des mouvements.
 * Argent fictif : il ne s'achète pas et ne se retire jamais.
 */
import { randomInt } from 'node:crypto';
import { Base } from './base.js';
import { CALENDRIER, COUP_DE_POUCE, EtatBonus, JourSerie, ROUE, SEUIL_COUP_DE_POUCE, SOLDE_DEPART, etatBonus, gainRoue, jourParis, tirerRoue } from '../moteur/bonus.js';

export interface EtatPortefeuille {
  solde: number;
  tickets: number;
  bonus: EtatBonus & { calendrier: JourSerie[] };
  /** Tours de Grande Roue gagnés en plus (missions du jour). */
  toursBonus: number;
  coupDePouce: boolean;
}

export interface TourDeRoue { segment: number; clubs: number; tickets: number; jour: number; multiplicateur: number; quotidien: boolean; etat: EtatPortefeuille }

export class ErreurPortefeuille extends Error {}

interface Ligne { solde: number; tickets: number; serie: number; dernier_bonus: string | null; dernier_coup: string | null; tours_bonus: number }

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
  const colonnes = (db.prepare('PRAGMA table_info(portefeuilles)').all() as { name: string }[]).map((c) => c.name);
  if (!colonnes.includes('tours_bonus')) db.exec('ALTER TABLE portefeuilles ADD COLUMN tours_bonus INTEGER NOT NULL DEFAULT 0');
}

export class Portefeuilles {
  constructor(private db: Base, private horloge: () => number = Date.now, private hasard: (n: number) => number = (n) => randomInt(n)) { migrerPortefeuilles(db); }

  private ligne(u: number): Ligne {
    let l = this.db.prepare('SELECT solde, tickets, serie, dernier_bonus, dernier_coup, tours_bonus FROM portefeuilles WHERE utilisateur = ?').get(u) as Ligne | undefined;
    if (!l) {
      this.db.prepare('INSERT INTO portefeuilles (utilisateur, solde) VALUES (?, ?)').run(u, SOLDE_DEPART);
      this.db.prepare('INSERT INTO mouvements (utilisateur, date, montant, motif, solde) VALUES (?, ?, ?, ?, ?)').run(u, this.horloge(), SOLDE_DEPART, 'Bienvenue au Club', SOLDE_DEPART);
      l = { solde: SOLDE_DEPART, tickets: 0, serie: 0, dernier_bonus: null, dernier_coup: null, tours_bonus: 0 };
    }
    return l;
  }

  etat(u: number): EtatPortefeuille {
    const l = this.ligne(u);
    const auj = jourParis(this.horloge());
    return {
      solde: l.solde, tickets: l.tickets,
      bonus: { ...etatBonus(l.serie, l.dernier_bonus, auj), calendrier: CALENDRIER },
      toursBonus: l.tours_bonus,
      coupDePouce: l.solde < SEUIL_COUP_DE_POUCE && l.dernier_coup !== auj,
    };
  }

  /** Ajoute (ou retire, si négatif) des Clubs. Refuse de passer sous zéro. */
  crediter(u: number, montant: number, motif: string): number {
    const l = this.ligne(u);
    if (montant < 0 && this.estTest(u)) {
      // Compte de test : on note le mouvement mais rien n'est débité
      this.db.prepare('INSERT INTO mouvements (utilisateur, date, montant, motif, solde) VALUES (?, ?, 0, ?, ?)').run(u, this.horloge(), `(test, non débité) ${motif}`.slice(0, 80), l.solde);
      return l.solde;
    }
    const solde = l.solde + Math.trunc(montant);
    if (solde < 0) throw new ErreurPortefeuille('Pas assez de Clubs');
    this.db.prepare('UPDATE portefeuilles SET solde = ? WHERE utilisateur = ?').run(solde, u);
    this.db.prepare('INSERT INTO mouvements (utilisateur, date, montant, motif, solde) VALUES (?, ?, ?, ?, ?)').run(u, this.horloge(), Math.trunc(montant), motif.slice(0, 80), solde);
    return solde;
  }

  /** Compte de test (mode admin) ? */
  estTest(u: number): boolean {
    return !!(this.db.prepare('SELECT test FROM utilisateurs WHERE id = ?').get(u) as { test?: number } | undefined)?.test;
  }

  /**
   * Un tour de Grande Roue : d'abord le tour gratuit du jour (qui fait avancer la série),
   * puis les tours gagnés avec les missions. Le jour de la série multiplie le gain.
   */
  tournerRoue(u: number): TourDeRoue {
    const e = this.etat(u);
    const auj = jourParis(this.horloge());
    let jour: number, ticketsSerie = 0;
    const quotidien = e.bonus.dispo;
    if (quotidien) {
      jour = e.bonus.jour;
      ticketsSerie = CALENDRIER[jour - 1].tickets;
      this.db.prepare('UPDATE portefeuilles SET serie = ?, dernier_bonus = ? WHERE utilisateur = ?').run(jour, auj, u);
    } else if (e.toursBonus > 0) {
      jour = e.bonus.jour;
      this.db.prepare('UPDATE portefeuilles SET tours_bonus = tours_bonus - 1 WHERE utilisateur = ?').run(u);
    } else throw new ErreurPortefeuille('Plus de tour de roue aujourd\'hui : reviens demain !');
    const multiplicateur = CALENDRIER[jour - 1].multiplicateur;
    const segment = tirerRoue(this.hasard);
    const g = gainRoue(segment, multiplicateur);
    const tickets = g.tickets + ticketsSerie;
    if (tickets) this.db.prepare('UPDATE portefeuilles SET tickets = tickets + ? WHERE utilisateur = ?').run(tickets, u);
    if (g.clubs) this.crediter(u, g.clubs, `Grande Roue : ${ROUE[segment].label}${multiplicateur > 1 ? ` ×${String(multiplicateur).replace('.', ',')}` : ''}`);
    return { segment, clubs: g.clubs, tickets, jour, multiplicateur, quotidien, etat: this.etat(u) };
  }

  /** Un tour de roue en plus (les 3 missions du jour faites). */
  ajouterTourBonus(u: number) {
    this.ligne(u);
    this.db.prepare('UPDATE portefeuilles SET tours_bonus = tours_bonus + 1 WHERE utilisateur = ?').run(u);
  }

  coupDePouce(u: number): EtatPortefeuille {
    const e = this.etat(u);
    if (!e.coupDePouce) throw new ErreurPortefeuille(e.solde >= SEUIL_COUP_DE_POUCE ? 'Le coup de pouce est réservé aux portefeuilles à sec' : 'Coup de pouce déjà reçu aujourd\'hui');
    this.db.prepare('UPDATE portefeuilles SET dernier_coup = ? WHERE utilisateur = ?').run(jourParis(this.horloge()), u);
    this.crediter(u, COUP_DE_POUCE, 'Coup de pouce du Club');
    return this.etat(u);
  }

  utiliserTicketOffert(u: number) {
    const l = this.ligne(u);
    if (l.tickets <= 0) throw new ErreurPortefeuille('Aucun ticket offert');
    this.db.prepare('UPDATE portefeuilles SET tickets = tickets - 1 WHERE utilisateur = ?').run(u);
  }

  mouvements(u: number, n = 30) {
    return this.db.prepare('SELECT date, montant, motif, solde FROM mouvements WHERE utilisateur = ? ORDER BY id DESC LIMIT ?').all(u, n) as { date: number; montant: number; motif: string; solde: number }[];
  }

  /** Les plus riches du Club. */
  classement(n = 50) {
    return this.db.prepare(`SELECT u.pseudo, u.avatar, u.cadre, p.solde FROM portefeuilles p JOIN utilisateurs u ON u.id = p.utilisateur WHERE u.test = 0 ORDER BY p.solde DESC, u.pseudo LIMIT ?`).all(n) as { pseudo: string; avatar: string; cadre: string; solde: number }[];
  }
}
