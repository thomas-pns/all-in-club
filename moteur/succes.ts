/**
 * Statistiques cumulées d'un joueur, et les 25 succès d'All-In Club.
 * Les succès sont évalués par le serveur ; le jeu affiche la liste qu'il reçoit.
 */
import { Categorie } from './evaluation.js';
import { FaitsJoueur } from './analyse.js';

export interface Stats {
  mains: number;
  vpip: number;
  pfr: number;
  agressions: number;
  passifs: number;
  abattages: number;
  abattagesGagnes: number;
  gainsSansAbattage: number;
  potsGagnes: number;
  plusGrosPot: number;
  meilleureScore: number;
  meilleureTexte: string;
  parties: number;
  partiesGagnees: number;
  bilanTapis: number;        // somme des bilans, en tapis de départ
  meilleurePartie: number;   // meilleur bilan d'une partie, en tapis de départ
  tapisGagnes: number;
  elimines: number;
  bluffs: number;
  badBeats: number;
  quintes: number;
  couleurs: number;
  fulls: number;
  carres: number;
  quintesFlush: number;
  messages: number;
  emotes: number;
}

export const STATS_VIDES: Stats = {
  mains: 0, vpip: 0, pfr: 0, agressions: 0, passifs: 0, abattages: 0, abattagesGagnes: 0, gainsSansAbattage: 0,
  potsGagnes: 0, plusGrosPot: 0, meilleureScore: -1, meilleureTexte: '', parties: 0, partiesGagnees: 0, bilanTapis: 0,
  meilleurePartie: 0, tapisGagnes: 0, elimines: 0, bluffs: 0, badBeats: 0, quintes: 0, couleurs: 0, fulls: 0, carres: 0,
  quintesFlush: 0, messages: 0, emotes: 0,
};

/** Ajoute une main aux statistiques. */
export function cumulerMain(s: Stats, f: FaitsJoueur): Stats {
  const c = f.categorieGagnante;
  const r: Stats = {
    ...s,
    mains: s.mains + 1,
    vpip: s.vpip + (f.vpip ? 1 : 0),
    pfr: s.pfr + (f.pfr ? 1 : 0),
    agressions: s.agressions + f.agressions,
    passifs: s.passifs + f.passifs,
    abattages: s.abattages + (f.abattage ? 1 : 0),
    abattagesGagnes: s.abattagesGagnes + (f.gagneAbattage ? 1 : 0),
    gainsSansAbattage: s.gainsSansAbattage + (f.gagneSansAbattage ? 1 : 0),
    potsGagnes: s.potsGagnes + (f.potGagne > 0 ? 1 : 0),
    plusGrosPot: Math.max(s.plusGrosPot, f.potGagne),
    tapisGagnes: s.tapisGagnes + (f.tapisGagne ? 1 : 0),
    elimines: s.elimines + f.elimines,
    bluffs: s.bluffs + (f.bluff ? 1 : 0),
    badBeats: s.badBeats + (f.badBeat ? 1 : 0),
    quintes: s.quintes + (c === Categorie.Quinte ? 1 : 0),
    couleurs: s.couleurs + (c === Categorie.Couleur ? 1 : 0),
    fulls: s.fulls + (c === Categorie.Full ? 1 : 0),
    carres: s.carres + (c === Categorie.Carre ? 1 : 0),
    quintesFlush: s.quintesFlush + (c === Categorie.QuinteFlush ? 1 : 0),
  };
  if (f.meilleure && f.meilleure.score > s.meilleureScore) { r.meilleureScore = f.meilleure.score; r.meilleureTexte = f.meilleure.texte; }
  return r;
}

/* ------------------------------------------------------------------ */

export type Recompense = { type: 'cadre'; id: string; nom: string } | { type: 'dos'; id: string; nom: string };

/** Ce qui s'est passé juste avant d'évaluer les succès. */
export interface ContexteSucces {
  stats: Stats;
  main?: FaitsJoueur & { tapisDepartTable: number; royale: boolean };
  partie?: { gagnee: boolean; comeback: boolean };
}

export interface DefinitionSucces {
  id: string;
  titre: string;
  description: string;
  icone: string;
  recompense?: Recompense;
  test: (c: ContexteSucces) => boolean;
}

export const SUCCES: DefinitionSucces[] = [
  { id: 'premiere-donne', titre: 'Première donne', description: 'Jouer sa première main', icone: '🃏', test: (c) => c.stats.mains >= 1 },
  { id: 'habitue', titre: 'Habitué du club', description: 'Jouer 100 mains', icone: '🪑', recompense: { type: 'dos', id: 'ocean', nom: 'Océan' }, test: (c) => c.stats.mains >= 100 },
  { id: 'marathon', titre: 'Marathon', description: 'Jouer 1 000 mains', icone: '🏃', recompense: { type: 'cadre', id: 'neon', nom: 'Néon' }, test: (c) => c.stats.mains >= 1000 },
  { id: 'premier-pot', titre: 'Premier pot', description: 'Gagner un pot', icone: '🍯', recompense: { type: 'dos', id: 'corail', nom: 'Corail' }, test: (c) => c.stats.potsGagnes >= 1 },
  { id: 'collectionneur', titre: 'Collectionneur', description: 'Gagner 100 pots', icone: '💰', recompense: { type: 'cadre', id: 'argent', nom: 'Argent' }, test: (c) => c.stats.potsGagnes >= 100 },
  { id: 'gros-poisson', titre: 'Gros poisson', description: 'Gagner un pot de plus de 5 tapis de départ', icone: '🐟', test: (c) => !!c.main && c.main.potGagne > 5 * c.main.tapisDepartTable },
  { id: 'double-ou-rien', titre: 'Double ou rien', description: 'Gagner un pot en étant à tapis', icone: '🎲', test: (c) => c.stats.tapisGagnes >= 1 },
  { id: 'kamikaze', titre: 'Kamikaze', description: 'Gagner 10 pots à tapis', icone: '💥', recompense: { type: 'cadre', id: 'feu', nom: 'Feu' }, test: (c) => c.stats.tapisGagnes >= 10 },
  { id: 'coup-de-bluff', titre: 'Coup de bluff', description: 'Gagner sans abattage après avoir misé à la river avec moins qu\'une paire', icone: '😎', test: (c) => c.stats.bluffs >= 1 },
  { id: 'bluffeur-ne', titre: 'Bluffeur né', description: 'Réussir 10 bluffs', icone: '🎭', recompense: { type: 'dos', id: 'emeraude', nom: 'Émeraude' }, test: (c) => c.stats.bluffs >= 10 },
  { id: 'quinte', titre: 'En ligne', description: 'Gagner avec une quinte', icone: '📏', test: (c) => c.stats.quintes >= 1 },
  { id: 'couleur', titre: 'Haut en couleur', description: 'Gagner avec une couleur', icone: '🎨', test: (c) => c.stats.couleurs >= 1 },
  { id: 'full', titre: 'Maison pleine', description: 'Gagner avec un full', icone: '🏠', test: (c) => c.stats.fulls >= 1 },
  { id: 'full-house', titre: 'Agent immobilier', description: 'Gagner 10 fois avec un full', icone: '🏘️', recompense: { type: 'dos', id: 'nuit', nom: 'Nuit étoilée' }, test: (c) => c.stats.fulls >= 10 },
  { id: 'carre', titre: 'Carré magique', description: 'Gagner avec un carré', icone: '🟪', test: (c) => c.stats.carres >= 1 },
  { id: 'carre-as', titre: 'Carré d\'as', description: 'Gagner avec un carré d\'as', icone: '🅰️', recompense: { type: 'cadre', id: 'diamant', nom: 'Diamant' }, test: (c) => !!c.main?.carreAs },
  { id: 'quinte-flush', titre: 'Quinte flush', description: 'Gagner avec une quinte flush', icone: '⚡', recompense: { type: 'dos', id: 'or', nom: 'Or' }, test: (c) => c.stats.quintesFlush >= 1 },
  { id: 'royale', titre: 'Royal !', description: 'Obtenir une quinte flush royale', icone: '👑', recompense: { type: 'cadre', id: 'arc', nom: 'Arc-en-ciel' }, test: (c) => !!c.main?.royale },
  { id: 'coup-double', titre: 'Coup double', description: 'Éliminer 2 joueurs dans la même main', icone: '✌️', test: (c) => (c.main?.elimines ?? 0) >= 2 },
  { id: 'chasseur', titre: 'Chasseur de têtes', description: 'Éliminer 10 joueurs', icone: '🦈', recompense: { type: 'cadre', id: 'requin', nom: 'Requin' }, test: (c) => c.stats.elimines >= 10 },
  { id: 'bad-beat', titre: 'Bad beat', description: 'Perdre à l\'abattage avec un full ou mieux', icone: '💔', recompense: { type: 'cadre', id: 'glace', nom: 'Glace' }, test: (c) => c.stats.badBeats >= 1 },
  { id: 'patron', titre: 'Patron de la table', description: 'Gagner une partie', icone: '🏆', recompense: { type: 'cadre', id: 'or', nom: 'Or' }, test: (c) => c.stats.partiesGagnees >= 1 },
  { id: 'legende', titre: 'Légende du club', description: 'Gagner 10 parties', icone: '🌟', recompense: { type: 'dos', id: 'legende', nom: 'Légende' }, test: (c) => c.stats.partiesGagnees >= 10 },
  { id: 'le-retour', titre: 'Le retour', description: 'Gagner une partie après être descendu sous 10 % de son tapis', icone: '🔥', test: (c) => !!c.partie?.gagnee && !!c.partie.comeback },
  { id: 'bavard', titre: 'Bavard', description: 'Envoyer 100 messages ou émotes', icone: '💬', test: (c) => c.stats.messages + c.stats.emotes >= 100 },
];

/** Succès débloqués par ce contexte et pas encore obtenus. */
export function nouveauxSucces(c: ContexteSucces, deja: Set<string>): DefinitionSucces[] {
  return SUCCES.filter((s) => !deja.has(s.id) && s.test(c));
}

/** Liste publique (sans les fonctions). */
export const listeSucces = () => SUCCES.map(({ test: _t, ...s }) => s);

export const CADRES = [{ id: 'aucun', nom: 'Aucun' }, ...SUCCES.flatMap((s) => (s.recompense?.type === 'cadre' ? [{ id: s.recompense.id, nom: s.recompense.nom }] : []))];
export const DOS = [{ id: 'prune', nom: 'Prune' }, ...SUCCES.flatMap((s) => (s.recompense?.type === 'dos' ? [{ id: s.recompense.id, nom: s.recompense.nom }] : []))];
