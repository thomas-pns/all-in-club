/**
 * Hall : toutes les tables en ligne, les connexions WebSocket des joueurs et la liste des tables.
 */
import type { WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { Salle, CommandeClient, ReglagesSalle, REGLAGES_DEFAUT, genererCode, Membre, Sortie, MessageSalle } from '../moteur/salle.js';
import { analyserMain } from '../moteur/analyse.js';
import { SalleBJ, ReglagesBJ, REGLAGES_BJ_DEFAUT, CommandeBJ, MessageBJ, SortieBJ, SauvegardeBJ } from '../moteur/blackjack/salleBJ.js';
import { SalleRoulette, ReglagesRoulette, REGLAGES_ROULETTE_DEFAUT, CommandeRoulette, MessageRoulette, SortieRoulette, SauvegardeRoulette } from '../moteur/roulette/salleRoulette.js';

/** Une table de n'importe quel jeu du club. */
type SalleJeu = Salle | SalleBJ | SalleRoulette;
export type Jeu = 'poker' | 'blackjack' | 'roulette';
const jeuDe = (s: SalleJeu): Jeu => (s instanceof SalleBJ ? 'blackjack' : s instanceof SalleRoulette ? 'roulette' : 'poker');
import { DefinitionSucces } from '../moteur/succes.js';
import { Utilisateur } from './comptes.js';
import { Donnees, idUtilisateur } from './donnees.js';
import { Notifications } from './notifications.js';

/* ------------------------- Protocole WebSocket ------------------------- */

export type MessageClient =
  | { type: 'auth'; jeton: string }
  | { type: 'hall' }                                  // s'abonner à la liste des tables
  | { type: 'creer'; jeu?: Jeu; reglages: Partial<ReglagesSalle> | Partial<ReglagesBJ> | Partial<ReglagesRoulette> }
  | { type: 'rejoindre'; id?: string; code?: string }
  | { type: 'regarder'; id: string }
  | { type: 'quitter' }
  | { type: 'cmd'; cmd: CommandeClient | CommandeBJ | CommandeRoulette }
  | { type: 'ping' }
  | { type: 'visible'; visible: boolean };

export type ResumeTable = ReturnType<Salle['resume']> | ReturnType<SalleBJ['resume']> | ReturnType<SalleRoulette['resume']>;

export type MessageServeur =
  | { type: 'bienvenue'; utilisateur: Utilisateur; salle: string | null }
  | { type: 'hall'; tables: ResumeTable[]; enLigne: number }
  | { type: 'entre'; id: string; code: string; jeu: Jeu }
  | { type: 'sorti'; raison?: string }
  | { type: 'salle'; msg: MessageSalle | MessageBJ | MessageRoulette }
  | { type: 'remplace' }
  | { type: 'succes'; succes: Omit<DefinitionSucces, 'test'>[] }
  | { type: 'erreur'; texte: string }
  | { type: 'pong' };

interface Client { ws: WebSocket; utilisateur: Utilisateur | null; abonneHall: boolean; compteur: number; fenetre: number; visible: boolean }

const memId = (u: Utilisateur) => `u${u.id}`;
const membre = (u: Utilisateur): Membre => ({ id: memId(u), nom: u.pseudo, avatar: u.avatar, cadre: u.cadre });

export class Hall {
  private salles = new Map<string, SalleJeu>();
  private parCode = new Map<string, SalleJeu>();
  private ouEst = new Map<string, string>();          // membre → salle
  private clients = new Set<Client>();
  private parMembre = new Map<string, Client>();      // une connexion active par joueur
  private hallEnAttente: ReturnType<typeof setTimeout> | null = null;

  private sauvegardes = new Map<string, ReturnType<typeof setTimeout>>();
  private menage: ReturnType<typeof setInterval>;

  constructor(private donnees: Donnees | null = null, private notifications: Notifications | null = null) {
    // Tables restées sans personne pendant 6 heures : supprimées
    this.menage = setInterval(() => {
      for (const s of this.salles.values()) if (s.nbConnectes === 0 && Date.now() - s.derniereActivite > 6 * 3_600_000) this.supprimer(s);
    }, 10 * 60_000);
    this.menage.unref?.();
  }

  /** Recrée les tables sauvegardées (après un redémarrage du serveur). */
  restaurer() {
    if (!this.donnees) return;
    for (const sv of this.donnees.salles()) {
      try {
        const hote = sv.joueurs.find((j) => j.membre.id === sv.hote)?.membre ?? sv.joueurs.find((j) => !j.bot)?.membre;
        if (!hote) { this.donnees.supprimerSalle(sv.id); continue; }
        const jeu = (sv as unknown as { jeu?: string }).jeu;
        const s: SalleJeu = jeu === 'blackjack'
          ? new SalleBJ({ id: sv.id, code: sv.code, hote, reglages: (sv as unknown as SauvegardeBJ).reglages, sauvegarde: sv as unknown as SauvegardeBJ, sortie: this.sortieCasino() })
          : jeu === 'roulette'
          ? new SalleRoulette({ id: sv.id, code: sv.code, hote, reglages: (sv as unknown as SauvegardeRoulette).reglages, sauvegarde: sv as unknown as SauvegardeRoulette, sortie: this.sortieCasino() })
          : new Salle({ id: sv.id, code: sv.code, hote, reglages: sv.reglages, sauvegarde: sv, sortie: this.sortie(() => s as Salle) });
        this.salles.set(s.id, s);
        this.parCode.set(s.code, s);
        for (const j of sv.joueurs) if (!j.bot) this.ouEst.set(j.membre.id, s.id);
      } catch (e) {
        console.error('Table impossible à restaurer', sv.id, e);
        this.donnees.supprimerSalle(sv.id);
      }
    }
  }

  private notifierSucces(par: Map<number, DefinitionSucces[]>) {
    for (const [u, defs] of par) this.envoyerMembre(`u${u}`, { type: 'succes', succes: defs.map(({ test: _t, ...d }) => d) });
  }

  /** Sortie d'une salle : messages vers les joueurs, statistiques, sauvegarde. */
  private sortie(salle: () => Salle): Sortie {
    return {
      envoyer: (dest, m) => {
        if (m.type === 'exclu') { this.ouEst.delete(dest); this.envoyerMembre(dest, { type: 'sorti', raison: "L'hôte t'a exclu de la table" }); return; }
        this.envoyerMembre(dest, { type: 'salle', msg: m });
      },
      mainTerminee: (m, _t, s, rec) => {
        if (this.donnees) {
          try { this.notifierSucces(this.donnees.enregistrerMain(analyserMain(m), rec, s.reglages.tapisDepart)); }
          catch (e) { console.error('Statistiques', e); }
        }
        this.signalerHall();
      },
      partieTerminee: (r) => {
        if (this.donnees) {
          try { this.notifierSucces(this.donnees.enregistrerPartie(r.classement, r.tapisDepart)); }
          catch (e) { console.error('Statistiques', e); }
        }
        this.signalerHall();
      },
      activite: (id, type) => {
        const u = idUtilisateur(id);
        if (u === null || !this.donnees) return;
        const n = this.donnees.activite(u, type);
        if (n.length) this.notifierSucces(new Map([[u, n]]));
      },
      modifiee: (s) => this.planifierSauvegarde(s),
      tourDe: (id, s) => {
        const u = idUtilisateur(id);
        if (u === null || !this.notifications) return;
        const c = this.parMembre.get(id);
        if (c && c.visible) return; // il regarde déjà la table
        void this.notifications.tour(u, s.reglages.nom).catch(() => {});
      },
      vide: (s) => this.supprimer(s),
    };
    void salle;
  }

  /** Sortie d'une table de Black Jack ou de roulette (pas encore de statistiques pour ces jeux). */
  private sortieCasino(): SortieBJ & SortieRoulette {
    return {
      envoyer: (dest: string, m: MessageBJ | MessageRoulette) => {
        if (m.type === 'exclu') { this.ouEst.delete(dest); this.envoyerMembre(dest, { type: 'sorti', raison: "L'hôte t'a exclu de la table" }); return; }
        this.envoyerMembre(dest, { type: 'salle', msg: m });
      },
      activite: (id: string, type: 'message' | 'emote') => {
        const u = idUtilisateur(id);
        if (u === null || !this.donnees) return;
        const n = this.donnees.activite(u, type);
        if (n.length) this.notifierSucces(new Map([[u, n]]));
      },
      modifiee: (s: SalleBJ | SalleRoulette) => { this.planifierSauvegarde(s); this.signalerHall(); },
      vide: (s: SalleBJ | SalleRoulette) => this.supprimer(s),
      tourDe: (id: string, s: SalleBJ | SalleRoulette) => {
        const u = idUtilisateur(id);
        if (u === null || !this.notifications) return;
        const c = this.parMembre.get(id);
        if (c && c.visible) return;
        void this.notifications.tour(u, s.reglages.nom).catch(() => {});
      },
    } as SortieBJ & SortieRoulette;
  }

  private planifierSauvegarde(s: SalleJeu) {
    if (!this.donnees || this.sauvegardes.has(s.id)) return;
    this.sauvegardes.set(s.id, setTimeout(() => {
      this.sauvegardes.delete(s.id);
      if (this.salles.get(s.id) === s) this.donnees!.sauverSalle(s.exporter());
    }, 1500));
  }

  get nbSalles() { return this.salles.size; }
  get nbConnectes() { return this.parMembre.size; }

  /* --------------------------- Connexions --------------------------- */

  brancher(ws: WebSocket, authentifier: (jeton: string) => Utilisateur | null) {
    const c: Client = { ws, utilisateur: null, abonneHall: false, compteur: 0, fenetre: Date.now(), visible: true };
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
      if (s) { this.envoyer(c, { type: 'entre', id: s.id, code: s.code, jeu: jeuDe(s) }); s.connexion(id, true); }
      this.signalerHall();
      return;
    }
    const u = c.utilisateur;
    if (!u) return this.envoyer(c, { type: 'erreur', texte: 'Non connecté' });
    const id = memId(u);

    switch (msg.type) {
      case 'visible':
        c.visible = !!msg.visible;
        return;
      case 'hall':
        c.abonneHall = true;
        this.envoyer(c, this.messageHall(id));
        return;
      case 'creer': {
        this.quitterSalle(id);
        const jeu: Jeu = msg.jeu === 'blackjack' || msg.jeu === 'roulette' ? msg.jeu : 'poker';
        const salleId = randomBytes(6).toString('base64url');
        let code = genererCode();
        while (this.parCode.has(code)) code = genererCode();
        const s: SalleJeu = jeu === 'blackjack'
          ? new SalleBJ({ id: salleId, code, hote: membre(u), reglages: { ...REGLAGES_BJ_DEFAUT, nom: `Black Jack de ${u.pseudo}`, ...(msg.reglages ?? {}) } as ReglagesBJ, sortie: this.sortieCasino() })
          : jeu === 'roulette'
          ? new SalleRoulette({ id: salleId, code, hote: membre(u), reglages: { ...REGLAGES_ROULETTE_DEFAUT, nom: `Roulette de ${u.pseudo}`, ...(msg.reglages ?? {}) } as ReglagesRoulette, sortie: this.sortieCasino() })
          : new Salle({ id: salleId, code, hote: membre(u), reglages: { ...REGLAGES_DEFAUT, nom: `Table de ${u.pseudo}`, ...(msg.reglages ?? {}) } as ReglagesSalle, sortie: this.sortie(() => s as Salle) });
        this.planifierSauvegarde(s);
        this.salles.set(salleId, s);
        this.parCode.set(code, s);
        this.ouEst.set(id, salleId);
        this.envoyer(c, { type: 'entre', id: salleId, code, jeu });
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
        this.envoyer(c, { type: 'entre', id: s.id, code: s.code, jeu: jeuDe(s) });
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
        if (s instanceof SalleBJ) s.commande(id, msg.cmd as CommandeBJ);
        else if (s instanceof SalleRoulette) s.commande(id, msg.cmd as CommandeRoulette);
        else s.commande(id, msg.cmd as CommandeClient);
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

  private salleDe(id: string): SalleJeu | undefined {
    const sid = this.ouEst.get(id);
    return sid ? this.salles.get(sid) : undefined;
  }

  private quitterSalle(id: string) {
    const s = this.salleDe(id);
    this.ouEst.delete(id);
    s?.partir(id);
  }

  private supprimer(s: SalleJeu) {
    s.arreter();
    this.donnees?.supprimerSalle(s.id);
    const h = this.sauvegardes.get(s.id);
    if (h) { clearTimeout(h); this.sauvegardes.delete(s.id); }
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
    // Sauvegarde finale de toutes les tables avant l'arrêt
    for (const s of this.salles.values()) { s.arreter(); this.donnees?.sauverSalle(s.exporter()); }
    for (const h of this.sauvegardes.values()) clearTimeout(h);
    clearInterval(this.menage);
    if (this.hallEnAttente) clearTimeout(this.hallEnAttente);
  }
}
