/**
 * Connexion au serveur : API REST (comptes) et WebSocket (hall et tables), avec reconnexion automatique.
 */
import type { MessageServeur, MessageClient } from '../../serveur/hall';
import type { Utilisateur } from '../../serveur/comptes';

const CLE_JETON = 'aic-jeton';

export function jetonEnregistre(): string | null {
  try { return localStorage.getItem(CLE_JETON); } catch { return null; }
}
export function enregistrerJeton(j: string | null) {
  try { if (j) localStorage.setItem(CLE_JETON, j); else localStorage.removeItem(CLE_JETON); } catch { /* navigation privée */ }
}

export class ErreurApi extends Error { constructor(message: string, public statut: number) { super(message); } }

export async function api<T = any>(chemin: string, corps?: unknown, methode?: string): Promise<T> {
  const jeton = jetonEnregistre();
  let r: Response;
  try {
    r = await fetch(chemin, {
      method: methode ?? (corps === undefined ? 'GET' : 'POST'),
      headers: { ...(corps !== undefined ? { 'content-type': 'application/json' } : {}), ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch {
    throw new ErreurApi('Serveur injoignable : vérifie ta connexion', 0);
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurApi(d.erreur ?? `Erreur ${r.status}`, r.status);
  return d as T;
}

type Ecouteur = (m: MessageServeur) => void;

/** Connexion WebSocket persistante. */
export class Reseau {
  private ws: WebSocket | null = null;
  private ecouteurs = new Set<Ecouteur>();
  private tentative = 0;
  private arrete = false;
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  utilisateur: Utilisateur | null = null;
  connecte = false;
  onEtatConnexion: ((connecte: boolean) => void) | null = null;

  constructor(private jeton: string) {
    this.ouvrir();
    document.addEventListener('visibilitychange', this.auRetour);
    window.addEventListener('online', this.auRetour);
  }

  private auRetour = () => {
    this.envoyer({ type: 'visible', visible: document.visibilityState === 'visible' });
    if (document.visibilityState === 'visible' && !this.connecte && !this.arrete) {
      this.tentative = 0;
      if (this.minuterie) clearTimeout(this.minuterie);
      this.ouvrir();
    }
  };

  private ouvrir() {
    if (this.arrete) return;
    try { this.ws?.close(); } catch { /* déjà fermé */ }
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', jeton: this.jeton }));
      ws.send(JSON.stringify({ type: 'visible', visible: document.visibilityState === 'visible' }));
      if (this.ping) clearInterval(this.ping);
      this.ping = setInterval(() => this.envoyer({ type: 'ping' }), 25_000);
    };
    ws.onmessage = (e) => {
      let m: MessageServeur;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'bienvenue') {
        this.utilisateur = m.utilisateur;
        this.tentative = 0;
        this.connecte = true;
        this.onEtatConnexion?.(true);
      }
      if (m.type === 'remplace') this.arrete = true;
      for (const f of this.ecouteurs) f(m);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.connecte = false;
      if (this.ping) clearInterval(this.ping);
      this.onEtatConnexion?.(false);
      if (e.code === 4001) { this.arrete = true; for (const f of this.ecouteurs) f({ type: 'erreur', texte: 'Session expirée' }); return; }
      if (this.arrete) return;
      const delai = Math.min(8000, 500 * 2 ** this.tentative++);
      this.minuterie = setTimeout(() => this.ouvrir(), delai);
    };
  }

  envoyer(m: MessageClient) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  ecouter(f: Ecouteur): () => void {
    this.ecouteurs.add(f);
    return () => this.ecouteurs.delete(f);
  }

  fermer() {
    this.arrete = true;
    document.removeEventListener('visibilitychange', this.auRetour);
    window.removeEventListener('online', this.auRetour);
    if (this.minuterie) clearTimeout(this.minuterie);
    if (this.ping) clearInterval(this.ping);
    this.ws?.close();
  }
}
