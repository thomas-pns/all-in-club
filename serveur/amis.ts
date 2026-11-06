/**
 * Les amis du Club : demandes par pseudo, liste avec qui est en ligne et où il joue,
 * invitations à sa table et cadeaux en Clubs ♣ (plafonnés par jour).
 */
import { Base } from './base.js';
import type { Portefeuilles } from './portefeuille.js';
import { ErreurPortefeuille } from './portefeuille.js';
import { jourParis } from '../moteur/bonus.js';

/** Combien de Clubs on peut offrir au total par jour (contre les abus). */
export const CADEAU_MAX_JOUR = 10_000;
export const CADEAU_MIN = 100;
export const AMIS_MAX = 100;

export interface TablePresence { code: string; nom: string; jeu: string; ville: string | null; joueurs: number; places: number; rejoignable: boolean }
export interface Presence { enLigne: boolean; table: TablePresence | null }
export interface Personne { id: number; pseudo: string; avatar: string; cadre: string }
export interface MessageAmi {
  type: 'amis';
  evenement: 'demande' | 'accepte' | 'cadeau' | 'invitation';
  de: { pseudo: string; avatar: string; cadre: string };
  montant?: number;
  table?: TablePresence;
}

export class ErreurAmis extends Error {}

export function migrerAmis(db: Base) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS amis (
      utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      ami INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      statut TEXT NOT NULL,               -- 'envoyee' (j'ai demandé), 'recue' (on m'a demandé), 'ok'
      date INTEGER NOT NULL,
      PRIMARY KEY (utilisateur, ami)
    );
    CREATE TABLE IF NOT EXISTS cadeaux (
      id INTEGER PRIMARY KEY,
      de INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      a INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      montant INTEGER NOT NULL,
      jour TEXT NOT NULL,
      date INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cadeaux_jour ON cadeaux(de, jour);
  `);
}

export class Amis {
  /** Branchés par le Hall : présence en ligne, et messages en direct. */
  presence: (u: number) => Presence = () => ({ enLigne: false, table: null });
  notifier: (u: number, m: MessageAmi) => void = () => {};

  constructor(private db: Base, private porte: Portefeuilles | null, private horloge: () => number = Date.now) { migrerAmis(db); }

  private personne(u: number): Personne {
    const p = this.db.prepare('SELECT id, pseudo, avatar, cadre FROM utilisateurs WHERE id = ?').get(u) as Personne | undefined;
    if (!p) throw new ErreurAmis('Joueur introuvable');
    return p;
  }

  private parPseudo(pseudo: string): Personne {
    const p = this.db.prepare('SELECT id, pseudo, avatar, cadre FROM utilisateurs WHERE pseudo = ? COLLATE NOCASE').get(String(pseudo ?? '').trim()) as Personne | undefined;
    if (!p) throw new ErreurAmis('Aucun joueur avec ce pseudo');
    return p;
  }

  private lien(u: number, v: number) {
    return (this.db.prepare('SELECT statut FROM amis WHERE utilisateur = ? AND ami = ?').get(u, v) as { statut: string } | undefined)?.statut ?? null;
  }

  sontAmis(u: number, v: number) { return this.lien(u, v) === 'ok'; }

  /** Ma liste : amis (en ligne d'abord), demandes reçues et envoyées. */
  liste(u: number) {
    const lignes = this.db.prepare(`SELECT a.statut, a.date, p.id, p.pseudo, p.avatar, p.cadre FROM amis a JOIN utilisateurs p ON p.id = a.ami
      WHERE a.utilisateur = ? ORDER BY p.pseudo COLLATE NOCASE`).all(u) as unknown as (Personne & { statut: string; date: number })[];
    const sans = ({ id: _id, statut: _s, date: _d, ...p }: Personne & { statut: string; date: number }) => p;
    const amis = lignes.filter((l) => l.statut === 'ok').map((l) => ({ ...sans(l), ...this.presence(l.id) }))
      .sort((a, b) => Number(b.enLigne) - Number(a.enLigne) || Number(!!b.table) - Number(!!a.table));
    const offerts = this.offertAujourdhui(u);
    return {
      amis,
      recues: lignes.filter((l) => l.statut === 'recue').map(sans),
      envoyees: lignes.filter((l) => l.statut === 'envoyee').map(sans),
      cadeaux: { offerts, reste: Math.max(0, CADEAU_MAX_JOUR - offerts), min: CADEAU_MIN },
    };
  }

  /** Demande d'ami par pseudo. Si l'autre m'avait déjà demandé, c'est accepté directement. */
  demander(u: number, pseudo: string) {
    const v = this.parPseudo(pseudo);
    if (v.id === u) throw new ErreurAmis('Tu ne peux pas être ton propre ami 🙂');
    const l = this.lien(u, v.id);
    if (l === 'ok') throw new ErreurAmis(`${v.pseudo} est déjà ton ami`);
    if (l === 'envoyee') throw new ErreurAmis(`Demande déjà envoyée à ${v.pseudo}`);
    if (l === 'recue') return this.accepter(u, v.pseudo);
    const n = (this.db.prepare("SELECT COUNT(*) AS n FROM amis WHERE utilisateur = ? AND statut != 'recue'").get(u) as { n: number }).n;
    if (n >= AMIS_MAX) throw new ErreurAmis(`Pas plus de ${AMIS_MAX} amis`);
    const t = this.horloge();
    this.db.prepare("INSERT INTO amis (utilisateur, ami, statut, date) VALUES (?, ?, 'envoyee', ?)").run(u, v.id, t);
    this.db.prepare("INSERT INTO amis (utilisateur, ami, statut, date) VALUES (?, ?, 'recue', ?)").run(v.id, u, t);
    const moi = this.personne(u);
    this.notifier(v.id, { type: 'amis', evenement: 'demande', de: { pseudo: moi.pseudo, avatar: moi.avatar, cadre: moi.cadre } });
    return { statut: 'envoyee' as const, pseudo: v.pseudo };
  }

  accepter(u: number, pseudo: string) {
    const v = this.parPseudo(pseudo);
    if (this.lien(u, v.id) !== 'recue') throw new ErreurAmis('Aucune demande de ce joueur');
    this.db.prepare("UPDATE amis SET statut = 'ok' WHERE (utilisateur = ? AND ami = ?) OR (utilisateur = ? AND ami = ?)").run(u, v.id, v.id, u);
    const moi = this.personne(u);
    this.notifier(v.id, { type: 'amis', evenement: 'accepte', de: { pseudo: moi.pseudo, avatar: moi.avatar, cadre: moi.cadre } });
    return { statut: 'ok' as const, pseudo: v.pseudo };
  }

  /** Refuser une demande, annuler la sienne, ou retirer un ami : le lien disparaît des deux côtés. */
  retirer(u: number, pseudo: string) {
    const v = this.parPseudo(pseudo);
    this.db.prepare('DELETE FROM amis WHERE (utilisateur = ? AND ami = ?) OR (utilisateur = ? AND ami = ?)').run(u, v.id, v.id, u);
    return { ok: true };
  }

  private offertAujourdhui(u: number) {
    return (this.db.prepare('SELECT COALESCE(SUM(montant), 0) AS s FROM cadeaux WHERE de = ? AND jour = ?').get(u, jourParis(this.horloge())) as { s: number }).s;
  }

  /** Offrir des Clubs à un ami (plafond par jour, jamais plus que son solde). */
  offrir(u: number, pseudo: string, montant: unknown) {
    const v = this.parPseudo(pseudo);
    if (!this.sontAmis(u, v.id)) throw new ErreurAmis('On ne fait des cadeaux qu\'à ses amis');
    const m = Math.floor(Number(montant));
    if (!Number.isFinite(m) || m < CADEAU_MIN) throw new ErreurAmis(`Au moins ${CADEAU_MIN} Clubs`);
    const reste = CADEAU_MAX_JOUR - this.offertAujourdhui(u);
    if (m > reste) throw new ErreurAmis(reste > 0 ? `Tu peux encore offrir ${reste} Clubs aujourd'hui` : 'Plafond de cadeaux atteint pour aujourd\'hui');
    if (!this.porte) throw new ErreurAmis('Portefeuille indisponible');
    const moi = this.personne(u);
    this.porte.crediter(u, -m, `Cadeau à ${v.pseudo}`);
    try { this.porte.crediter(v.id, m, `Cadeau de ${moi.pseudo}`); }
    catch (e) { this.porte.crediter(u, m, `Cadeau annulé (${v.pseudo})`); throw e; }
    this.db.prepare('INSERT INTO cadeaux (de, a, montant, jour, date) VALUES (?, ?, ?, ?, ?)').run(u, v.id, m, jourParis(this.horloge()), this.horloge());
    this.notifier(v.id, { type: 'amis', evenement: 'cadeau', de: { pseudo: moi.pseudo, avatar: moi.avatar, cadre: moi.cadre }, montant: m });
    return { etat: this.porte.etat(u), reste: reste - m };
  }

  /** Inviter un ami à la table où je suis. */
  inviter(u: number, pseudo: string) {
    const v = this.parPseudo(pseudo);
    if (!this.sontAmis(u, v.id)) throw new ErreurAmis('Tu ne peux inviter que tes amis');
    const ici = this.presence(u).table;
    if (!ici) throw new ErreurAmis('Tu dois être à une table pour inviter');
    const lui = this.presence(v.id);
    const moi = this.personne(u);
    // Hors ligne, l'invitation l'attend dans sa cloche (et sur son téléphone s'il a les notifications)
    this.notifier(v.id, { type: 'amis', evenement: 'invitation', de: { pseudo: moi.pseudo, avatar: moi.avatar, cadre: moi.cadre }, table: ici });
    return { ok: true, enLigne: lui.enLigne };
  }
}

export { ErreurPortefeuille };
