/**
 * Comptes : inscription, connexion, sessions, mot de passe oublié.
 * Mots de passe hachés avec scrypt (sel aléatoire), jetons stockés sous forme d'empreinte.
 */
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { Base } from './base.js';
import { AvatarId, estAvatar } from '../moteur/avatars.js';

const SESSION_JOURS = 30;
const REINIT_MINUTES = 30;

export interface Utilisateur {
  id: number;
  pseudo: string;
  email: string | null;
  avatar: AvatarId;
  toujoursMontrer: boolean;
  cree: number;
  cadre: string;
  dos: string;
}

export class ErreurCompte extends Error {
  constructor(message: string, public code = 400) { super(message); }
}

function hacher(mdp: string, sel = randomBytes(16)): Promise<string> {
  return new Promise((ok, ko) =>
    scrypt(mdp, sel, 64, { N: 16384, r: 8, p: 1 }, (e, cle) => (e ? ko(e) : ok(`scrypt$${sel.toString('base64')}$${cle.toString('base64')}`))),
  );
}

async function verifier(mdp: string, stocke: string): Promise<boolean> {
  const [, sel, cle] = stocke.split('$');
  const attendu = Buffer.from(cle, 'base64');
  const calcule = await hacher(mdp, Buffer.from(sel, 'base64'));
  const obtenu = Buffer.from(calcule.split('$')[2], 'base64');
  return obtenu.length === attendu.length && timingSafeEqual(obtenu, attendu);
}

const empreinte = (jeton: string) => createHash('sha256').update(jeton).digest('hex');
const nouveauJeton = () => randomBytes(32).toString('base64url');

const PSEUDO = /^[\p{L}\p{N}_\-. ]{3,16}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ligneVersUtilisateur(r: any): Utilisateur {
  return {
    id: Number(r.id), pseudo: String(r.pseudo), email: r.email ? String(r.email) : null,
    avatar: estAvatar(r.avatar) ? r.avatar : 'renard', toujoursMontrer: !!r.toujours_montrer, cree: Number(r.cree),
    cadre: r.cadre ? String(r.cadre) : 'aucun', dos: r.dos ? String(r.dos) : 'prune',
  };
}

export class Comptes {
  constructor(private db: Base) {}

  async inscrire(pseudo: string, mdp: string, email?: string | null, avatar?: string): Promise<{ jeton: string; utilisateur: Utilisateur }> {
    pseudo = String(pseudo ?? '').trim().replace(/\s+/g, ' ');
    if (!PSEUDO.test(pseudo)) throw new ErreurCompte('Pseudo : 3 à 16 caractères (lettres, chiffres, espace, _ - .)');
    if (typeof mdp !== 'string' || mdp.length < 8) throw new ErreurCompte('Mot de passe : 8 caractères minimum');
    if (mdp.length > 200) throw new ErreurCompte('Mot de passe trop long');
    const mail = email ? String(email).trim() : null;
    if (mail && !EMAIL.test(mail)) throw new ErreurCompte('Adresse e-mail invalide');
    if (this.db.prepare('SELECT 1 FROM utilisateurs WHERE pseudo = ?').get(pseudo)) throw new ErreurCompte('Ce pseudo est déjà pris', 409);
    const hash = await hacher(mdp);
    const r = this.db.prepare('INSERT INTO utilisateurs (pseudo, hash, email, avatar, cree) VALUES (?, ?, ?, ?, ?)')
      .run(pseudo, hash, mail, estAvatar(avatar) ? avatar : 'renard', Date.now());
    const id = Number(r.lastInsertRowid);
    return { jeton: this.creerSession(id), utilisateur: this.parId(id)! };
  }

  async connecter(pseudo: string, mdp: string): Promise<{ jeton: string; utilisateur: Utilisateur }> {
    const r: any = this.db.prepare('SELECT * FROM utilisateurs WHERE pseudo = ?').get(String(pseudo ?? '').trim());
    // Même temps de calcul que le pseudo existe ou non
    const ok = r ? await verifier(String(mdp ?? ''), r.hash) : (await hacher('x'), false);
    if (!r || !ok) throw new ErreurCompte('Pseudo ou mot de passe incorrect', 401);
    return { jeton: this.creerSession(Number(r.id)), utilisateur: ligneVersUtilisateur(r) };
  }

  private creerSession(id: number): string {
    const jeton = nouveauJeton();
    this.db.prepare('INSERT INTO sessions (jeton, utilisateur, expire) VALUES (?, ?, ?)')
      .run(empreinte(jeton), id, Date.now() + SESSION_JOURS * 86_400_000);
    return jeton;
  }

  /** Utilisateur d'un jeton de session (prolonge la session). */
  session(jeton: string | undefined | null): Utilisateur | null {
    if (!jeton) return null;
    const h = empreinte(jeton);
    const r: any = this.db.prepare('SELECT u.* , s.expire FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur WHERE s.jeton = ?').get(h);
    if (!r) return null;
    if (Number(r.expire) < Date.now()) { this.db.prepare('DELETE FROM sessions WHERE jeton = ?').run(h); return null; }
    if (Number(r.expire) - Date.now() < (SESSION_JOURS - 1) * 86_400_000)
      this.db.prepare('UPDATE sessions SET expire = ? WHERE jeton = ?').run(Date.now() + SESSION_JOURS * 86_400_000, h);
    return ligneVersUtilisateur(r);
  }

  deconnecter(jeton: string) {
    this.db.prepare('DELETE FROM sessions WHERE jeton = ?').run(empreinte(jeton));
  }

  parId(id: number): Utilisateur | null {
    const r = this.db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(id);
    return r ? ligneVersUtilisateur(r) : null;
  }

  parPseudo(pseudo: string): Utilisateur | null {
    const r = this.db.prepare('SELECT * FROM utilisateurs WHERE pseudo = ?').get(pseudo);
    return r ? ligneVersUtilisateur(r) : null;
  }

  modifier(id: number, m: { avatar?: string; email?: string | null; toujoursMontrer?: boolean }): Utilisateur {
    if (m.avatar !== undefined) {
      if (!estAvatar(m.avatar)) throw new ErreurCompte('Avatar inconnu');
      this.db.prepare('UPDATE utilisateurs SET avatar = ? WHERE id = ?').run(m.avatar, id);
    }
    if (m.email !== undefined) {
      const mail = m.email ? String(m.email).trim() : null;
      if (mail && !EMAIL.test(mail)) throw new ErreurCompte('Adresse e-mail invalide');
      this.db.prepare('UPDATE utilisateurs SET email = ? WHERE id = ?').run(mail, id);
    }
    if (m.toujoursMontrer !== undefined) this.db.prepare('UPDATE utilisateurs SET toujours_montrer = ? WHERE id = ?').run(m.toujoursMontrer ? 1 : 0, id);
    return this.parId(id)!;
  }

  async changerMotDePasse(id: number, ancien: string, nouveau: string) {
    const r: any = this.db.prepare('SELECT hash FROM utilisateurs WHERE id = ?').get(id);
    if (!r || !(await verifier(String(ancien ?? ''), r.hash))) throw new ErreurCompte('Mot de passe actuel incorrect', 401);
    await this.definirMotDePasse(id, nouveau);
  }

  async definirMotDePasse(id: number, mdp: string) {
    if (typeof mdp !== 'string' || mdp.length < 8) throw new ErreurCompte('Mot de passe : 8 caractères minimum');
    this.db.prepare('UPDATE utilisateurs SET hash = ? WHERE id = ?').run(await hacher(mdp), id);
    this.db.prepare('DELETE FROM sessions WHERE utilisateur = ?').run(id);
  }

  /** Crée un lien de réinitialisation. Renvoie null si aucun e-mail n'est enregistré. */
  demanderReinitialisation(pseudoOuEmail: string): { utilisateur: Utilisateur; jeton: string } | null {
    const v = String(pseudoOuEmail ?? '').trim();
    const r: any = this.db.prepare('SELECT * FROM utilisateurs WHERE pseudo = ? OR (email IS NOT NULL AND email = ?)').get(v, v);
    if (!r || !r.email) return null;
    const jeton = nouveauJeton();
    this.db.prepare('INSERT INTO reinitialisations (jeton, utilisateur, expire) VALUES (?, ?, ?)')
      .run(empreinte(jeton), r.id, Date.now() + REINIT_MINUTES * 60_000);
    return { utilisateur: ligneVersUtilisateur(r), jeton };
  }

  async reinitialiser(jeton: string, mdp: string) {
    const h = empreinte(String(jeton ?? ''));
    const r: any = this.db.prepare('SELECT * FROM reinitialisations WHERE jeton = ?').get(h);
    if (!r || Number(r.expire) < Date.now()) throw new ErreurCompte('Lien expiré ou invalide');
    await this.definirMotDePasse(Number(r.utilisateur), mdp);
    this.db.prepare('DELETE FROM reinitialisations WHERE utilisateur = ?').run(r.utilisateur);
  }

  nettoyer() {
    this.db.prepare('DELETE FROM sessions WHERE expire < ?').run(Date.now());
    this.db.prepare('DELETE FROM reinitialisations WHERE expire < ?').run(Date.now());
  }
}
