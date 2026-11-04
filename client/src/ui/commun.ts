/** Outils d'interface partagés : échappement, notifications, panneaux, préférences. */
import { avatarSVG, Expression } from '../art/avatars';
import type { AvatarId } from '../../../moteur/avatars';
import { AVATARS } from '../../../moteur/avatars';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const $ = <T extends HTMLElement = HTMLElement>(sel: string, r: ParentNode = document) => r.querySelector(sel) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, r: ParentNode = document) => [...r.querySelectorAll(sel)] as T[];

export function html(s: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = s.trim();
  return t.content.firstElementChild as HTMLElement;
}

export function toast(texte: string, erreur = false, duree = 2800) {
  const zone = document.getElementById('toasts')!;
  const t = html(`<div class="toast ${erreur ? 'erreur' : ''}">${esc(texte)}</div>`);
  zone.appendChild(t);
  while (zone.children.length > 3) zone.firstElementChild!.remove();
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duree);
}

/** Ouvre un panneau modal. Renvoie l'élément et une fonction de fermeture. */
export function panneau(contenu: string, opts: { fermable?: boolean; onFerme?: () => void } = {}) {
  const v = html(`<div class="voile"><div class="panneau">${opts.fermable !== false ? '<button class="btn btn-petit btn-fantome fermer" data-fermer aria-label="Fermer">✕</button>' : ''}${contenu}</div></div>`);
  document.body.appendChild(v);
  const fermer = () => { if (v.isConnected) { v.remove(); opts.onFerme?.(); } };
  if (opts.fermable !== false) {
    v.addEventListener('click', (e) => { if (e.target === v || (e.target as HTMLElement).closest('[data-fermer]')) fermer(); });
  }
  return { el: v.querySelector('.panneau') as HTMLElement, fermer };
}

export function confirmer(question: string, oui = 'Oui', non = 'Annuler'): Promise<boolean> {
  return new Promise((ok) => {
    const p = panneau(`<h2>${esc(question)}</h2><div class="ligne" style="justify-content:flex-end;margin-top:10px"><button class="btn btn-fantome" data-non>${esc(non)}</button><button class="btn btn-or" data-oui>${esc(oui)}</button></div>`, { onFerme: () => ok(false) });
    $('[data-oui]', p.el).onclick = () => { ok(true); p.fermer(); };
    $('[data-non]', p.el).onclick = () => p.fermer();
  });
}

export const avatar = (id: AvatarId, ex: Expression = 'neutre', taille = 64) => avatarSVG(id, ex, taille);

export function choixAvatars(courant: AvatarId, onChoix: (a: AvatarId) => void): HTMLElement {
  const el = html(`<div class="avatars-choix">${AVATARS.map((a) => `<button type="button" data-a="${a.id}" class="${a.id === courant ? 'on' : ''}" title="${a.nom}">${avatarSVG(a.id, 'content', 90)}</button>`).join('')}</div>`);
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-a]') as HTMLElement | null;
    if (!b) return;
    $$('button', el).forEach((x) => x.classList.toggle('on', x === b));
    onChoix(b.dataset.a as AvatarId);
  });
  return el;
}

export function logoHTML(taille = '') {
  return `<div class="logo" style="${taille}"><svg class="jeton" viewBox="-50 -50 100 100"><circle r="46" fill="#FF6B5B" stroke="#2A1E3F" stroke-width="5"/><circle r="38" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="11 9"/><circle r="26" fill="#FF6B5B" stroke="#2A1E3F" stroke-opacity=".35" stroke-width="2"/><text y="13" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="38" fill="#2A1E3F">A</text></svg><span><b>ALL-IN</b> <i>CLUB</i></span></div>`;
}

/* ------------------------------ Préférences ------------------------------ */

export interface Prefs { quatreCouleurs: boolean; son: boolean; rapide: boolean; toujoursMontrer: boolean; cartesCachees: boolean }
const CLE = 'aic-prefs';
let prefs: Prefs = { quatreCouleurs: false, son: true, rapide: false, toujoursMontrer: false, cartesCachees: false };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(CLE) ?? '{}') }; } catch { /* rien */ }
const abonnes = new Set<(p: Prefs) => void>();
export const lirePrefs = () => prefs;
export function ecrirePrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(CLE, JSON.stringify(prefs)); } catch { /* rien */ }
  abonnes.forEach((f) => f(prefs));
}
export function suivrePrefs(f: (p: Prefs) => void) { abonnes.add(f); return () => abonnes.delete(f); }

/** Panneau des réglages personnels. */
export function ouvrirReglagesPerso(surToujoursMontrer?: (oui: boolean) => void) {
  const p = lirePrefs();
  const interrupteur = (cle: keyof Prefs, titre: string, aide: string) => `
    <label class="pre-actions" style="justify-content:flex-start;margin-bottom:8px"><label style="flex:1;justify-content:space-between">
      <span>${titre}<br><span class="doux petit" style="font-weight:600">${aide}</span></span>
      <input type="checkbox" data-cle="${cle}" ${p[cle] ? 'checked' : ''}></label></label>`;
  const pn = panneau(`<h2>Réglages</h2>
    ${interrupteur('cartesCachees', 'Cacher mes cartes', 'Pour jouer côte à côte : survoler ou maintenir le doigt pour les voir')}
    ${interrupteur('son', 'Sons', 'Cartes, jetons, tic-tac du temps')}
    ${interrupteur('quatreCouleurs', 'Cartes 4 couleurs', 'Pique noir, cœur rouge, carreau bleu, trèfle vert')}
    ${interrupteur('rapide', 'Animations rapides', 'Tout va deux fois plus vite')}
    ${interrupteur('toujoursMontrer', 'Toujours montrer ma main', 'Même quand je perds à l\'abattage')}`);
  $$('input[data-cle]', pn.el).forEach((i) => (i as HTMLInputElement).addEventListener('change', () => {
    const cle = i.dataset.cle as keyof Prefs;
    const v = (i as HTMLInputElement).checked;
    ecrirePrefs({ [cle]: v });
    if (cle === 'toujoursMontrer') surToujoursMontrer?.(v);
  }));
}

/* ------------------------------ Listes déroulantes du jeu ------------------------------ */

/**
 * Remplace l'affichage des <select> natifs (bordures blanches, style du système) par un menu
 * aux couleurs du jeu. Le <select> reste dans la page, caché : les formulaires le lisent comme avant.
 */
function embellir(select: HTMLSelectElement) {
  if (select.dataset.embelli) return;
  select.dataset.embelli = '1';
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'liste-jeu';
  bouton.setAttribute('aria-haspopup', 'listbox');
  select.classList.add('select-cache');
  select.insertAdjacentElement('afterend', bouton);
  const maj = () => { bouton.innerHTML = `<span>${esc(select.selectedOptions[0]?.textContent ?? '')}</span><i>▾</i>`; };
  maj();
  select.addEventListener('change', maj);

  bouton.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('.menu-liste')?.remove();
    const r = bouton.getBoundingClientRect();
    const menu = html(`<div class="menu-liste" role="listbox">${[...select.options].map((o, i) =>
      `<button type="button" role="option" data-i="${i}" class="${o.selected ? 'on' : ''}">${esc(o.textContent)}</button>`).join('')}</div>`);
    document.body.appendChild(menu);
    // Sous le bouton, ou au-dessus s'il n'y a pas la place
    const h = Math.min(menu.scrollHeight, 320);
    const enHaut = r.bottom + h + 12 > window.innerHeight && r.top > h + 12;
    Object.assign(menu.style, { left: `${Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 160) - 8))}px`, width: `${Math.max(r.width, 160)}px`, top: enHaut ? `${r.top - h - 6}px` : `${r.bottom + 6}px`, maxHeight: '320px' });
    (menu.querySelector('.on') as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
    const fermer = () => { menu.remove(); document.removeEventListener('pointerdown', dehors, true); document.removeEventListener('keydown', clavier, true); };
    const dehors = (ev: Event) => { if (!menu.contains(ev.target as Node) && ev.target !== bouton && !bouton.contains(ev.target as Node)) fermer(); };
    const clavier = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); fermer(); bouton.focus(); } };
    document.addEventListener('pointerdown', dehors, true);
    document.addEventListener('keydown', clavier, true);
    menu.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (!b) return;
      select.selectedIndex = Number(b.dataset.i);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      fermer();
    });
  });
}

// Tous les <select> ajoutés à la page sont embellis automatiquement.
if (typeof document !== 'undefined') {
  const tout = (racine: ParentNode) => racine.querySelectorAll?.('select:not([data-embelli])').forEach((s) => embellir(s as HTMLSelectElement));
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) { if (n.tagName === 'SELECT') embellir(n as HTMLSelectElement); else tout(n); } }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => tout(document));
  // Fermer le menu ouvert si la page défile ou change de taille
  window.addEventListener('resize', () => document.querySelector('.menu-liste')?.remove());
}
