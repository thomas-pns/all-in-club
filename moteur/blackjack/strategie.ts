/**
 * Stratégie de base du Black Jack (6 jeux, croupier s'arrête à 17, doubler après séparation, abandon).
 * C'est le meilleur coup « en moyenne » : elle sert au bouton Conseil.
 */
import { Carte } from '../cartes.js';
import { ActionBJ, LegalesBJ, valeurCarte, valeurMain } from './regles.js';

export interface Conseil { action: ActionBJ; pourquoi: string }

export function conseil(cartes: Carte[], carteCroupier: Carte, L: LegalesBJ): Conseil {
  const c = valeurCarte(carteCroupier); // 2..11 (11 = As)
  const { total, souple } = valeurMain(cartes);
  const nom = c === 11 ? 'un As' : c === 10 ? 'un 10' : `un ${c}`;
  const faible = c >= 2 && c <= 6;
  const res = (action: ActionBJ, pourquoi: string, repli?: ActionBJ, pourquoiRepli?: string): Conseil =>
    L[action] ? { action, pourquoi } : { action: repli ?? 'tirer', pourquoi: pourquoiRepli ?? pourquoi };

  // Paires
  if (L.separer && cartes.length === 2 && valeurCarte(cartes[0]) === valeurCarte(cartes[1])) {
    const p = valeurCarte(cartes[0]);
    const sep = (pourquoi: string) => ({ action: 'separer' as const, pourquoi });
    if (p === 11) return sep('Toujours séparer les As : chacun a une belle chance de faire 21.');
    if (p === 8) return sep('Toujours séparer les 8 : 16 est la pire main, deux mains de 8 valent bien mieux.');
    if (p === 9 && ![7, 10, 11].includes(c)) return sep(`Deux 9 contre ${nom} : séparer pour faire deux bonnes mains.`);
    if (p === 7 && c <= 7) return sep(`Deux 7 contre ${nom} : séparer, le croupier est dans une position moyenne.`);
    if (p === 6 && c <= 6) return sep(`Deux 6 contre ${nom} : séparer, le croupier risque de dépasser.`);
    if (p === 4 && (c === 5 || c === 6)) return sep(`Deux 4 contre ${nom} : séparer, le croupier est très faible.`);
    if ((p === 2 || p === 3) && c <= 7) return sep(`Petite paire contre ${nom} : séparer.`);
  }

  // Abandon
  if (L.abandonner && !souple && cartes.length === 2) {
    if (total === 16 && [9, 10, 11].includes(c) && !(valeurCarte(cartes[0]) === 8 && valeurCarte(cartes[1]) === 8))
      return { action: 'abandonner', pourquoi: `16 contre ${nom}, c'est presque perdu : récupère la moitié de ta mise.` };
    if (total === 15 && c === 10) return { action: 'abandonner', pourquoi: `15 contre un 10 : abandonner limite la casse.` };
  }

  // Mains souples (un As compté 11)
  if (souple) {
    if (total >= 20) return { action: 'rester', pourquoi: `${total} souple : excellente main, reste.` };
    if (total === 19) return c === 6 ? res('doubler', '19 souple contre un 6 : double, le croupier est très faible.', 'rester', '19 souple : reste.') : { action: 'rester', pourquoi: '19 souple : reste.' };
    if (total === 18) {
      if (faible) return res('doubler', `18 souple contre ${nom} : double.`, 'rester', '18 souple : reste.');
      if (c === 7 || c === 8) return { action: 'rester', pourquoi: `18 souple contre ${nom} : reste.` };
      return { action: 'tirer', pourquoi: `18 souple contre ${nom} : tire, tu ne peux pas dépasser.` };
    }
    if (total === 17 && c >= 3 && c <= 6) return res('doubler', `17 souple contre ${nom} : double.`);
    if ((total === 15 || total === 16) && c >= 4 && c <= 6) return res('doubler', `${total} souple contre ${nom} : double.`);
    if ((total === 13 || total === 14) && (c === 5 || c === 6)) return res('doubler', `${total} souple contre ${nom} : double.`);
    return { action: 'tirer', pourquoi: `${total} souple : tire sans risque, l'As peut redevenir 1.` };
  }

  // Mains dures
  if (total >= 17) return { action: 'rester', pourquoi: `${total} : reste, tirer serait trop risqué.` };
  if (total >= 13) return faible
    ? { action: 'rester', pourquoi: `${total} contre ${nom} : reste et laisse le croupier dépasser.` }
    : { action: 'tirer', pourquoi: `${total} contre ${nom} : le croupier est fort, il faut tirer.` };
  if (total === 12) return c >= 4 && c <= 6
    ? { action: 'rester', pourquoi: `12 contre ${nom} : reste, le croupier risque de dépasser.` }
    : { action: 'tirer', pourquoi: `12 contre ${nom} : tire.` };
  if (total === 11) return c !== 11 ? res('doubler', `11 contre ${nom} : double, c'est le meilleur moment !`) : { action: 'tirer', pourquoi: '11 contre un As : tire.' };
  if (total === 10) return c <= 9 ? res('doubler', `10 contre ${nom} : double.`) : { action: 'tirer', pourquoi: `10 contre ${nom} : tire.` };
  if (total === 9) return c >= 3 && c <= 6 ? res('doubler', `9 contre ${nom} : double.`) : { action: 'tirer', pourquoi: `9 contre ${nom} : tire.` };
  return { action: 'tirer', pourquoi: `${total} : tire, tu ne peux pas dépasser.` };
}
