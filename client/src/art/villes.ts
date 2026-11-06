/**
 * Les cartes postales des villes du Casino : des scènes cartoon en SVG, avec quelques animations
 * légères (néons, fenêtres, bateaux, lanternes). Tout est dessiné ici, aucune image externe.
 */

const T = '#2A1E3F'; // le trait de toutes les illustrations
const S = `stroke="${T}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
const s = `stroke="${T}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"`;

/** Petit générateur déterministe, pour que les étoiles et les fenêtres restent toujours au même endroit. */
function alea(graine: number) {
  let x = graine;
  return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
}

const etoiles = (n: number, graine: number, hMax: number) => {
  const r = alea(graine);
  return Array.from({ length: n }, (_, i) => {
    const x = r() * 400, y = r() * hMax, t = 0.8 + r() * 1.6;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${t.toFixed(1)}" fill="#FFF4DF" class="scintille" style="animation-delay:${(i * 0.37) % 3}s"/>`;
  }).join('');
};

/** Une grille de fenêtres, certaines allumées (et qui clignotent doucement). */
function fenetres(x: number, y: number, cols: number, rangs: number, w: number, h: number, gx: number, gy: number, allumee: string, eteinte: string, graine: number) {
  const r = alea(graine);
  let out = '';
  for (let j = 0; j < rangs; j++) for (let i = 0; i < cols; i++) {
    const on = r() > 0.3;
    out += `<rect x="${x + i * (w + gx)}" y="${y + j * (h + gy)}" width="${w}" height="${h}" rx="1" fill="${on ? allumee : eteinte}"${on && r() > 0.75 ? ` class="scintille lent" style="animation-delay:${(r() * 4).toFixed(1)}s"` : ''}/>`;
  }
  return out;
}

const palmier = (x: number, y: number, h: number, couleur = '#2F7D52', tronc = '#A86B3C') => `
  <g>
    <path d="M${x} ${y} q${-4} ${-h * 0.5} ${3} ${-h}" fill="none" stroke="${T}" stroke-width="7" stroke-linecap="round"/>
    <path d="M${x} ${y} q${-4} ${-h * 0.5} ${3} ${-h}" fill="none" stroke="${tronc}" stroke-width="3.5" stroke-linecap="round"/>
    <g transform="translate(${x + 3} ${y - h})" class="balance-palme">
      <path d="M0 0 q-14 -10 -26 2 q12 -3 26 -2z M0 0 q14 -10 26 2 q-12 -3 -26 -2z M0 0 q-6 -16 -20 -14 q10 2 20 14z M0 0 q6 -16 20 -14 q-10 2 -20 14z M0 0 q-16 2 -20 14 q6 -10 20 -14z M0 0 q16 2 20 14 q-6 -10 -20 -14z" fill="${couleur}" ${s}/>
    </g>
  </g>`;

/* ================================ Le Bistrot ================================ */

const BISTROT = `
  <defs>
    <linearGradient id="ciel-bistrot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6B4FA0"/><stop offset=".55" stop-color="#E9788A"/><stop offset="1" stop-color="#FFC27A"/></linearGradient>
    <radialGradient id="halo-bistrot"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".9"/><stop offset="1" stop-color="#FFE7A0" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="150" fill="url(#ciel-bistrot)"/>
  ${etoiles(10, 7, 40)}
  <circle cx="336" cy="74" r="20" fill="#FFD36B" opacity=".95"/>
  <!-- Toits de Paris au loin -->
  <path d="M0 112 V78 h18 l6 -10 h24 l6 10 h10 V70 h6 v8 h26 l8 -14 h34 l8 14 h4 V96 h20 V74 l10 -8 l10 8 v22 h14 V82 h8 v-8 h5 v8 h40 l6 -12 h30 l6 12 h22 V68 h6 v12 h30 l6 -10 h20 l6 10 h12 V112z" fill="#8C88C4" opacity=".75"/>
  <path d="M250 112 V86 l12 -10 h26 l12 10 v26z" fill="#7570B0"/>
  ${fenetres(258, 90, 3, 2, 6, 7, 6, 6, '#FFE7A0', '#5B5794', 3)}
  <!-- Le café -->
  <path d="M34 150 V44 h196 v106z" fill="#F6D9A8" ${S}/>
  <path d="M28 46 l14 -24 h180 l14 24z" fill="#6E7BB8" ${S}/>
  ${[60, 104, 148, 192].map((x) => `<path d="M${x - 9} 40 v-10 q9 -8 18 0 v10z" fill="#FFE7A0" ${s}/>`).join('')}
  ${[50, 94, 138, 182].map((x) => `
    <rect x="${x}" y="52" width="22" height="30" rx="2" fill="#FFE7A0" ${s}/>
    <path d="M${x + 11} 52 v30 M${x} 66 h22" stroke="${T}" stroke-width="1.4"/>
    <rect x="${x - 3}" y="80" width="28" height="6" rx="2" fill="#7B4A2E" ${s}/>
    ${[3, 9, 15, 21].map((d, k) => `<circle cx="${x + d}" cy="79" r="2.6" fill="${k % 2 ? '#FF6B5B' : '#FF9AC1'}"/>`).join('')}`).join('')}
  <!-- Devanture -->
  <rect x="34" y="92" width="196" height="58" fill="#2F7D52" ${S}/>
  <rect x="86" y="94" width="92" height="14" rx="3" fill="#FFF4DF" ${s}/>
  <text x="132" y="105" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="11" fill="#2F7D52" letter-spacing="2">BISTROT</text>
  <!-- Store rayé -->
  <path d="M38 110 h188 l8 14 H30z" fill="#FFF4DF" ${S}/>
  ${Array.from({ length: 9 }, (_, i) => `<path d="M${38 + i * 21} 110 h10.5 l${2 + i * 0.2} 14 h-13z" fill="#E5484D"/>`).join('')}
  <path d="M30 124 ${Array.from({ length: 12 }, (_, i) => `q${8.5} 8 17 0`).join(' ')}" fill="#E5484D" ${s}/>
  <rect x="44" y="130" width="64" height="20" fill="#FFD98A" ${s}/>
  <rect x="156" y="130" width="64" height="20" fill="#FFD98A" ${s}/>
  <rect x="116" y="128" width="32" height="22" fill="#7B4A2E" ${s}/>
  <circle cx="142" cy="140" r="1.6" fill="#FFC23D"/>
  <!-- Guirlande -->
  <path d="M230 64 q40 26 84 6" fill="none" stroke="${T}" stroke-width="1.2"/>
  ${[0.12, 0.3, 0.5, 0.7, 0.88].map((t, i) => { const x = 230 + 84 * t, y = 64 + 2 * t * (1 - t) * 26 * 2 - t * 6 + 2; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${['#FFC23D', '#FF6B5B', '#46C2F0', '#FFC23D', '#8EE07A'][i]}" ${s} class="scintille lent" style="animation-delay:${i * 0.5}s"/>`; }).join('')}
  <!-- Réverbère -->
  <circle cx="300" cy="78" r="26" fill="url(#halo-bistrot)" class="pulse"/>
  <path d="M300 150 V86" stroke="${T}" stroke-width="5"/><path d="M300 150 V86" stroke="#3E4A6B" stroke-width="2.5"/>
  <path d="M290 86 h20 l-4 -14 h-12z" fill="#FFE7A0" ${s}/><path d="M292 72 h16 l-8 -7z" fill="#3E4A6B" ${s}/>
  <!-- Pavés et terrasse -->
  <rect x="0" y="146" width="400" height="4" fill="#9C7F60"/>
  ${[248, 340].map((x) => `
    <ellipse cx="${x}" cy="128" rx="14" ry="4" fill="#FFF4DF" ${s}/>
    <path d="M${x} 132 v14 M${x - 8} 146 h16" stroke="${T}" stroke-width="2.2"/>
    <path d="M${x - 24} 146 v-20 h8 v10 h-8 M${x + 24} 146 v-20 h-8 v10 h8" fill="none" stroke="#7B4A2E" stroke-width="2.4"/>
    <rect x="${x - 6}" y="120" width="5" height="7" rx="1" fill="#FFF4DF" ${s}/><path d="M${x + 3} 127 l2 -9 h4 l2 9z" fill="#E5484D" ${s}/>`).join('')}
  <!-- Le chat du bistrot -->
  <g transform="translate(372 146)">
    <path d="M-9 0 q-2 -14 6 -16 l1 -5 l3 4 h4 l3 -4 l1 5 q8 2 6 16z" fill="${T}"/>
    <path d="M9 -2 q10 0 8 -12" fill="none" stroke="${T}" stroke-width="2.5" stroke-linecap="round" class="queue-chat"/>
    <circle cx="-1" cy="-13" r="1.2" fill="#FFC23D"/><circle cx="5" cy="-13" r="1.2" fill="#FFC23D"/>
  </g>`;

/* ================================ Las Vegas ================================ */

const VEGAS = `
  <defs>
    <linearGradient id="ciel-vegas" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140D30"/><stop offset=".7" stop-color="#4B2380"/><stop offset="1" stop-color="#C2448F"/></linearGradient>
    <linearGradient id="faisceau" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFF4DF" stop-opacity=".5"/><stop offset="1" stop-color="#FFF4DF" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="400" height="150" fill="url(#ciel-vegas)"/>
  ${etoiles(26, 11, 70)}
  <g class="faisceau-a" style="transform-origin:120px 150px"><path d="M114 150 L80 0 h20 L126 150z" fill="url(#faisceau)"/></g>
  <g class="faisceau-b" style="transform-origin:300px 150px"><path d="M294 150 L320 0 h20 L306 150z" fill="url(#faisceau)"/></g>
  <!-- Montagnes du désert -->
  <path d="M0 116 L40 92 L70 104 L110 80 L150 102 L200 86 L250 104 L300 82 L350 100 L400 88 V150 H0z" fill="#3B2366"/>
  <!-- Les hôtels -->
  <path d="M18 150 V70 h44 v80z" fill="#5A3A9A" ${S}/>${fenetres(24, 76, 5, 8, 5, 5, 3, 3.5, '#FFE27A', '#3E2670', 21)}
  <path d="M66 150 V40 l18 -12 l18 12 v110z" fill="#D9A63A" ${S}/>${fenetres(72, 46, 4, 12, 4, 5, 3.3, 3, '#FFF4DF', '#9C7426', 22)}
  <path d="M80 30 l4 -12 l4 12" fill="none" ${s}/><circle cx="84" cy="16" r="3" fill="#FF6B5B" ${s} class="scintille"/>
  <path d="M276 150 V54 q20 -16 40 0 v96z" fill="#E86FA8" ${S}/>${fenetres(282, 62, 4, 10, 5, 5, 3.4, 3.4, '#FFF4DF', '#B04D82', 23)}
  <path d="M322 150 V76 h56 v74z" fill="#4C6FD0" ${S}/>${fenetres(328, 82, 6, 7, 5, 5, 3.3, 3.6, '#B8F0FF', '#36509C', 24)}
  <path d="M322 76 l28 -16 l28 16" fill="#2E8FD0" ${S}/>
  <!-- La grande enseigne -->
  <path d="M150 150 V112 M250 150 V112" stroke="${T}" stroke-width="7"/><path d="M150 150 V112 M250 150 V112" stroke="#C7C2D6" stroke-width="3.5"/>
  <path d="M200 26 L262 70 L200 114 L138 70z" fill="#FFF4DF" ${S}/>
  <path d="M200 36 L250 70 L200 104 L150 70z" fill="#E5484D" ${s}/>
  ${Array.from({ length: 20 }, (_, i) => { const t = i / 20, k = Math.floor(t * 4), u = t * 4 - k; const P = [[200, 31], [256, 70], [200, 109], [144, 70]]; const a = P[k], b = P[(k + 1) % 4]; return `<circle cx="${(a[0] + (b[0] - a[0]) * u).toFixed(1)}" cy="${(a[1] + (b[1] - a[1]) * u).toFixed(1)}" r="2.2" fill="#FFC23D" class="ampoule" style="animation-delay:${(i % 2) * 0.45}s"/>`; }).join('')}
  <text x="200" y="66" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="9" fill="#FFF4DF" letter-spacing="1">BIENVENUE À</text>
  <text x="200" y="84" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="19" fill="#FFC23D" stroke="${T}" stroke-width="1" paint-order="stroke" class="neon">VEGAS</text>
  <path d="M200 6 l3.5 7 l7.5 1 l-5.5 5 l1.5 7.5 l-7 -3.5 l-7 3.5 l1.5 -7.5 l-5.5 -5 l7.5 -1z" fill="#FFC23D" ${s} class="scintille"/>
  <!-- Néons des casinos -->
  <rect x="108" y="96" width="34" height="14" rx="4" fill="${T}"/><text x="125" y="107" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="10" fill="#FF6BD5" class="neon">777</text>
  <rect x="258" y="98" width="30" height="12" rx="4" fill="${T}"/><text x="273" y="108" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="10" fill="#7CF2FF" class="neon lent">♠♥♣</text>
  ${palmier(130, 150, 30, '#25A05C')}${palmier(272, 150, 34, '#25A05C')}
  <!-- Le boulevard -->
  <rect x="0" y="138" width="400" height="12" fill="#2A2340"/>
  <path d="M0 144 h400" stroke="#FFC23D" stroke-width="1.5" stroke-dasharray="10 8"/>
  <g class="voiture"><rect x="-30" y="130" width="26" height="9" rx="4" fill="#FF6B5B" ${s}/><path d="M-25 130 l3 -5 h12 l4 5" fill="#B8F0FF" ${s}/><circle cx="-24" cy="140" r="2.6" fill="${T}"/><circle cx="-10" cy="140" r="2.6" fill="${T}"/><path d="M-4 133 l14 -2 v6z" fill="#FFF4DF" opacity=".6"/></g>`;

/* ================================ Monaco ================================ */

const MONACO = `
  <defs>
    <linearGradient id="ciel-monaco" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FD3F7"/><stop offset=".75" stop-color="#FFE3B3"/><stop offset="1" stop-color="#FFC48A"/></linearGradient>
    <linearGradient id="mer-monaco" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FA9E0"/><stop offset="1" stop-color="#1E6FB0"/></linearGradient>
  </defs>
  <rect width="400" height="150" fill="url(#ciel-monaco)"/>
  <circle cx="60" cy="88" r="18" fill="#FFF0B8"/>
  <g class="nuage"><path d="M110 30 q4 -10 14 -6 q6 -8 16 -2 q10 -2 10 8 h-40z" fill="#FFF" opacity=".9"/></g>
  <g class="nuage lent"><path d="M300 18 q4 -8 12 -5 q6 -7 14 -1 q8 -1 8 7 h-34z" fill="#FFF" opacity=".85"/></g>
  <!-- Collines et montagne -->
  <path d="M120 96 Q170 50 230 60 Q290 40 340 62 L400 52 V100 H120z" fill="#8CC57A" ${s}/>
  <path d="M150 84 q40 -18 90 -12" fill="none" stroke="#6BA85A" stroke-width="2"/>
  <!-- Le rocher et ses maisons -->
  <path d="M256 104 V72 q30 -16 70 -6 q40 4 74 -6 V104z" fill="#D8B48A" ${S}/>
  ${[[266, 70, '#FF9A8A'], [288, 64, '#FFD36B'], [310, 62, '#F6E3C0'], [332, 64, '#FFB57A'], [354, 62, '#FF9AC1'], [376, 58, '#FFD36B']].map(([x, y, c], i) => `
    <rect x="${x}" y="${(y as number) - 4}" width="18" height="${108 - (y as number)}" fill="${c}" ${s}/>
    <path d="M${(x as number) - 2} ${(y as number) - 4} l11 -8 l11 8z" fill="#D9573E" ${s}/>
    <rect x="${(x as number) + 4}" y="${(y as number) + 4}" width="4" height="5" fill="#46C2F0" stroke="${T}" stroke-width="1"/><rect x="${(x as number) + 11}" y="${(y as number) + 4}" width="4" height="5" fill="#46C2F0" stroke="${T}" stroke-width="1"/>
    ${i % 2 ? `<rect x="${(x as number) + 4}" y="${(y as number) + 14}" width="4" height="5" fill="#46C2F0" stroke="${T}" stroke-width="1"/>` : ''}`).join('')}
  <!-- Le casino Belle Époque -->
  <path d="M110 104 V70 h120 v34z" fill="#FFF4DF" ${S}/>
  <path d="M104 72 h132 l-6 -8 h-120z" fill="#E8D3A6" ${S}/>
  ${[118, 222].map((x) => `
    <rect x="${x - 10}" y="44" width="20" height="28" fill="#FFF4DF" ${S}/>
    <path d="M${x - 12} 46 q12 -22 24 0z" fill="#6CC3A8" ${S}/>
    <path d="M${x} 24 v-6" stroke="${T}" stroke-width="2"/><circle cx="${x}" cy="17" r="2" fill="#FFC23D" ${s}/>
    <rect x="${x - 4}" y="52" width="8" height="12" rx="4" fill="#46C2F0" ${s}/>`).join('')}
  <path d="M150 70 q20 -26 40 0z" fill="#6CC3A8" ${S}/>
  <circle cx="170" cy="60" r="5" fill="#FFF4DF" ${s}/><path d="M170 57 v3 l2 1.5" stroke="${T}" stroke-width="1.2" fill="none"/>
  ${[128, 146, 194, 212].map((x) => `<rect x="${x - 5}" y="78" width="10" height="16" rx="5" fill="#FFD98A" ${s}/>`).join('')}
  <path d="M160 104 v-16 q10 -12 20 0 v16z" fill="#7B4A2E" ${s}/>
  <path d="M110 104 h120" stroke="${T}" stroke-width="2.5"/>
  ${palmier(98, 108, 34, '#43B072')}${palmier(244, 108, 30, '#43B072')}
  <!-- La mer et les yachts -->
  <rect x="0" y="104" width="400" height="46" fill="url(#mer-monaco)"/>
  <path d="M0 104 h400" stroke="${T}" stroke-width="2.5"/>
  ${[[30, 116], [150, 126], [250, 118], [350, 132], [90, 138]].map(([x, y], i) => `<path d="M${x} ${y} q6 -4 12 0 q6 4 12 0" fill="none" stroke="#B8E8FF" stroke-width="1.8" stroke-linecap="round" class="vague" style="animation-delay:${i * 0.6}s"/>`).join('')}
  <g class="flotte">
    <path d="M40 128 h70 l-10 12 h-52z" fill="#FFF" ${S}/><path d="M44 132 h62" stroke="#2E8FD0" stroke-width="2.5"/>
    <path d="M56 128 v-10 h30 l10 10z" fill="#FFF" ${s}/><path d="M62 122 h20" stroke="#2E8FD0" stroke-width="3"/>
  </g>
  <g class="flotte lent">
    <path d="M300 122 h44 l-7 9 h-32z" fill="#FFF4DF" ${S}/>
    <path d="M322 122 V86" stroke="${T}" stroke-width="2"/>
    <path d="M324 88 l18 30 h-18z" fill="#FFF" ${s}/><path d="M320 92 l-14 26 h14z" fill="#FF6B5B" ${s}/>
    <path d="M322 86 l8 3 l-8 3" fill="#E5484D"/>
  </g>`;

/* ================================ Macao ================================ */

const MACAO = `
  <defs>
    <linearGradient id="ciel-macao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0F0C2A"/><stop offset=".75" stop-color="#3F1A5A"/><stop offset="1" stop-color="#7A2A6A"/></linearGradient>
    <linearGradient id="or-macao" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E59A12"/><stop offset=".5" stop-color="#FFE27A"/><stop offset="1" stop-color="#E59A12"/></linearGradient>
    <radialGradient id="lune-halo"><stop offset="0" stop-color="#FFF4DF" stop-opacity=".35"/><stop offset="1" stop-color="#FFF4DF" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="150" fill="url(#ciel-macao)"/>
  ${etoiles(22, 5, 70)}
  <circle cx="330" cy="34" r="34" fill="url(#lune-halo)"/><circle cx="330" cy="34" r="15" fill="#FFF4DF"/><circle cx="325" cy="31" r="3" fill="#EADFC8"/><circle cx="335" cy="38" r="2" fill="#EADFC8"/>
  <!-- Feu d'artifice -->
  <g class="artifice" style="transform-origin:90px 30px">${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${(90 + Math.cos(a) * 6).toFixed(1)} ${(30 + Math.sin(a) * 6).toFixed(1)} L${(90 + Math.cos(a) * 16).toFixed(1)} ${(30 + Math.sin(a) * 16).toFixed(1)}" stroke="${i % 2 ? '#FF6BD5' : '#FFC23D'}" stroke-width="2" stroke-linecap="round"/>`; }).join('')}</g>
  <g class="artifice lent" style="transform-origin:250px 22px">${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<path d="M${(250 + Math.cos(a) * 4).toFixed(1)} ${(22 + Math.sin(a) * 4).toFixed(1)} L${(250 + Math.cos(a) * 11).toFixed(1)} ${(22 + Math.sin(a) * 11).toFixed(1)}" stroke="#7CF2FF" stroke-width="1.8" stroke-linecap="round"/>`; }).join('')}</g>
  <!-- Les tours de la ville -->
  <path d="M232 112 V58 h26 v54z" fill="#2E2A6B" ${s}/>${fenetres(236, 62, 3, 8, 4, 3, 3, 2.6, '#7CF2FF', '#26225A', 31)}
  <path d="M262 112 V70 h30 v42z" fill="#5A2A7A" ${s}/>${fenetres(266, 74, 4, 6, 4, 3, 3, 3, '#FFC23D', '#45205E', 32)}
  <path d="M110 112 V64 h28 v48z" fill="#3B2A7A" ${s}/>${fenetres(114, 68, 4, 7, 3.5, 3, 3, 3, '#FFE27A', '#2E2160', 33)}
  <!-- La tour lotus dorée -->
  <path d="M168 112 V92 q-14 -10 -10 -30 q10 4 14 16 q-2 -24 18 -42 q6 -14 10 -26 q4 12 10 26 q20 18 18 42 q4 -12 14 -16 q4 20 -10 30 v20z" fill="url(#or-macao)" ${S}/>
  <path d="M200 10 v-6" stroke="${T}" stroke-width="2"/><circle cx="200" cy="4" r="2.4" fill="#FF6B5B" class="scintille"/>
  ${Array.from({ length: 6 }, (_, j) => Array.from({ length: 4 }, (_, i) => `<rect x="${186 + i * 7}" y="${42 + j * 9}" width="4" height="5" rx="1" fill="#FFF4DF" opacity="${(i + j) % 3 ? 0.95 : 0.4}"/>`).join('')).join('')}
  <path d="M180 78 q20 10 40 0 M176 90 q24 10 48 0" fill="none" stroke="#B3700E" stroke-width="1.6"/>
  <!-- La pagode et ses lanternes -->
  <g>
    <rect x="22" y="80" width="56" height="32" fill="#C0392B" ${S}/>
    <rect x="40" y="92" width="20" height="20" rx="2" fill="#FFD98A" ${s}/>
    <path d="M10 82 q40 -6 80 0 l-8 -10 h-64z" fill="#E5484D" ${S}/>
    <rect x="30" y="58" width="40" height="16" fill="#C0392B" ${S}/>
    <path d="M18 60 q32 -6 64 0 l-8 -10 h-48z" fill="#E5484D" ${S}/>
    <path d="M28 52 q22 -18 44 0z" fill="#E5484D" ${S}/><path d="M50 40 v-8" stroke="${T}" stroke-width="2"/><circle cx="50" cy="31" r="2.2" fill="#FFC23D" ${s}/>
    ${[36, 50, 64].map((x) => `<rect x="${x - 3}" y="62" width="6" height="8" fill="#FFD98A" stroke="${T}" stroke-width="1"/>`).join('')}
  </g>
  <path d="M84 70 q42 14 84 6" fill="none" stroke="${T}" stroke-width="1.2"/>
  ${[100, 118, 136, 154].map((x, i) => `<g class="lanterne" style="transform-origin:${x}px ${74 + (i === 0 || i === 3 ? 1 : 3)}px;animation-delay:${i * 0.4}s"><path d="M${x} ${74 + (i === 0 || i === 3 ? 1 : 3)} v4" stroke="${T}" stroke-width="1"/><ellipse cx="${x}" cy="${84 + (i === 0 || i === 3 ? 1 : 3)}" rx="5" ry="6" fill="#FF4B3E" ${s}/><path d="M${x - 3} ${78 + (i === 0 || i === 3 ? 1 : 3)} h6 M${x - 3} ${90 + (i === 0 || i === 3 ? 1 : 3)} h6" stroke="#FFC23D" stroke-width="1.6"/></g>`).join('')}
  <!-- Le pont illuminé -->
  <path d="M290 112 Q345 80 400 100" fill="none" stroke="${T}" stroke-width="5"/><path d="M290 112 Q345 80 400 100" fill="none" stroke="#B8B0D8" stroke-width="2.4"/>
  ${Array.from({ length: 9 }, (_, i) => { const t = i / 8, x = 290 + 110 * t, y = (1 - t) * (1 - t) * 112 + 2 * (1 - t) * t * 80 + t * t * 100; return `<circle cx="${x.toFixed(1)}" cy="${(y - 3).toFixed(1)}" r="1.8" fill="#FFE27A" class="scintille lent" style="animation-delay:${i * 0.3}s"/>`; }).join('')}
  <!-- L'eau et les reflets -->
  <rect x="0" y="112" width="400" height="38" fill="#1B1640"/>
  <path d="M0 112 h400" stroke="${T}" stroke-width="2.5"/>
  ${[[190, 118, 22], [196, 126, 14], [200, 134, 8], [46, 120, 16], [118, 122, 10], [250, 120, 12], [340, 124, 18]].map(([x, y, w], i) => `<path d="M${x - w / 2} ${y} h${w}" stroke="${i < 3 ? '#FFC23D' : i === 3 ? '#FF6B5B' : '#7CF2FF'}" stroke-width="2" stroke-linecap="round" opacity=".7" class="reflet" style="animation-delay:${i * 0.4}s"/>`).join('')}
  <g class="flotte lent"><path d="M300 138 h34 l-5 6 h-24z" fill="#C0392B" ${s}/><path d="M314 138 v-16 q8 6 12 14z" fill="#FFD98A" ${s}/></g>`;

const SCENES: Record<string, string> = { bistrot: BISTROT, vegas: VEGAS, monaco: MONACO, macao: MACAO };

/** La carte postale d'une ville, en SVG prêt à insérer. */
export function illustrationVille(id: string): string {
  const scene = SCENES[id];
  if (!scene) return '';
  return `<svg class="scene-ville" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${scene}</svg>`;
}
