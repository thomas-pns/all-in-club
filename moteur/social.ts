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
