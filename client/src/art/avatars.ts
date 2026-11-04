/**
 * Les 12 personnages d'All-In Club, dessinés en SVG, chacun avec 6 expressions.
 * Gabarit commun : boîte 200 × 200, tête décalée de 14 px vers le bas dans un médaillon rond.
 */
import type { AvatarId } from '../../../moteur/avatars';
import { cadreSVG } from './emotes';

export type Expression = 'neutre' | 'concentre' | 'content' | 'ravi' | 'decu' | 'sueur' | 'cligne';
export const EXPRESSIONS: Expression[] = ['neutre', 'concentre', 'content', 'ravi', 'decu', 'sueur'];

const T = '#2A1E3F';

interface Visage {
  ey: number;            // hauteur des yeux
  dx: number;            // écart des yeux depuis le centre
  my: number;            // hauteur de la bouche
  bec?: boolean;
  sclere?: string;       // couleur du blanc de l'œil (yeux sur fond sombre)
  oeil?: string;         // couleur des yeux
  sourcil?: string | null; // null : pas de sourcils
  bouche?: string;       // couleur de la bouche
  joues?: boolean;
}

interface Perso {
  fond: string;
  visage: Visage;
  derriere: () => string;     // tête, oreilles…
  devant?: (ex: Expression) => string; // lunettes, moustache…
}

/* ------------------------------ Visage ------------------------------ */

function sourcils(v: Visage, ex: Expression): string {
  if (v.sourcil === null) return '';
  const coul = v.sourcil ?? T;
  const kind = ex === 'concentre' ? 'froid' : ex === 'decu' || ex === 'sueur' ? 'inquiet' : ex === 'ravi' || ex === 'content' ? 'haut' : 'neutre';
  const y = v.ey - 17 - (v.sclere ? 4 : 0);
  const un = (x: number, side: number) => {
    let a = 0, b = 0;
    if (kind === 'froid') { a = side < 0 ? -3 : 4; b = side < 0 ? 4 : -3; }
    if (kind === 'inquiet') { a = side < 0 ? 4 : -5; b = side < 0 ? -5 : 4; }
    if (kind === 'haut') { a = -4; b = -4; }
    return `<path d="M${x - 10},${y + a} Q${x},${y - 4 + (a + b) / 2} ${x + 10},${y + b}" stroke="${coul}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  };
  return un(100 - v.dx, -1) + un(100 + v.dx, 1);
}

function yeux(v: Visage, ex: Expression): string {
  const L = 100 - v.dx, R = 100 + v.dx, ey = v.ey;
  const oeil = v.oeil ?? T;
  const reflet = v.oeil && v.oeil !== T ? '' : '#fff';
  const sclere = (x: number, ry = 11) => (v.sclere ? `<ellipse cx="${x}" cy="${ey}" rx="11" ry="${ry}" fill="${v.sclere}" stroke="${T}" stroke-width="3"/>` : '');
  const arc = v.sclere ? '#FFF4DF' : oeil;
  let s = '';
  for (const x of [L, R]) {
    switch (ex) {
      case 'neutre':
      case 'content':
        s += sclere(x) + `<ellipse cx="${x}" cy="${ey}" rx="${v.sclere ? 5.5 : 7}" ry="${v.sclere ? 7 : 9}" fill="${oeil}"/>` + (reflet ? `<circle cx="${x + 2.5}" cy="${ey - 3.5}" r="2.4" fill="${reflet}"/>` : '');
        break;
      case 'concentre':
        if (v.sclere) s += `<path d="M${x - 10},${ey} Q${x},${ey - 7} ${x + 10},${ey} Q${x},${ey + 6} ${x - 10},${ey}Z" fill="${v.sclere}" stroke="${T}" stroke-width="3"/><circle cx="${x + 2}" cy="${ey}" r="3.5" fill="${oeil}"/>`;
        else s += `<path d="M${x - 8},${ey - 1} Q${x},${ey - 5} ${x + 8},${ey - 1} Q${x},${ey + 6} ${x - 8},${ey - 1}Z" fill="${oeil}"/>` + (reflet ? `<circle cx="${x + 3}" cy="${ey}" r="1.8" fill="${reflet}"/>` : '');
        break;
      case 'ravi':
        s += `<path d="M${x - 9},${ey + 3} Q${x},${ey - 10} ${x + 9},${ey + 3}" stroke="${arc}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`;
        break;
      case 'decu':
        s += sclere(x) + `<ellipse cx="${x}" cy="${ey + 3}" rx="${v.sclere ? 5 : 6.5}" ry="${v.sclere ? 6 : 7.5}" fill="${oeil}"/>` + (reflet ? `<circle cx="${x + 2}" cy="${ey + 5.5}" r="2.2" fill="${reflet}"/>` : '');
        break;
      case 'cligne':
        // Yeux fermés le temps d'un clignement
        s += `<path d="M${x - 9},${ey + 1} Q${x},${ey + 6} ${x + 9},${ey + 1}" stroke="${v.sclere ? '#FFF4DF' : oeil}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
        break;
      case 'sueur':
        s += (v.sclere ? sclere(x, 12) : `<ellipse cx="${x}" cy="${ey}" rx="10" ry="11" fill="#fff" stroke="${T}" stroke-width="3"/>`) + `<circle cx="${x}" cy="${ey + 1}" r="3.6" fill="${oeil}"/>`;
        break;
    }
  }
  return s + sourcils(v, ex);
}

function bouche(v: Visage, ex: Expression): string {
  const y = v.my, c = v.bouche ?? T;
  if (v.bec) {
    const bec = `<path d="M86,${y - 6} Q100,${y - 14} 114,${y - 6} Q100,${y + 8} 86,${y - 6}Z" fill="#FF9F2E" stroke="${T}" stroke-width="3.5" stroke-linejoin="round"/>`;
    if (ex === 'ravi' || ex === 'content')
      return `<path d="M89,${y + 1} Q100,${y + (ex === 'ravi' ? 16 : 10)} 111,${y + 1} Q100,${y + 4} 89,${y + 1}Z" fill="#E5484D" stroke="${T}" stroke-width="3.5" stroke-linejoin="round"/><path d="M86,${y - 8} Q100,${y - 16} 114,${y - 8} Q107,${y + 1} 100,${y + 1} Q93,${y + 1} 86,${y - 8}Z" fill="#FF9F2E" stroke="${T}" stroke-width="3.5" stroke-linejoin="round"/>`;
    if (ex === 'decu' || ex === 'sueur') return `<g transform="rotate(${ex === 'decu' ? 8 : -6} 100 ${y})">${bec}</g>`;
    return bec;
  }
  switch (ex) {
    case 'neutre':
    case 'cligne': return `<path d="M88,${y} Q100,${y + 9} 112,${y}" stroke="${c}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    case 'concentre': return `<path d="M91,${y + 3} L110,${y + 1}" stroke="${c}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    case 'content': return `<path d="M84,${y - 2} Q100,${y + 15} 116,${y - 2}" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    case 'ravi': return `<path d="M84,${y - 3} Q100,${y - 1} 116,${y - 3} Q114,${y + 19} 100,${y + 19} Q86,${y + 19} 84,${y - 3}Z" fill="${T}"/><path d="M91,${y + 12} Q100,${y + 6} 109,${y + 12} Q100,${y + 19} 91,${y + 12}Z" fill="#FF7E8A"/>`;
    case 'decu': return `<path d="M88,${y + 7} Q100,${y - 3} 112,${y + 7}" stroke="${c}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    case 'sueur': return `<path d="M86,${y + 3} q4,-5 8,0 t8,0 t8,0 t8,0" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

function extras(v: Visage, ex: Expression): string {
  let s = '';
  if (v.joues !== false) {
    const op = ex === 'ravi' ? 0.85 : ex === 'content' ? 0.65 : 0.4;
    s += `<ellipse cx="${100 - v.dx - 8}" cy="${v.ey + 19}" rx="9" ry="5.5" fill="#FF7E8A" opacity="${op}"/><ellipse cx="${100 + v.dx + 8}" cy="${v.ey + 19}" rx="9" ry="5.5" fill="#FF7E8A" opacity="${op}"/>`;
  }
  if (ex === 'decu') s += `<path d="M${100 + v.dx + 15},${v.ey - 10} q-6,10 0,13 q6,-3 0,-13z" fill="#46C2F0" stroke="${T}" stroke-width="2.5"/>`;
  if (ex === 'sueur') s += `<path d="M${100 - v.dx - 20},${v.ey - 26} q-7,12 0,15 q7,-3 0,-15z" fill="#46C2F0" stroke="${T}" stroke-width="2.5"/><path d="M${100 + v.dx + 18},${v.ey - 20} q-6,10 0,13 q6,-3 0,-13z" fill="#46C2F0" stroke="${T}" stroke-width="2.5"/>`;
  if (ex === 'ravi') s += `<path d="M28,34 l4,-10 l4,10 l10,4 l-10,4 l-4,10 l-4,-10 l-10,-4z" fill="#FFC23D" stroke="${T}" stroke-width="2.5"/><path d="M166,44 l3,-7 l3,7 l7,3 l-7,3 l-3,7 l-3,-7 l-7,-3z" fill="#FFC23D" stroke="${T}" stroke-width="2.5"/>`;
  return s;
}

/* ------------------------------ Personnages ------------------------------ */

const contour = `stroke="${T}" stroke-width="5" stroke-linejoin="round"`;

const PERSOS: Record<AvatarId, Perso> = {
  renard: {
    fond: '#FFC23D', visage: { ey: 104, dx: 23, my: 146 },
    derriere: () => `
      <path d="M52,74 L40,22 Q68,34 86,58Z" fill="#FF8A2B" ${contour}/>
      <path d="M148,74 L160,22 Q132,34 114,58Z" fill="#FF8A2B" ${contour}/>
      <path d="M53,62 L47,34 Q64,42 72,56Z" fill="#7A3A1A"/><path d="M147,62 L153,34 Q136,42 128,56Z" fill="#7A3A1A"/>
      <path d="M100,52 Q150,50 162,96 Q168,124 140,146 Q122,166 100,170 Q78,166 60,146 Q32,124 38,96 Q50,50 100,52Z" fill="#FF8A2B"/>
      <path d="M42,112 Q62,124 82,124 Q92,128 100,136 Q108,128 118,124 Q138,124 158,112 Q156,136 136,152 Q120,166 100,168 Q80,166 64,152 Q44,136 42,112Z" fill="#FFF4DF"/>
      <path d="M100,52 Q150,50 162,96 Q168,124 140,146 Q122,166 100,170 Q78,166 60,146 Q32,124 38,96 Q50,50 100,52Z" fill="none" stroke="${T}" stroke-width="5"/>
      <ellipse cx="100" cy="134" rx="9" ry="6.5" fill="${T}"/><ellipse cx="97" cy="132" rx="3" ry="1.8" fill="#fff" opacity=".7"/>`,
  },
  ours: {
    fond: '#46C2F0', visage: { ey: 102, dx: 24, my: 146 },
    derriere: () => `
      <circle cx="52" cy="58" r="22" fill="#A8693A" stroke="${T}" stroke-width="5"/><circle cx="52" cy="58" r="10" fill="#E9B98A"/>
      <circle cx="148" cy="58" r="22" fill="#A8693A" stroke="${T}" stroke-width="5"/><circle cx="148" cy="58" r="10" fill="#E9B98A"/>
      <ellipse cx="100" cy="110" rx="66" ry="62" fill="#A8693A" stroke="${T}" stroke-width="5"/>
      <ellipse cx="100" cy="140" rx="32" ry="24" fill="#E9B98A" stroke="${T}" stroke-width="4"/>
      <path d="M90,128 Q100,122 110,128 Q108,137 100,138 Q92,137 90,128Z" fill="${T}"/>`,
  },
  pingouin: {
    fond: '#FF6B5B', visage: { ey: 104, dx: 20, my: 134, bec: true },
    derriere: () => `
      <path d="M100,30 Q104,18 112,22 Q106,26 108,34" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="100" cy="106" rx="66" ry="66" fill="#33407A" stroke="${T}" stroke-width="5"/>
      <path d="M100,80 Q86,62 68,72 Q46,84 50,114 Q56,150 100,162 Q144,150 150,114 Q154,84 132,72 Q114,62 100,80Z" fill="#FFF4DF" stroke="${T}" stroke-width="4"/>`,
  },
  raton: {
    fond: '#8E5BD6', visage: { ey: 104, dx: 24, my: 150, sclere: '#FFF4DF' },
    derriere: () => `
      <path d="M44,80 L44,36 Q72,40 80,62Z" fill="#8F95AA" ${contour}/><path d="M156,80 L156,36 Q128,40 120,62Z" fill="#8F95AA" ${contour}/>
      <path d="M50,70 L50,46 Q66,50 70,62Z" fill="#3B3550"/><path d="M150,70 L150,46 Q134,50 130,62Z" fill="#3B3550"/>
      <ellipse cx="100" cy="112" rx="68" ry="60" fill="#A3A9BE" stroke="${T}" stroke-width="5"/>
      <path d="M86,56 Q100,48 114,56 L108,84 L92,84Z" fill="#7D8398"/>
      <path d="M40,104 Q48,84 74,88 Q92,92 100,98 Q108,92 126,88 Q152,84 160,104 Q150,122 126,120 Q110,118 100,112 Q90,118 74,120 Q50,122 40,104Z" fill="#3B3550"/>
      <ellipse cx="100" cy="146" rx="38" ry="24" fill="#F4F1EA" stroke="${T}" stroke-width="4"/>
      <ellipse cx="100" cy="132" rx="9" ry="6.5" fill="${T}"/>`,
  },
  grenouille: {
    fond: '#FFC23D', visage: { ey: 74, dx: 31, my: 140, sclere: '#FFFFFF' },
    derriere: () => `
      <ellipse cx="100" cy="122" rx="74" ry="54" fill="#5CC46A" stroke="${T}" stroke-width="5"/>
      <circle cx="69" cy="76" r="26" fill="#5CC46A" stroke="${T}" stroke-width="5"/>
      <circle cx="131" cy="76" r="26" fill="#5CC46A" stroke="${T}" stroke-width="5"/>
      <path d="M44,102 Q100,96 156,102" fill="none" stroke="#5CC46A" stroke-width="10"/>
      <ellipse cx="100" cy="150" rx="46" ry="18" fill="#9BE08F" opacity=".8"/>
      <circle cx="92" cy="122" r="2.5" fill="${T}"/><circle cx="108" cy="122" r="2.5" fill="${T}"/>`,
  },
  hibou: {
    fond: '#46C2F0', visage: { ey: 98, dx: 25, my: 128, bec: true, sclere: '#FFD84D', sourcil: '#5A3A22' },
    derriere: () => `
      <path d="M48,70 L40,30 L72,54Z" fill="#8C6A4F" ${contour}/><path d="M152,70 L160,30 L128,54Z" fill="#8C6A4F" ${contour}/>
      <ellipse cx="100" cy="112" rx="66" ry="62" fill="#8C6A4F" stroke="${T}" stroke-width="5"/>
      <circle cx="75" cy="98" r="27" fill="#F2DFC4" stroke="${T}" stroke-width="3.5"/>
      <circle cx="125" cy="98" r="27" fill="#F2DFC4" stroke="${T}" stroke-width="3.5"/>
      <path d="M80,142 l6,6 l6,-6 M96,150 l6,6 l6,-6 M112,142 l6,6 l6,-6" stroke="#5A3A22" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  },
  chat: {
    fond: '#FF6B5B', visage: { ey: 104, dx: 24, my: 148 },
    derriere: () => `
      <path d="M46,82 L50,26 L88,58Z" fill="#B8A6D9" ${contour}/><path d="M154,82 L150,26 L112,58Z" fill="#B8A6D9" ${contour}/>
      <path d="M55,66 L57,40 L76,56Z" fill="#FF9FB8"/><path d="M145,66 L143,40 L124,56Z" fill="#FF9FB8"/>
      <ellipse cx="100" cy="112" rx="66" ry="58" fill="#B8A6D9" stroke="${T}" stroke-width="5"/>
      <path d="M92,58 l3,14 M100,56 l0,15 M108,58 l-3,14" stroke="#7E68A8" stroke-width="4" stroke-linecap="round"/>
      <circle cx="89" cy="138" r="13" fill="#FFF4DF"/><circle cx="111" cy="138" r="13" fill="#FFF4DF"/>
      <path d="M93,127 L107,127 L100,135Z" fill="#FF7E8A" stroke="${T}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M40,130 L70,134 M40,142 L70,140 M160,130 L130,134 M160,142 L130,140" stroke="${T}" stroke-width="2.5" stroke-linecap="round"/>`,
  },
  robot: {
    fond: '#FFC23D', visage: { ey: 102, dx: 22, my: 148, oeil: '#6FF2FF', sourcil: null, joues: false },
    derriere: () => `
      <path d="M100,52 L100,26" stroke="${T}" stroke-width="5"/><circle cx="100" cy="22" r="9" fill="#FF6B5B" stroke="${T}" stroke-width="4"/>
      <rect x="28" y="92" width="16" height="32" rx="6" fill="#7F93A8" stroke="${T}" stroke-width="4"/>
      <rect x="156" y="92" width="16" height="32" rx="6" fill="#7F93A8" stroke="${T}" stroke-width="4"/>
      <rect x="40" y="50" width="120" height="118" rx="28" fill="#A9BCCE" stroke="${T}" stroke-width="5"/>
      <rect x="52" y="78" width="96" height="50" rx="18" fill="#26304A" stroke="${T}" stroke-width="4"/>
      <circle cx="56" cy="62" r="3.5" fill="#7F93A8"/><circle cx="144" cy="62" r="3.5" fill="#7F93A8"/>
      <rect x="80" y="138" width="40" height="20" rx="7" fill="#26304A" stroke="${T}" stroke-width="3"/>`,
    devant: (ex) => {
      // la bouche du robot est un petit écran
      const y = 148;
      const m: Record<Expression, string> = {
        neutre: `M88,${y} L112,${y}`, concentre: `M90,${y} L110,${y}`, content: `M86,${y - 3} Q100,${y + 7} 114,${y - 3}`,
        ravi: `M86,${y - 4} Q100,${y + 9} 114,${y - 4}`, decu: `M88,${y + 4} Q100,${y - 4} 112,${y + 4}`, sueur: `M86,${y} l6,-4 l6,4 l6,-4 l6,4`, cligne: `M88,${y} L112,${y}`,
      };
      return `<path d="${m[ex]}" stroke="#6FF2FF" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
  },
  mamie: {
    fond: '#8E5BD6', visage: { ey: 112, dx: 22, my: 150, sourcil: '#B9B2C9' },
    derriere: () => `
      <circle cx="100" cy="36" r="22" fill="#E8E4F0" stroke="${T}" stroke-width="5"/>
      <ellipse cx="100" cy="100" rx="70" ry="62" fill="#E8E4F0" stroke="${T}" stroke-width="5"/>
      <circle cx="46" cy="122" r="10" fill="#F6C9A8" stroke="${T}" stroke-width="4"/><circle cx="154" cy="122" r="10" fill="#F6C9A8" stroke="${T}" stroke-width="4"/>
      <circle cx="44" cy="136" r="4.5" fill="#fff" stroke="${T}" stroke-width="2"/><circle cx="156" cy="136" r="4.5" fill="#fff" stroke="${T}" stroke-width="2"/>
      <ellipse cx="100" cy="122" rx="54" ry="52" fill="#F6C9A8" stroke="${T}" stroke-width="5"/>
      <path d="M48,104 Q60,72 100,74 Q140,72 152,104 Q130,86 100,90 Q70,86 48,104Z" fill="#E8E4F0" stroke="${T}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M96,130 Q100,136 104,130" stroke="#D9967A" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    devant: () => `
      <circle cx="78" cy="112" r="16" fill="#fff" fill-opacity=".18" stroke="${T}" stroke-width="4"/>
      <circle cx="122" cy="112" r="16" fill="#fff" fill-opacity=".18" stroke="${T}" stroke-width="4"/>
      <path d="M94,110 Q100,105 106,110" stroke="${T}" stroke-width="4" fill="none"/>`,
  },
  cowboy: {
    fond: '#46C2F0', visage: { ey: 110, dx: 22, my: 156 },
    derriere: () => `
      <circle cx="46" cy="122" r="11" fill="#E9A879" stroke="${T}" stroke-width="4"/><circle cx="154" cy="122" r="11" fill="#E9A879" stroke="${T}" stroke-width="4"/>
      <ellipse cx="100" cy="122" rx="56" ry="54" fill="#E9A879" stroke="${T}" stroke-width="5"/>
      <path d="M62,76 Q60,30 82,30 Q100,40 118,30 Q140,30 138,76Z" fill="#8A4B22" ${contour}/>
      <path d="M62,66 L138,66 L138,78 L62,78Z" fill="#E5484D" stroke="${T}" stroke-width="3.5"/>
      <path d="M14,80 Q30,96 100,94 Q170,96 186,80 Q170,74 140,78 Q100,84 60,78 Q30,74 14,80Z" fill="#A65E2E" ${contour}/>
      <ellipse cx="100" cy="133" rx="8" ry="6" fill="#D98C5F"/>`,
    devant: () => `<path d="M78,146 Q90,136 100,143 Q110,136 122,146 Q112,150 100,146 Q88,150 78,146Z" fill="#5A3A22" stroke="${T}" stroke-width="3" stroke-linejoin="round"/>`,
  },
  pieuvre: {
    fond: '#43B072', visage: { ey: 106, dx: 22, my: 140 },
    derriere: () => `
      ${[40, 68, 100, 132, 160].map((x, i) => `<path d="M${x - 12},140 Q${x - 16},${176 + (i % 2) * 8} ${x - 2},${184 + (i % 2) * 6} Q${x + 10},${186} ${x + 4},${174} Q${x + 2},${160} ${x + 12},140Z" fill="#E86AA0" ${contour}/>`).join('')}
      <path d="M36,120 Q30,40 100,36 Q170,40 164,120 Q160,156 100,158 Q40,156 36,120Z" fill="#FF7FB0" ${contour}/>
      <circle cx="72" cy="66" r="9" fill="#FFB3D1"/><circle cx="128" cy="60" r="6" fill="#FFB3D1"/><circle cx="114" cy="78" r="4" fill="#FFB3D1"/>`,
  },
  croco: {
    fond: '#FF6B5B', visage: { ey: 72, dx: 30, my: 156, sclere: '#FFF4DF' },
    derriere: () => `
      <path d="M36,112 Q36,62 100,60 Q164,62 164,112 Q164,140 140,142 L60,142 Q36,140 36,112Z" fill="#3FAE6A" ${contour}/>
      <circle cx="70" cy="74" r="23" fill="#3FAE6A" stroke="${T}" stroke-width="5"/>
      <circle cx="130" cy="74" r="23" fill="#3FAE6A" stroke="${T}" stroke-width="5"/>
      <path d="M56,92 Q100,86 144,92" stroke="#3FAE6A" stroke-width="10" fill="none"/>
      <rect x="48" y="104" width="104" height="70" rx="32" fill="#6CCB8A" stroke="${T}" stroke-width="5"/>
      <circle cx="86" cy="120" r="4" fill="${T}"/><circle cx="114" cy="120" r="4" fill="${T}"/>
      <path d="M70,100 l6,-4 l6,4 M118,100 l6,-4 l6,4" stroke="#2E8A52" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    devant: (ex) => (ex === 'ravi' ? '' : `<path d="M84,158 l4,8 l4,-8 M108,158 l4,8 l4,-8" fill="#fff" stroke="${T}" stroke-width="2.5" stroke-linejoin="round"/>`),
  },
};

/** Fond de médaillon de chaque personnage. */
export const couleurFond = (id: AvatarId) => PERSOS[id].fond;

let compteur = 0;
/**
 * SVG d'un avatar.
 * @param anneau proportion d'anneau de temps (0..1) ou null
 */
export function avatarSVG(id: AvatarId, ex: Expression = 'neutre', taille = 120, opts: { gris?: boolean; cadre?: string } = {}): string {
  const p = PERSOS[id] ?? PERSOS.renard;
  const v = p.visage;
  const clip = `cl${++compteur}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 200 200">
    ${opts.gris ? '<defs><filter id="g' + clip + '"><feColorMatrix type="saturate" values="0.15"/></filter></defs>' : ''}
    <g ${opts.gris ? `filter="url(#g${clip})" opacity=".7"` : ''}>
    <circle cx="100" cy="100" r="96" fill="${p.fond}" stroke="${T}" stroke-width="6"/>
    <clipPath id="${clip}"><circle cx="100" cy="100" r="93"/></clipPath>
    <g clip-path="url(#${clip})">
      <circle cx="60" cy="50" r="60" fill="#fff" opacity=".18"/>
      <g transform="translate(0,14)">${p.derriere()}${extras(v, ex)}${yeux(v, ex)}${id === 'robot' ? '' : bouche(v, ex)}${p.devant?.(ex) ?? ''}</g>
    </g>
    <circle cx="100" cy="100" r="96" fill="none" stroke="${T}" stroke-width="6"/>
    ${opts.cadre ? cadreSVG(opts.cadre) : ''}
    </g>
  </svg>`;
}
