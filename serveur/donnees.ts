/**
 * Données de jeu : statistiques, succès, historique des mains, sauvegarde des tables.
 */
import { Base } from './base.js';
import { Stats, STATS_VIDES, cumulerMain, nouveauxSucces, DefinitionSucces, ContexteSucces, CADRES, DOS, SUCCES } from '../moteur/succes.js';
import { FaitsJoueur, EnregistrementMain, filtrerEnregistrement } from '../moteur/analyse.js';
import { SauvegardeSalle } from '../moteur/salle.js';
import type { SauvegardeBJ } from '../moteur/blackjack/salleBJ.js';

const MAINS_PAR_JOUEUR = 50;

export function migrer(db: Base) {
  const colonnes = (db.prepare('PRAGMA table_info(utilisateurs)').all() as { name: string }[]).map((c) => c.name);
  if (!colonnes.includes('cadre')) db.exec("ALTER TABLE utilisateurs ADD COLUMN cadre TEXT NOT NULL DEFAULT 'aucun'");
  if (!colonnes.includes('dos')) db.exec("ALTER TABLE utilisateurs ADD COLUMN dos TEXT NOT NULL DEFAULT 'prune'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats (
      utilisateur INTEGER PRIMARY KEY REFERENCES utilisateurs(id) ON DELETE CASCADE,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS succes (
      utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      date INTEGER NOT NULL,
      PRIMARY KEY (utilisateur, id)
    );
    CREATE TABLE IF NOT EXISTS mains (
      id INTEGER PRIMARY KEY,
      date INTEGER NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mains_joueurs (
      main INTEGER NOT NULL REFERENCES mains(id) ON DELETE CASCADE,
      utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      net INTEGER NOT NULL,
      PRIMARY KEY (main, utilisateur)
    );
    CREATE INDEX IF NOT EXISTS mains_joueurs_utilisateur ON mains_joueurs(utilisateur, main);
    CREATE TABLE IF NOT EXISTS salles (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      maj INTEGER NOT NULL
    );
  `);
}

/** Identifiant de membre « u12 » → identifiant utilisateur 12 (null pour un bot). */
export const idUtilisateur = (membre: string): number | null => (/^u\d+$/.test(membre) ? Number(membre.slice(1)) : null);

export class Donnees {
  constructor(private db: Base) { migrer(db); }

  /* --------------------------- Statistiques --------------------------- */

  stats(u: number): Stats {
    const r = this.db.prepare('SELECT json FROM stats WHERE utilisateur = ?').get(u) as { json: string } | undefined;
    return r ? { ...STATS_VIDES, ...JSON.parse(r.json) } : { ...STATS_VIDES };
  }

  private ecrireStats(u: number, s: Stats) {
    this.db.prepare('INSERT INTO stats (utilisateur, json) VALUES (?, ?) ON CONFLICT(utilisateur) DO UPDATE SET json = excluded.json').run(u, JSON.stringify(s));
  }

  succesObtenus(u: number): { id: string; date: number }[] {
    return this.db.prepare('SELECT id, date FROM succes WHERE utilisateur = ? ORDER BY date').all(u) as { id: string; date: number }[];
  }

  private debloquer(u: number, ctx: ContexteSucces): DefinitionSucces[] {
    const deja = new Set(this.succesObtenus(u).map((s) => s.id));
    const nouveaux = nouveauxSucces(ctx, deja);
    const ins = this.db.prepare('INSERT OR IGNORE INTO succes (utilisateur, id, date) VALUES (?, ?, ?)');
    for (const s of nouveaux) ins.run(u, s.id, Date.now());
    return nouveaux;
  }

  /** Une main terminée : statistiques, succès, historique. Renvoie les succès débloqués par joueur. */
  enregistrerMain(faits: FaitsJoueur[], rec: EnregistrementMain, tapisDepartTable: number): Map<number, DefinitionSucces[]> {
    const debloques = new Map<number, DefinitionSucces[]>();
    const humains = faits.filter((f) => idUtilisateur(f.id) !== null);
    if (!humains.length) return debloques;
    this.db.exec('BEGIN');
    try {
      const idMain = Number(this.db.prepare('INSERT INTO mains (date, json) VALUES (?, ?)').run(rec.date, JSON.stringify(rec)).lastInsertRowid);
      const lien = this.db.prepare('INSERT INTO mains_joueurs (main, utilisateur, net) VALUES (?, ?, ?)');
      for (const f of humains) {
        const u = idUtilisateur(f.id)!;
        lien.run(idMain, u, f.net);
        const s = cumulerMain(this.stats(u), f);
        this.ecrireStats(u, s);
        const royale = f.categorieGagnante !== null && f.meilleure?.texte === 'Quinte flush royale';
        const n = this.debloquer(u, { stats: s, main: { ...f, tapisDepartTable, royale } });
        if (n.length) debloques.set(u, n);
        // Ne garder que les dernières mains de chaque joueur
        this.db.prepare(`DELETE FROM mains_joueurs WHERE utilisateur = ? AND main NOT IN
          (SELECT main FROM mains_joueurs WHERE utilisateur = ? ORDER BY main DESC LIMIT ${MAINS_PAR_JOUEUR})`).run(u, u);
      }
      this.db.prepare('DELETE FROM mains WHERE id NOT IN (SELECT main FROM mains_joueurs)').run();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return debloques;
  }

  /** Fin de partie : parties jouées / gagnées, bilan en tapis de départ, succès de partie. */
  enregistrerPartie(classement: { id: string; bilan: number; comeback: boolean }[], tapisDepart: number): Map<number, DefinitionSucces[]> {
    const debloques = new Map<number, DefinitionSucces[]>();
    const premier = classement[0];
    for (const c of classement) {
      const u = idUtilisateur(c.id);
      if (u === null) continue;
      const s = this.stats(u);
      const gagnee = c === premier && c.bilan > 0;
      const bilan = c.bilan / Math.max(1, tapisDepart);
      s.parties++;
      if (gagnee) s.partiesGagnees++;
      s.bilanTapis = Math.round((s.bilanTapis + bilan) * 100) / 100;
      s.meilleurePartie = Math.max(s.meilleurePartie, Math.round(bilan * 100) / 100);
      this.ecrireStats(u, s);
      const n = this.debloquer(u, { stats: s, partie: { gagnee, comeback: c.comeback } });
      if (n.length) debloques.set(u, n);
    }
    return debloques;
  }

  /** Message ou émote envoyé (succès « Bavard »). */
  activite(u: number, type: 'message' | 'emote'): DefinitionSucces[] {
    const s = this.stats(u);
    if (type === 'message') s.messages++; else s.emotes++;
    this.ecrireStats(u, s);
    return this.debloquer(u, { stats: s });
  }

  /* --------------------------- Cosmétiques --------------------------- */

  /** Cadres et dos de cartes débloqués par les succès. */
  recompenses(u: number): { cadres: string[]; dos: string[] } {
    const obtenus = new Set(this.succesObtenus(u).map((s) => s.id));
    const cadres = ['aucun'], dos = ['prune'];
    for (const s of SUCCES) {
      if (!obtenus.has(s.id) || !s.recompense) continue;
      (s.recompense.type === 'cadre' ? cadres : dos).push(s.recompense.id);
    }
    return { cadres, dos };
  }

  choisirCosmetiques(u: number, m: { cadre?: string; dos?: string }) {
    const r = this.recompenses(u);
    if (m.cadre !== undefined) {
      if (!CADRES.some((c) => c.id === m.cadre) || !r.cadres.includes(m.cadre)) throw new Error('Cadre non débloqué');
      this.db.prepare('UPDATE utilisateurs SET cadre = ? WHERE id = ?').run(m.cadre, u);
    }
    if (m.dos !== undefined) {
      if (!DOS.some((c) => c.id === m.dos) || !r.dos.includes(m.dos)) throw new Error('Dos de carte non débloqué');
      this.db.prepare('UPDATE utilisateurs SET dos = ? WHERE id = ?').run(m.dos, u);
    }
  }

  /* --------------------------- Joueurs et historique --------------------------- */

  joueurs() {
    const lignes = this.db.prepare(`SELECT u.id, u.pseudo, u.avatar, u.cadre, s.json,
      (SELECT COUNT(*) FROM succes x WHERE x.utilisateur = u.id) AS nb_succes
      FROM utilisateurs u LEFT JOIN stats s ON s.utilisateur = u.id ORDER BY u.pseudo COLLATE NOCASE`).all() as any[];
    return lignes.map((l) => {
      const s: Stats = { ...STATS_VIDES, ...(l.json ? JSON.parse(l.json) : {}) };
      return { pseudo: l.pseudo, avatar: l.avatar, cadre: l.cadre, mains: s.mains, parties: s.parties, partiesGagnees: s.partiesGagnees, bilanTapis: s.bilanTapis, succes: Number(l.nb_succes) };
    });
  }

  mesMains(u: number) {
    const lignes = this.db.prepare(`SELECT m.id, m.json, mj.net FROM mains_joueurs mj JOIN mains m ON m.id = mj.main
      WHERE mj.utilisateur = ? ORDER BY m.id DESC LIMIT ${MAINS_PAR_JOUEUR}`).all(u) as any[];
    return lignes.map((l) => ({ id: Number(l.id), net: Number(l.net), main: filtrerEnregistrement(JSON.parse(l.json), `u${u}`) }));
  }

  /* --------------------------- Tables --------------------------- */

  sauverSalle(s: SauvegardeSalle | SauvegardeBJ) {
    this.db.prepare('INSERT INTO salles (id, json, maj) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, maj = excluded.maj')
      .run(s.id, JSON.stringify(s), Date.now());
  }

  supprimerSalle(id: string) {
    this.db.prepare('DELETE FROM salles WHERE id = ?').run(id);
  }

  salles(): SauvegardeSalle[] {
    // Les tables abandonnées depuis plus de 12 heures ne sont pas restaurées
    this.db.prepare('DELETE FROM salles WHERE maj < ?').run(Date.now() - 12 * 3_600_000);
    return (this.db.prepare('SELECT json FROM salles').all() as { json: string }[]).flatMap((r) => {
      try { return [JSON.parse(r.json) as SauvegardeSalle]; } catch { return []; }
    });
  }
}
