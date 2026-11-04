/**
 * Test de bout en bout : comptes, WebSocket, table privée par code, partie entre deux joueurs et un bot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { ouvrirBase } from '../base.js';
import { creerServeur } from '../app.js';
import type { MessageServeur } from '../hall.js';

let url = '';
let fermer: () => Promise<void>;

beforeAll(async () => {
  const { app } = await creerServeur({ db: ouvrirBase(':memory:'), courriel: { actif: false, envoyer: async () => {} } });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const a = app.server.address() as { port: number };
  url = `http://127.0.0.1:${a.port}`;
  fermer = () => app.close();
});
afterAll(() => fermer());

async function api(chemin: string, corps?: unknown, jeton?: string, methode = 'POST') {
  const r = await fetch(url + chemin, {
    method: corps === undefined && methode === 'POST' ? 'GET' : methode,
    headers: { 'content-type': 'application/json', ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  return { statut: r.status, corps: (await r.json()) as any };
}

class Joueur {
  ws!: WebSocket;
  recus: MessageServeur[] = [];
  constructor(public jeton: string) {}
  async connecter() {
    this.ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    await new Promise((ok) => this.ws.once('open', ok));
    this.ws.on('message', (d) => this.recus.push(JSON.parse(String(d))));
    this.envoyer({ type: 'auth', jeton: this.jeton });
    await this.attendre((m) => m.type === 'bienvenue');
  }
  envoyer(m: unknown) { this.ws.send(JSON.stringify(m)); }
  async attendre(f: (m: MessageServeur) => boolean, ms = 5000): Promise<MessageServeur> {
    const debut = Date.now();
    for (;;) {
      const m = this.recus.find(f);
      if (m) return m;
      if (Date.now() - debut > ms) throw new Error('Délai dépassé');
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  dernierEtat() {
    for (let i = this.recus.length - 1; i >= 0; i--) {
      const m = this.recus[i];
      if (m.type === 'salle' && m.msg.type === 'maj') return m.msg.etat;
    }
    return null;
  }
  /** Joue « parole ou suivre » dès que c'est son tour. */
  pilotage() {
    let vu = 0;
    const t = setInterval(() => {
      for (; vu < this.recus.length; vu++) {
        const m = this.recus[vu];
        if (m.type === 'salle' && m.msg.type === 'maj' && m.msg.etat.legales)
          this.envoyer({ type: 'cmd', cmd: { c: 'action', action: { type: m.msg.etat.legales.peutParler ? 'parole' : 'suivre' } } });
      }
    }, 30);
    return () => clearInterval(t);
  }
}

describe('Serveur', () => {
  it('inscription, connexion, erreurs', async () => {
    const r = await api('/api/inscription', { pseudo: 'Thomas', mdp: 'motdepasse1', email: 'thomas@example.com' });
    expect(r.statut).toBe(200);
    expect(r.corps.utilisateur.pseudo).toBe('Thomas');
    expect((await api('/api/inscription', { pseudo: 'thomas', mdp: 'autrechose1' })).statut).toBe(409);
    expect((await api('/api/inscription', { pseudo: 'Zo', mdp: 'motdepasse1' })).statut).toBe(400);
    expect((await api('/api/inscription', { pseudo: 'Zoé', mdp: 'court' })).statut).toBe(400);
    expect((await api('/api/connexion', { pseudo: 'Thomas', mdp: 'mauvais!!' })).statut).toBe(401);
    const c = await api('/api/connexion', { pseudo: 'thomas', mdp: 'motdepasse1' });
    expect(c.statut).toBe(200);
    const moi = await api('/api/moi', undefined, c.corps.jeton, 'GET');
    expect(moi.corps.utilisateur.email).toBe('thomas@example.com');
    const maj = await api('/api/moi', { avatar: 'pieuvre' }, c.corps.jeton, 'PATCH');
    expect(maj.corps.utilisateur.avatar).toBe('pieuvre');
    expect((await api('/api/moi', undefined, 'faux', 'GET')).statut).toBe(401);
  });

  it('table privée rejointe par code, partie à deux joueurs et un bot', async () => {
    const a = await api('/api/inscription', { pseudo: 'Hôte', mdp: 'motdepasse1', avatar: 'ours' });
    const b = await api('/api/inscription', { pseudo: 'Invité', mdp: 'motdepasse1', avatar: 'chat' });
    const hote = new Joueur(a.corps.jeton), invite = new Joueur(b.corps.jeton);
    await hote.connecter(); await invite.connecter();
    invite.envoyer({ type: 'hall' });

    hote.envoyer({ type: 'creer', reglages: { visibilite: 'privee', tempsReflexion: 10, bots: 1, niveauBots: 'facile' } });
    const entre = (await hote.attendre((m) => m.type === 'entre')) as Extract<MessageServeur, { type: 'entre' }>;
    expect(entre.code).toMatch(/^[A-Z]{5}$/);

    // La table privée n'apparaît pas dans le hall de l'invité
    await new Promise((r) => setTimeout(r, 600));
    const hall = [...invite.recus].reverse().find((m) => m.type === 'hall') as Extract<MessageServeur, { type: 'hall' }>;
    expect(hall.tables.find((t) => t.id === entre.id)).toBeUndefined();

    // Sans code : refusé ; avec le code : accepté
    invite.envoyer({ type: 'rejoindre', id: entre.id });
    await invite.attendre((m) => m.type === 'erreur');
    invite.envoyer({ type: 'rejoindre', code: entre.code.toLowerCase() });
    await invite.attendre((m) => m.type === 'entre');

    hote.envoyer({ type: 'cmd', cmd: { c: 'lancer' } });
    const stop1 = hote.pilotage(), stop2 = invite.pilotage();
    await hote.attendre((m) => m.type === 'salle' && m.msg.type === 'maj' && m.msg.etat.numeroMain >= 3, 60_000);
    stop1(); stop2();

    const etat = hote.dernierEtat()!;
    expect(etat.sieges.filter(Boolean)).toHaveLength(3);
    expect(etat.hote).toMatch(/^u\d+$/);
    // L'invité n'a jamais vu les cartes de l'hôte pendant une main
    for (const m of invite.recus) {
      if (m.type !== 'salle' || m.msg.type !== 'maj') continue;
      const e = m.msg.etat;
      for (const s of e.sieges) if (s && s.id !== e.moi && s.cartes) expect(e.mainEnCours).toBe(false);
    }

    // Reconnexion : l'invité retrouve sa table
    invite.ws.close();
    const retour = new Joueur(b.corps.jeton);
    await retour.connecter();
    const bienvenue = retour.recus.find((m) => m.type === 'bienvenue') as Extract<MessageServeur, { type: 'bienvenue' }>;
    expect(bienvenue.salle).toBe(entre.id);
    await retour.attendre((m) => m.type === 'salle');
    expect(retour.dernierEtat()!.monSiege).not.toBeNull();

    hote.ws.close(); retour.ws.close();
  }, 90_000);

  it('limite les tentatives de connexion', async () => {
    let refus = 0;
    for (let i = 0; i < 14; i++) if ((await api('/api/connexion', { pseudo: 'x', mdp: 'y' })).statut === 429) refus++;
    expect(refus).toBeGreaterThan(0);
  });
});
