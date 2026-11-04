/**
 * Analyse d'une main terminée : ce que chaque joueur y a fait (pour les statistiques et les succès),
 * et l'enregistrement de la main pour l'historique (avec filtrage des cartes cachées).
 */
import { Carte } from './cartes.js';
import { EtatMain, Evenement } from './main.js';
import { evaluer, categorie, Categorie, decrire } from './evaluation.js';

export interface FaitsJoueur {
  id: string;
  siege: number;
  vpip: boolean;            // a mis des jetons volontairement avant le flop
  pfr: boolean;             // a relancé avant le flop
  agressions: number;       // mises et relances après le flop
  passifs: number;          // paroles et suivis après le flop
  abattage: boolean;        // est allé jusqu'à l'abattage
  gagneAbattage: boolean;
  gagneSansAbattage: boolean;
  potGagne: number;         // jetons gagnés dans les pots
  net: number;              // variation du tapis sur la main
  meilleure: { score: number; texte: string } | null; // sa main finale s'il a vu les 5 cartes
  categorieGagnante: Categorie | null; // combinaison avec laquelle il a gagné à l'abattage
  carreAs: boolean;
  bluff: boolean;           // gagné sans abattage après une mise/relance à la river, avec moins qu'une paire
  tapisGagne: boolean;      // était à tapis et a gagné un pot
  elimines: number;         // joueurs mis à sec par lui sur cette main
  badBeat: boolean;         // a perdu à l'abattage avec un full ou mieux
}

export function analyserMain(main: EtatMain): FaitsJoueur[] {
  const r = main.resultat;
  if (!r) throw new Error('Main non terminée');
  const faits = new Map<number, FaitsJoueur>();
  for (const p of main.joueurs) {
    faits.set(p.siege, {
      id: p.id, siege: p.siege, vpip: false, pfr: false, agressions: 0, passifs: 0,
      abattage: !r.sansAbattage && !p.couche, gagneAbattage: false, gagneSansAbattage: false,
      potGagne: r.gains[p.siege] ?? 0, net: p.tapis - p.tapisDepart, meilleure: null, categorieGagnante: null,
      carreAs: false, bluff: false, tapisGagne: false, elimines: 0, badBeat: false,
    });
  }
  let rue = 'preflop';
  let agresseurRiver: number | null = null;
  for (const e of main.evenements) {
    if (e.t === 'rue') rue = e.phase;
    if (e.t !== 'action') continue;
    const f = faits.get(e.siege)!;
    const agressif = e.action === 'miser' || e.action === 'relancer';
    if (rue === 'preflop') {
      if (agressif || e.action === 'suivre') f.vpip = true;
      if (agressif) f.pfr = true;
    } else if (agressif) f.agressions++;
    else if (e.action === 'suivre' || e.action === 'parole') f.passifs++;
    if (rue === 'river' && agressif) agresseurRiver = e.siege;
  }

  for (const p of main.joueurs) {
    const f = faits.get(p.siege)!;
    const gagne = (r.gains[p.siege] ?? 0) > 0;
    if (!p.couche && main.tableau.length === 5) {
      const score = evaluer(p.cartes.concat(main.tableau));
      f.meilleure = { score, texte: decrire(score) };
    }
    if (gagne && r.sansAbattage) {
      f.gagneSansAbattage = true;
      if (agresseurRiver === p.siege && main.tableau.length === 5 && categorie(evaluer(p.cartes.concat(main.tableau))) < Categorie.Paire) f.bluff = true;
    }
    if (gagne && !r.sansAbattage) {
      f.gagneAbattage = true;
      const s = evaluer(p.cartes.concat(main.tableau));
      f.categorieGagnante = categorie(s);
      f.carreAs = categorie(s) === Categorie.Carre && Math.floor(s / 15 ** 4) % 15 === 14;
    }
    if (!gagne && f.abattage && f.meilleure && categorie(f.meilleure.score) >= Categorie.Full) f.badBeat = true;
    // À tapis et gagnant : il a doublé (au moins en partie)
    if (gagne && p.tapisDepart > 0 && p.miseTotale >= p.tapisDepart) f.tapisGagne = true; // tout son tapis était engagé
  }

  // Éliminations : joueurs mis à sec sur cette main, attribués au plus gros gagnant
  const asec = main.joueurs.filter((p) => p.tapis === 0 && p.tapisDepart > 0);
  if (asec.length) {
    const gagnant = [...faits.values()].filter((f) => f.potGagne > 0).sort((a, b) => b.potGagne - a.potGagne)[0];
    if (gagnant && !asec.some((p) => p.siege === gagnant.siege)) gagnant.elimines = asec.length;
  }
  return [...faits.values()];
}

/* ------------------------------------------------------------------ */
/* Enregistrement pour l'historique                                     */

export interface JoueurEnregistre { siege: number; id: string; nom: string; avatar: string; tapisDebut: number; cartes: Carte[] | null; net: number }

export interface EnregistrementMain {
  date: number;
  table: string;
  numero: number;
  pb: number;
  gb: number;
  places: number;
  bouton: number;
  joueurs: JoueurEnregistre[];
  evenements: Evenement[];
  tableau: Carte[];
  pot: number;
  gagnants: { siege: number; montant: number; main: string | null }[];
}

export function enregistrerMain(main: EtatMain, meta: { table: string; numero: number; places: number; membre: (id: string) => { nom: string; avatar: string } }): EnregistrementMain {
  const r = main.resultat!;
  const gagnants: EnregistrementMain['gagnants'] = [];
  for (const e of main.evenements) if (e.t === 'pot') for (const g of e.gagnants) {
    const x = gagnants.find((y) => y.siege === g.siege);
    if (x) x.montant += g.montant; else gagnants.push({ siege: g.siege, montant: g.montant, main: e.main });
  }
  void r;
  return {
    date: Date.now(), table: meta.table, numero: meta.numero, pb: main.pb, gb: main.gb, places: meta.places, bouton: main.bouton,
    joueurs: main.joueurs.map((p) => {
      const m = meta.membre(p.id);
      return { siege: p.siege, id: p.id, nom: m.nom, avatar: m.avatar, tapisDebut: p.tapisDepart, cartes: p.cartes.slice(), net: p.tapis - p.tapisDepart };
    }),
    evenements: main.evenements.slice(),
    tableau: main.tableau.slice(),
    pot: gagnants.reduce((s, g) => s + g.montant, 0),
    gagnants,
  };
}

/** Version d'un enregistrement que `pour` a le droit de voir : ses cartes et celles montrées à l'abattage. */
export function filtrerEnregistrement(e: EnregistrementMain, pour: string): EnregistrementMain {
  const montrees = new Set(e.evenements.filter((x) => x.t === 'abattage').map((x) => (x as { siege: number }).siege));
  return { ...e, joueurs: e.joueurs.map((j) => ({ ...j, cartes: j.id === pour || montrees.has(j.siege) ? j.cartes : null })) };
}
