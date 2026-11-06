/**
 * La cloche : les notifications du joueur (demandes d'amis, cadeaux, invitations, gains aux tirages
 * pendant son absence) et, en dessous, les derniers gros gains du Club.
 */
import { api } from '../reseau';
import { $, $$, esc, panneau, avecPieces } from './commun';
import type { Annonce } from '../../../serveur/activites';
import type { Notif } from '../../../serveur/boite';
export type { Notif };

const ICONES: Record<string, string> = { demande: '👋', accepte: '🤝', cadeau: '🎁', invitation: '🃏', tirage: '🎉', club: '📣' };

function quand(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export async function ouvrirCloche(annonces: Annonce[], rejoindre: (code: string) => void, toutLu: () => void) {
  const p = panneau(`<h2>Notifications</h2><div class="liste-notifs" data-notifs><span class="doux">Chargement…</span></div>
    <h3 style="margin:16px 0 8px">Les gros gains du Club</h3><div class="liste-notifs club" data-club></div>`);
  $('[data-club]', p.el).innerHTML = annonces.length
    ? annonces.slice(0, 8).map((a) => `<div class="notif"><span class="ico">🎉</span><span class="txt"><b>${esc(a.pseudo)}</b> ${avecPieces(esc(a.texte))}<small>${quand(a.date)}</small></span></div>`).join('')
    : '<span class="doux petit">Rien pour l\'instant</span>';
  try {
    const { notifs } = await api<{ notifs: Notif[] }>('/api/boite');
    const z = $('[data-notifs]', p.el);
    z.innerHTML = notifs.length ? notifs.map((n) => `<div class="notif ${n.lu ? '' : 'nouvelle'}"><span class="ico">${ICONES[n.genre] ?? '🔔'}</span>
      <span class="txt"><b>${esc(n.titre)}</b> ${avecPieces(esc(n.texte))}<small>${quand(n.date)}</small></span>
      ${n.genre === 'invitation' && n.code && Date.now() - n.date < 6 * 3_600_000 ? `<button class="btn btn-petit btn-or" data-code="${esc(n.code)}">Rejoindre</button>` : ''}</div>`).join('')
      : '<div class="vide-liste">Rien de neuf. Les demandes d\'amis, cadeaux, invitations et gains aux tirages pendant ton absence arriveront ici.</div>';
    $$('[data-code]', z).forEach((b) => b.onclick = () => { p.fermer(); rejoindre(b.dataset.code!); });
    if (notifs.some((n) => !n.lu)) { await api('/api/boite/lu', {}); toutLu(); }
  } catch { $('[data-notifs]', p.el).innerHTML = '<span class="doux">Notifications indisponibles</span>'; }
}
