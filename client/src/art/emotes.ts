/**
 * Les 12 émotes du club (SVG), les cadres d'avatar et les dos de cartes débloqués par les succès.
 */
const T = '#2A1E3F';
const visage = (fond: string, contenu: string) => `<circle cx="50" cy="52" r="40" fill="${fond}" stroke="${T}" stroke-width="5"/>${contenu}`;
const oeil = (x: number, y = 46) => `<ellipse cx="${x}" cy="${y}" rx="4.5" ry="6" fill="${T}"/><circle cx="${x + 1.5}" cy="${y - 2.5}" r="1.6" fill="#fff"/>`;

const DESSINS: Record<string, string> = {
  pouce: `<circle cx="50" cy="50" r="42" fill="#46C2F0" stroke="${T}" stroke-width="5"/>
    <path d="M30 50 h10 v26 h-10 z" fill="#FFF4DF" stroke="${T}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M42 50 L52 28 Q56 20 62 24 Q66 28 62 40 L74 40 Q82 41 80 49 L76 70 Q74 76 66 76 L42 76 Z" fill="#FFD89A" stroke="${T}" stroke-width="4" stroke-linejoin="round"/>`,
  rire: visage('#FFC23D', `<path d="M30 44 q6 -8 12 0 M58 44 q6 -8 12 0" stroke="${T}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M28 58 Q50 60 72 58 Q70 82 50 82 Q30 82 28 58Z" fill="${T}"/><path d="M38 72 Q50 64 62 72 Q50 80 38 72Z" fill="#FF7E8A"/>
    <path d="M22 48 q-8 10 -2 16 q6 -2 2 -16z M78 48 q8 10 2 16 q-6 -2 -2 -16z" fill="#46C2F0" stroke="${T}" stroke-width="2.5"/>`),
  larme: visage('#9FD6F2', `${oeil(38, 48)}${oeil(62, 48)}<path d="M30 36 l12 4 M70 36 l-12 4" stroke="${T}" stroke-width="4" stroke-linecap="round"/>
    <path d="M38 72 Q50 62 62 72" stroke="${T}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M64 56 q-8 14 0 18 q8 -4 0 -18z" fill="#46C2F0" stroke="${T}" stroke-width="3"/>`),
  colere: visage('#FF6B5B', `<path d="M28 36 l16 8 M72 36 l-16 8" stroke="${T}" stroke-width="5" stroke-linecap="round"/>${oeil(38, 52)}${oeil(62, 52)}
    <path d="M36 72 Q50 62 64 72" stroke="${T}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M14 22 q4 -6 0 -12 M86 22 q-4 -6 0 -12 M24 16 q4 -6 0 -12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  coeur: `<path d="M50 86 C22 66 8 52 8 34 C8 20 18 10 31 10 C40 10 46 16 50 24 C54 16 60 10 69 10 C82 10 92 20 92 34 C92 52 78 66 50 86Z" fill="#FF6B5B" stroke="${T}" stroke-width="5" stroke-linejoin="round"/>
    <ellipse cx="30" cy="30" rx="8" ry="5" fill="#fff" opacity=".5" transform="rotate(-30 30 30)"/>`,
  applaudir: `<path d="M50 6 L60 34 L90 34 L66 52 L76 82 L50 64 L24 82 L34 52 L10 34 L40 34 Z" fill="#FFC23D" stroke="${T}" stroke-width="5" stroke-linejoin="round"/>
    <text x="50" y="58" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="15" fill="${T}">BRAVO</text>`,
  bienjoue: `<rect x="8" y="24" width="84" height="52" rx="16" fill="#43B072" stroke="${T}" stroke-width="5"/>
    <text x="50" y="64" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="32" fill="#FFF4DF" stroke="${T}" stroke-width="2">GG</text>`,
  lunettes: visage('#FFC23D', `<path d="M18 42 H82 L78 54 Q72 62 60 58 L55 48 H45 L40 58 Q28 62 22 54 Z" fill="${T}"/>
    <path d="M26 46 l8 0 M62 46 l8 0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <path d="M36 70 Q52 80 66 68" stroke="${T}" stroke-width="5" fill="none" stroke-linecap="round"/>`),
  poisson: `<circle cx="50" cy="50" r="42" fill="#46C2F0" stroke="${T}" stroke-width="5"/>
    <path d="M70 50 L90 34 L88 66 Z" fill="#FF9F2E" stroke="${T}" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="46" cy="50" rx="28" ry="20" fill="#FF9F2E" stroke="${T}" stroke-width="4"/>
    <circle cx="32" cy="46" r="5" fill="#fff" stroke="${T}" stroke-width="2.5"/><circle cx="31" cy="46" r="2.4" fill="${T}"/>
    <path d="M22 56 q4 3 8 0" stroke="${T}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M48 38 q6 12 0 24" stroke="${T}" stroke-width="3" fill="none"/>`,
  requin: `<circle cx="50" cy="50" r="42" fill="#2F80ED" stroke="${T}" stroke-width="5"/>
    <path d="M30 64 Q46 52 52 18 Q66 40 72 64 Z" fill="#8A9BB0" stroke="${T}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M12 66 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0" stroke="#FFF4DF" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  sablier: `<circle cx="50" cy="50" r="42" fill="#8E5BD6" stroke="${T}" stroke-width="5"/>
    <path d="M30 18 H70 M30 82 H70" stroke="${T}" stroke-width="6" stroke-linecap="round"/>
    <path d="M34 20 H66 Q66 40 52 50 Q66 60 66 80 H34 Q34 60 48 50 Q34 40 34 20Z" fill="#FFF4DF" stroke="${T}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M40 30 H60 Q58 40 50 46 Q42 40 40 30Z M38 78 Q40 66 50 62 Q60 66 62 78Z" fill="#FFC23D"/>`,
  champagne: `<circle cx="50" cy="50" r="42" fill="#FF6B9A" stroke="${T}" stroke-width="5"/>
    <path d="M42 86 L42 50 Q42 40 48 34 L48 22 L56 22 L56 34 Q62 40 62 50 L62 86 Z" fill="#2E9A5E" stroke="${T}" stroke-width="4" stroke-linejoin="round"/>
    <rect x="45" y="56" width="14" height="14" rx="3" fill="#FFF4DF"/><rect x="46" y="14" width="12" height="9" rx="2" fill="#FFC23D" stroke="${T}" stroke-width="3"/>
    <circle cx="32" cy="24" r="4" fill="#FFF4DF"/><circle cx="72" cy="18" r="3" fill="#FFF4DF"/><circle cx="68" cy="34" r="5" fill="#FFF4DF"/><circle cx="26" cy="40" r="3" fill="#FFF4DF"/>`,
};

export function emoteSVG(id: string, taille = 64): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 100 100">${DESSINS[id] ?? DESSINS.pouce}</svg>`;
}

/* ------------------------------ Cadres et dos ------------------------------ */

/** Couleurs des cadres d'avatar (plusieurs couleurs = dégradé). */
export const CADRES_COULEURS: Record<string, string[]> = {
  aucun: [],
  or: ['#FFE08A', '#F2A516'],
  argent: ['#F4F6FA', '#9AA6B8'],
  neon: ['#6FF2FF', '#FF6BEA'],
  feu: ['#FFD25E', '#FF4B2B'],
  glace: ['#E6FBFF', '#46C2F0'],
  requin: ['#8A9BB0', '#2F4A6E'],
  diamant: ['#FFFFFF', '#9BE7FF', '#FFFFFF'],
  arc: ['#FF6B5B', '#FFC23D', '#43B072', '#46C2F0', '#8E5BD6'],
};

/** Couleurs des dos de cartes : [fond, rayures, médaillon]. */
export const DOS_COULEURS: Record<string, [string, string, string]> = {
  prune: ['#8E5BD6', '#7C49C4', '#FFC23D'],
  corail: ['#FF6B5B', '#E5484D', '#FFF4DF'],
  ocean: ['#2F80ED', '#2565C4', '#FFC23D'],
  emeraude: ['#2E9A5E', '#227A49', '#FFC23D'],
  nuit: ['#2A1E3F', '#3A2D5E', '#FFC23D'],
  or: ['#FFC23D', '#E59A12', '#2A1E3F'],
  legende: ['#FF6B9A', '#8E5BD6', '#FFF4DF'],
};

/** Anneau de cadre en SVG (même gabarit 200 × 200 que les avatars). */
export function cadreSVG(id: string): string {
  const c = CADRES_COULEURS[id];
  if (!c || !c.length) return '';
  const g = `cg${Math.random().toString(36).slice(2, 8)}`;
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">${c.map((x, i) => `<stop offset="${i / Math.max(1, c.length - 1)}" stop-color="${x}"/>`).join('')}</linearGradient></defs>
    <circle cx="100" cy="100" r="92" fill="none" stroke="#2A1E3F" stroke-width="16"/><circle cx="100" cy="100" r="92" fill="none" stroke="url(#${g})" stroke-width="10"/>`;
}
