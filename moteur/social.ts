/** Émotes et filtre du chat. */

export const EMOTES = [
  { id: 'pouce', nom: 'Bien vu' },
  { id: 'rire', nom: 'Mort de rire' },
  { id: 'larme', nom: 'Snif' },
  { id: 'colere', nom: 'Grrr' },
  { id: 'coeur', nom: 'Cœur' },
  { id: 'applaudir', nom: 'Bravo' },
  { id: 'bienjoue', nom: 'Bien joué' },
  { id: 'lunettes', nom: 'Trop cool' },
  { id: 'poisson', nom: 'Poisson' },
  { id: 'requin', nom: 'Requin' },
  { id: 'sablier', nom: 'Dépêche-toi' },
  { id: 'champagne', nom: 'Champagne' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];

// Liste volontairement courte : on masque les insultes les plus courantes, pas le langage familier.
const MOTS = [
  'connard', 'connasse', 'conasse', 'salope', 'salaud', 'enculé', 'encule', 'enfoiré', 'enfoire', 'pute', 'putain',
  'batard', 'bâtard', 'fdp', 'ntm', 'nique', 'niquer', 'pd', 'tg', 'ta gueule', 'bouffon', 'abruti', 'débile', 'debile',
  'merde', 'con', 'conne', 'couille', 'couilles', 'bite', 'chier',
];
const MOTIF = new RegExp(`(^|[^\\p{L}])(${MOTS.map((m) => m.replace(/ /g, '\\s+')).join('|')})(?=$|[^\\p{L}])`, 'giu');

export function filtrerTexte(t: string): string {
  return t.replace(MOTIF, (_m, avant: string, mot: string) => avant + mot[0] + '★'.repeat(Math.max(1, mot.length - 1)));
}

/** Chat d'une salle : anti-spam, filtre, derniers messages. Utilisé par les tables de Black Jack. */
export interface MessageChatSocial { de: string; nom: string; avatar: string; texte: string; t: number }
export class GestionSocial {
  messages: MessageChatSocial[] = [];
  private antiSpam = new Map<string, { messages: number[]; emote: number }>();

  private compte(id: string) {
    let a = this.antiSpam.get(id);
    if (!a) { a = { messages: [], emote: -Infinity }; this.antiSpam.set(id, a); }
    return a;
  }

  /** Renvoie le message à diffuser, ou une erreur en texte. */
  ecrire(m: { id: string; nom: string; avatar: string }, texte: string, maintenant: number, filtre: boolean): MessageChatSocial | string | null {
    let propre = String(texte ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!propre) return null;
    const a = this.compte(m.id);
    a.messages = a.messages.filter((x) => maintenant - x < 10_000);
    if (a.messages.length >= 5 || (a.messages.length && maintenant - a.messages[a.messages.length - 1] < 1000)) return 'Doucement ! Un message par seconde au maximum';
    a.messages.push(maintenant);
    if (filtre) propre = filtrerTexte(propre);
    const msg = { de: m.id, nom: m.nom, avatar: m.avatar, texte: propre, t: maintenant };
    this.messages.push(msg);
    if (this.messages.length > 100) this.messages.shift();
    return msg;
  }

  emoteAutorisee(id: string, maintenant: number): boolean {
    const a = this.compte(id);
    if (maintenant - a.emote < 3000) return false;
    a.emote = maintenant;
    return true;
  }
}
