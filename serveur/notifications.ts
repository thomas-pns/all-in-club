/**
 * Notifications « c'est ton tour » (Web Push). Les clés VAPID sont créées au premier démarrage
 * et gardées dans la base : rien à configurer.
 */
import webpush from 'web-push';
import { Base } from './base.js';

export class Notifications {
  readonly clePublique: string;
  private dernierEnvoi = new Map<number, number>();

  constructor(private db: Base, sujet: string) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS config (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS abonnements_push (
        endpoint TEXT PRIMARY KEY,
        utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        json TEXT NOT NULL
      );
    `);
    const lire = (c: string) => (db.prepare('SELECT valeur FROM config WHERE cle = ?').get(c) as { valeur: string } | undefined)?.valeur;
    let pub = lire('vapid_publique'), priv = lire('vapid_privee');
    if (!pub || !priv) {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      db.prepare('INSERT OR REPLACE INTO config (cle, valeur) VALUES (?, ?), (?, ?)').run('vapid_publique', pub, 'vapid_privee', priv);
    }
    this.clePublique = pub;
    webpush.setVapidDetails(sujet.startsWith('https://') || sujet.startsWith('mailto:') ? sujet : 'mailto:admin@all-in-club.invalid', pub, priv);
  }

  abonner(u: number, abonnement: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }) {
    if (!abonnement?.endpoint || !/^https:\/\//.test(abonnement.endpoint) || !abonnement.keys?.p256dh || !abonnement.keys?.auth) throw new Error('Abonnement invalide');
    this.db.prepare('INSERT INTO abonnements_push (endpoint, utilisateur, json) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET utilisateur = excluded.utilisateur, json = excluded.json')
      .run(abonnement.endpoint, u, JSON.stringify({ endpoint: abonnement.endpoint, keys: abonnement.keys }));
  }

  desabonner(u: number, endpoint: string) {
    this.db.prepare('DELETE FROM abonnements_push WHERE utilisateur = ? AND endpoint = ?').run(u, String(endpoint ?? ''));
  }

  /** Prévient un joueur que c'est à lui de jouer (au plus une fois toutes les 20 secondes). */
  async tour(u: number, table: string) {
    const t = Date.now();
    if (t - (this.dernierEnvoi.get(u) ?? 0) < 20_000) return;
    this.dernierEnvoi.set(u, t);
    const abonnements = this.db.prepare('SELECT endpoint, json FROM abonnements_push WHERE utilisateur = ?').all(u) as { endpoint: string; json: string }[];
    const charge = JSON.stringify({ titre: "C'est à toi de jouer !", corps: `Table « ${table} » : les autres t'attendent 🃏`, tag: 'tour' });
    await Promise.all(abonnements.map(async (a) => {
      try {
        await webpush.sendNotification(JSON.parse(a.json), charge, { TTL: 60, urgency: 'high' });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) this.db.prepare('DELETE FROM abonnements_push WHERE endpoint = ?').run(a.endpoint);
      }
    }));
  }
}
