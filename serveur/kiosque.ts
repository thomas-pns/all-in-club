/**
 * Le Kiosque côté serveur : achat des tickets à gratter, grilles de Keno et de Loto Flash,
 * tirages programmés (toutes les 4 et 10 minutes) et paiement des gagnants en Clubs ♣.
 */
import { randomInt } from 'node:crypto';
import { Base } from './base.js';
import type { Activites } from './activites.js';
import { Portefeuilles, ErreurPortefeuille } from './portefeuille.js';
import {
  TICKETS, TypeTicket, fabriquerTicket, Hasard, KENO, gainKeno, tirerKeno, validerGrilleKeno,
  LOTO, LOTO_GAINS, tirerLoto, rangLoto, validerGrilleLoto, prochainTirage,
} from '../moteur/kiosque.js';

export function migrerKiosque(db: Base) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY, utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      date INTEGER NOT NULL, type TEXT NOT NULL, prix INTEGER NOT NULL, gain INTEGER NOT NULL, json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS keno_grilles (
      id INTEGER PRIMARY KEY, utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      tirage INTEGER NOT NULL, numeros TEXT NOT NULL, mise INTEGER NOT NULL, gain INTEGER
    );
    CREATE INDEX IF NOT EXISTS keno_grilles_tirage ON keno_grilles(tirage);
    CREATE TABLE IF NOT EXISTS keno_tirages (id INTEGER PRIMARY KEY, numeros TEXT NOT NULL, date INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS loto_grilles (
      id INTEGER PRIMARY KEY, utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      tirage INTEGER NOT NULL, numeros TEXT NOT NULL, etoile INTEGER NOT NULL, gain INTEGER, rang TEXT
    );
    CREATE INDEX IF NOT EXISTS loto_grilles_tirage ON loto_grilles(tirage);
    CREATE TABLE IF NOT EXISTS loto_tirages (id INTEGER PRIMARY KEY, numeros TEXT NOT NULL, etoile INTEGER NOT NULL, cagnotte INTEGER NOT NULL, gagnants INTEGER NOT NULL, date INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reglages_kiosque (cle TEXT PRIMARY KEY, valeur INTEGER NOT NULL);
  `);
}

const hasardSur: Hasard = (n) => randomInt(n);

export class Kiosque {
  private minuterie: ReturnType<typeof setInterval> | null = null;

  /** Missions et annonces des gros gains (branché par l'application). */
  activites: Activites | null = null;

  constructor(private db: Base, private porte: Portefeuilles, private horloge: () => number = Date.now, private hasard: Hasard = hasardSur) {
    migrerKiosque(db);
  }

  /** Lance la vérification des tirages chaque seconde. */
  demarrer() { this.tirer(); this.minuterie = setInterval(() => this.tirer(), 1000); this.minuterie.unref?.(); }
  arreter() { if (this.minuterie) clearInterval(this.minuterie); }

  /* ----------------------------- Tickets à gratter ----------------------------- */

  acheterTicket(u: number, type: TypeTicket, offert = false) {
    const d = TICKETS[type];
    if (!d) throw new ErreurPortefeuille('Ticket inconnu');
    if (offert) {
      if (type !== 'banco') throw new ErreurPortefeuille('Les tickets offerts sont des Banco');
      this.porte.utiliserTicketOffert(u);
    } else this.porte.crediter(u, -d.prix, `Ticket ${d.nom}`);
    const t = fabriquerTicket(type, this.hasard);
    const id = Number(this.db.prepare('INSERT INTO tickets (utilisateur, date, type, prix, gain, json) VALUES (?, ?, ?, ?, ?, ?)').run(u, this.horloge(), type, offert ? 0 : d.prix, t.gain, JSON.stringify(t.contenu)).lastInsertRowid);
    if (t.gain) this.porte.crediter(u, t.gain, `Gain ${d.nom}`);
    this.activites?.signaler(u, 'ticket');
    if (t.gain) this.activites?.signaler(u, 'ticketGagnant');
    // Annoncé un peu plus tard : le temps de gratter, pour ne pas gâcher la surprise
    if (t.gain >= d.prix * 10) this.plusTard(() => this.activites?.annoncer(u, `a gagné ${fmtClubs(t.gain)} au ${d.nom.replace(/^Le /, '')}`, t.gain), 20_000);
    return { id, type, gain: t.gain, contenu: t.contenu, etat: this.porte.etat(u) };
  }

  /* ----------------------------- Keno ----------------------------- */

  etatKeno(u: number) {
    const t = this.horloge();
    const prochain = prochainTirage(t, KENO.periode);
    const dernier = this.db.prepare('SELECT id, numeros, date FROM keno_tirages ORDER BY id DESC LIMIT 1').get() as { id: number; numeros: string; date: number } | undefined;
    const grilles = (this.db.prepare('SELECT id, tirage, numeros, mise, gain FROM keno_grilles WHERE utilisateur = ? AND tirage >= ? ORDER BY id DESC LIMIT 30').all(u, prochain - 3) as { id: number; tirage: number; numeros: string; mise: number; gain: number | null }[])
      .map((g) => ({ ...g, numeros: JSON.parse(g.numeros) as number[] }));
    return {
      prochain: { id: prochain, heure: prochain * KENO.periode, fermeture: prochain * KENO.periode - KENO.fermeture },
      dernier: dernier ? { id: dernier.id, numeros: JSON.parse(dernier.numeros) as number[], heure: dernier.id * KENO.periode } : null,
      grilles, maintenant: t,
    };
  }

  tirageKeno(id: number) {
    const r = this.db.prepare('SELECT id, numeros FROM keno_tirages WHERE id = ?').get(id) as { id: number; numeros: string } | undefined;
    return r ? { id: r.id, numeros: JSON.parse(r.numeros) as number[] } : null;
  }

  jouerKeno(u: number, numeros: unknown, mise: unknown, tirages = 1) {
    const g = validerGrilleKeno(numeros, mise);
    if (!g) throw new ErreurPortefeuille('Grille invalide');
    const n = Math.max(1, Math.min(10, Math.floor(Number(tirages)) || 1));
    const t = this.horloge();
    let id = prochainTirage(t, KENO.periode);
    if (id * KENO.periode - t < KENO.fermeture) id++; // trop tard pour celui-là : le suivant
    this.porte.crediter(u, -g.mise * n, n > 1 ? `Keno (${n} tirages)` : 'Keno');
    for (let i = 0; i < n; i++) this.db.prepare('INSERT INTO keno_grilles (utilisateur, tirage, numeros, mise) VALUES (?, ?, ?, ?)').run(u, id + i, JSON.stringify(g.numeros), g.mise);
    this.activites?.signaler(u, 'keno');
    return { tirage: id, etat: this.porte.etat(u) };
  }

  private plusTard(f: () => void, ms: number) { const m = setTimeout(f, ms); m.unref?.(); }

  /* ----------------------------- Loto Flash ----------------------------- */

  private cagnotte(): number {
    const r = this.db.prepare("SELECT valeur FROM reglages_kiosque WHERE cle = 'cagnotte'").get() as { valeur: number } | undefined;
    return r?.valeur ?? LOTO.cagnotteDepart;
  }
  private fixerCagnotte(v: number) { this.db.prepare("INSERT INTO reglages_kiosque (cle, valeur) VALUES ('cagnotte', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(v); }

  etatLoto(u: number) {
    const t = this.horloge();
    const prochain = prochainTirage(t, LOTO.periode);
    const dernier = this.db.prepare('SELECT id, numeros, etoile, cagnotte, gagnants FROM loto_tirages ORDER BY id DESC LIMIT 1').get() as { id: number; numeros: string; etoile: number; cagnotte: number; gagnants: number } | undefined;
    const grilles = (this.db.prepare('SELECT id, tirage, numeros, etoile, gain, rang FROM loto_grilles WHERE utilisateur = ? AND tirage >= ? ORDER BY id DESC LIMIT 30').all(u, prochain - 3) as { id: number; tirage: number; numeros: string; etoile: number; gain: number | null; rang: string | null }[])
      .map((g) => ({ ...g, numeros: JSON.parse(g.numeros) as number[] }));
    return {
      prochain: { id: prochain, heure: prochain * LOTO.periode, fermeture: prochain * LOTO.periode - LOTO.fermeture },
      dernier: dernier ? { id: dernier.id, numeros: JSON.parse(dernier.numeros) as number[], etoile: dernier.etoile, cagnotte: dernier.cagnotte, gagnants: dernier.gagnants, heure: dernier.id * LOTO.periode } : null,
      cagnotte: this.cagnotte(), grilles, maintenant: t,
    };
  }

  tirageLoto(id: number) {
    const r = this.db.prepare('SELECT id, numeros, etoile, cagnotte, gagnants FROM loto_tirages WHERE id = ?').get(id) as { id: number; numeros: string; etoile: number; cagnotte: number; gagnants: number } | undefined;
    return r ? { ...r, numeros: JSON.parse(r.numeros) as number[] } : null;
  }

  jouerLoto(u: number, numeros: unknown, etoile: unknown) {
    const g = validerGrilleLoto(numeros, etoile);
    if (!g) throw new ErreurPortefeuille('Grille invalide : 5 numéros et 1 étoile');
    const t = this.horloge();
    let id = prochainTirage(t, LOTO.periode);
    if (id * LOTO.periode - t < LOTO.fermeture) id++;
    this.porte.crediter(u, -LOTO.prix, 'Loto Flash');
    this.db.prepare('INSERT INTO loto_grilles (utilisateur, tirage, numeros, etoile) VALUES (?, ?, ?, ?)').run(u, id, JSON.stringify(g.numeros), g.etoile);
    this.fixerCagnotte(this.cagnotte() + LOTO.partCagnotte);
    this.activites?.signaler(u, 'loto');
    return { tirage: id, etat: this.porte.etat(u), cagnotte: this.cagnotte() };
  }

  /* ----------------------------- Tirages ----------------------------- */

  /** Fait les tirages arrivés à échéance (et ceux manqués pendant un arrêt du serveur) et paie les gagnants. */
  tirer() {
    const t = this.horloge();
    // Keno
    const dueK = Math.floor(t / KENO.periode);
    const idsK = new Set((this.db.prepare('SELECT DISTINCT tirage FROM keno_grilles WHERE gain IS NULL AND tirage <= ?').all(dueK) as { tirage: number }[]).map((r) => r.tirage));
    if (dueK > 0 && !this.tirageKeno(dueK)) idsK.add(dueK);
    for (const id of [...idsK].sort((a, b) => a - b)) {
      let tirage = this.tirageKeno(id)?.numeros;
      if (!tirage) {
        tirage = tirerKeno(this.hasard);
        this.db.prepare('INSERT INTO keno_tirages (id, numeros, date) VALUES (?, ?, ?)').run(id, JSON.stringify(tirage), t);
      }
      for (const g of this.db.prepare('SELECT id, utilisateur, numeros, mise FROM keno_grilles WHERE tirage = ? AND gain IS NULL').all(id) as { id: number; utilisateur: number; numeros: string; mise: number }[]) {
        const gain = gainKeno(JSON.parse(g.numeros), tirage, g.mise);
        this.db.prepare('UPDATE keno_grilles SET gain = ? WHERE id = ?').run(gain, g.id);
        if (gain) this.porte.crediter(g.utilisateur, gain, `Gain Keno n° ${id}`);
        if (gain >= 2_000 && gain >= g.mise * 20) this.plusTard(() => this.activites?.annoncer(g.utilisateur, `a gagné ${fmtClubs(gain)} au Keno`, gain), 25_000);
      }
    }
    // Loto Flash
    const dueL = Math.floor(t / LOTO.periode);
    const idsL = new Set((this.db.prepare('SELECT DISTINCT tirage FROM loto_grilles WHERE gain IS NULL AND tirage <= ?').all(dueL) as { tirage: number }[]).map((r) => r.tirage));
    if (dueL > 0 && !this.tirageLoto(dueL)) idsL.add(dueL);
    for (const id of [...idsL].sort((a, b) => a - b)) {
      if (this.tirageLoto(id)) continue;
      const tirage = tirerLoto(this.hasard);
      const grilles = this.db.prepare('SELECT id, utilisateur, numeros, etoile FROM loto_grilles WHERE tirage = ? AND gain IS NULL').all(id) as { id: number; utilisateur: number; numeros: string; etoile: number }[];
      const rangs = grilles.map((g) => ({ g, r: rangLoto(JSON.parse(g.numeros), g.etoile, tirage) }));
      const cagnotte = this.cagnotte();
      const jackpot = rangs.filter((x) => x.r?.gain === 'cagnotte').length;
      for (const { g, r } of rangs) {
        const gain = !r ? 0 : r.gain === 'cagnotte' ? Math.floor(cagnotte / jackpot) : r.gain;
        this.db.prepare('UPDATE loto_grilles SET gain = ?, rang = ? WHERE id = ?').run(gain, r?.nom ?? null, g.id);
        if (gain) this.porte.crediter(g.utilisateur, gain, r?.gain === 'cagnotte' ? `Cagnotte du Loto Flash !` : `Gain Loto Flash n° ${id}`);
        if (gain >= 10_000) this.plusTard(() => this.activites?.annoncer(g.utilisateur, r?.gain === 'cagnotte' ? `a décroché la cagnotte du Loto Flash : ${fmtClubs(gain)} !` : `a gagné ${fmtClubs(gain)} au Loto Flash`, gain), 25_000);
      }
      if (jackpot) this.fixerCagnotte(LOTO.cagnotteDepart);
      this.db.prepare('INSERT INTO loto_tirages (id, numeros, etoile, cagnotte, gagnants, date) VALUES (?, ?, ?, ?, ?, ?)').run(id, JSON.stringify(tirage.numeros), tirage.etoile, cagnotte, rangs.filter((x) => x.r).length, t);
    }
    // Ménage : on garde une semaine de tirages
    const semaine = 7 * 86_400_000;
    this.db.prepare('DELETE FROM keno_tirages WHERE id < ?').run(Math.floor((t - semaine) / KENO.periode));
    this.db.prepare('DELETE FROM loto_tirages WHERE id < ?').run(Math.floor((t - semaine) / LOTO.periode));
  }
}

export { LOTO_GAINS };

/** « 12 500 ♣ » */
export const fmtClubs = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ♣`;
