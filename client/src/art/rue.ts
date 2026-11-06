/**
 * La rue du Club : le Casino, le Kiosque, la Grande Roue et le salon « Entre potes », côte à côte.
 * Le ciel suit l'heure de Paris (matin, jour, soir, nuit), et la rue vit : voitures de sport, motos,
 * avions, ballon, oiseaux, étoiles filantes. Tout est en SVG, animé en CSS.
 */

export type Moment = 'matin' | 'jour' | 'soir' | 'nuit';

/** Le moment de la journée à Paris. */
export function momentParis(t = Date.now()): Moment {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 12);
  return h >= 6 && h < 10 ? 'matin' : h >= 10 && h < 18 ? 'jour' : h >= 18 && h < 21 ? 'soir' : 'nuit';
}

export const LARGEUR_RUE = 1100;
const H = 340;
const T = '#2A1E3F';
const S = `stroke="${T}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
const s = `stroke="${T}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
const SOL = 290;

interface Palette { ciel: [string, string, string]; loin: string; fenetre: string; allume: boolean; etoiles: boolean }
const PALETTES: Record<Moment, Palette> = {
  matin: { ciel: ['#8FD3FF', '#CFE9FF', '#FFD7A8'], loin: '#9DB4E0', fenetre: '#CFEFFF', allume: false, etoiles: false },
  jour: { ciel: ['#4FB8F0', '#8ED6FA', '#D4F1FF'], loin: '#8FB0DA', fenetre: '#BFE8FF', allume: false, etoiles: false },
  soir: { ciel: ['#3B2A6E', '#B0508A', '#FF9A6B'], loin: '#6A3E86', fenetre: '#FFE7A0', allume: true, etoiles: true },
  nuit: { ciel: ['#0F0B2A', '#2A1E5A', '#4A2C7A'], loin: '#3A2766', fenetre: '#FFE7A0', allume: true, etoiles: true },
};

function alea(graine: number) { let x = graine; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; }

/* ------------------------------ Le ciel ------------------------------ */

function ciel(m: Moment, p: Palette) {
  const r = alea(9);
  const etoiles = p.etoiles ? Array.from({ length: m === 'nuit' ? 46 : 14 }, (_, i) => `<circle cx="${(r() * LARGEUR_RUE).toFixed(0)}" cy="${(r() * 120).toFixed(0)}" r="${(0.8 + r() * 1.4).toFixed(1)}" fill="#FFF4DF" class="scintille" style="animation-delay:${((i * 0.41) % 3).toFixed(2)}s"/>`).join('') : '';
  const astre = m === 'nuit'
    ? `<circle cx="520" cy="56" r="40" fill="#FFF4DF" opacity=".12"/><circle cx="520" cy="56" r="20" fill="#FFF4DF"/><circle cx="513" cy="51" r="4" fill="#EADFC8"/><circle cx="526" cy="62" r="3" fill="#EADFC8"/>`
    : m === 'soir' ? `<circle cx="700" cy="232" r="56" fill="#FFB86B" opacity=".35"/><circle cx="700" cy="232" r="36" fill="#FFC27A"/>`
    : m === 'matin' ? `<circle cx="140" cy="120" r="44" fill="#FFE7A0" opacity=".45"/><circle cx="140" cy="120" r="26" fill="#FFD36B" ${s}/>`
    : `<g class="soleil"><circle cx="880" cy="58" r="44" fill="#FFF0A0" opacity=".4"/><circle cx="880" cy="58" r="26" fill="#FFD84D" ${s}/></g>`;
  const nuages = m === 'jour' || m === 'matin' ? [[120, 46, 1], [430, 30, 0.8], [760, 70, 1.1], [1000, 36, 0.9]].map(([x, y, k], i) => `
    <g class="nuage" style="animation-duration:${30 + i * 9}s;animation-delay:-${i * 7}s"><path transform="translate(${x} ${y}) scale(${k})" d="M0 20 q2 -14 18 -12 q8 -14 26 -6 q16 -4 18 12 q10 2 8 10 h-66 q-10 -2 -4 -4z" fill="#FFF" opacity=".92" ${s}/></g>`).join('') : '';
  // Un avion traverse : banderole le jour, feux clignotants la nuit
  const avion = `<g class="avion"><g transform="translate(0 ${m === 'nuit' ? 38 : 30})">
    ${m === 'jour' || m === 'matin' ? `<path d="M-6 6 h-14" stroke="${T}" stroke-width="1"/><rect x="-128" y="-2" width="108" height="16" rx="3" fill="#FFF4DF" ${s}/><text x="-74" y="10" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="10" fill="${T}">ALL-IN CLUB ♣</text>` : ''}
    <path d="M0 6 q4 -6 30 -6 q10 0 14 6 q-4 4 -14 4 h-26z" fill="#FFF4DF" ${s}/><path d="M14 4 l-6 -10 h6 l10 10z M16 8 l-4 8 h6 l8 -8z" fill="#FF6B5B" ${s}/><path d="M2 4 l-4 -8 h5 l5 8z" fill="#FF6B5B" ${s}/>
    ${p.allume ? '<circle cx="44" cy="6" r="2" fill="#FF4B3E" class="clignote"/><circle cx="-2" cy="-3" r="1.6" fill="#7CF2FF" class="clignote lent"/>' : ''}
  </g></g>`;
  const extra = m === 'nuit' ? `<path d="M0 0 l60 22" stroke="#FFF4DF" stroke-width="2" stroke-linecap="round" class="filante"/>`
    : m === 'jour' ? `<g class="montgolfiere" transform="translate(470 4) scale(.85)"><path d="M0 0 q-24 0 -24 26 q0 18 18 30 h12 q18 -12 18 -30 q0 -26 -24 -26z" fill="#FF6B5B" ${s}/><path d="M0 0 q-8 10 -6 56 M0 0 q8 10 6 56" fill="none" stroke="#FFC23D" stroke-width="3"/><path d="M-6 56 l2 10 h8 l2 -10" fill="none" stroke="${T}" stroke-width="1.2"/><rect x="-6" y="66" width="12" height="9" rx="2" fill="#A86B3C" ${s}/></g>`
    : m === 'matin' ? Array.from({ length: 4 }, (_, i) => `<path class="oiseau" style="animation-delay:-${i * 1.3}s;animation-duration:${16 + i * 2}s" d="M${i * 16} ${70 + (i % 2) * 10} q5 -5 9 0 q4 -5 9 0" fill="none" stroke="${T}" stroke-width="1.8" stroke-linecap="round"/>`).join('')
    : '';
  return `<defs><linearGradient id="rue-ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.ciel[0]}"/><stop offset=".6" stop-color="${p.ciel[1]}"/><stop offset="1" stop-color="${p.ciel[2]}"/></linearGradient>
    <radialGradient id="rue-halo"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".85"/><stop offset="1" stop-color="#FFE7A0" stop-opacity="0"/></radialGradient></defs>
    <rect width="${LARGEUR_RUE}" height="${H}" fill="url(#rue-ciel)"/>${etoiles}${astre}${nuages}${extra}${avion}
    <path d="M0 ${SOL - 70} ${Array.from({ length: 22 }, (_, i) => { const x = i * 52, hh = 30 + ((i * 37) % 60); return `H${x} V${SOL - 40 - hh} h${26 + (i % 3) * 8} V${SOL - 70}`; }).join(' ')} H${LARGEUR_RUE} V${SOL} H0z" fill="${p.loin}" opacity=".85"/>`;
}

/* ------------------------------ Les bâtiments ------------------------------ */

const ampoules = (x0: number, x1: number, y: number) => Array.from({ length: Math.floor((x1 - x0) / 11) + 1 }, (_, i) => `<circle cx="${x0 + i * 11}" cy="${y}" r="2.8" fill="${i % 2 ? '#FFF4DF' : '#FFC23D'}" stroke="${T}" stroke-width="1" class="ampoule" style="animation-delay:${(i % 2) * 0.45}s"/>`).join('');

function casino(p: Palette) {
  const portes = [
    { jeu: 'poker', x: 40, icone: `<text x="0" y="8" text-anchor="middle" font-size="22" fill="${T}">♠</text>`, nom: 'Poker' },
    { jeu: 'blackjack', x: 147, icone: `<text x="0" y="7" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="17" fill="#E5484D">21</text>`, nom: 'Black Jack' },
    { jeu: 'roulette', x: 254, icone: `<circle r="10" fill="none" stroke="#E5484D" stroke-width="5" stroke-dasharray="4 3"/><circle r="4.5" fill="#FFC23D"/>`, nom: 'Roulette' },
  ];
  return `<g class="lieu entree" data-lieu="casino" style="--d:.05s">
    <path d="M14 ${SOL} V108 h282 v${SOL - 108}z" fill="#8E3B6E" ${S}/>
    <path d="M6 110 h298 l-12 -16 h-274z" fill="#FFC23D" ${S}/>
    <path d="M98 94 q57 -70 114 0z" fill="#B0458A" ${S}/>
    <path d="M155 26 l4.5 10 l11 1.2 l-8 7.5 l2.2 11 l-9.7 -5.5 l-9.7 5.5 l2.2 -11 l-8 -7.5 l11 -1.2z" fill="#FFC23D" ${s} class="scintille lent"/>
    ${[124, 186].map((x) => `<rect x="${x - 7}" y="66" width="14" height="18" rx="7" fill="${p.fenetre}" ${s}/>`).join('')}
    <rect x="44" y="120" width="222" height="44" rx="10" fill="${T}"/>
    ${ampoules(52, 258, 125)}${ampoules(52, 258, 159)}
    <text x="155" y="152" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="26" fill="#FFC23D" letter-spacing="5" class="neon">CASINO</text>
    ${[30, 290].map((x) => `<rect x="${x - 8}" y="176" width="16" height="${SOL - 176}" fill="#F3D7A0" ${s}/>`).join('')}
    ${[['♠', T, 70], ['♥', '#E5484D', 120], ['♦', '#E5484D', 190], ['♣', T, 240]].map(([g, c, x]) => `<g transform="translate(${x} 182)"><rect x="-14" y="0" width="28" height="30" rx="14" fill="${p.fenetre}" ${s}/><text x="0" y="21" text-anchor="middle" font-size="16" fill="${c}">${g}</text></g>`).join('')}
    ${portes.map((d) => `<g class="porte-casino" data-jeu="${d.jeu}" role="button" tabindex="0" aria-label="Le ${d.nom}">
      <path d="M${d.x - 26} ${SOL} v-56 q26 -24 52 0 v56z" fill="${p.allume ? '#FFD98A' : '#F6C77A'}" ${S}/>
      <circle cx="${d.x}" cy="${SOL - 54}" r="15" fill="#FFF4DF" ${s}/><g transform="translate(${d.x} ${SOL - 54})">${d.icone}</g>
      <rect x="${d.x - 30}" y="${SOL - 26}" width="60" height="16" rx="8" fill="#FFF4DF" ${s}/>
      <text x="${d.x}" y="${SOL - 14}" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="600" font-size="10.5" fill="${T}">${d.nom}</text>
      <text x="${d.x}" y="${SOL - 75}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="800" font-size="9.5" fill="#FFF4DF" data-compte="${d.jeu}"></text>
    </g>`).join('')}
  </g>`;
}

function kiosque(p: Palette) {
  const x0 = 300;
  return `<g class="lieu entree" data-lieu="kiosque" role="button" tabindex="0" aria-label="Le Kiosque" style="--d:.18s">
    <path d="M${x0 + 6} ${SOL} V96 h232 v${SOL - 96}z" fill="#F6D9A8" ${S}/>
    <path d="M${x0} 98 l14 -24 h216 l14 24z" fill="#6E7BB8" ${S}/>
    ${[x0 + 58, x0 + 122, x0 + 186].map((x) => `<path d="M${x - 10} 92 v-9 q10 -9 20 0 v9z" fill="${p.fenetre}" ${s}/>`).join('')}
    ${[x0 + 34, x0 + 172].map((x) => `<g><rect x="${x}" y="110" width="32" height="40" rx="2" fill="${p.fenetre}" ${s}/><path d="M${x + 16} 110 v40 M${x} 130 h32" stroke="${T}" stroke-width="1.3"/><rect x="${x - 10}" y="110" width="9" height="40" fill="#43B072" ${s}/><rect x="${x + 33}" y="110" width="9" height="40" fill="#43B072" ${s}/><rect x="${x - 3}" y="150" width="38" height="6" rx="2" fill="#7B4A2E" ${s}/>${[4, 12, 20, 28].map((d, k) => `<circle cx="${x + d}" cy="149" r="3" fill="${k % 2 ? '#FF6B5B' : '#FF9AC1'}"/>`).join('')}</g>`).join('')}
    <path d="M${x0 + 122} 102 v8" stroke="${T}" stroke-width="2"/>
    <g class="balance" style="transform-origin:${x0 + 122}px 110px"><path d="M${x0 + 122} 110 l15 21 l-15 21 l-15 -21z" fill="#E5484D" ${S}/><text x="${x0 + 122}" y="135" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="8.5" fill="#FFF4DF">TABAC</text></g>
    <rect x="${x0 + 6}" y="164" width="232" height="${SOL - 164}" fill="#2E8FD0" ${S}/>
    <rect x="${x0 + 30}" y="170" width="184" height="26" rx="7" fill="${T}"/>
    <text x="${x0 + 122}" y="189" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="17" fill="#7CF2FF" letter-spacing="3" class="neon lent">KIOSQUE</text>
    <path d="M${x0 + 6} 202 h232 l7 13 h-246z" fill="#FFF4DF" ${s}/>
    ${Array.from({ length: 11 }, (_, i) => `<path d="M${x0 + 6 + i * 21.2} 202 h10.6 l1 13 h-12z" fill="#FFC23D"/>`).join('')}
    <rect x="${x0 + 18}" y="222" width="122" height="${SOL - 236}" rx="4" fill="#BFE8FF" ${S}/>
    ${[[x0 + 30, 244, -14, '#E5484D'], [x0 + 52, 238, -5, '#46C2F0'], [x0 + 74, 236, 4, '#FFC23D'], [x0 + 96, 240, 12, '#8E5BD6']].map(([x, y, r, c]) => `<g transform="rotate(${r} ${(x as number) + 11} ${(y as number) + 15})"><rect x="${x}" y="${y}" width="22" height="30" rx="3" fill="${c}" ${s}/><rect x="${(x as number) + 4}" y="${(y as number) + 6}" width="14" height="10" rx="2" fill="#C9C3D6"/></g>`).join('')}
    <rect x="${x0 + 112}" y="228" width="22" height="18" rx="2" fill="${T}"/>
    ${['#FFC23D', '#FF6B5B', '#7CF2FF', '#FFC23D'].map((c, i) => `<circle cx="${x0 + 117 + (i % 2) * 11}" cy="${233 + Math.floor(i / 2) * 7}" r="2.4" fill="${c}" class="scintille" style="animation-delay:${i * 0.3}s"/>`).join('')}
    <path d="M${x0 + 156} ${SOL} v-68 h44 v68z" fill="#7B4A2E" ${S}/>
    <circle cx="${x0 + 192}" cy="${SOL - 32}" r="2.2" fill="#FFC23D"/>
    <rect x="${x0 + 206}" y="${SOL - 28}" width="26" height="28" rx="2" fill="#5A4A8C" ${s}/><rect x="${x0 + 209}" y="${SOL - 34}" width="20" height="10" fill="#FFF4DF" ${s}/>
    <rect x="${x0 + 22}" y="${SOL - 18}" width="114" height="16" rx="8" fill="#FFF4DF" ${s}/>
    <text x="${x0 + 79}" y="${SOL - 6}" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="600" font-size="10.5" fill="${T}">Tickets · Keno · Loto</text>
  </g>`;
}

function grandeRoue(p: Palette) {
  const cx = 670, cy = 150, R = 96;
  const nacelles = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${T}" stroke-width="1.8"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${['#FFC23D', '#46C2F0', '#FF6B5B', '#43B072', '#FF9AC1'][i % 5]}" ${s}/>`;
  }).join('');
  const lumieres = p.allume ? Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return `<circle cx="${(cx + (R - 1) * Math.cos(a)).toFixed(1)}" cy="${(cy + (R - 1) * Math.sin(a)).toFixed(1)}" r="2" fill="#FFF4DF" class="ampoule" style="animation-delay:${(i % 2) * 0.45}s"/>`; }).join('') : '';
  return `<g class="lieu entree" data-lieu="roue" role="button" tabindex="0" aria-label="La Grande Roue" style="--d:.3s">
    <path d="M${cx} ${cy} L${cx - 58} ${SOL} M${cx} ${cy} L${cx + 58} ${SOL}" stroke="${T}" stroke-width="9" stroke-linecap="round"/>
    <path d="M${cx} ${cy} L${cx - 58} ${SOL} M${cx} ${cy} L${cx + 58} ${SOL}" stroke="#C7C2D6" stroke-width="5" stroke-linecap="round"/>
    <g class="tourne" style="transform-origin:${cx}px ${cy}px">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${T}" stroke-width="6"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#FF9AC1" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="${R * 0.6}" fill="none" stroke="#FF9AC1" stroke-width="2"/>
      ${nacelles}${lumieres}
    </g>
    <circle cx="${cx}" cy="${cy}" r="12" fill="#FFF4DF" ${S}/><text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="15" fill="#25A05C">♣</text>
    <rect x="${cx - 66}" y="${SOL - 44}" width="132" height="44" rx="6" fill="#E5484D" ${S}/>
    <path d="M${cx - 72} ${SOL - 44} h144 l-8 -12 h-128z" fill="#FFF4DF" ${s}/>
    ${Array.from({ length: 7 }, (_, i) => `<path d="M${cx - 64 + i * 20} ${SOL - 56} h10 l3 12 h-12z" fill="#E5484D"/>`).join('')}
    <rect x="${cx - 52}" y="${SOL - 36}" width="104" height="18" rx="5" fill="${T}"/>
    <text x="${cx}" y="${SOL - 23}" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="11" fill="#FFC23D" letter-spacing="1.5" class="neon">GRANDE ROUE</text>
    <rect x="${cx - 14}" y="${SOL - 14}" width="28" height="14" fill="${p.fenetre}" ${s}/>
    <g class="bulle-roue"><path d="M${cx + 30} 22 h96 a10 10 0 0 1 10 10 v18 a10 10 0 0 1 -10 10 h-70 l-12 10 l2 -10 h-16 a10 10 0 0 1 -10 -10 v-18 a10 10 0 0 1 10 -10z" fill="#FFC23D" ${S}/>
      <text x="${cx + 78}" y="45" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="13" fill="${T}" data-bulle-roue>Tour gratuit !</text></g>
  </g>`;
}

function salon(p: Palette) {
  const x0 = 780;
  return `<g class="lieu entree" data-lieu="salon" role="button" tabindex="0" aria-label="Le salon Entre potes" style="--d:.42s">
    <path d="M${x0} ${SOL} V118 h300 v${SOL - 118}z" fill="#C8643C" ${S}/>
    ${Array.from({ length: 9 }, (_, j) => Array.from({ length: 7 }, (_, i) => `<rect x="${x0 + 6 + i * 42 + (j % 2) * 20}" y="${126 + j * 18}" width="18" height="6" rx="1.5" fill="#B3532F" opacity=".7"/>`).join('')).join('')}
    <path d="M${x0 - 8} 120 h316 l-10 -18 h-296z" fill="#4A3A6E" ${S}/>
    <rect x="${x0 + 50}" y="132" width="200" height="32" rx="16" fill="${T}" ${S}/>
    <text x="${x0 + 150}" y="155" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="19" fill="#FF7FD0" class="neon">Entre potes</text>
    <!-- La grande vitrine : des potes autour d'une table, une lampe au-dessus -->
    <rect x="${x0 + 16}" y="176" width="178" height="${SOL - 186}" rx="12" fill="#4A3A6E" ${S}/>
    <clipPath id="vitre-salon"><rect x="${x0 + 22}" y="182" width="166" height="${SOL - 198}" rx="8"/></clipPath>
    <g clip-path="url(#vitre-salon)">
      <rect x="${x0 + 22}" y="182" width="166" height="${SOL - 198}" fill="${p.allume ? '#FFD98A' : '#FFE9C2'}"/>
      <rect x="${x0 + 22}" y="${SOL - 44}" width="166" height="40" fill="${p.allume ? '#E9A55A' : '#F2C48B'}"/>
      <path d="M${x0 + 105} 182 v14" stroke="${T}" stroke-width="1.6"/>
      <path d="M${x0 + 88} 206 q17 -16 34 0z" fill="#FF6B5B" ${s}/>
      ${p.allume ? `<path d="M${x0 + 90} 206 l-26 44 h82 l-26 -44z" fill="#FFF4DF" opacity=".35"/>` : ''}
      ${[[x0 + 58, '#8EE07A', '#43B072'], [x0 + 86, '#FFC23D', '#E59A12'], [x0 + 126, '#FF9AC1', '#E5484D'], [x0 + 154, '#46C2F0', '#2E7FB8']].map(([x, c, h], i) => `<g class="pote" style="animation-delay:${i * 0.5}s;transform-origin:${x}px ${SOL - 40}px">
        <path d="M${(x as number) - 11} ${SOL - 30} q0 -16 11 -16 q11 0 11 16z" fill="${h}" ${s}/>
        <circle cx="${x}" cy="${SOL - 56}" r="10" fill="${c}" ${s}/>
        <circle cx="${(x as number) - 3.5}" cy="${SOL - 58}" r="1.5" fill="${T}"/><circle cx="${(x as number) + 3.5}" cy="${SOL - 58}" r="1.5" fill="${T}"/>
        <path d="M${(x as number) - 3.5} ${SOL - 52} q3.5 3 7 0" fill="none" stroke="${T}" stroke-width="1.4" stroke-linecap="round"/></g>`).join('')}
      <path d="M${x0 + 44} ${SOL - 26} q61 -16 122 0 v6 q-61 12 -122 0z" fill="#25A05C" ${S}/>
      ${[[x0 + 92, -1], [x0 + 104, 0], [x0 + 116, 1]].map(([x, r]) => `<rect x="${x}" y="${SOL - 31}" width="9" height="12" rx="2" fill="#FFF4DF" ${s} transform="rotate(${(r as number) * 8} ${(x as number) + 4.5} ${SOL - 25})"/>`).join('')}
      <circle cx="${x0 + 70}" cy="${SOL - 27}" r="3.5" fill="#E5484D" ${s}/><circle cx="${x0 + 140}" cy="${SOL - 27}" r="3.5" fill="#46C2F0" ${s}/>
    </g>
    <path d="M${x0 + 214} ${SOL} v-84 q30 -22 60 0 v84z" fill="#5A3A2A" ${S}/>
    <circle cx="${x0 + 266}" cy="${SOL - 40}" r="2.4" fill="#FFC23D"/>
    ${[x0 + 206, x0 + 284].map((x) => `<g><rect x="${x - 8}" y="${SOL - 16}" width="16" height="16" fill="#A86B3C" ${s}/><path d="M${x} ${SOL - 16} q-12 -10 -6 -24 q4 8 6 4 q2 -14 8 -16 q2 12 -2 18 q10 -6 10 4 q-6 8 -16 14z" fill="#43B072" ${s}/></g>`).join('')}
    <path d="M${x0 + 10} 172 q70 18 140 2 q70 16 140 0" fill="none" stroke="${T}" stroke-width="1.2"/>
    ${Array.from({ length: 9 }, (_, i) => { const x = x0 + 26 + i * 32; return `<circle cx="${x}" cy="${178 + (i % 2) * 3}" r="3" fill="${['#FFC23D', '#FF6B5B', '#46C2F0', '#8EE07A'][i % 4]}" ${s} ${p.allume ? `class="scintille lent" style="animation-delay:${i * 0.4}s"` : ''}/>`; }).join('')}
  </g>`;
}

/* ------------------------------ La rue et ses véhicules ------------------------------ */

function reverbere(x: number, p: Palette) {
  return `<g>${p.allume ? `<circle cx="${x}" cy="${SOL - 70}" r="34" fill="url(#rue-halo)" class="pulse"/>` : ''}
    <path d="M${x} ${SOL + 6} V${SOL - 62}" stroke="${T}" stroke-width="5"/><path d="M${x} ${SOL + 6} V${SOL - 62}" stroke="#3E4A6B" stroke-width="2.5"/>
    <path d="M${x - 9} ${SOL - 62} h18 l-3 -13 h-12z" fill="${p.allume ? '#FFE7A0' : '#E8F4FF'}" ${s}/><path d="M${x - 8} ${SOL - 75} h16 l-8 -7z" fill="#3E4A6B" ${s}/></g>`;
}

/** Les véhicules, dessinés vers la droite autour de (0, 0) = roue arrière au sol. */
const roue = (x: number, r = 8, jante = '#C7C2D6') => `<circle cx="${x}" cy="${-r + 2}" r="${r}" fill="${T}"/><circle cx="${x}" cy="${-r + 2}" r="${(r * 0.42).toFixed(1)}" fill="${jante}"/>`;
const faisceau = (x: number, y: number, phares: boolean) => (phares ? `<path d="M${x} ${y} l58 -7 v20z" fill="#FFF4DF" opacity=".35"/>` : '');
const tete = (x: number, y: number, peau: string, cheveux: string) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${peau}" ${s}/><path d="M${x - 6.5} ${y - 1} q1 -8 6.5 -8 q6 0 6.5 7 q-4 -4 -13 1z" fill="${cheveux}"/>`;
export const VEHICULES = {
  /* --- Les voitures de riches --- */
  supercar: (c: string, phares: boolean) => `${faisceau(70, -12, phares)}
    <path d="M-12 -4 v-8 l6 -6 l34 -8 q16 -4 28 4 l22 10 q4 2 4 8 z" fill="${c}" ${S}/>
    <path d="M26 -23 l14 -4 q8 -1 12 4 l5 4 h-31z" fill="#BFE8FF" ${s}/>
    <path d="M-12 -14 l-6 -8 h10 l6 6" fill="${T}"/>
    ${roue(0, 7)}${roue(56, 7)}
    <path d="M66 -10 h7" stroke="#FFF4DF" stroke-width="3" stroke-linecap="round"/>`,
  cabriolet: (c: string, phares: boolean) => `${faisceau(70, -12, phares)}
    ${tete(24, -31, '#FFD9B0', '#7B4A2E')}${tete(8, -29, '#C98B5E', '#2A1E3F')}
    <path d="M-14 -4 v-14 q0 -6 8 -6 h40 l6 -8 h4 l-2 8 h26 q8 0 8 8 v12z" fill="${c}" ${S}/>
    <path d="M38 -24 l5 -9" stroke="#BFE8FF" stroke-width="3" stroke-linecap="round"/>
    ${roue(2)}${roue(52)}`,
  limousine: (c: string, phares: boolean) => `${faisceau(108, -12, phares)}
    <path d="M-14 -4 v-14 q0 -6 8 -6 h14 l10 -10 h70 l10 10 h18 q8 0 8 8 v12z" fill="${c}" ${S}/>
    ${[22, 42, 62].map((x) => `<rect x="${x}" y="-31" width="16" height="8" rx="2" fill="#2A2340"/>`).join('')}
    <path d="M82 -31 h6 l7 8 h-13z" fill="#BFE8FF" ${s}/>
    <path d="M-14 -12 h120" stroke="${T}" stroke-width="1.2" opacity=".5"/>
    ${roue(6)}${roue(92)}`,
  /* --- Les voitures de tous les jours --- */
  citadine: (c: string, phares: boolean) => `${faisceau(56, -12, phares)}
    <path d="M-12 -4 v-13 q0 -6 7 -6 h6 l9 -12 q2 -2 5 -2 h18 q3 0 5 2 l9 12 h3 q8 0 8 7 v12z" fill="${c}" ${S}/>
    <path d="M6 -23 l7 -10 h8 v10z M25 -23 v-10 h9 l7 10z" fill="#BFE8FF" ${s}/>
    ${roue(0, 7.5)}${roue(40, 7.5)}`,
  berline: (c: string, phares: boolean) => `${faisceau(72, -12, phares)}
    <path d="M-14 -4 v-13 q0 -6 8 -6 h12 l10 -11 q2 -2 6 -2 h24 q4 0 6 2 l10 11 h12 q8 0 8 7 v12z" fill="${c}" ${S}/>
    <path d="M10 -23 l8 -9 h11 v9z M33 -23 v-9 h12 l8 9z" fill="#BFE8FF" ${s}/>
    ${roue(2)}${roue(54)}`,
  taxi: (c: string, phares: boolean) => `${faisceau(56, -12, phares)}
    <rect x="13" y="-42" width="16" height="6" rx="2" fill="#FFF4DF" ${s}/>
    <path d="M-12 -4 v-13 q0 -6 7 -6 h6 l9 -12 q2 -2 5 -2 h18 q3 0 5 2 l9 12 h3 q8 0 8 7 v12z" fill="${c}" ${S}/>
    <path d="M6 -23 l7 -10 h8 v10z M25 -23 v-10 h9 l7 10z" fill="#BFE8FF" ${s}/>
    <path d="M-10 -13 h56" stroke="${T}" stroke-width="3" stroke-dasharray="4 4"/>
    ${roue(0, 7.5)}${roue(40, 7.5)}`,
  camionnette: (c: string, phares: boolean) => `${faisceau(64, -12, phares)}
    <path d="M-12 -4 v-38 q0 -4 4 -4 h48 l14 18 q6 2 6 8 v16z" fill="${c}" ${S}/>
    <path d="M42 -42 l11 14 h-11z" fill="#BFE8FF" ${s}/>
    <path d="M38 -44 v40" stroke="${T}" stroke-width="1.6"/>
    <text x="13" y="-20" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="7" fill="${T}">LIVRAISON</text>
    ${roue(2)}${roue(48)}`,
  /* --- La moto : roues à rayons, pot chromé, pilote casqué --- */
  moto: (c: string, phares: boolean) => `${faisceau(48, -18, phares)}
    <circle cx="0" cy="-9" r="9" fill="#2E2840" stroke="${T}" stroke-width="2.5"/><circle cx="0" cy="-9" r="3" fill="#C7C2D6"/>
    <circle cx="42" cy="-9" r="9" fill="#2E2840" stroke="${T}" stroke-width="2.5"/><circle cx="42" cy="-9" r="3" fill="#C7C2D6"/>
    <path d="M2 -10 h16" stroke="#C7C2D6" stroke-width="3.4" stroke-linecap="round"/><path d="M2 -10 h16" stroke="${T}" stroke-width="1" stroke-linecap="round" opacity=".5"/>
    <path d="M0 -9 l12 -10 M42 -9 l-8 -18 l4 -4" fill="none" stroke="${T}" stroke-width="3" stroke-linecap="round"/>
    <path d="M8 -20 q2 -6 10 -6 h8 q8 -1 12 4 l-4 6 h-24z" fill="${c}" ${s}/>
    <path d="M6 -22 q6 -4 14 -2 v3 h-14z" fill="${T}"/>
    <path d="M15 -22 l9 9" stroke="${T}" stroke-width="7" stroke-linecap="round"/><path d="M15 -22 l9 9" stroke="#3E4A6B" stroke-width="4" stroke-linecap="round"/>
    <path d="M16 -23 L24 -37" stroke="${T}" stroke-width="11" stroke-linecap="round"/><path d="M16 -23 L24 -37" stroke="#3E4A6B" stroke-width="7.5" stroke-linecap="round"/>
    <path d="M24 -35 L35 -28" stroke="${T}" stroke-width="6" stroke-linecap="round"/><path d="M24 -35 L35 -28" stroke="#3E4A6B" stroke-width="3" stroke-linecap="round"/>
    <circle cx="27" cy="-45" r="7.5" fill="${c}" ${s}/><path d="M29 -48 h6 q1.5 3.5 -1 6 h-5z" fill="#BFE8FF" ${s}/>
    <circle class="fumee" cx="-6" cy="-10" r="3" fill="#C7C2D6" opacity=".6"/>`,
};

function circulation(p: Palette) {
  // Voie du fond (vers la droite) dessinée d'abord, puis celle de devant : pas de tête qui dépasse d'une voiture
  const v = [
    { t: 'supercar', c: '#FFC23D', voie: 0, duree: 7, delai: 0 },
    { t: 'citadine', c: '#46C2F0', voie: 0, duree: 10, delai: 4 },
    { t: 'cabriolet', c: '#E5484D', voie: 0, duree: 12, delai: 9 },
    { t: 'limousine', c: '#2A2340', voie: 0, duree: 14, delai: 15 },
    { t: 'camionnette', c: '#FFF4DF', voie: 0, duree: 13, delai: 21 },
    { t: 'taxi', c: '#FFC23D', voie: 1, duree: 9, delai: 2 },
    { t: 'moto', c: '#E5484D', voie: 1, duree: 8, delai: 7 },
    { t: 'berline', c: '#8EE07A', voie: 1, duree: 11, delai: 12 },
    { t: 'supercar', c: '#8E5BD6', voie: 1, duree: 6.5, delai: 17 },
    { t: 'berline', c: '#FF9AC1', voie: 1, duree: 10, delai: 23 },
  ] as const;
  return v.map((x) => {
    const y = x.voie ? SOL + 46 : SOL + 26;
    const corps = VEHICULES[x.t](x.c, p.allume);
    // Voie du bas : on roule vers la gauche (dessin retourné)
    return `<g class="vehicule ${x.voie ? 'gauche' : 'droite'}" style="animation-duration:${x.duree * 3}s;animation-delay:-${x.delai}s"><g transform="translate(0 ${y})${x.voie ? ' scale(-1 1)' : ''}">${corps}</g></g>`;
  }).join('');
}

/** La rue complète, prête à insérer dans la page. */
export function sceneRue(m: Moment): string {
  const p = PALETTES[m];
  return `<svg class="scene-rue moment-${m}" viewBox="0 0 ${LARGEUR_RUE} ${H}" aria-label="La rue du Club">
    ${ciel(m, p)}
    ${casino(p)}${kiosque(p)}${grandeRoue(p)}${salon(p)}
    <rect x="0" y="${SOL}" width="${LARGEUR_RUE}" height="12" fill="#A99BC4" stroke="${T}" stroke-width="2"/>
    <rect x="0" y="${SOL + 12}" width="${LARGEUR_RUE}" height="${H - SOL - 12}" fill="${m === 'jour' || m === 'matin' ? '#4A4560' : '#2E2840'}"/>
    <path d="M0 ${SOL + 30} H${LARGEUR_RUE}" stroke="#FFC23D" stroke-width="2.4" stroke-dasharray="18 14"/>
    ${[290, 556, 770].map((x) => reverbere(x, p)).join('')}
    ${circulation(p)}
  </svg>`;
}
