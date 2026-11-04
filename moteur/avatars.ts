import { Personnalite } from './bots.js';

/** Les 12 personnages du club. Quand un bot prend un avatar, il prend aussi son nom et sa personnalité. */
export const AVATARS = [
  { id: 'renard',     nom: 'Roux',      personnalite: 'bluffeur' },
  { id: 'ours',       nom: 'Bruno',     personnalite: 'prudent' },
  { id: 'pingouin',   nom: 'Pipo',      personnalite: 'imprevisible' },
  { id: 'raton',      nom: 'Rocky',     personnalite: 'agressif' },
  { id: 'grenouille', nom: 'Gribouille', personnalite: 'suiveur' },
  { id: 'hibou',      nom: 'Hector',    personnalite: 'prudent' },
  { id: 'chat',       nom: 'Minette',   personnalite: 'bluffeur' },
  { id: 'robot',      nom: 'Bip-Bop',   personnalite: 'imprevisible' },
  { id: 'mamie',      nom: 'Mamie Jo',  personnalite: 'suiveur' },
  { id: 'cowboy',     nom: 'Lucky',     personnalite: 'agressif' },
  { id: 'pieuvre',    nom: 'Octave',    personnalite: 'imprevisible' },
  { id: 'croco',      nom: 'Croc',      personnalite: 'agressif' },
] as const satisfies readonly { id: string; nom: string; personnalite: Personnalite }[];

export type AvatarId = (typeof AVATARS)[number]['id'];
export const AVATAR_IDS = AVATARS.map((a) => a.id) as AvatarId[];
export const estAvatar = (x: unknown): x is AvatarId => typeof x === 'string' && (AVATAR_IDS as string[]).includes(x);
