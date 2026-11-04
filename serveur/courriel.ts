/**
 * Envoi d'e-mails (mot de passe oublié). Facultatif : configuré par variables d'environnement.
 *   SMTP_HOTE, SMTP_PORT (465 par défaut), SMTP_UTILISATEUR, SMTP_MDP, SMTP_EXPEDITEUR
 */
import nodemailer from 'nodemailer';

export interface Courriel {
  actif: boolean;
  envoyer(a: string, sujet: string, texte: string, html: string): Promise<void>;
}

export function creerCourriel(env = process.env): Courriel {
  const hote = env.SMTP_HOTE, utilisateur = env.SMTP_UTILISATEUR, mdp = env.SMTP_MDP;
  if (!hote || !utilisateur || !mdp) return { actif: false, envoyer: async () => { throw new Error('E-mail non configuré'); } };
  const port = Number(env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({ host: hote, port, secure: port === 465, auth: { user: utilisateur, pass: mdp } });
  const de = env.SMTP_EXPEDITEUR ?? `All-In Club <${utilisateur}>`;
  return {
    actif: true,
    envoyer: async (a, sujet, texte, html) => { await transport.sendMail({ from: de, to: a, subject: sujet, text: texte, html }); },
  };
}
