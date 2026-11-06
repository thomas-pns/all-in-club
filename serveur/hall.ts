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
import { Ville, ville as trouverVille, caveDe, reglagesCasino, COMMANDES_HOTE_CASINO } from '../moteur/casino.js';
import type { Portefeuilles, EtatPortefeuille } from './portefeuille.js';
import type { Activites, Annonce, MissionFaite } from './activites.js';
import { fmtClubs } from './kiosque.js';
import type { MessageAmi, Presence } from './amis.js';
import { Utilisateur } from './comptes.js';
import { Donnees, idUtilisateur } from './donnees.js';
import { Notifications } from './notifications.js';

/* ------------------------- Protocole WebSocket ------------------------- */

export type MessageClient =
  | { type: 'auth'; jeton: string }
  | { type: 'hall' }                                  // s'abonner à la liste des tables
  | { type: 'casino'; jeu: Jeu; ville: string }
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
  | { type: 'hall'; tables: ResumeTable[]; enLigne: number; villes: Record<string, number> }
  | { type: 'entre'; id: string; code: string; jeu: Jeu; casino?: string }
  | { type: 'sorti'; raison?: string }
  | { type: 'salle'; msg: MessageSalle | MessageBJ | MessageRoulette }
  | { type: 'remplace' }
  | { type: 'succes'; succes: Omit<DefinitionSucces, 'test'>[] }
  | { type: 'erreur'; texte: string }
  | { type: 'annonce'; annonce: Annonce }
  | MessageAmi
  | ({ type: 'mission'; etat: EtatPortefeuille | null } & MissionFaite)
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
  /** Tables du Casino : on y joue ses Clubs ♣. */
  private casino = new Map<string, { jeu: Jeu; ville: Ville }>();
  private menage: ReturnType<typeof setInterval>;

  constructor(private donnees: Donnees | null = null, private notifications: Notifications | null = null, private porte: Portefeuilles | null = null, private activites: Activites | null = null) {
    if (activites) {
      activites.surMission = (u, m) => this.envoyerMembre(`u${u}`, { type: 'mission', ...m, etat: this.porte?.etat(u) ?? null });
      activites.surAnnonce = (a) => { for (const c of this.clients) if (c.utilisateur) this.envoyer(c, { type: 'annonce', annonce: a }); };
    }
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
    for (const r of this.donnees.casinoTables()) {
      const v = trouverVille(r.ville);
      if (this.salles.has(r.id) && v) this.casino.set(r.id, { jeu: r.jeu as Jeu, ville: v });
      else this.donnees.retirerCasino(r.id);
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
        if (this.activites) {
          try {
            for (const j of rec.joueurs) this.activites.signaler(idUtilisateur(j.id), 'mainPoker');
            const lieu = this.casino.get(s.id);
            for (const g of rec.gagnants) {
              const j = rec.joueurs.find((x) => x.siege === g.siege);
              if (!j) continue;
              const u = idUtilisateur(j.id);
              this.activites.signaler(u, 'potPoker');
              if (lieu && u !== null && g.montant >= rec.gb * 100) this.activites.annoncer(u, `a remporté un pot de ${fmtClubs(g.montant)} à ${lieu.ville.nom}`, g.montant);
            }
          } catch (e) { console.error('Missions', e); }
        }
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
        try { this.suivreMissions(dest, m); } catch (e) { console.error('Missions', e); }
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

  /** Chaque joueur reçoit ses propres événements : on y lit ce qui fait avancer ses missions. */
  private suivreMissions(dest: string, m: MessageBJ | MessageRoulette) {
    const a = this.activites, u = idUtilisateur(dest);
    if (!a || u === null) return;
    if (m.type === 'majBJ' && m.etat.monSiege !== null) {
      for (const e of m.evenements) {
        if (e.t !== 'resultat' || e.siege !== m.etat.monSiege) continue;
        if (e.main === 0) a.signaler(u, 'mancheBJ');
        if (e.issue === 'gagne' || e.issue === 'blackjack') a.signaler(u, 'gagneBJ');
        if (e.issue === 'blackjack') a.signaler(u, 'blackjack');
      }
    }
    if (m.type === 'majRoulette' && m.etat.monSiege !== null) {
      const lieu = this.casino.get(m.etat.id);
      for (const e of m.evenements) {
        if (e.t === 'bilan' && e.siege === m.etat.monSiege && e.mise > 0) a.signaler(u, 'tourRoulette');
        if (e.t === 'gain' && e.siege === m.etat.monSiege && /^\d+$/.test(e.mise)) {
          a.signaler(u, 'pleinRoulette');
          if (lieu && e.retour >= 1_000) a.annoncer(u, `a touché le ${e.mise} en plein à ${lieu.ville.nom} (+${fmtClubs(e.retour)})`, e.retour);
        }
      }
    }
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

  /** Où en est un joueur : connecté ? à quelle table ? (pour ses amis) */
  presence(u: number): Presence {
    const id = `u${u}`;
    const enLigne = this.parMembre.has(id);
    const sid = this.ouEst.get(id);
    const s = sid ? this.salles.get(sid) : undefined;
    if (!enLigne || !s) return { enLigne, table: null };
    const r = s.resume() as { nom: string; joueurs: number; places: number; statut: string };
    const lieu = this.casino.get(s.id);
    return {
      enLigne,
      table: {
        code: s.code, nom: lieu ? `Casino de ${lieu.ville.nom}` : r.nom, jeu: jeuDe(s), ville: lieu?.ville.nom ?? null,
        joueurs: r.joueurs, places: r.places, rejoignable: r.statut !== 'terminee' && r.joueurs < r.places,
      },
    };
  }

  /** Un message en direct pour un joueur connecté (amis). */
  notifier(u: number, m: MessageServeur) { this.envoyerMembre(`u${u}`, m); }

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
      if (s) { this.envoyer(c, { type: 'entre', id: s.id, code: s.code, jeu: jeuDe(s), casino: this.nomCasino(s) }); s.connexion(id, true); this.demarrerCasino(s); }
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
      case 'casino':
        this.entrerCasino(c, u, msg.jeu, String(msg.ville));
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
        this.envoyer(c, { type: 'entre', id: s.id, code: s.code, jeu: jeuDe(s), casino: this.nomCasino(s) });
        const dejaAssis = s.estMembre(id) && this.estAssis(s, id);
        if (msg.type === 'regarder' || (this.casino.has(s.id) && !dejaAssis && (this.porte?.etat(u.id).solde ?? 0) < caveDe(this.casino.get(s.id)!.ville, this.casino.get(s.id)!.jeu))) s.regarder(membre(u));
        else {
          s.rejoindre(membre(u));
          if (this.casino.has(s.id) && !dejaAssis && this.estAssis(s, id) && !this.payerCave(s, id)) { s.partir(id); s.regarder(membre(u)); }
          this.demarrerCasino(s);
        }
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
        if (this.commandeCasino(c, s, id, msg.cmd as { c: string })) { this.planifierSauvegarde(s); this.signalerHall(); return; }
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

  /* --------------------------- Casino --------------------------- */

  private nomCasino(s: SalleJeu) { const c = this.casino.get(s.id); return c ? c.ville.nom : undefined; }
  private uid(id: string) { return idUtilisateur(id); }

  /** Jetons d'un joueur assis à une table (ceux qui retournent au portefeuille s'il se lève). */
  private jetonsDe(s: SalleJeu, id: string): number {
    const v = s.vue(id) as unknown as { phase?: string; sieges: ({ id: string; tapis: number; totalMise?: number } | null)[] };
    const siege = v.sieges.find((x) => x && x.id === id);
    if (!siege) return 0;
    return siege.tapis + (s instanceof SalleRoulette && v.phase === 'mises' ? siege.totalMise ?? 0 : 0);
  }
  private estAssis(s: SalleJeu, id: string) { return (s.vue(id) as unknown as { monSiege: number | null }).monSiege !== null; }

  /** Rend au portefeuille les jetons d'un joueur qui quitte une table du Casino. */
  private encaisser(s: SalleJeu, id: string) {
    const c = this.casino.get(s.id), u = this.uid(id);
    if (!c || u === null || !this.porte) return;
    const n = this.jetonsDe(s, id);
    if (n > 0) this.porte.crediter(u, n, `Retour de ${c.ville.nom}`);
  }

  /** Prélève la cave pour s'asseoir ; faux si le portefeuille ne suffit pas. */
  private payerCave(s: SalleJeu, id: string): boolean {
    const c = this.casino.get(s.id), u = this.uid(id);
    if (!c || u === null || !this.porte) return false;
    const cave = caveDe(c.ville, c.jeu);
    if (this.porte.etat(u).solde < cave) return false;
    this.porte.crediter(u, -cave, `Cave ${c.ville.nom}`);
    return true;
  }

  /** Lance (ou relance) une table du Casino : personne n'en est le patron. */
  private demarrerCasino(s: SalleJeu) {
    if (!this.casino.has(s.id)) return;
    const humains = s.resume().humains;
    const poker = s instanceof Salle;
    const cmd = (c: string) => (s as unknown as { commande(id: string, c: { c: string }): void }).commande(s.hote, { c });
    if (s.statut === 'attente' && (!poker || humains >= 2)) cmd('lancer');
    else if (s.statut === 'pause' && (!poker || humains >= 2)) cmd('reprendre');
  }

  /** Va s'asseoir à une table de la ville (en en créant une si besoin). */
  private entrerCasino(c: Client, u: Utilisateur, jeu: Jeu, idVille: string) {
    const v = trouverVille(idVille);
    if (!v || !['poker', 'blackjack', 'roulette'].includes(jeu)) return this.envoyer(c, { type: 'erreur', texte: 'Ville inconnue' });
    const id = memId(u);
    if (!this.porte) return this.envoyer(c, { type: 'erreur', texte: 'Le Casino est fermé' });
    const cave = caveDe(v, jeu);
    if (this.porte.etat(u.id).solde < cave) return this.envoyer(c, { type: 'erreur', texte: `Il te faut ${cave.toLocaleString('fr-FR')} ♣ pour t'asseoir à ${v.nom}` });
    this.quitterSalle(id);
    let s = [...this.casino.entries()].map(([sid, x]) => ({ t: this.salles.get(sid), x }))
      .find(({ t, x }) => t && x.jeu === jeu && x.ville.id === v.id && t.statut !== 'terminee' && t.resume().joueurs < t.reglages.places)?.t;
    if (!s) {
      const salleId = randomBytes(6).toString('base64url');
      let code = genererCode();
      while (this.parCode.has(code)) code = genererCode();
      const r = reglagesCasino(v, jeu);
      const nouvelle: SalleJeu = jeu === 'blackjack'
        ? new SalleBJ({ id: salleId, code, hote: membre(u), reglages: { ...REGLAGES_BJ_DEFAUT, ...r } as ReglagesBJ, sortie: this.sortieCasino() })
        : jeu === 'roulette'
        ? new SalleRoulette({ id: salleId, code, hote: membre(u), reglages: { ...REGLAGES_ROULETTE_DEFAUT, ...r } as ReglagesRoulette, sortie: this.sortieCasino() })
        : new Salle({ id: salleId, code, hote: membre(u), reglages: { ...REGLAGES_DEFAUT, ...r } as ReglagesSalle, sortie: this.sortie(() => nouvelle as Salle) });
      s = nouvelle;
      this.salles.set(salleId, s);
      this.parCode.set(code, s);
      this.casino.set(salleId, { jeu, ville: v });
      this.donnees?.ajouterCasino(salleId, jeu, v.id);
    } else s.rejoindre(membre(u));
    this.ouEst.set(id, s.id);
    if (!this.payerCave(s, id)) { this.ouEst.delete(id); s.partir(id); return this.envoyer(c, { type: 'erreur', texte: 'Portefeuille insuffisant' }); }
    this.envoyer(c, { type: 'entre', id: s.id, code: s.code, jeu: jeuDe(s), casino: v.nom });
    this.demarrerCasino(s);
    s.diffuser();
    this.planifierSauvegarde(s);
    this.signalerHall();
  }

  /** Commandes envoyées à une table du Casino : l'argent passe par le portefeuille. Vrai si déjà traitée. */
  private commandeCasino(c: Client, s: SalleJeu, id: string, cmd: { c: string }): boolean {
    const x = this.casino.get(s.id);
    if (!x) return false;
    if (COMMANDES_HOTE_CASINO.includes(cmd.c)) { this.envoyer(c, { type: 'salle', msg: { type: 'erreur', texte: 'Les tables du Casino n\'ont pas de patron' } }); return true; }
    const u = this.uid(id);
    if (u === null || !this.porte) return true;
    const commande = (k: { c: string }) => (s as unknown as { commande(id: string, c: { c: string }): void }).commande(id, k);
    const cave = caveDe(x.ville, x.jeu);
    if (cmd.c === 'asseoir') {
      if (this.porte.etat(u).solde < cave) { this.envoyer(c, { type: 'salle', msg: { type: 'erreur', texte: 'Pas assez de Clubs pour la cave' } }); return true; }
      commande(cmd);
      if (this.estAssis(s, id) && !this.payerCave(s, id)) s.partir(id);
      this.demarrerCasino(s);
      return true;
    }
    if (cmd.c === 'lever') {
      const avant = this.jetonsDe(s, id);
      commande(cmd);
      if (!this.estAssis(s, id) && avant > 0) this.porte.crediter(u, avant, `Retour de ${x.ville.nom}`);
      return true;
    }
    if (cmd.c === 'recave') {
      const avant = this.jetonsDe(s, id);
      if (!this.payerCave(s, id)) { this.envoyer(c, { type: 'salle', msg: { type: 'erreur', texte: 'Pas assez de Clubs pour te recaver' } }); return true; }
      commande(cmd);
      if (this.jetonsDe(s, id) <= avant) this.porte.crediter(u, cave, 'Recave annulée');
      this.demarrerCasino(s);
      return true;
    }
    return false;
  }

  private salleDe(id: string): SalleJeu | undefined {
    const sid = this.ouEst.get(id);
    return sid ? this.salles.get(sid) : undefined;
  }

  private quitterSalle(id: string) {
    const s = this.salleDe(id);
    this.ouEst.delete(id);
    if (s) this.encaisser(s, id);
    s?.partir(id);
  }

  private supprimer(s: SalleJeu) {
    if (this.casino.has(s.id)) {
      // Fermeture d'une table du Casino : chacun récupère ses jetons
      const v = s.vue('') as unknown as { sieges: ({ id: string } | null)[] };
      for (const x of v.sieges) if (x) this.encaisser(s, x.id);
      this.casino.delete(s.id);
      this.donnees?.retirerCasino(s.id);
    }
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
      .filter((s) => !this.casino.has(s.id) && (s.reglages.visibilite === 'publique' || s.id === mienne))
      .map((s) => s.resume())
      .sort((a, b) => Number(b.statut === 'attente') - Number(a.statut === 'attente') || b.humains - a.humains);
    const villes: Record<string, number> = {};
    for (const [sid, x] of this.casino) { const t = this.salles.get(sid); if (t) villes[`${x.jeu}:${x.ville.id}`] = (villes[`${x.jeu}:${x.ville.id}`] ?? 0) + t.resume().humains; }
    return { type: 'hall', tables, enLigne: this.parMembre.size, villes };
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
