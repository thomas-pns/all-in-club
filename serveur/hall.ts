/**
 * Hall : toutes les tables en ligne, les connexions WebSocket des joueurs et la liste des tables.
 */
import type { WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { Salle, CommandeClient, ReglagesSalle, REGLAGES_DEFAUT, MessageSalle, genererCode, Membre, Resultats } from '../moteur/salle.js';
import { EtatMain } from '../moteur/main.js';
import { Table } from '../moteur/table.js';
import { Utilisateur } from './comptes.js';

/* ------------------------- Protocole WebSocket ------------------------- */

export type MessageClient =
  | { type: 'auth'; jeton: string }
  | { type: 'hall' }                                  // s'abonner à la liste des tables
  | { type: 'creer'; reglages: Partial<ReglagesSalle> }
  | { type: 'rejoindre'; id?: string; code?: string }
  | { type: 'regarder'; id: string }
  | { type: 'quitter' }
  | { type: 'cmd'; cmd: CommandeClient }
  | { type: 'ping' };

export type ResumeTable = ReturnType<Salle['resume']>;

export type MessageServeur =
  | { type: 'bienvenue'; utilisateur: Utilisateur; salle: string | null }
  | { type: 'hall'; tables: ResumeTable[]; enLigne: number }
  | { type: 'entre'; id: string; code: string }
  | { type: 'sorti'; raison?: string }
  | { type: 'salle'; msg: MessageSalle }
  | { type: 'remplace' }
  | { type: 'erreur'; texte: string }
  | { type: 'pong' };

interface Client { ws: WebSocket; utilisateur: Utilisateur | null; abonneHall: boolean; compteur: number; fenetre: number }

const memId = (u: Utilisateur) => `u${u.id}`;
const membre = (u: Utilisateur): Membre => ({ id: memId(u), nom: u.pseudo, avatar: u.avatar });

export interface Ecouteurs {
  mainTerminee?(main: EtatMain, table: Table, salle: Salle): void;
  partieTerminee?(r: Resultats, salle: Salle): void;
}

export class Hall {
  private salles = new Map<string, Salle>();
  private parCode = new Map<string, Salle>();
  private ouEst = new Map<string, string>();          // membre → salle
  private clients = new Set<Client>();
  private parMembre = new Map<string, Client>();      // une connexion active par joueur
  private hallEnAttente: ReturnType<typeof setTimeout> | null = null;

  constructor(private ecouteurs: Ecouteurs = {}) {}

  get nbSalles() { return this.salles.size; }
  get nbConnectes() { return this.parMembre.size; }

  /* --------------------------- Connexions --------------------------- */

  brancher(ws: WebSocket, authentifier: (jeton: string) => Utilisateur | null) {
    const c: Client = { ws, utilisateur: null, abonneHall: false, compteur: 0, fenetre: Date.now() };
    this.clients.add(c);
    ws.on('message', (data) => {
      // Limite : 40 messages par seconde et par connexion
      const t = Date.now();
      if (t - c.fenetre > 1000) { c.fenetre = t; c.compteur = 0; }
      if (++c.compteur > 40) return;
      let msg: MessageClient;
      try { msg = JSON.parse(String(data)); } catch { return; }
      try { this.recevoir(c, msg, authentifier); }
      catch (e) { console.error('Erreur WebSocket', e); this.envoyer(c, { type: 'erreur', texte: 'Erreur interne' }); }
    });
    ws.on('close', () => this.debrancher(c));
    ws.on('error', () => this.debrancher(c));
  }

  private debrancher(c: Client) {
    if (!this.clients.delete(c)) return;
    if (c.utilisateur) {
      const id = memId(c.utilisateur);
      if (this.parMembre.get(id) === c) {
        this.parMembre.delete(id);
        const s = this.salleDe(id);
        s?.connexion(id, false);
      }
    }
    this.signalerHall();
  }

  private envoyer(c: Client, m: MessageServeur) {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m));
  }

  private envoyerMembre(id: string, m: MessageServeur) {
    const c = this.parMembre.get(id);
    if (c) this.envoyer(c, m);
  }

  private recevoir(c: Client, msg: MessageClient, authentifier: (j: string) => Utilisateur | null) {
    if (msg.type === 'ping') return this.envoyer(c, { type: 'pong' });
    if (msg.type === 'auth') {
      const u = authentifier(String(msg.jeton ?? ''));
      if (!u) { this.envoyer(c, { type: 'erreur', texte: 'Session expirée, reconnecte-toi' }); c.ws.close(4001, 'auth'); return; }
      c.utilisateur = u;
      const id = memId(u);
      const ancien = this.parMembre.get(id);
      if (ancien && ancien !== c) { this.envoyer(ancien, { type: 'remplace' }); ancien.utilisateur = null; ancien.ws.close(4002, 'remplace'); }
      this.parMembre.set(id, c);
      const s = this.salleDe(id);
      this.envoyer(c, { type: 'bienvenue', utilisateur: u, salle: s?.id ?? null });
      if (s) { this.envoyer(c, { type: 'entre', id: s.id, code: s.code }); s.connexion(id, true); }
      this.signalerHall();
      return;
    }
    const u = c.utilisateur;
    if (!u) return this.envoyer(c, { type: 'erreur', texte: 'Non connecté' });
    const id = memId(u);

    switch (msg.type) {
      case 'hall':
        c.abonneHall = true;
        this.envoyer(c, this.messageHall(id));
        return;
      case 'creer': {
        this.quitterSalle(id);
        const r = { ...REGLAGES_DEFAUT, nom: `Table de ${u.pseudo}`, ...(msg.reglages ?? {}) } as ReglagesSalle;
        const salleId = randomBytes(6).toString('base64url');
        let code = genererCode();
        while (this.parCode.has(code)) code = genererCode();
        const s = new Salle({
          id: salleId, code, hote: membre(u), reglages: r,
          sortie: {
            envoyer: (dest, m) => {
              if (m.type === 'exclu') { this.ouEst.delete(dest); this.envoyerMembre(dest, { type: 'sorti', raison: "L'hôte t'a exclu de la table" }); return; }
              this.envoyerMembre(dest, { type: 'salle', msg: m });
            },
            mainTerminee: (m, t, salle) => { this.ecouteurs.mainTerminee?.(m, t, salle); this.signalerHall(); },
            partieTerminee: (res, salle) => { this.ecouteurs.partieTerminee?.(res, salle); this.signalerHall(); },
            vide: (salle) => this.supprimer(salle),
          },
        });
        this.salles.set(salleId, s);
        this.parCode.set(code, s);
        this.ouEst.set(id, salleId);
        this.envoyer(c, { type: 'entre', id: salleId, code });
        s.diffuser();
        this.signalerHall();
        return;
      }
      case 'rejoindre':
      case 'regarder': {
        const s = msg.type === 'rejoindre' && msg.code
          ? this.parCode.get(String(msg.code).toUpperCase().trim())
          : this.salles.get(String(msg.id ?? ''));
        if (!s) return this.envoyer(c, { type: 'erreur', texte: msg.type === 'rejoindre' && msg.code ? 'Aucune table avec ce code' : "Cette table n'existe plus" });
        if (msg.type === 'rejoindre' && !msg.code && s.reglages.visibilite === 'privee' && !s.estMembre(id))
          return this.envoyer(c, { type: 'erreur', texte: 'Table privée : il faut son code' });
        if (this.ouEst.get(id) !== s.id) this.quitterSalle(id);
        this.ouEst.set(id, s.id);
        this.envoyer(c, { type: 'entre', id: s.id, code: s.code });
        if (msg.type === 'regarder') s.regarder(membre(u)); else s.rejoindre(membre(u));
        this.signalerHall();
        return;
      }
      case 'quitter':
        this.quitterSalle(id);
        this.envoyer(c, { type: 'sorti' });
        this.signalerHall();
        return;
      case 'cmd': {
        const s = this.salleDe(id);
        if (!s) return this.envoyer(c, { type: 'erreur', texte: "Tu n'es à aucune table" });
        s.commande(id, msg.cmd);
        if (['lancer', 'terminer', 'rejouer', 'reglages', 'ajouterBot', 'retirerBot', 'asseoir', 'lever'].includes(msg.cmd?.c)) this.signalerHall();
        return;
      }
    }
  }

  /** Le profil a changé (avatar…) : mettre à jour la connexion. */
  majUtilisateur(u: Utilisateur) {
    const c = this.parMembre.get(memId(u));
    if (c) c.utilisateur = u;
  }

  private salleDe(id: string): Salle | undefined {
    const sid = this.ouEst.get(id);
    return sid ? this.salles.get(sid) : undefined;
  }

  private quitterSalle(id: string) {
    const s = this.salleDe(id);
    this.ouEst.delete(id);
    s?.partir(id);
  }

  private supprimer(s: Salle) {
    s.arreter();
    this.salles.delete(s.id);
    this.parCode.delete(s.code);
    for (const [m, sid] of this.ouEst) if (sid === s.id) this.ouEst.delete(m);
    this.signalerHall();
  }

  /* --------------------------- Liste des tables --------------------------- */

  private messageHall(pour: string): MessageServeur {
    const mienne = this.ouEst.get(pour);
    const tables = [...this.salles.values()]
      .filter((s) => s.reglages.visibilite === 'publique' || s.id === mienne)
      .map((s) => s.resume())
      .sort((a, b) => Number(b.statut === 'attente') - Number(a.statut === 'attente') || b.humains - a.humains);
    return { type: 'hall', tables, enLigne: this.parMembre.size };
  }

  /** Envoie la liste à jour aux abonnés (au plus une fois par seconde). */
  private signalerHall() {
    if (this.hallEnAttente) return;
    this.hallEnAttente = setTimeout(() => {
      this.hallEnAttente = null;
      for (const c of this.clients) if (c.abonneHall && c.utilisateur) this.envoyer(c, this.messageHall(memId(c.utilisateur)));
    }, 400);
  }

  arreter() {
    for (const s of this.salles.values()) s.arreter();
    if (this.hallEnAttente) clearTimeout(this.hallEnAttente);
  }
}
