/**
 * Relecture d'une main enregistrée : découpe les événements en étapes et reconstruit
 * l'état de la table après chacune, pour la scène PixiJS.
 */
import type { EnregistrementMain } from '../../../moteur/analyse';
import type { VueSalle, VueSiege, EvenementPublic } from '../../../moteur/salle';
import { REGLAGES_DEFAUT } from '../../../moteur/salle';
import type { AvatarId } from '../../../moteur/avatars';
import { fmt } from '../art/rendu';

export interface Etape { evenements: EvenementPublic[]; etat: VueSalle; texte: string }

export function preparerRelecture(rec: EnregistrementMain, moi: string | null): { initial: VueSalle; etapes: Etape[] } {
  const monJoueur = rec.joueurs.find((j) => j.id === moi) ?? null;
  const nom = (s: number) => rec.joueurs.find((j) => j.siege === s)?.nom ?? '?';
  const places = Math.max(rec.places, ...rec.joueurs.map((j) => j.siege + 1));

  // Modèle courant
  const tapis = new Map(rec.joueurs.map((j) => [j.siege, j.tapisDebut]));
  const mise = new Map<number, number>();
  const couche = new Set<number>();
  const montrees = new Map<number, { cartes: number[]; main: string }>();
  let tableau: number[] = [];
  let pot = 0;
  let distribue = false, fini = false;

  const vue = (): VueSalle => {
    const sieges: (VueSiege | null)[] = Array.from({ length: places }, () => null);
    for (const j of rec.joueurs) {
      const visibles = montrees.get(j.siege)?.cartes ?? (j.id === moi && distribue ? j.cartes : null);
      sieges[j.siege] = {
        siege: j.siege, id: j.id, nom: j.nom, avatar: j.avatar as AvatarId, bot: !j.id.startsWith('u') && j.id !== 'moi',
        tapis: tapis.get(j.siege) ?? 0, mise: fini ? 0 : mise.get(j.siege) ?? 0, dansLaMain: distribue, couche: couche.has(j.siege),
        aTapis: distribue && !fini && (tapis.get(j.siege) ?? 0) === 0, absent: false, deconnecte: false, attendGB: false,
        cartes: visibles, aDesCartes: distribue && !couche.has(j.siege), main: montrees.get(j.siege)?.main ?? null,
        recue: 0, recavesRestantes: 0, cadre: 'aucun',
      };
    }
    return {
      id: 'relecture', code: '', reglages: { ...REGLAGES_DEFAUT, nom: rec.table, pb: rec.pb, gb: rec.gb, places, tempsReflexion: 0, filtreInsultes: true },
      statut: 'en_jeu', hote: '', moi: moi ?? '', monSiege: monJoueur ? monJoueur.siege : null, sieges, spectateurs: [],
      numeroMain: rec.numero, mainEnCours: distribue && !fini, bouton: rec.bouton, tableau: tableau.slice(), pot, potTotal: pot,
      aParler: null, resteMs: null, banqueMs: null, maBanque: 0, legales: null, resultats: null, debut: null, finPrevue: null,
    };
  };

  const initial = vue();
  const etapes: Etape[] = [];
  let lot: EvenementPublic[] = [{ t: 'nouvelleMain', numero: rec.numero, bouton: rec.bouton }];
  let texte = 'Blindes et donne';
  const couper = (nouveauTexte: string) => {
    if (lot.length) etapes.push({ evenements: lot, etat: vue(), texte });
    lot = [];
    texte = nouveauTexte;
  };

  for (const e of rec.evenements) {
    // Une étape commence à chaque action, à chaque rue et à l'abattage
    if (e.t === 'action') {
      const libelle = { coucher: 'se couche', parole: 'parle', suivre: 'suit', miser: `mise ${fmt(e.montant)}`, relancer: `relance à ${fmt(e.montant)}`, tapis: 'fait tapis' }[e.action];
      couper(`${nom(e.siege)} ${e.tapis && e.action !== 'coucher' ? (e.action === 'suivre' ? 'suit à tapis' : 'fait tapis') : libelle}`);
    } else if (e.t === 'rue') couper(e.phase === 'flop' ? 'Flop' : e.phase === 'turn' ? 'Turn' : 'River');
    else if ((e.t === 'abattage' || e.t === 'jette') && !texte.startsWith('Abattage')) couper('Abattage');
    else if (e.t === 'pot' && !texte.startsWith('Abattage') && !texte.startsWith('Pot')) couper('Pot');

    lot.push(e);
    switch (e.t) {
      case 'blinde':
        tapis.set(e.siege, (tapis.get(e.siege) ?? 0) - e.montant);
        if (e.mort) pot += e.montant; else mise.set(e.siege, (mise.get(e.siege) ?? 0) + e.montant);
        break;
      case 'donne':
        distribue = true;
        if (monJoueur?.cartes) lot.push({ t: 'mesCartes', cartes: monJoueur.cartes });
        break;
      case 'action': {
        const ajoute = e.miseTour - (mise.get(e.siege) ?? 0);
        if (ajoute > 0) { tapis.set(e.siege, (tapis.get(e.siege) ?? 0) - ajoute); mise.set(e.siege, e.miseTour); }
        if (e.action === 'coucher') couche.add(e.siege);
        break;
      }
      case 'remboursement':
        mise.set(e.siege, (mise.get(e.siege) ?? 0) - e.montant);
        tapis.set(e.siege, (tapis.get(e.siege) ?? 0) + e.montant);
        break;
      case 'ramassage':
        pot = e.pot;
        mise.clear();
        break;
      case 'rue':
        tableau = tableau.concat(e.cartes);
        break;
      case 'abattage':
        montrees.set(e.siege, { cartes: e.cartes, main: e.main });
        break;
      case 'pot':
        for (const g of e.gagnants) { tapis.set(g.siege, (tapis.get(g.siege) ?? 0) + g.montant); pot = Math.max(0, pot - g.montant); }
        if (e.main && !texte.includes('remporte')) {
          const g = e.gagnants.map((x) => nom(x.siege)).join(' et ');
          texte = `${texte === 'Abattage' ? 'Abattage : ' : ''}${g} remporte ${fmt(e.montant)} avec ${e.main.toLowerCase()}`;
        } else if (!e.main) texte = `${e.gagnants.map((x) => nom(x.siege)).join(' et ')} remporte ${fmt(e.montant)} sans montrer`;
        break;
      case 'fin':
        fini = true;
        break;
    }
  }
  couper('');
  return { initial, etapes };
}
