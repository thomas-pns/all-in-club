/**
 * Tables du Casino : la cave quitte le portefeuille, les jetons y reviennent en se levant.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { ouvrirBase } from '../base.js';
import { creerServeur } from '../app.js';
import type { MessageServeur } from '../hall.js';
import { SOLDE_DEPART } from '../../moteur/bonus.js';

let url = '';
let fermer: () => Promise<void>;
beforeAll(async () => {
  const { app } = await creerServeur({ db: ouvrirBase(':memory:'), courriel: { actif: false, envoyer: async () => {} } });
  await app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  fermer = () => app.close();
});
afterAll(() => fermer());

async function api(chemin: string, corps?: unknown, jeton?: string) {
  const r = await fetch(url + chemin, { method: corps === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return (await r.json()) as any;
}
class Joueur {
  ws!: WebSocket; recus: MessageServeur[] = [];
  constructor(public jeton: string) {}
  async connecter() {
    this.ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    await new Promise((ok) => this.ws.once('open', ok));
    this.ws.on('message', (d) => this.recus.push(JSON.parse(String(d))));
    this.envoyer({ type: 'auth', jeton: this.jeton });
    await this.attendre((m) => m.type === 'bienvenue');
  }
  envoyer(m: unknown) { this.ws.send(JSON.stringify(m)); }
  async attendre(f: (m: MessageServeur) => boolean, ms = 5000) {
    const debut = Date.now();
    for (;;) { const m = this.recus.find(f); if (m) return m; if (Date.now() - debut > ms) throw new Error('Délai dépassé'); await new Promise((r) => setTimeout(r, 20)); }
  }
  etat(): any { for (let i = this.recus.length - 1; i >= 0; i--) { const m = this.recus[i]; if (m.type === 'salle' && /^maj/.test(m.msg.type)) return (m.msg as any).etat; } return null; }
  solde = async () => (await api('/api/portefeuille', undefined, this.jeton)).solde as number;
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Casino', () => {
  it('poker au Bistrot : la cave est prélevée, la table démarre à deux, les jetons reviennent', async () => {
    const t = new Joueur((await api('/api/inscription', { pseudo: 'thomas', mdp: 'motdepasse1' })).jeton);
    const l = new Joueur((await api('/api/inscription', { pseudo: 'leo', mdp: 'motdepasse1' })).jeton);
    await t.connecter(); await l.connecter();
    t.envoyer({ type: 'casino', jeu: 'poker', ville: 'bistrot' });
    const e = await t.attendre((m) => m.type === 'entre') as any;
    expect(e.casino).toBe('Le Bistrot');
    expect(await t.solde()).toBe(SOLDE_DEPART - 1000);
    l.envoyer({ type: 'casino', jeu: 'poker', ville: 'bistrot' });
    const e2 = await l.attendre((m) => m.type === 'entre') as any;
    expect(e2.id).toBe(e.id);
    await pause(300);
    expect(t.etat().statut).toBe('en_jeu');
    // Pas de patron : les réglages sont refusés
    t.envoyer({ type: 'cmd', cmd: { c: 'terminer' } });
    await t.attendre((m) => m.type === 'salle' && m.msg.type === 'erreur' && /patron/.test((m.msg as any).texte));
    // La table n'apparaît pas dans la liste des tables entre potes, mais compte dans les villes
    t.envoyer({ type: 'hall' });
    const h = await t.attendre((m) => m.type === 'hall') as any;
    expect(h.tables.find((x: any) => x.id === e.id)).toBeUndefined();
    expect(h.villes['poker:bistrot']).toBe(2);
    // Thomas se lève : son tapis revient dans le portefeuille
    const tapis = t.etat().sieges.find((s: any) => s && s.id.startsWith('u') && s.nom === 'thomas').tapis;
    t.envoyer({ type: 'quitter' });
    await t.attendre((m) => m.type === 'sorti');
    expect(await t.solde()).toBe(SOLDE_DEPART - 1000 + tapis);
    l.envoyer({ type: 'quitter' });
  });

  it('black jack à Las Vegas : refusé sans assez de Clubs, puis cave et retour', async () => {
    const s = new Joueur((await api('/api/inscription', { pseudo: 'sam', mdp: 'motdepasse1' })).jeton);
    await s.connecter();
    s.envoyer({ type: 'casino', jeu: 'blackjack', ville: 'monaco' });
    await s.attendre((m) => m.type === 'erreur' && /Monaco/.test((m as any).texte));
    s.envoyer({ type: 'casino', jeu: 'blackjack', ville: 'vegas' });
    await s.attendre((m) => m.type === 'entre');
    await pause(200);
    expect(s.etat().statut).toBe('en_jeu');
    expect(s.etat().sieges[0].tapis).toBe(10_000);
    expect(await s.solde()).toBe(SOLDE_DEPART - 10_000);
    s.envoyer({ type: 'quitter' });
    await s.attendre((m) => m.type === 'sorti');
    expect(await s.solde()).toBe(SOLDE_DEPART);
  });
});
