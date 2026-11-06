/**
 * Le mode admin (réservé au patron du Club) : les joueurs, les comptes de test, la surveillance
 * des mouvements d'argent suspects et le réglage des récompenses (missions, Grande Roue, série).
 *
 * Qui est admin ? Les pseudos de la variable d'environnement ADMINS (séparés par des virgules) ;
 * à défaut, le tout premier compte créé.
 */
import { randomBytes } from 'node:crypto';
import { Base } from './base.js';
import type { Comptes, Utilisateur } from './comptes.js';
import type { Portefeuilles } from './portefeuille.js';
import { ErreurPortefeuille } from './portefeuille.js';
import { CALENDRIER, ROUE } from '../moteur/bonus.js';
import { MISSIONS } from '../moteur/missions.js';
import { jourParis } from '../moteur/bonus.js';

export class ErreurAdmin extends Error {}

interface Reglages {
  missions: { cle: string; recompense: number }[];
  roue: { clubs: number; tickets: number; poids: number }[];
  calendrier: { multiplicateur: number; tickets: number }[];
}

const entier = (v: unknown, min: number, max: number, quoi: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ErreurAdmin(`${quoi} : entre ${min} et ${max}`);
  return n;
};
const etiquette = (clubs: number) => String(clubs).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export class Administration {
  private admins: string[];

  constructor(private db: Base, private comptes: Comptes, private porte: Portefeuilles, admins = process.env.ADMINS ?? '', private horloge: () => number = Date.now) {
    this.admins = admins.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    db.exec(`
      CREATE TABLE IF NOT EXISTS config (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS flux_prives (
        utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        jour TEXT NOT NULL,
        mise INTEGER NOT NULL DEFAULT 0,
        retour INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (utilisateur, jour)
      );
    `);
    const r = db.prepare("SELECT valeur FROM config WHERE cle = 'reglages_jeu'").get() as { valeur: string } | undefined;
    if (r) { try { this.appliquer(JSON.parse(r.valeur)); } catch (e) { console.error('Réglages du jeu illisibles', e); } }
  }

  estAdmin(u: Utilisateur) {
    return this.admins.length ? this.admins.includes(u.pseudo.toLowerCase()) : u.id === (this.db.prepare('SELECT MIN(id) AS id FROM utilisateurs').get() as { id: number }).id;
  }

  /* ------------------------------ Joueurs ------------------------------ */

  joueurs(enLigne: (u: number) => boolean) {
    const lignes = this.db.prepare(`SELECT u.id, u.pseudo, u.avatar, u.email IS NOT NULL AS email, u.cree, u.test,
        COALESCE(p.solde, 0) AS solde, (SELECT MAX(date) FROM mouvements m WHERE m.utilisateur = u.id) AS derniere
      FROM utilisateurs u LEFT JOIN portefeuilles p ON p.utilisateur = u.id ORDER BY u.pseudo COLLATE NOCASE`).all() as {
        id: number; pseudo: string; avatar: string; email: number; cree: number; test: number; solde: number; derniere: number | null }[];
    return { joueurs: lignes.map((l) => ({ ...l, email: !!l.email, test: !!l.test, enLigne: enLigne(l.id) })) };
  }

  private existe(id: number) {
    const u = this.db.prepare('SELECT id, pseudo FROM utilisateurs WHERE id = ?').get(id) as { id: number; pseudo: string } | undefined;
    if (!u) throw new ErreurAdmin('Joueur introuvable');
    return u;
  }

  /** Ajouter ou retirer des Clubs à un joueur. */
  crediter(id: number, montant: unknown, motif: unknown) {
    this.existe(id);
    const m = Math.trunc(entier(montant, -1e9, 1e9, 'Montant'));
    if (!m) throw new ErreurAdmin('Montant nul');
    try { return { solde: this.porte.crediter(id, m, String(motif || (m > 0 ? 'Cadeau du Club' : 'Retenue du Club')).slice(0, 60)) }; }
    catch (e) { if (e instanceof ErreurPortefeuille) throw new ErreurAdmin('Le solde ne peut pas passer sous zéro'); throw e; }
  }

  basculerTest(id: number) {
    this.existe(id);
    this.db.prepare('UPDATE utilisateurs SET test = 1 - test WHERE id = ?').run(id);
    return { test: this.porte.estTest(id) };
  }

  async motDePasseProvisoire(id: number) {
    const u = this.existe(id);
    const mdp = randomBytes(6).toString('base64url');
    await this.comptes.definirMotDePasse(id, mdp);
    return { pseudo: u.pseudo, mdp };
  }

  /** Un compte de test tout neuf (mot de passe affiché une seule fois). */
  async creerTest() {
    let n = 1;
    while (this.db.prepare('SELECT 1 FROM utilisateurs WHERE pseudo = ?').get(`Testeur${n}`)) n++;
    const pseudo = `Testeur${n}`, mdp = randomBytes(6).toString('base64url');
    const r = await this.comptes.inscrire(pseudo, mdp, null, 'robot');
    this.db.prepare('UPDATE utilisateurs SET test = 1 WHERE id = ?').run(r.utilisateur.id);
    return { pseudo, mdp };
  }

  /* ------------------------------ Surveillance ------------------------------ */

  /** Argent misé et récupéré aux tables privées en vrais Clubs (appelé par le Hall). */
  fluxPrive(u: number, montant: number) {
    const jour = jourParis(this.horloge());
    this.db.prepare(`INSERT INTO flux_prives (utilisateur, jour, mise, retour) VALUES (?, ?, ?, ?)
      ON CONFLICT(utilisateur, jour) DO UPDATE SET mise = mise + excluded.mise, retour = retour + excluded.retour`)
      .run(u, jour, montant < 0 ? -montant : 0, montant > 0 ? montant : 0);
  }

  /** Ce qui pourrait ressembler à du transfert d'argent : on regarde, on n'empêche rien. */
  surveillance() {
    const t = this.horloge();
    const semaine = jourParis(t - 7 * 86_400_000);
    const gains24h = this.db.prepare(`SELECT u.pseudo, SUM(m.montant) AS net FROM mouvements m JOIN utilisateurs u ON u.id = m.utilisateur
      WHERE m.date > ? AND u.test = 0 AND m.motif != 'Bienvenue au Club' GROUP BY m.utilisateur HAVING net > 0 ORDER BY net DESC LIMIT 10`).all(t - 86_400_000) as { pseudo: string; net: number }[];
    const prives = this.db.prepare(`SELECT u.pseudo, SUM(f.mise) AS mise, SUM(f.retour) AS retour, SUM(f.retour) - SUM(f.mise) AS net
      FROM flux_prives f JOIN utilisateurs u ON u.id = f.utilisateur WHERE f.jour >= ? GROUP BY f.utilisateur ORDER BY ABS(SUM(f.retour) - SUM(f.mise)) DESC LIMIT 15`).all(semaine) as { pseudo: string; mise: number; retour: number; net: number }[];
    const cadeaux = this.db.prepare(`SELECT d.pseudo AS de, a.pseudo AS a, SUM(c.montant) AS total, COUNT(*) AS fois
      FROM cadeaux c JOIN utilisateurs d ON d.id = c.de JOIN utilisateurs a ON a.id = c.a WHERE c.jour >= ? GROUP BY c.de, c.a ORDER BY total DESC LIMIT 15`).all(semaine) as { de: string; a: string; total: number; fois: number }[];
    return { gains24h, prives, cadeaux };
  }

  /* ------------------------------ Récompenses ------------------------------ */

  reglages() {
    return {
      missions: MISSIONS.map(({ cle, texte, recompense }) => ({ cle, texte, recompense })),
      roue: ROUE.map(({ label, clubs, tickets, poids, couleur }) => ({ label, clubs, tickets, poids, couleur })),
      calendrier: CALENDRIER.map((j) => ({ ...j })),
    };
  }

  modifierReglages(r: Partial<Reglages>) {
    const avant = JSON.stringify(this.reglages());
    try { this.appliquer(r); }
    catch (e) { this.appliquer(JSON.parse(avant)); throw e; }
    const x = this.reglages();
    this.db.prepare("INSERT INTO config (cle, valeur) VALUES ('reglages_jeu', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
      .run(JSON.stringify({ missions: x.missions, roue: x.roue, calendrier: x.calendrier }));
    return x;
  }

  /** Applique des réglages (validés) aux règles en mémoire. */
  private appliquer(r: Partial<Reglages>) {
    if (Array.isArray(r.missions)) for (const m of r.missions) {
      const d = MISSIONS.find((x) => x.cle === m?.cle);
      if (d) d.recompense = Math.round(entier(m.recompense, 0, 1_000_000, 'Récompense de mission'));
    }
    if (Array.isArray(r.roue)) {
      if (r.roue.length !== ROUE.length) throw new ErreurAdmin('La roue a 12 cases');
      const nouv = r.roue.map((s, i) => ({ clubs: Math.round(entier(s?.clubs, 0, 10_000_000, `Case ${i + 1}`)), tickets: Math.round(entier(s?.tickets ?? 0, 0, 10, `Tickets case ${i + 1}`)), poids: Math.round(entier(s?.poids, 0, 1000, `Chance case ${i + 1}`)) }));
      if (!nouv.some((s) => s.poids > 0)) throw new ErreurAdmin('Au moins une case doit pouvoir tomber');
      nouv.forEach((s, i) => {
        const seg = ROUE[i];
        Object.assign(seg, s);
        if (seg.label !== 'JACKPOT') seg.label = s.clubs ? etiquette(s.clubs) : s.tickets ? '🎟️' : '0';
      });
    }
    if (Array.isArray(r.calendrier)) {
      if (r.calendrier.length !== CALENDRIER.length) throw new ErreurAdmin('La série dure 7 jours');
      r.calendrier.forEach((j, i) => {
        CALENDRIER[i].multiplicateur = Math.round(entier(j?.multiplicateur, 0.5, 20, `Multiplicateur jour ${i + 1}`) * 10) / 10;
        CALENDRIER[i].tickets = Math.round(entier(j?.tickets ?? 0, 0, 10, `Tickets jour ${i + 1}`));
      });
    }
  }
}
