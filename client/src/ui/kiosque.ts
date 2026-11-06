/**
 * Le Kiosque : la vitrine, les tickets à gratter (au doigt), le Keno et le Loto Flash en direct.
 * Tout s'affiche dans la zone de contenu du Club (le portefeuille et les onglets restent visibles).
 */
import type { TypeTicket } from '../../../moteur/kiosque';
import { TICKETS, tauxRetour, chanceGain, casesGagnantes, KENO, KENO_GAINS, LOTO, LOTO_GAINS } from '../../../moteur/kiosque';
import type { ContenuBanco, ContenuCoffre, ContenuTrefle, ContenuMillionnaire } from '../../../moteur/kiosque';
import { api, ErreurApi } from '../reseau';
import { fmt } from '../art/rendu';
import { jouerSon } from '../vue/son';
import { $, $$, esc, html, toast, panneau, suspense } from './commun';

export interface EtatPortefeuille { solde: number; tickets: number }

export interface ContexteKiosque {
  porte(): EtatPortefeuille | null;
  /** Met à jour le portefeuille ; `affiche` = solde montré pour l'instant (suspense du grattage). */
  majPorte(e: EtatPortefeuille, affiche?: number): void;
  aller(vue: string | null): void;
  celebrer(depuis: HTMLElement, pieces: number): void;
  /** Rappelé à chaque changement de vue pour arrêter les minuteries. */
  nettoyer(f: () => void): void;
  /** Revenir à la rue (avec l'animation de retour). */
  retourRue(): void;
}

const clubs = (n: number) => `${fmt(n)}&nbsp;<i class="pc"></i>`;
const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const duree = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const erreur = (e: unknown) => toast(e instanceof ErreurApi ? e.message : 'Le Kiosque ne répond pas', true);

const TICKETS_VITRINE: { type: TypeTicket; nom: string; prix: number; accroche: string; max: number }[] = [
  { type: 'banco', nom: 'Le Banco', prix: 100, accroche: '3 montants pareils', max: 20_000 },
  { type: 'coffre', nom: 'Le Coffre', prix: 500, accroche: 'Ouvre le coffre-fort', max: 100_000 },
  { type: 'trefle', nom: 'Trèfle Cash', prix: 1_000, accroche: 'Plus d\'1 chance sur 4', max: 250_000 },
  { type: 'millionnaire', nom: 'Le Millionnaire', prix: 5_000, accroche: '3 jeux, 1 million', max: 1_000_000 },
];

/* ================================ Vitrine ================================ */

export function vueVitrine(c: HTMLElement, ctx: ContexteKiosque) {
  const offerts = ctx.porte()?.tickets ?? 0;
  c.innerHTML = `<div class="kiosque-vue">
    <div class="ligne" style="gap:10px;margin-bottom:10px"><button class="btn btn-rond btn-fantome" data-retour-rue aria-label="Retour à la rue">←</button><h1 style="font-size:26px">Le Kiosque</h1></div>
    <div class="auvent-large"></div>
    ${offerts ? `<button class="annonce bonus" data-offert><span class="mini-ticket"><i></i><i class="g"></i><i></i><i class="g"></i><i></i><i class="g"></i></span><span><b>${offerts} ticket${offerts > 1 ? 's' : ''} offert${offerts > 1 ? 's' : ''}</b><small>Un Banco gratuit à gratter, touche pour le prendre</small></span></button>` : ''}
    <h3 class="titre-rubrique">Tickets à gratter</h3>
    <div class="presentoir">${TICKETS_VITRINE.map((t, i) => `<button class="tk t-${t.type}" data-ticket="${t.type}" style="--d:${i * 0.08}s">
      ${t.type === 'trefle' ? '<span class="ruban">+ d\'1 chance sur 4</span>' : t.type === 'millionnaire' ? '<span class="ruban">Gros lot</span>' : ''}
      <span class="tk-titre">${t.nom}</span>
      <span class="tk-illu">${miniTicket(t.type)}</span>
      <span class="tk-max"><i class="eclat e1">✦</i><small>jusqu'à</small><b>${fmtCourt(t.max)}</b><i class="eclat e2">✦</i></span>
      <span class="tk-prix">${clubs(t.prix)}</span>
      <i class="reflet"></i>
    </button>`).join('')}</div>
    <h3 class="titre-rubrique">Tirages en direct</h3>
    <button class="tirage-carte keno" data-vue="keno">
      <span class="tableau-keno">${Array.from({ length: 20 }, (_, i) => `<i style="--i:${(i * 7) % 20}">${[3, 9, 14, 22, 27, 31, 35, 40, 44, 48, 51, 55, 58, 61, 63, 66, 2, 18, 29, 70][i]}</i>`).join('')}</span>
      <span class="txt"><b class="logo-keno">KENO <em>du Club</em></b><span>Coche 1 à 10 numéros sur 70</span><span class="prochain">Prochain tirage dans <b data-chrono-keno>…</b></span></span></button>
    <button class="tirage-carte loto" data-vue="loto">
      <span class="tambour">${[5, 12, 19, 23, 8].map((n, i) => `<i style="--i:${i}">${n}</i>`).join('')}<i class="etoile-boule" style="--i:5">★</i></span>
      <span class="txt"><b class="logo-loto">LOTO <em>FLASH</em> <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#FFC23D" stroke="#2A1E3F" stroke-width="1.8" stroke-linejoin="round"/></svg></b>
        <span class="cagnotte-carte"><small>Cagnotte</small><b data-cagnotte>…</b></span>
        <span class="prochain">5 numéros + 1 étoile · tirage dans <b data-chrono-loto>…</b></span></span></button>
    <p class="doux petit" style="text-align:center;margin-top:14px">Argent fictif du Club : on joue pour le plaisir, rien ne s'achète et rien ne se retire.</p>
  </div>`;
  $$('[data-ticket]', c).forEach((b) => b.onclick = () => ctx.aller(`ticket:${b.dataset.ticket}`));
  $$('[data-vue]', c).forEach((b) => b.onclick = () => ctx.aller(b.dataset.vue!));
  const o = $('[data-offert]', c); if (o) o.onclick = () => ctx.aller('ticket:banco:offert');
  $('[data-retour-rue]', c).onclick = () => ctx.retourRue();
  // Comptes à rebours des tirages (calés sur l'heure du serveur)
  let decalage = 0, cagnotte: number | null = null;
  void api<{ maintenant: number; cagnotte: number }>('/api/kiosque/loto').then((r) => {
    decalage = r.maintenant - Date.now(); cagnotte = r.cagnotte;
    const el = $('[data-cagnotte]', c); if (el) el.innerHTML = clubs(cagnotte);
  }).catch(() => {});
  const tic = () => {
    const t = Date.now() + decalage;
    const k = $('[data-chrono-keno]', c), l = $('[data-chrono-loto]', c);
    if (!k || !l) return;
    k.textContent = duree((Math.floor(t / KENO.periode) + 1) * KENO.periode - t);
    l.textContent = duree((Math.floor(t / LOTO.periode) + 1) * LOTO.periode - t);
  };
  tic();
  const m = setInterval(tic, 500);
  ctx.nettoyer(() => { clearInterval(m); suspense.kiosque = false; });
}

/** « 250 000 » → « 250 000 », « 1 000 000 » → « 1 MILLION » (pour les étiquettes). */
const fmtCourt = (n: number) => (n >= 1_000_000 ? `${fmt(n / 1_000_000)} MILLION` : fmt(n));

/** La petite illustration de chaque ticket sur le présentoir. */
function miniTicket(t: TypeTicket): string {
  const T = '#2A1E3F';
  const argent = '#C9C3D6';
  if (t === 'banco') {
    const v = ['500', '', '500', '2 000', '500', ''];
    return `<svg viewBox="0 0 120 78" aria-hidden="true">${v.map((x, i) => {
      const cx = 6 + (i % 3) * 38, cy = 4 + Math.floor(i / 3) * 37;
      return `<rect x="${cx}" y="${cy}" width="32" height="32" rx="7" fill="${x ? (x === '500' ? '#FFC23D' : '#fff') : argent}" stroke="${T}" stroke-width="2.5"/>${x ? `<text x="${cx + 16}" y="${cy + 21}" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="700" font-size="${x.length > 3 ? 9 : 12}" fill="${T}">${x}</text>` : `<path d="M${cx + 6} ${cy + 26} l20 -20" stroke="#B5AEC6" stroke-width="5"/>`}`;
    }).join('')}</svg>`;
  }
  if (t === 'coffre') {
    return `<svg viewBox="0 0 120 78" aria-hidden="true">
      <rect x="22" y="4" width="76" height="66" rx="8" fill="#C7CCD8" stroke="${T}" stroke-width="2.5"/>
      <rect x="29" y="11" width="62" height="52" rx="5" fill="#3A3150" stroke="${T}" stroke-width="2"/>
      ${[[38, 45], [60, 45], [49, 28]].map(([x, y]) => `<path d="M${x} ${y + 14} l4 -12 h16 l4 12z" fill="#FFC23D" stroke="${T}" stroke-width="2" stroke-linejoin="round"/>`).join('')}
      <path d="M98 14 l14 -6 v60 l-14 -4z" fill="#9AA3B8" stroke="${T}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="105" cy="38" r="4" fill="#FFC23D" stroke="${T}" stroke-width="1.5"/></svg>`;
  }
  if (t === 'trefle') {
    const etoile = (x: number, y: number, n: string, f = '#FFC23D') => `<path transform="translate(${x} ${y})" d="M0 -12 l3.5 7.5 l8.3 1 l-6 5.8 l1.5 8.2 l-7.3 -4 l-7.3 4 l1.5 -8.2 l-6 -5.8 l8.3 -1z" fill="${f}" stroke="${T}" stroke-width="2" stroke-linejoin="round"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="700" font-size="8.5" fill="${T}">${n}</text>`;
    return `<svg viewBox="0 0 120 78" aria-hidden="true">
      <rect x="2" y="2" width="116" height="30" rx="7" fill="#17403F" stroke="${T}" stroke-width="2"/>
      ${etoile(22, 18, '12')}${etoile(60, 18, '7')}${etoile(98, 18, '28')}
      ${Array.from({ length: 8 }, (_, i) => { const x = 3 + (i % 4) * 29, y = 37 + Math.floor(i / 4) * 21; const c = i === 2 ? '#FFC23D' : i === 5 ? argent : '#1F5C5A'; return `<rect x="${x}" y="${y}" width="27" height="18" rx="4" fill="${c}" stroke="${T}" stroke-width="1.8"/>${i === 5 ? '' : `<text x="${x + 13.5}" y="${y + 13}" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="700" font-size="${i === 6 ? 13 : 10}" fill="${i === 2 ? T : i === 6 ? '#5BE38B' : '#FFF4DF'}">${['31', '4', '7', '19', '25', '', '♣\uFE0E', '11'][i]}</text>`}`; }).join('')}</svg>`;
  }
  return `<svg viewBox="0 0 120 78" aria-hidden="true">
    <path d="M30 56 l-8 -34 l20 14 l18 -26 l18 26 l20 -14 l-8 34z" fill="#FFC23D" stroke="${T}" stroke-width="2.8" stroke-linejoin="round"/>
    <rect x="28" y="56" width="64" height="12" rx="3" fill="#E59A12" stroke="${T}" stroke-width="2.5"/>
    ${[[42, 44, '#FF6B5B'], [60, 40, '#46C2F0'], [78, 44, '#43B072']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="5" fill="${c}" stroke="${T}" stroke-width="1.8"/>`).join('')}
    <path d="M8 20 l4 -6 l4 6 l-4 6z M104 14 l5 -7 l5 7 l-5 7z" fill="#BFE8FF" stroke="${T}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

/* ============================ Ticket à gratter ============================ */

interface ReponseTicket { id: number; type: TypeTicket; gain: number; contenu: any; etat: EtatPortefeuille }

export function vueTicket(c: HTMLElement, ctx: ContexteKiosque, type: TypeTicket, offert: boolean) {
  const def = TICKETS_VITRINE.find((t) => t.type === type) ?? TICKETS_VITRINE[0];
  type = def.type;
  c.innerHTML = `<div class="vue-ticket">
    <div class="ligne" style="gap:10px;margin-bottom:12px"><button class="btn btn-rond btn-fantome" data-retour aria-label="Retour au Kiosque">←</button><h1 style="font-size:24px">${def.nom}</h1></div>
    <div data-ticket-zone></div>
    <div data-resultat></div>
    <div class="actions-ticket" data-actions></div>
  </div>`;
  $('[data-retour]', c).onclick = () => ctx.aller('kiosque');
  let gratuitCourant = offert;

  const ticketHTML = (r: ReponseTicket, emballe: boolean) => `<div class="ticket-grand t-${type} ${emballe ? 'emballe' : ''}">
      <div class="entete-ticket"><b>${def.nom}</b><span class="prix">${gratuitCourant ? 'offert' : clubs(def.prix)}</span></div>
      <p class="regle-ticket">${accroche(type)}</p>
      <div class="jeu-ticket">${contenuHTML(r)}${emballe ? '' : '<canvas class="couche-grattage"></canvas>'}</div>
      <div class="pied-ticket"><small>Gagne jusqu'à ${clubs(def.max)}</small><small>${emballe ? 'n° ——————' : `n° ${String(r.id).padStart(6, '0')}`}</small></div>
    </div>`;

  presenter(offert);

  /** Le ticket encore emballé : rien n'est débité tant qu'on n'a pas appuyé sur « Jouer ». */
  function presenter(gratuit: boolean) {
    gratuitCourant = gratuit;
    $('[data-resultat]', c).innerHTML = '';
    $('[data-ticket-zone]', c).innerHTML = ticketHTML(exemple(type), true);
    const solde = ctx.porte()?.solde ?? 0, assez = gratuit || solde >= def.prix;
    $('[data-actions]', c).innerHTML = `<button class="btn btn-regles" data-regles aria-label="Règles">⚙ Règles</button>
      <button class="btn btn-or" data-jouer ${assez ? '' : 'disabled'}>${gratuit ? 'Jouer (offert)' : assez ? `Jouer · ${clubs(def.prix)}` : 'Pas assez de Clubs'}</button>`;
    $('[data-regles]', c).onclick = () => ouvrirReglesTicket(type);
    $('[data-jouer]', c).onclick = () => void acheter(gratuit);
  }

  async function acheter(gratuit: boolean) {
    gratuitCourant = gratuit;
    const bj = $('[data-jouer]', c) as HTMLButtonElement | null; if (bj) bj.disabled = true;
    // Rien ne doit trahir le résultat avant la dernière case grattée
    suspense.kiosque = true;
    let r: ReponseTicket;
    try { r = await api<ReponseTicket>('/api/kiosque/ticket', { type, offert: gratuit }); }
    catch (e) { erreur(e); if (bj) bj.disabled = false; suspense.kiosque = false; return; }
    if (!c.isConnected) { suspense.kiosque = false; return; }
    jouerSon('jeton');
    // Le gain est déjà crédité côté serveur : on garde le suspense jusqu'au grattage
    ctx.majPorte(r.etat, r.etat.solde - r.gain);
    afficherTicket(r);
  }

  function afficherTicket(r: ReponseTicket) {
    const zone = $('[data-ticket-zone]', c);
    zone.innerHTML = ticketHTML(r, false);
    $('[data-actions]', c).innerHTML = `<button class="btn btn-regles" data-regles aria-label="Règles">⚙ Règles</button><button class="btn btn-ciel" data-auto>AUTO</button>`;
    $('[data-regles]', c).onclick = () => ouvrirReglesTicket(type);
    const gagnantes = new Set(casesGagnantes({ type, gain: r.gain, contenu: r.contenu }));
    let fini = false;
    // Le ticket est vu : le serveur compte les missions et annonce les gros gains à ce moment-là
    const signalerVu = () => void api(`/api/kiosque/ticket/${r.id}/vu`, {}).catch(() => {});
    ctx.nettoyer(() => { if (!fini) { fini = true; signalerVu(); } suspense.kiosque = false; });
    const reveler = () => {
      if (fini) return;
      fini = true;
      signalerVu();
      const cv = $('canvas', zone) as HTMLCanvasElement | null;
      if (cv) { cv.style.transition = 'opacity .4s'; cv.style.opacity = '0'; setTimeout(() => cv.remove(), 420); }
      $$('[data-id]', zone).forEach((e) => e.classList.toggle('gagnante', gagnantes.has(e.dataset.id!)));
      const res = $('[data-resultat]', c);
      if (r.gain) {
        res.innerHTML = `<div class="resultat-ticket gagne"><b>Gagné ! +${clubs(r.gain)}</b><span>${r.gain >= def.prix * 10 ? 'Gros lot, bravo !' : 'Crédité sur ton portefeuille'}</span></div>`;
        jouerSon(r.gain >= def.prix * 10 ? 'grosGain' : 'gagne');
        ctx.majPorte(r.etat);
        ctx.celebrer($('.resultat-ticket', res), r.gain >= def.prix * 10 ? 16 : 8);
      } else {
        res.innerHTML = `<div class="resultat-ticket perdu"><b>Perdu…</b><span>Ce sera pour le prochain !</span></div>`;
        jouerSon('parole');
        ctx.majPorte(r.etat);
      }
      // Le résultat est à l'écran : les notifications peuvent passer
      suspense.kiosque = false;
      $('[data-actions]', c).innerHTML = `<button class="btn" data-kiosque>Le Kiosque</button><button class="btn btn-or" data-encore>Un autre ticket</button>`;
      $('[data-kiosque]', c).onclick = () => ctx.aller('kiosque');
      $('[data-encore]', c).onclick = () => { const offerts = ctx.porte()?.tickets ?? 0; presenter(type === 'banco' && offerts > 0); };
    };
    // Chaque case découverte s'allume si elle gagne, tout de suite
    const surZone = (el: HTMLElement) => { el.classList.add('decouvert'); if (gagnantes.has(el.dataset.id!)) { el.classList.add('gagnante'); jouerSon('jeton'); } };
    requestAnimationFrame(() => {
      const g = installerGrattage($('canvas', zone) as HTMLCanvasElement, $$('[data-grat]', zone), surZone, reveler);
      $('[data-auto]', c).onclick = (e) => { (e.currentTarget as HTMLButtonElement).disabled = true; void g?.auto(); };
    });
  }
}

/** Un ticket « vierge » pour la présentation : la mise en page exacte, sans le contenu. */
function exemple(type: TypeTicket): ReponseTicket {
  const contenu: unknown = type === 'banco' ? { cases: Array(6).fill(0) } satisfies ContenuBanco
    : type === 'coffre' ? { gagnants: [0, 0, 0], lingots: Array.from({ length: 10 }, () => ({ n: 0, lot: 0 })) } satisfies ContenuCoffre
    : type === 'trefle' ? { gagnants: [0, 0, 0, 0, 0], cases: Array.from({ length: 20 }, () => ({ n: 0, lot: 0 })) } satisfies ContenuTrefle
    : { symboles: { cases: ['', '', ''], lot: 0 }, duel: { mes: [0, 0, 0], sien: 0, lot: 0 }, couronne: { cases: Array(6).fill(''), lot: 0 } } satisfies ContenuMillionnaire;
  return { id: 0, type, gain: 0, contenu, etat: { solde: 0, tickets: 0 } };
}

/** Les règles d'un ticket, avec le tableau des lots et les chances de les gagner. */
function ouvrirReglesTicket(type: TypeTicket) {
  const d = TICKETS[type];
  const p = panneau(`<h2>${d.nom} · règles</h2>
    <p>${esc(d.regle)}</p>
    <p class="doux petit">Gratte les cases argentées au doigt (ou à la souris), une par une. Pressé ? « AUTO » gratte tout pour toi.</p>
    <table class="table-lots"><thead><tr><th>Lot</th><th>Chance</th></tr></thead><tbody>
      ${[...d.gains].reverse().map(([g, pr]) => `<tr><td><b>${clubs(g)}</b>${g === d.prix ? ' <small>(remboursé)</small>' : ''}</td><td>1 sur ${fmt(Math.round(1_000_000 / pr))}</td></tr>`).join('')}
    </tbody></table>
    <p class="doux petit" style="margin-top:10px">Prix du ticket : ${clubs(d.prix)} · un ticket gagnant sur ${(1 / chanceGain(d)).toFixed(1).replace('.', ',')} · en moyenne, ${Math.round(tauxRetour(d) * 100)} % des mises reviennent aux joueurs.</p>
    <button class="btn btn-or btn-plein" data-ok>Compris</button>`);
  $('[data-ok]', p.el).onclick = () => p.fermer();
}

function accroche(type: TypeTicket) {
  return type === 'banco' ? '3 montants identiques ? Tu gagnes ce montant.'
    : type === 'coffre' ? 'Un de tes lingots porte un numéro gagnant ? Tu gagnes le lot écrit dessous.'
    : type === 'trefle' ? 'Tes numéros parmi les gagnants rapportent leur lot. Un ♣\uFE0E gagne directement !'
    : '3 jeux sur un ticket : les gains s\'additionnent.';
}

const lot = (n: number) => (n ? fmt(n) : '');
const numero = (n: number | null) => (n === null ? '♣\uFE0E' : n ? String(n) : '');

function contenuHTML(r: ReponseTicket): string {
  if (r.type === 'banco') {
    const ct = r.contenu as ContenuBanco;
    return `<div class="grille-banco">${ct.cases.map((v, i) => `<span data-grat data-id="c${i}"><b>${lot(v)}</b><small>${v ? '<i class="pc"></i>' : ''}</small></span>`).join('')}</div>`;
  }
  if (r.type === 'coffre') {
    const ct = r.contenu as ContenuCoffre;
    // Pyramide de lingots : 1, 2, 3, puis 4
    const rangs = [[0], [1, 2], [3, 4, 5], [6, 7, 8, 9]];
    return `<div class="coffre-fort"><span class="porte-g"></span><span class="porte-d"></span>
      <div class="interieur">
        <span class="etiquette-coffre">NUMÉROS GAGNANTS</span>
        <div class="piles">${ct.gagnants.map((n, i) => `<span class="pile"><i></i><i></i><i></i><b data-grat data-id="g${i}">${n || ''}</b></span>`).join('')}</div>
        <span class="etagere"></span>
        <span class="etiquette-coffre">VOS NUMÉROS</span>
        <div class="lingots">${rangs.map((rg) => `<div>${rg.map((i) => `<span class="lingot" data-grat data-id="l${i}"><b>${ct.lingots[i].n || ''}</b><small>${lot(ct.lingots[i].lot)}</small></span>`).join('')}</div>`).join('')}</div>
      </div></div>`;
  }
  if (r.type === 'trefle') {
    const ct = r.contenu as ContenuTrefle;
    return `<div class="trefle-haut"><span class="logo-trefle">TRÈFLE<br><em>♣\uFE0ECASH</em></span><span class="chance-trefle">PLUS<br><b>D'1 CHANCE<br>SUR 4</b><br>DE GAGNER</span></div>
      <div class="cadre-trefle"><span class="titre-cadre">N° GAGNANTS</span><div class="etoiles-trefle">${ct.gagnants.map((n, i) => `<span class="etoile-trefle" data-grat data-id="g${i}"><b>${n || ''}</b></span>`).join('')}</div></div>
      <div class="cadre-trefle"><span class="titre-cadre">VOS NUMÉROS</span><div class="grille-trefle">${ct.cases.map((x, i) => `<span data-grat data-id="c${i}" class="${x.n === null ? 'trefle-direct' : ''}"><b>${numero(x.n)}</b><small>${lot(x.lot)}</small></span>`).join('')}</div></div>`;
  }
  const ct = r.contenu as ContenuMillionnaire;
  const jeu = (titre: string, lotJeu: number, corps: string) => `<div class="jeu-million"><div class="titre-jeu"><b>${titre}</b><small>${lotJeu ? `lot : ${clubs(lotJeu)}` : ''}</small></div>${corps}</div>`;
  return `<div class="bandeau-million">GROS LOT ${clubs(1_000_000)}</div>
    ${jeu('Jeu 1 · 3 symboles identiques', ct.symboles.lot, `<div class="cases-million trois">${ct.symboles.cases.map((x, i) => `<span data-grat data-id="s${i}">${x}</span>`).join('')}</div>`)}
    ${jeu('Jeu 2 · Un de tes numéros bat le sien', ct.duel.lot, `<div class="duel-million"><div class="cases-million trois">${ct.duel.mes.map((n, i) => `<span data-grat data-id="d${i}"><b>${n || ''}</b></span>`).join('')}</div><em>contre</em><span class="sien" data-grat data-id="sien"><b>${ct.duel.sien || ''}</b></span></div>`)}
    ${jeu('Jeu 3 · Trouve la 👑', ct.couronne.lot, `<div class="cases-million six">${ct.couronne.cases.map((x, i) => `<span data-grat data-id="k${i}">${x}</span>`).join('')}</div>`)}`;
}

/** Arrondi d'une zone argentée. */
function rectArrondi(x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}

/**
 * La couche argentée : seules les cases du ticket sont recouvertes, chacune se gratte au doigt.
 * Une case grattée à plus de moitié se découvre d'elle-même ; quand toutes le sont, le ticket est fini.
 * `auto()` gratte les cases restantes une à une, comme une main pressée.
 */
function installerGrattage(cv: HTMLCanvasElement, zones: HTMLElement[], surZone: (el: HTMLElement) => void, fini: () => void) {
  if (!cv || !cv.isConnected) return null;
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const x = cv.getContext('2d', { willReadFrequently: true })!;
  x.scale(dpr, dpr);
  const motif = document.createElement('canvas'); motif.width = motif.height = 16;
  const m = motif.getContext('2d')!;
  m.fillStyle = '#C9C3D6'; m.fillRect(0, 0, 16, 16);
  m.strokeStyle = '#B5AEC6'; m.lineWidth = 5; m.beginPath(); m.moveTo(-4, 20); m.lineTo(20, -4); m.stroke();
  const cases = zones.map((el) => {
    const b = el.getBoundingClientRect();
    const rayon = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8;
    return { el, l: b.left - r.left, t: b.top - r.top, w: b.width, h: b.height, rayon: Math.min(rayon, b.height / 2, b.width / 2), vu: false };
  });
  for (const z of cases) {
    x.fillStyle = x.createPattern(motif, 'repeat')!;
    rectArrondi(x, z.l, z.t, z.w, z.h, z.rayon); x.fill();
    x.strokeStyle = '#A39BB6'; x.lineWidth = 2; x.stroke();
    x.fillStyle = 'rgba(58,45,94,.4)'; x.font = `700 ${Math.round(Math.min(20, z.h * 0.42))}px Fredoka, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♣', z.l + z.w / 2, z.t + z.h / 2 + 1);
  }
  x.globalCompositeOperation = 'destination-out';
  let dernier: { x: number; y: number } | null = null, coups = 0, son = 0, termine = false;
  const trait = (px: number, py: number, epais = 24) => {
    x.lineCap = 'round'; x.lineWidth = epais;
    x.beginPath();
    if (dernier) { x.moveTo(dernier.x, dernier.y); x.lineTo(px, py); x.stroke(); }
    x.arc(px, py, epais / 2, 0, Math.PI * 2); x.fill();
    dernier = { x: px, y: py };
  };
  const gratter = (px: number, py: number) => {
    trait(px, py);
    const t = performance.now(); if (t - son > 110) { son = t; jouerSon('carte'); }
    if (++coups % 6 === 0) verifier();
  };
  const decouvrir = (z: (typeof cases)[number]) => {
    z.vu = true;
    x.save(); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#000';
    rectArrondi(x, z.l - 3, z.t - 3, z.w + 6, z.h + 6, z.rayon + 3); x.fill(); x.restore();
    surZone(z.el);
  };
  const verifier = () => {
    for (const z of cases) {
      if (z.vu) continue;
      const l = Math.max(0, Math.floor(z.l * dpr)), t = Math.max(0, Math.floor(z.t * dpr));
      const w = Math.max(1, Math.min(cv.width - l, Math.floor(z.w * dpr))), h = Math.max(1, Math.min(cv.height - t, Math.floor(z.h * dpr)));
      const d = x.getImageData(l, t, w, h).data;
      let vides = 0, n = 0;
      for (let i = 3; i < d.length; i += 4 * 7) { n++; if (d[i] < 40) vides++; }
      if (vides / n > 0.5) decouvrir(z);
    }
    if (!termine && cases.every((z) => z.vu)) { termine = true; fini(); }
  };
  const pos = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); dernier = null; const p = pos(e); gratter(p.x, p.y); });
  cv.addEventListener('pointermove', (e) => { if (!cv.hasPointerCapture(e.pointerId)) return; const p = pos(e); gratter(p.x, p.y); });
  cv.addEventListener('pointerup', () => { dernier = null; verifier(); });
  const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  return {
    /** Gratte toutes les cases restantes, une à une, en zigzag. */
    async auto() {
      for (const z of cases) {
        if (z.vu || !cv.isConnected) continue;
        dernier = null;
        const passes = Math.max(2, Math.ceil(z.h / 18));
        for (let k = 0; k <= passes * 2; k++) {
          const px = z.l + (k % 2 ? z.w - 6 : 6), py = z.t + 6 + ((z.h - 12) * k) / (passes * 2);
          trait(px, py, 22);
          if (k % 3 === 0) jouerSon('carte');
          await pause(14);
        }
        decouvrir(z);
        await pause(70);
      }
      verifier();
    },
  };
}

/* ================================ Keno ================================ */

interface EtatKeno {
  prochain: { id: number; heure: number; fermeture: number };
  dernier: { id: number; numeros: number[]; heure: number } | null;
  grilles: { id: number; tirage: number; numeros: number[]; mise: number; gain: number | null }[];
  maintenant: number;
}

/** Probabilité d'avoir exactement k bons numéros en en cochant n (20 tirés sur 70). */
function chanceKeno(n: number, k: number) {
  const C = (a: number, b: number) => { if (b < 0 || b > a) return 0; let r = 1; for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i; return r; };
  return C(KENO.tires, k) * C(KENO.numeros - KENO.tires, n - k) / C(KENO.numeros, n);
}
const fmtChance = (p: number) => { const x = 1 / p; return x < 10 ? x.toFixed(1).replace('.', ',') : fmt(Math.round(x)); };

/** Comment jouer au Keno, comme sur le bulletin officiel. */
function ouvrirCommentKeno() {
  const p = panneau(`<h2>Comment jouer au Keno</h2>
    <ol class="etapes-keno">
      <li><b>Coche de 1 à 10 numéros</b> sur la grille de 1 à 70. Plus tu en coches, plus les gros lots sont gros… et plus il faut de bons numéros pour gagner.</li>
      <li><b>Choisis ta mise</b> : ${KENO.mises.map((m) => clubs(m)).join(', ')} par tirage.</li>
      <li><b>Choisis le nombre de tirages</b> : 1, 3, 5 ou 10 tirages d'affilée avec la même grille.</li>
      <li><b>Toutes les 4 minutes, 20 numéros sont tirés</b> sur les 70. Tu les vois sortir en direct, et tes bons numéros s'allument.</li>
      <li><b>Ton gain = ta mise × le multiplicateur</b> du tableau, selon le nombre de numéros cochés et de bons numéros. Il arrive tout seul sur ton portefeuille.</li>
    </ol>
    <p class="doux petit">Astuce : avec 10 numéros cochés, en trouver 0 rapporte aussi ×2 ! Les grilles se ferment 10 secondes avant chaque tirage.</p>
    <button class="btn btn-or btn-plein" data-tab>Voir le tableau des gains</button>`);
  $('[data-tab]', p.el).onclick = () => { p.fermer(); ouvrirTableauKeno(10); };
}

/** Le tableau des gains complet : un onglet par nombre de numéros cochés. */
function ouvrirTableauKeno(depart: number) {
  const p = panneau(`<h2>Tableau des gains</h2>
    <p class="doux petit" style="margin:0 0 8px">Gain pour une mise de ${clubs(100)} (pour une autre mise, c'est proportionnel). Chance calculée sur 20 numéros tirés parmi 70.</p>
    <div class="choix-coches">${Array.from({ length: 10 }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div data-table></div>`);
  const afficher = (n: number) => {
    $$('[data-n]', p.el).forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
    const g = KENO_GAINS[n];
    const total = Object.keys(g).reduce((s, k) => s + chanceKeno(n, +k), 0);
    $('[data-table]', p.el).innerHTML = `<div class="titre-bareme">${n} numéro${n > 1 ? 's' : ''} coché${n > 1 ? 's' : ''}</div>
      <table class="table-keno"><thead><tr><th>Bons numéros</th><th>Gain</th><th>Chance</th></tr></thead><tbody>
      ${Object.entries(g).sort((a, b) => +b[0] - +a[0]).map(([k, m]) => `<tr><td><b>${k}</b> sur ${n}</td><td class="gain">${clubs(m * 100)} <small>×${m}</small></td><td>1 sur ${fmtChance(chanceKeno(n, +k))}</td></tr>`).join('')}
      </tbody></table><p class="doux petit" style="margin-top:8px">Chance de gagner quelque chose : 1 sur ${fmtChance(total)}</p>`;
  };
  $$('[data-n]', p.el).forEach((b) => b.onclick = () => afficher(Number(b.dataset.n)));
  afficher(depart);
}

let choixKeno: number[] = [];
let miseKeno = 100;
let tiragesKeno = 1;

export function vueKeno(c: HTMLElement, ctx: ContexteKiosque) {
  c.innerHTML = `<div class="vue-keno">
    <div class="ligne" style="gap:10px;margin-bottom:10px"><button class="btn btn-rond btn-fantome" data-retour aria-label="Retour au Kiosque">←</button>
      <h1 style="font-size:26px;flex:1">KENO <span style="color:var(--or)">du Club</span></h1><span class="chrono grand" data-chrono>…</span></div>
    <div class="aide-keno"><button class="btn btn-petit" data-comment>📖 Comment jouer</button><button class="btn btn-petit" data-tableau>💰 Tableau des gains</button></div>
    <div class="dernier-tirage" data-dernier></div>
    <div class="ligne" style="justify-content:space-between;margin:12px 0 6px"><b style="font-family:Fredoka;font-size:17px">Coche tes numéros</b><span class="compte-choix" data-compte></span></div>
    <div class="grille-keno" data-grille>${Array.from({ length: KENO.numeros }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div class="ligne" style="margin:8px 0;gap:8px"><button class="btn btn-petit" data-flash>Au hasard</button><button class="btn btn-petit btn-fantome" data-effacer>Effacer</button></div>
    <div class="reglage-ligne"><span>Mise</span>${KENO.mises.map((m) => `<button data-mise="${m}">${m >= 1000 ? '1k' : m}</button>`).join('')}</div>
    <div class="reglage-ligne"><span>Tirages</span>${[1, 3, 5, 10].map((n) => `<button data-tirages="${n}">${n}</button>`).join('')}</div>
    <div class="bareme" data-bareme></div>
    <button class="btn btn-or btn-plein" data-jouer style="margin-top:10px"></button>
    <h3 class="titre-rubrique">Mes grilles</h3><div class="mes-grilles" data-grilles></div>
  </div>`;
  $('[data-retour]', c).onclick = () => ctx.aller('kiosque');
  $('[data-comment]', c).onclick = () => ouvrirCommentKeno();
  $('[data-tableau]', c).onclick = () => ouvrirTableauKeno(choixKeno.length || 10);
  let etat: EtatKeno | null = null, decalage = 0, enDirect = false;
  const maj = () => {
    $$('[data-n]', c).forEach((b) => b.classList.toggle('on', choixKeno.includes(Number(b.dataset.n))));
    $$('[data-mise]', c).forEach((b) => b.classList.toggle('on', Number(b.dataset.mise) === miseKeno));
    $$('[data-tirages]', c).forEach((b) => b.classList.toggle('on', Number(b.dataset.tirages) === tiragesKeno));
    $('[data-compte]', c).textContent = `${choixKeno.length} / 10`;
    const g = KENO_GAINS[choixKeno.length];
    $('[data-bareme]', c).innerHTML = g
      ? `<div class="titre-bareme">Tes gains possibles · ${choixKeno.length} numéro${choixKeno.length > 1 ? 's' : ''} cochés, mise ${clubs(miseKeno)}</div>
        <table class="table-keno"><thead><tr><th>Bons numéros</th><th>Tu gagnes</th><th>Chance</th></tr></thead><tbody>${Object.entries(g).sort((a, b) => +b[0] - +a[0]).map(([k, mult]) => `<tr><td><b>${k}</b> sur ${choixKeno.length}</td><td class="gain">${clubs(mult * miseKeno)} <small>×${mult}</small></td><td>1 sur ${fmtChance(chanceKeno(choixKeno.length, +k))}</td></tr>`).join('')}</tbody></table>`
      : '<div class="titre-bareme">Coche entre 1 et 10 numéros : le tableau de tes gains s\'affiche ici.</div>';
    const b = $('[data-jouer]', c) as HTMLButtonElement;
    b.disabled = !choixKeno.length;
    b.innerHTML = `Jouer ${clubs(miseKeno * tiragesKeno)}${tiragesKeno > 1 ? ` (${tiragesKeno} tirages)` : ''}`;
  };
  $$('[data-n]', c).forEach((b) => b.onclick = () => {
    const n = Number(b.dataset.n);
    if (choixKeno.includes(n)) choixKeno = choixKeno.filter((x) => x !== n);
    else if (choixKeno.length < 10) choixKeno = [...choixKeno, n];
    else return toast('10 numéros au maximum');
    jouerSon('clic'); maj();
  });
  $('[data-flash]', c).onclick = () => {
    const n = Math.max(1, choixKeno.length || 6), l = new Set<number>();
    while (l.size < n) l.add(1 + Math.floor(Math.random() * KENO.numeros));
    choixKeno = [...l]; jouerSon('jetons'); maj();
  };
  $('[data-effacer]', c).onclick = () => { choixKeno = []; maj(); };
  $$('[data-mise]', c).forEach((b) => b.onclick = () => { miseKeno = Number(b.dataset.mise); jouerSon('jeton'); maj(); });
  $$('[data-tirages]', c).forEach((b) => b.onclick = () => { tiragesKeno = Number(b.dataset.tirages); jouerSon('clic'); maj(); });
  $('[data-jouer]', c).onclick = async () => {
    try {
      const r = await api<{ tirage: number; etat: EtatPortefeuille }>('/api/kiosque/keno', { numeros: choixKeno, mise: miseKeno, tirages: tiragesKeno });
      ctx.majPorte(r.etat);
      jouerSon('jetons');
      toast(`Grille validée pour le tirage de ${heure(r.tirage * KENO.periode)}`);
      await charger();
    } catch (e) { erreur(e); }
  };
  maj();

  async function charger() {
    try { etat = await api<EtatKeno>('/api/kiosque/keno'); } catch { return; }
    decalage = etat.maintenant - Date.now();
    if (!c.isConnected) return;
    afficherDernier();
    $('[data-grilles]', c).innerHTML = etat.grilles.length ? etat.grilles.map((g) => {
      const t = g.tirage === etat!.dernier?.id ? etat!.dernier.numeros : null;
      return `<div class="ma-grille"><span class="quand">${g.gain === null ? `Tirage de ${heure(g.tirage * KENO.periode)}` : `n° ${g.tirage}`}</span>
        <span class="nums">${g.numeros.map((n) => `<i class="${t?.includes(n) ? 'bon' : ''}">${n}</i>`).join('')}</span>
        <b class="${g.gain ? 'plus' : ''}">${g.gain === null ? `${fmt(g.mise)} <i class="pc"></i>` : g.gain ? `+${fmt(g.gain)}` : 'perdu'}</b></div>`;
    }).join('') : '<span class="doux petit">Aucune grille pour l\'instant</span>';
  }

  function afficherDernier(boules?: number[], titre?: string, mes: number[] = choixKeno) {
    const d = etat?.dernier;
    const nums = boules ?? d?.numeros ?? [];
    $('[data-dernier]', c).innerHTML = `<small>${titre ?? (d ? `Dernier tirage · ${heure(d.heure)}` : 'Pas encore de tirage')}</small>
      <div class="boules">${nums.map((n) => `<i class="${mes.includes(n) ? 'mien' : ''}">${n}</i>`).join('')}</div>`;
  }

  /** Le tirage en direct : les 20 boules sortent une par une. */
  async function direct(id: number) {
    enDirect = true;
    suspense.kiosque = true;
    let t: { numeros: number[] } | null = null;
    for (let i = 0; i < 8 && !t; i++) {
      try { t = (await api<{ tirage: { numeros: number[] } | null }>(`/api/kiosque/keno/${id}`)).tirage; } catch { /* réessayer */ }
      if (!t) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!t || !c.isConnected) { enDirect = false; suspense.kiosque = false; return; }
    const ordre = t.numeros.slice().sort(() => Math.random() - 0.5);
    // Mes numéros joués pour ce tirage (ou ceux cochés à l'écran)
    const joues = etat?.grilles.filter((g) => g.tirage === id).flatMap((g) => g.numeros) ?? [];
    const mes = joues.length ? joues : choixKeno;
    for (let i = 1; i <= ordre.length; i++) {
      if (!c.isConnected) { suspense.kiosque = false; return; }
      afficherDernier(ordre.slice(0, i), `Tirage en direct · boule ${i} / 20`, mes);
      jouerSon(mes.includes(ordre[i - 1]) ? 'jeton' : 'clic');
      await new Promise((r) => setTimeout(r, 380));
    }
    await charger();
    const p = await api<EtatPortefeuille>('/api/portefeuille').catch(() => null);
    if (p) ctx.majPorte(p);
    enDirect = false;
    suspense.kiosque = false;
  }

  const tic = () => {
    if (!etat || !c.isConnected) return;
    const t = Date.now() + decalage;
    const reste = etat.prochain.heure - t;
    $('[data-chrono]', c).textContent = reste > 0 ? duree(reste) : 'tirage !';
    if (reste <= -800 && !enDirect) { const id = etat.prochain.id; etat.prochain = { id: id + 1, heure: (id + 1) * KENO.periode, fermeture: (id + 1) * KENO.periode - KENO.fermeture }; void direct(id); }
  };
  void charger();
  const m = setInterval(tic, 250);
  ctx.nettoyer(() => { clearInterval(m); suspense.kiosque = false; });
}

/* ================================ Loto Flash ================================ */

interface EtatLoto {
  prochain: { id: number; heure: number; fermeture: number };
  dernier: { id: number; numeros: number[]; etoile: number; cagnotte: number; gagnants: number; heure: number } | null;
  cagnotte: number;
  grilles: { id: number; tirage: number; numeros: number[]; etoile: number; gain: number | null; rang: string | null }[];
  maintenant: number;
}

let choixLoto: number[] = [];
let etoileLoto = 0;

export function vueLoto(c: HTMLElement, ctx: ContexteKiosque) {
  c.innerHTML = `<div class="vue-loto">
    <div class="ligne" style="gap:10px;margin-bottom:10px"><button class="btn btn-rond btn-fantome" data-retour aria-label="Retour au Kiosque">←</button>
      <h1 style="font-size:28px;flex:1;font-style:italic">LOTO <span style="color:var(--corail)">FLASH</span></h1></div>
    <div class="cagnotte-loto"><small>Cagnotte du prochain tirage</small><b data-cagnotte>…</b><span>Tirage à <b data-heure>…</b> · dans <b data-chrono>…</b></span></div>
    <div class="dernier-loto" data-dernier></div>
    <div class="bulletin">
    <div class="entete-bulletin"><b>LOTO <em>FLASH</em></b><small>Bulletin · grille simple</small></div>
    <b class="sous-titre">Coche 5 numéros sur ${LOTO.numeros}</b>
    <div class="grille-loto" data-grille>${Array.from({ length: LOTO.numeros }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
    <b class="sous-titre">et 1 étoile sur ${LOTO.etoiles}</b>
    <div class="etoiles-loto">${Array.from({ length: LOTO.etoiles }, (_, i) => `<button data-e="${i + 1}" aria-label="Étoile ${i + 1}"><svg viewBox="0 0 50 48" aria-hidden="true"><path d="M25 3 l6.8 14 l15.4 2.2 l-11.1 10.9 l2.6 15.4 l-13.7 -7.2 l-13.7 7.2 l2.6 -15.4 l-11.1 -10.9 l15.4 -2.2z"/></svg><span>${i + 1}</span></button>`).join('')}</div>
    </div>
    <div class="ligne" style="margin-top:12px;gap:10px"><button class="btn" data-flash style="flex:1">Flash au hasard</button><button class="btn btn-corail" data-jouer style="flex:1.3">Jouer · ${clubs(LOTO.prix)}</button></div>
    <details class="bareme-loto"><summary>Les gains</summary>${LOTO_GAINS.map((r) => `<div><span>${r.nom}</span><b>${r.gain === 'cagnotte' ? 'la cagnotte !' : clubs(r.gain)}</b></div>`).join('')}</details>
    <h3 class="titre-rubrique">Mes grilles</h3><div class="mes-grilles" data-grilles></div>
  </div>`;
  $('[data-retour]', c).onclick = () => ctx.aller('kiosque');
  let etat: EtatLoto | null = null, decalage = 0, enDirect = false;
  const maj = () => {
    $$('[data-n]', c).forEach((b) => b.classList.toggle('on', choixLoto.includes(Number(b.dataset.n))));
    $$('[data-e]', c).forEach((b) => b.classList.toggle('on', Number(b.dataset.e) === etoileLoto));
    ($('[data-jouer]', c) as HTMLButtonElement).disabled = choixLoto.length !== LOTO.choix || !etoileLoto;
  };
  $$('[data-n]', c).forEach((b) => b.onclick = () => {
    const n = Number(b.dataset.n);
    if (choixLoto.includes(n)) choixLoto = choixLoto.filter((x) => x !== n);
    else if (choixLoto.length < LOTO.choix) choixLoto = [...choixLoto, n];
    else return toast('5 numéros, pas un de plus');
    jouerSon('clic'); maj();
  });
  $$('[data-e]', c).forEach((b) => b.onclick = () => { etoileLoto = Number(b.dataset.e); jouerSon('clic'); maj(); });
  $('[data-flash]', c).onclick = () => {
    const l = new Set<number>();
    while (l.size < LOTO.choix) l.add(1 + Math.floor(Math.random() * LOTO.numeros));
    choixLoto = [...l]; etoileLoto = 1 + Math.floor(Math.random() * LOTO.etoiles); jouerSon('jetons'); maj();
  };
  $('[data-jouer]', c).onclick = async () => {
    try {
      const r = await api<{ tirage: number; etat: EtatPortefeuille; cagnotte: number }>('/api/kiosque/loto', { numeros: choixLoto, etoile: etoileLoto });
      ctx.majPorte(r.etat);
      jouerSon('jetons');
      toast(`Grille validée pour le tirage de ${heure(r.tirage * LOTO.periode)}`);
      await charger();
    } catch (e) { erreur(e); }
  };
  maj();

  async function charger() {
    try { etat = await api<EtatLoto>('/api/kiosque/loto'); } catch { return; }
    decalage = etat.maintenant - Date.now();
    if (!c.isConnected) return;
    $('[data-cagnotte]', c).innerHTML = clubs(etat.cagnotte);
    $('[data-heure]', c).textContent = heure(etat.prochain.heure);
    afficherDernier();
    $('[data-grilles]', c).innerHTML = etat.grilles.length ? etat.grilles.map((g) => {
      const t = g.tirage === etat!.dernier?.id ? etat!.dernier : null;
      return `<div class="ma-grille"><span class="quand">${g.gain === null ? `Tirage de ${heure(g.tirage * LOTO.periode)}` : g.rang ?? `n° ${g.tirage}`}</span>
        <span class="nums">${g.numeros.map((n) => `<i class="${t?.numeros.includes(n) ? 'bon' : ''}">${n}</i>`).join('')}<i class="etoile ${t?.etoile === g.etoile ? 'bon' : ''}">${g.etoile}</i></span>
        <b class="${g.gain ? 'plus' : ''}">${g.gain === null ? `${fmt(LOTO.prix)} <i class="pc"></i>` : g.gain ? `+${fmt(g.gain)}` : 'perdu'}</b></div>`;
    }).join('') : '<span class="doux petit">Aucune grille pour l\'instant</span>';
  }

  function afficherDernier(n?: number[], e?: number | null, titre?: string) {
    const d = etat?.dernier;
    const nums = n ?? d?.numeros ?? [];
    const et = e === undefined ? d?.etoile ?? null : e;
    $('[data-dernier]', c).innerHTML = `<small>${titre ?? (d ? `Tirage de ${heure(d.heure)}${d.gagnants ? ` · ${d.gagnants} grille${d.gagnants > 1 ? 's' : ''} gagnante${d.gagnants > 1 ? 's' : ''}` : ''}` : 'Pas encore de tirage')}</small>
      <div class="boules">${nums.map((x) => `<i>${x}</i>`).join('')}${et ? `<i class="etoile">${et}</i>` : ''}</div>`;
  }

  async function direct(id: number) {
    enDirect = true;
    suspense.kiosque = true;
    let t: { numeros: number[]; etoile: number } | null = null;
    for (let i = 0; i < 8 && !t; i++) {
      try { t = (await api<{ tirage: { numeros: number[]; etoile: number } | null }>(`/api/kiosque/loto/${id}`)).tirage; } catch { /* réessayer */ }
      if (!t) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!t || !c.isConnected) { enDirect = false; suspense.kiosque = false; return; }
    for (let i = 1; i <= 6; i++) {
      if (!c.isConnected) { suspense.kiosque = false; return; }
      afficherDernier(t.numeros.slice(0, Math.min(i, 5)), i === 6 ? t.etoile : null, 'Tirage en direct !');
      jouerSon(i === 6 ? 'gagne' : 'jeton');
      await new Promise((r) => setTimeout(r, 900));
    }
    await charger();
    const p = await api<EtatPortefeuille>('/api/portefeuille').catch(() => null);
    if (p) ctx.majPorte(p);
    enDirect = false;
    suspense.kiosque = false;
  }

  const tic = () => {
    if (!etat || !c.isConnected) return;
    const t = Date.now() + decalage;
    const reste = etat.prochain.heure - t;
    $('[data-chrono]', c).textContent = reste > 0 ? duree(reste) : 'maintenant !';
    if (reste <= -800 && !enDirect) { const id = etat.prochain.id; etat.prochain = { id: id + 1, heure: (id + 1) * LOTO.periode, fermeture: (id + 1) * LOTO.periode - LOTO.fermeture }; void direct(id); }
  };
  void charger();
  const m = setInterval(tic, 250);
  ctx.nettoyer(() => { clearInterval(m); suspense.kiosque = false; });
}
