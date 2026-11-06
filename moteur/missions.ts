/**
 * Missions du jour : 3 petits défis par joueur et par jour, récompensés en Clubs ♣.
 * Les 3 faites donnent un tour de Grande Roue en plus.
 */

/** Ce qui fait avancer une mission (signalé par le serveur quand ça arrive). */
export type ActionMission =
  | 'mainPoker' | 'potPoker' | 'mancheBJ' | 'gagneBJ' | 'blackjack'
  | 'tourRoulette' | 'pleinRoulette' | 'ticket' | 'ticketGagnant' | 'keno' | 'loto';

export interface DefMission { cle: ActionMission; texte: string; objectif: number; recompense: number; groupe: 'casino' | 'kiosque' }

export const MISSIONS: DefMission[] = [
  { cle: 'mainPoker', texte: 'Joue 10 mains de poker', objectif: 10, recompense: 500, groupe: 'casino' },
  { cle: 'potPoker', texte: 'Remporte 3 pots au poker', objectif: 3, recompense: 600, groupe: 'casino' },
  { cle: 'mancheBJ', texte: 'Joue 8 manches de Black Jack', objectif: 8, recompense: 400, groupe: 'casino' },
  { cle: 'gagneBJ', texte: 'Gagne 3 manches au Black Jack', objectif: 3, recompense: 500, groupe: 'casino' },
  { cle: 'blackjack', texte: 'Fais un Black Jack', objectif: 1, recompense: 600, groupe: 'casino' },
  { cle: 'tourRoulette', texte: 'Mise sur 5 tours de roulette', objectif: 5, recompense: 400, groupe: 'casino' },
  { cle: 'pleinRoulette', texte: 'Touche un numéro en plein à la roulette', objectif: 1, recompense: 800, groupe: 'casino' },
  { cle: 'ticket', texte: 'Gratte 2 tickets', objectif: 2, recompense: 300, groupe: 'kiosque' },
  { cle: 'ticketGagnant', texte: 'Gratte un ticket gagnant', objectif: 1, recompense: 400, groupe: 'kiosque' },
  { cle: 'keno', texte: 'Joue une grille de Keno', objectif: 1, recompense: 300, groupe: 'kiosque' },
  { cle: 'loto', texte: 'Joue une grille au Loto Flash', objectif: 1, recompense: 300, groupe: 'kiosque' },
];

/** Petit hachage stable (même joueur + même jour = mêmes missions, même après un redémarrage). */
function hacher(t: string) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Les 3 missions d'un joueur pour un jour : 2 au Casino et 1 au Kiosque, toutes différentes. */
export function missionsDuJour(utilisateur: number, jour: string): DefMission[] {
  let graine = hacher(`${utilisateur}:${jour}`);
  const suivant = (n: number) => { graine = (Math.imul(graine, 1103515245) + 12345) >>> 0; return graine % n; };
  const casino = MISSIONS.filter((m) => m.groupe === 'casino');
  const kiosque = MISSIONS.filter((m) => m.groupe === 'kiosque');
  const a = casino.splice(suivant(casino.length), 1)[0];
  const b = casino.splice(suivant(casino.length), 1)[0];
  const c = kiosque[suivant(kiosque.length)];
  return [a, b, c];
}
