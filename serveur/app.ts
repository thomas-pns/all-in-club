/**
 * Application HTTP + WebSocket d'All-In Club.
 */
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Base } from './base.js';
import { Comptes, ErreurCompte, Utilisateur } from './comptes.js';
import { Hall } from './hall.js';
import { Courriel } from './courriel.js';
import { AVATARS } from '../moteur/avatars.js';
import { listeSucces, CADRES, DOS } from '../moteur/succes.js';
import { Donnees } from './donnees.js';
import { Notifications } from './notifications.js';
import { Portefeuilles, ErreurPortefeuille } from './portefeuille.js';
import { Activites } from './activites.js';
import { ROUE } from '../moteur/bonus.js';
import { Kiosque, fmtClubs } from './kiosque.js';
import { TICKETS, KENO, KENO_GAINS, LOTO, LOTO_GAINS } from '../moteur/kiosque.js';

export const VERSION = '0.2.0';

export interface OptionsServeur {
  db: Base;
  courriel: Courriel;
  dossierClient?: string;   // build du client (dist/client)
  urlPublique?: string;     // pour les liens envoyés par e-mail
  journal?: boolean;
}

/** Limite de requêtes par adresse IP, en mémoire. */
function limiteur(max: number, fenetreMs: number) {
  const compteurs = new Map<string, { n: number; debut: number }>();
  setInterval(() => {
    const t = Date.now();
    for (const [k, v] of compteurs) if (t - v.debut > fenetreMs) compteurs.delete(k);
  }, fenetreMs).unref();
  return (cle: string) => {
    const t = Date.now();
    const c = compteurs.get(cle);
    if (!c || t - c.debut > fenetreMs) { compteurs.set(cle, { n: 1, debut: t }); return true; }
    return ++c.n <= max;
  };
}

export async function creerServeur(o: OptionsServeur): Promise<{ app: FastifyInstance; hall: Hall; comptes: Comptes }> {
  const app = Fastify({ logger: o.journal ? { level: 'info', redact: ['req.headers.authorization'] } : false, trustProxy: true, bodyLimit: 32 * 1024 });
  const comptes = new Comptes(o.db);
  const donnees = new Donnees(o.db);
  const portefeuilles = new Portefeuilles(o.db);
  const activites = new Activites(o.db, portefeuilles);
  const kiosque = new Kiosque(o.db, portefeuilles);
  kiosque.activites = activites;
  kiosque.demarrer();
  app.addHook('onClose', async () => kiosque.arreter());
  const notifications = new Notifications(o.db, o.urlPublique ?? 'mailto:admin@all-in-club.invalid');
  const hall = new Hall(donnees, notifications, portefeuilles, activites);
  hall.restaurer();
  const limiteAuth = limiteur(10, 5 * 60_000);
  const limiteMail = limiteur(3, 15 * 60_000);

  setInterval(() => comptes.nettoyer(), 3_600_000).unref();

  app.setErrorHandler((e, _req, rep) => {
    if (e instanceof ErreurCompte) return rep.code(e.code).send({ erreur: e.message });
    if (e instanceof ErreurPortefeuille) return rep.code(400).send({ erreur: e.message });
    if ((e as any).validation || (e as any).statusCode === 400) return rep.code(400).send({ erreur: 'Requête invalide' });
    app.log.error(e);
    return rep.code(500).send({ erreur: 'Erreur interne' });
  });

  const jetonDe = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : null;
  };
  const exigerUtilisateur = (req: FastifyRequest): Utilisateur => {
    const u = comptes.session(jetonDe(req));
    if (!u) throw new ErreurCompte('Session expirée, reconnecte-toi', 401);
    return u;
  };
  const verifierLimite = (req: FastifyRequest, f: (k: string) => boolean) => {
    if (!f(`${req.ip}:${req.url}`)) throw new ErreurCompte('Trop de tentatives, réessaie dans quelques minutes', 429);
  };

  /* --------------------------- API --------------------------- */

  app.get('/api/sante', async () => ({ ok: true, version: VERSION, tables: hall.nbSalles, connectes: hall.nbConnectes, courriel: o.courriel.actif }));

  app.get('/api/avatars', async () => AVATARS);

  app.get('/api/succes', async () => ({ succes: listeSucces(), cadres: CADRES, dos: DOS }));

  app.get('/api/joueurs', async (req) => { exigerUtilisateur(req); return { joueurs: donnees.joueurs() }; });

  /* Portefeuille en Clubs ♣ (argent fictif) */
  app.get('/api/portefeuille', async (req) => portefeuilles.etat(exigerUtilisateur(req).id));
  app.get('/api/portefeuille/mouvements', async (req) => ({ mouvements: portefeuilles.mouvements(exigerUtilisateur(req).id) }));
  app.post('/api/portefeuille/roue', async (req) => {
    const u = exigerUtilisateur(req).id;
    const r = portefeuilles.tournerRoue(u);
    // Le jackpot est annoncé une fois la roue arrêtée
    if (ROUE[r.segment].label === 'JACKPOT') setTimeout(() => activites.annoncer(u, `a décroché le JACKPOT de la Grande Roue : ${fmtClubs(r.clubs)} !`, r.clubs), 7_000).unref();
    return r;
  });
  app.get('/api/missions', async (req) => activites.missions(exigerUtilisateur(req).id));
  app.get('/api/annonces', async (req) => { exigerUtilisateur(req); return { annonces: activites.annonces() }; });
  app.post('/api/portefeuille/coup-de-pouce', async (req) => portefeuilles.coupDePouce(exigerUtilisateur(req).id));
  /* Le Kiosque : tickets à gratter, Keno, Loto Flash */
  app.get('/api/kiosque', async () => ({
    tickets: Object.values(TICKETS).map(({ type, nom, prix, regle, gains }) => ({ type, nom, prix, regle, lotMax: Math.max(...gains.map(([g]) => g)) })),
    keno: { ...KENO, gains: KENO_GAINS }, loto: { ...LOTO, gains: LOTO_GAINS },
  }));
  app.post('/api/kiosque/ticket', async (req) => {
    const b = (req.body ?? {}) as { type?: string; offert?: boolean };
    return kiosque.acheterTicket(exigerUtilisateur(req).id, String(b.type) as any, !!b.offert);
  });
  app.get('/api/kiosque/keno', async (req) => kiosque.etatKeno(exigerUtilisateur(req).id));
  app.get('/api/kiosque/keno/:id', async (req) => { exigerUtilisateur(req); return { tirage: kiosque.tirageKeno(Number((req.params as any).id)) }; });
  app.post('/api/kiosque/keno', async (req) => { const b = (req.body ?? {}) as any; return kiosque.jouerKeno(exigerUtilisateur(req).id, b.numeros, b.mise, b.tirages); });
  app.get('/api/kiosque/loto', async (req) => kiosque.etatLoto(exigerUtilisateur(req).id));
  app.get('/api/kiosque/loto/:id', async (req) => { exigerUtilisateur(req); return { tirage: kiosque.tirageLoto(Number((req.params as any).id)) }; });
  app.post('/api/kiosque/loto', async (req) => { const b = (req.body ?? {}) as any; return kiosque.jouerLoto(exigerUtilisateur(req).id, b.numeros, b.etoile); });

  app.get('/api/classement', async (req) => { exigerUtilisateur(req); return { joueurs: portefeuilles.classement() }; });

  app.get('/api/joueurs/:pseudo', async (req) => {
    exigerUtilisateur(req);
    const u = comptes.parPseudo(String((req.params as any).pseudo ?? ''));
    if (!u) throw new ErreurCompte('Joueur introuvable', 404);
    return {
      joueur: { pseudo: u.pseudo, avatar: u.avatar, cadre: u.cadre, cree: u.cree },
      stats: donnees.stats(u.id),
      succes: donnees.succesObtenus(u.id),
    };
  });

  app.get('/api/mes-mains', async (req) => ({ mains: donnees.mesMains(exigerUtilisateur(req).id) }));

  app.get('/api/push/cle', async () => ({ cle: notifications.clePublique }));

  app.post('/api/push/abonnement', async (req) => {
    const u = exigerUtilisateur(req);
    try { notifications.abonner(u.id, (req.body as any)?.abonnement); } catch (e) { throw new ErreurCompte((e as Error).message); }
    return { ok: true };
  });

  app.delete('/api/push/abonnement', async (req) => {
    const u = exigerUtilisateur(req);
    notifications.desabonner(u.id, (req.body as any)?.endpoint);
    return { ok: true };
  });

  app.get('/api/moi/recompenses', async (req) => donnees.recompenses(exigerUtilisateur(req).id));

  app.post('/api/inscription', async (req) => {
    verifierLimite(req, limiteAuth);
    const b = (req.body ?? {}) as any;
    return comptes.inscrire(b.pseudo, b.mdp, b.email, b.avatar);
  });

  app.post('/api/connexion', async (req) => {
    verifierLimite(req, limiteAuth);
    const b = (req.body ?? {}) as any;
    return comptes.connecter(b.pseudo, b.mdp);
  });

  app.post('/api/deconnexion', async (req) => {
    const j = jetonDe(req);
    if (j) comptes.deconnecter(j);
    return { ok: true };
  });

  app.get('/api/moi', async (req) => ({ utilisateur: exigerUtilisateur(req) }));

  app.patch('/api/moi', async (req) => {
    const u = exigerUtilisateur(req);
    const b = (req.body ?? {}) as any;
    if (b.cadre !== undefined || b.dos !== undefined) {
      try { donnees.choisirCosmetiques(u.id, { cadre: b.cadre, dos: b.dos }); }
      catch (e) { throw new ErreurCompte((e as Error).message); }
    }
    const maj = comptes.modifier(u.id, { avatar: b.avatar, email: b.email, toujoursMontrer: b.toujoursMontrer });
    hall.majUtilisateur(maj);
    return { utilisateur: maj };
  });

  app.post('/api/moi/mdp', async (req) => {
    const u = exigerUtilisateur(req);
    verifierLimite(req, limiteAuth);
    const b = (req.body ?? {}) as any;
    await comptes.changerMotDePasse(u.id, b.ancien, b.nouveau);
    return { ok: true };
  });

  app.post('/api/mdp-oublie', async (req) => {
    verifierLimite(req, limiteMail);
    const b = (req.body ?? {}) as any;
    const reponse = {
      ok: true,
      message: o.courriel.actif
        ? "Si ce compte a une adresse e-mail, un lien vient d'y être envoyé (valable 30 minutes)."
        : "L'envoi d'e-mails n'est pas configuré sur ce serveur : demande à l'administrateur de réinitialiser ton mot de passe.",
    };
    if (!o.courriel.actif) return reponse;
    const d = comptes.demanderReinitialisation(b.identifiant);
    if (d && d.utilisateur.email) {
      const base = o.urlPublique ?? `${req.protocol}://${req.headers.host}`;
      const lien = `${base}/?reinitialiser=${encodeURIComponent(d.jeton)}`;
      const texte = `Bonjour ${d.utilisateur.pseudo},\n\nPour choisir un nouveau mot de passe All-In Club, ouvre ce lien (valable 30 minutes) :\n${lien}\n\nSi tu n'as rien demandé, ignore ce message.`;
      const html = `<p>Bonjour <b>${d.utilisateur.pseudo}</b>,</p><p>Pour choisir un nouveau mot de passe All-In Club, clique ici (valable 30 minutes) :</p><p><a href="${lien}">Choisir un nouveau mot de passe</a></p><p>Si tu n'as rien demandé, ignore ce message.</p>`;
      o.courriel.envoyer(d.utilisateur.email, 'All-In Club : nouveau mot de passe', texte, html)
        .catch((e) => app.log.error({ err: String(e) }, 'Envoi e-mail impossible'));
    }
    return reponse;
  });

  app.post('/api/reinitialiser', async (req) => {
    verifierLimite(req, limiteAuth);
    const b = (req.body ?? {}) as any;
    await comptes.reinitialiser(b.jeton, b.mdp);
    return { ok: true };
  });

  /* --------------------------- WebSocket --------------------------- */

  await app.register(fastifyWebsocket, { options: { maxPayload: 16 * 1024 } });
  app.get('/ws', { websocket: true }, (socket) => {
    hall.brancher(socket, (jeton) => comptes.session(jeton));
  });

  /* --------------------------- Client --------------------------- */

  const dossier = o.dossierClient;
  if (dossier && existsSync(join(dossier, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: dossier,
      setHeaders: (res, chemin) => {
        if (chemin.endsWith('index.html') || chemin.endsWith('sw.js') || chemin.endsWith('.webmanifest')) res.header('Cache-Control', 'no-cache');
        else if (chemin.includes('/assets/')) res.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
    app.setNotFoundHandler((req, rep) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) return rep.code(404).send({ erreur: 'Introuvable' });
      return rep.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => hall.arreter());
  return { app, hall, comptes };
}
