/**
 * Durée des animations de chaque événement (ms). Le serveur attend ces durées avant de
 * passer la parole, et le client anime avec les mêmes : tout le monde reste synchronisé.
 */
import { Evenement } from './main.js';

export const RYTHME = {
  blinde: 350,
  donneParCarte: 110,
  action: 450,
  ramassage: 500,
  rue: 750,         // par carte du flop on ajoute retournement
  remboursement: 350,
  abattage: 900,    // par main retournée
  jette: 250,
  pot: 1400,
  fin: 0,
  entreMains: 1800, // pause avant la donne suivante
};

export function dureeAnimation(evts: Evenement[], vitesse = 1): number {
  let d = 0;
  for (const e of evts) {
    switch (e.t) {
      case 'blinde': d += RYTHME.blinde; break;
      case 'donne': d += RYTHME.donneParCarte * e.ordre.length * 2 + 300; break;
      case 'action': d += RYTHME.action; break;
      case 'ramassage': d += RYTHME.ramassage; break;
      case 'rue': d += RYTHME.rue + (e.cartes.length - 1) * 150; break;
      case 'remboursement': d += RYTHME.remboursement; break;
      case 'abattage': d += RYTHME.abattage; break;
      case 'jette': d += RYTHME.jette; break;
      case 'pot': d += RYTHME.pot; break;
    }
  }
  return Math.round(d / vitesse);
}
