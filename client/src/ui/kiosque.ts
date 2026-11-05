/**
 * Le Kiosque : la vitrine, les tickets à gratter (au doigt), le Keno et le Loto Flash en direct.
 * Tout s'affiche dans la zone de contenu du Club (le portefeuille et les onglets restent visibles).
 */
import type { TypeTicket } from '../../../moteur/kiosque';
import { TICKETS, tauxRetour, KENO, KENO_GAINS, LOTO, LOTO_GAINS, motForme, lignesMorpion, SymboleMorpion } from '../../../moteur/kiosque';
import { api, ErreurApi } from '../reseau';
import { fmt } from '../art/rendu';
import { jouerSon } from '../vue/son';
import { $, $$, esc, html, toast, panneau } from './commun';

export interface EtatPortefeuille { solde: number; tickets: number }

export interface ContexteKiosque {
  porte(): EtatPortefeuille | null;
  /** Met à jour le portefeuille ; `affiche` = solde montré pour l'instant (suspense du grattage). */
  majPorte(e: EtatPortefeuille, affiche?: number): void;
  aller(vue: string | null): void;
  celebrer(depuis: HTMLElement, pieces: number): void;
  /** Rappelé à chaque changement de vue pour arrêter les minuteries. */
  nettoyer(f: () => void): void;
}

const clubs = (n: number) => `${fmt(n)} ♣`;
const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const duree = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const erreur = (e: unknown) => toast(e instanceof ErreurApi ? e.message : 'Le Kiosque ne répond pas', true);

const TICKETS_VITRINE: { type: TypeTicket; nom: string; prix: number; accroche: string; max: number }[] = [
  { type: 'morpion', nom: 'Morpion', prix: 200, accroche: 'Aligne 3 ♣', max: 20_000 },
  { type: 'numeros', nom: 'Numéros Gagnants', prix: 500, accroche: 'Tes numéros = les gagnants ?', max: 100_000 },
  { type: 'mots', nom: 'Mots Croisés', prix: 1_000, accroche: 'Forme des mots', max: 150_000 },
];

/* ================================ Vitrine ================================ */

export function vueVitrine(c: HTMLElement, ctx: ContexteKiosque) {
  const offerts = ctx.porte()?.tickets ?? 0;
  c.innerHTML = `<div class="kiosque-vue">
    <h1 style="font-size:26px;margin-bottom:10px">Le Kiosque</h1>
    <div class="auvent-large"></div>
    ${offerts ? `<button class="annonce bonus" data-offert><span class="mini-ticket"><i></i><i class="g"></i><i></i><i class="g"></i><i></i><i class="g"></i></span><span><b>${offerts} ticket${offerts > 1 ? 's' : ''} offert${offerts > 1 ? 's' : ''}</b><small>Un Morpion gratuit à gratter, touche pour le prendre</small></span></button>` : ''}
    <h3 class="titre-rubrique">Tickets à gratter</h3>
    <div class="rangee-tickets">${TICKETS_VITRINE.map((t) => `<button class="ticket t-${t.type}" data-ticket="${t.type}"><b>${t.nom}</b><span class="zone-grattage">${esc(t.accroche)}</span>
      <span class="pied-ticket"><small>${clubs(t.prix)}</small><i>jusqu'à ${fmt(t.max)}</i></span></button>`).join('')}</div>
    <h3 class="titre-rubrique">Tirages en direct</h3>
    <button class="tirage-carte keno" data-vue="keno"><span class="boules-deco">${[7, 18, 33, 41, 56, 70].map((n, i) => `<i class="${i % 2 ? 'or' : ''}">${n}</i>`).join('')}</span>
      <span class="txt"><b>Keno du Club</b><span>Coche 1 à 10 numéros sur 70 · un tirage toutes les 4 minutes</span></span><span class="chrono" data-chrono-keno>…</span></button>
    <button class="tirage-carte loto" data-vue="loto"><span class="eclair"><svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#FFF4DF" stroke="#2A1E3F" stroke-width="1.6" stroke-linejoin="round"/></svg></span>
      <span class="txt"><b>Loto Flash</b><span data-cagnotte>5 numéros + 1 étoile · toutes les 10 minutes</span></span><span class="chrono" data-chrono-loto>…</span></button>
    <p class="doux petit" style="text-align:center;margin-top:14px">Argent fictif du Club : on joue pour le plaisir, rien ne s'achète et rien ne se retire.</p>
  </div>`;
  $$('[data-ticket]', c).forEach((b) => b.onclick = () => ctx.aller(`ticket:${b.dataset.ticket}`));
  $$('[data-vue]', c).forEach((b) => b.onclick = () => ctx.aller(b.dataset.vue!));
  const o = $('[data-offert]', c); if (o) o.onclick = () => ctx.aller('ticket:morpion:offert');
  // Comptes à rebours des tirages (calés sur l'heure du serveur)
  let decalage = 0, cagnotte: number | null = null;
  void api<{ maintenant: number; cagnotte: number }>('/api/kiosque/loto').then((r) => {
    decalage = r.maintenant - Date.now(); cagnotte = r.cagnotte;
    const el = $('[data-cagnotte]', c); if (el) el.textContent = `5 numéros + 1 étoile · cagnotte ${clubs(cagnotte)}`;
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
  ctx.nettoyer(() => clearInterval(m));
}

/* ============================ Ticket à gratter ============================ */

interface ReponseTicket { id: number; type: TypeTicket; gain: number; contenu: any; etat: EtatPortefeuille }

export function vueTicket(c: HTMLElement, ctx: ContexteKiosque, type: TypeTicket, offert: boolean) {
  const def = TICKETS_VITRINE.find((t) => t.type === type)!;
  c.innerHTML = `<div class="vue-ticket">
    <div class="ligne" style="gap:10px;margin-bottom:12px"><button class="btn btn-rond btn-fantome" data-retour aria-label="Retour au Kiosque">←</button><h1 style="font-size:24px">${def.nom}</h1></div>
    <div data-ticket-zone></div>
    <div data-resultat></div>
    <div class="actions-ticket" data-actions></div>
  </div>`;
  $('[data-retour]', c).onclick = () => ctx.aller('kiosque');
  let gratuitCourant = offert;
  presenter(offert);

  /** Le ticket encore emballé : rien n'est débité tant qu'on n'a pas appuyé sur « Jouer ». */
  function presenter(gratuit: boolean) {
    gratuitCourant = gratuit;
    $('[data-resultat]', c).innerHTML = '';
    $('[data-ticket-zone]', c).innerHTML = `<div class="ticket-grand t-${type} emballe">
      <div class="entete-ticket"><b>${def.nom}</b><span class="prix">${gratuit ? 'offert' : clubs(def.prix)}</span></div>
      <p class="regle-ticket">${regle(type)}</p>
      <div class="jeu-ticket">${contenuHTML(exemple(type))}</div>
      ${type === 'mots' ? '<div class="liste-mots"><span class="attente-mots">Tes 6 mots s\'affichent ici</span></div>' : ''}
      <div class="pied-ticket"><small>Lot maximal ${clubs(def.max)}</small><small>n° ——————</small></div>
    </div>`;
    const solde = ctx.porte()?.solde ?? 0, assez = gratuit || solde >= def.prix;
    $('[data-actions]', c).innerHTML = `<button class="btn" data-regles>Règles</button>
      <button class="btn btn-or" data-jouer ${assez ? '' : 'disabled'}>${gratuit ? 'Jouer (offert)' : assez ? `Jouer · ${clubs(def.prix)}` : 'Pas assez de Clubs'}</button>`;
    $('[data-regles]', c).onclick = () => ouvrirReglesTicket(type);
    $('[data-jouer]', c).onclick = () => void acheter(gratuit);
  }

  async function acheter(gratuit: boolean) {
    gratuitCourant = gratuit;
    const bj = $('[data-jouer]', c) as HTMLButtonElement | null; if (bj) bj.disabled = true;
    let r: ReponseTicket;
    try { r = await api<ReponseTicket>('/api/kiosque/ticket', { type, offert: gratuit }); }
    catch (e) { erreur(e); if (bj) bj.disabled = false; return; }
    if (!c.isConnected) return;
    jouerSon('jeton');
    // Le gain est déjà crédité côté serveur : on garde le suspense jusqu'au grattage
    ctx.majPorte(r.etat, r.etat.solde - r.gain);
    afficherTicket(r);
  }

  function afficherTicket(r: ReponseTicket) {
    const zone = $('[data-ticket-zone]', c);
    zone.innerHTML = `<div class="ticket-grand t-${type}">
      <div class="entete-ticket"><b>${def.nom}</b><span class="prix">${gratuitCourant ? 'offert' : clubs(def.prix)}</span></div>
      <p class="regle-ticket">${regle(type)}</p>
      <div class="jeu-ticket">${contenuHTML(r)}<canvas class="couche-grattage"></canvas></div>
      ${type === 'mots' ? `<div class="liste-mots">${(r.contenu.mots as string[]).map((m) => `<span data-mot="${m}">${m.split('').map((l) => `<i data-l="${l}">${l}</i>`).join('')}</span>`).join('')}</div>` : ''}
      <div class="pied-ticket"><small>Lot maximal ${clubs(def.max)}</small><small>n° ${String(r.id).padStart(6, '0')}</small></div>
    </div>`;
    $('[data-actions]', c).innerHTML = `<button class="btn" data-regles>Règles</button><button class="btn btn-ciel" data-tout>Tout gratter</button>`;
    $('[data-regles]', c).onclick = () => ouvrirReglesTicket(type);
    const lettresVues: string[] = [];
    let fini = false;
    const reveler = () => {
      if (fini) return;
      fini = true;
      const cv = $('canvas', zone) as HTMLCanvasElement | null;
      if (cv) { cv.style.transition = 'opacity .4s'; cv.style.opacity = '0'; setTimeout(() => cv.remove(), 420); }
      if (type === 'mots') marquerMots(r.contenu.lettres as string[]);
      if (type === 'morpion') lignesMorpion(r.contenu.grille as SymboleMorpion[]).flat().forEach((i) => $(`[data-case="${i}"]`, zone)?.classList.add('gagnante'));
      if (type === 'numeros') $$('[data-num]', zone).forEach((e) => e.classList.toggle('gagnante', (r.contenu.gagnants as number[]).includes(Number(e.dataset.num))));
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
      $('[data-actions]', c).innerHTML = `<button class="btn" data-kiosque>Le Kiosque</button><button class="btn btn-or" data-encore>Un autre ticket</button>`;
      $('[data-kiosque]', c).onclick = () => ctx.aller('kiosque');
      $('[data-encore]', c).onclick = () => { const offerts = ctx.porte()?.tickets ?? 0; presenter(type === 'morpion' && offerts > 0); };
    };
    /** Mots Croisés : chaque lettre grattée s'allume dans la liste des mots. */
    const marquerMots = (lettres: string[]) => $$('[data-mot]', zone).forEach((s) => {
      $$('[data-l]', s).forEach((i) => i.classList.toggle('vu', lettres.includes(i.dataset.l!)));
      s.classList.toggle('forme', motForme(s.dataset.mot!, lettres));
    });
    const surZone = (el: HTMLElement) => {
      el.classList.add('decouvert');
      if (type === 'mots' && el.dataset.lettre) { lettresVues.push(el.dataset.lettre); marquerMots(lettresVues); }
    };
    $('[data-tout]', c).onclick = reveler;
    requestAnimationFrame(() => installerGrattage($('canvas', zone) as HTMLCanvasElement, $$('[data-grat]', zone), surZone, reveler));
  }
}

/** Un ticket « vierge » pour la présentation : la mise en page exacte, sans le contenu. */
function exemple(type: TypeTicket): ReponseTicket {
  const contenu = type === 'morpion' ? { lot: 0, grille: Array(9).fill('') }
    : type === 'numeros' ? { gagnants: [0, 0], mes: Array.from({ length: 8 }, () => ({ n: 0, lot: 0 })) }
    : { lettres: Array(14).fill(''), mots: [] };
  return { id: 0, type, gain: 0, contenu, etat: { solde: 0, tickets: 0 } };
}

/** Les règles d'un ticket, avec le tableau des lots et les chances de les gagner. */
function ouvrirReglesTicket(type: TypeTicket) {
  const d = TICKETS[type];
  const total = d.gains.reduce((s, [, p]) => s + p, 0);
  const p = panneau(`<h2>${d.nom} · règles</h2>
    <p>${esc(d.regle)}</p>
    <p class="doux petit">Gratte les cases argentées au doigt (ou à la souris), une par une. Pressé ? « Tout gratter » découvre tout d'un coup.</p>
    <table class="table-lots"><thead><tr><th>Lot</th><th>Chance</th></tr></thead><tbody>
      ${[...d.gains].reverse().map(([g, pr]) => `<tr><td><b>${clubs(g)}</b>${g === d.prix ? ' <small>(remboursé)</small>' : ''}</td><td>1 sur ${fmt(Math.round(1_000_000 / pr))}</td></tr>`).join('')}
    </tbody></table>
    <p class="doux petit" style="margin-top:10px">Prix du ticket : ${clubs(d.prix)} · un ticket gagnant sur ${(1_000_000 / total).toFixed(1).replace('.', ',')} · en moyenne, ${Math.round(tauxRetour(d) * 100)} % des mises reviennent aux joueurs.</p>
    <button class="btn btn-or btn-plein" data-ok>Compris</button>`);
  $('[data-ok]', p.el).onclick = () => p.fermer();
}

function regle(type: TypeTicket) {
  return type === 'morpion' ? 'Aligne 3 ♣ (ligne, colonne ou diagonale) et tu gagnes le lot.'
    : type === 'numeros' ? 'Un de tes numéros est un numéro gagnant ? Tu gagnes le lot écrit dessous.'
    : 'Gratte tes 14 lettres. Chaque mot dont tu as toutes les lettres compte : 2 mots ou plus, tu gagnes.';
}

function contenuHTML(r: ReponseTicket): string {
  const ct = r.contenu;
  if (r.type === 'morpion') {
    return `<div class="lot-morpion"><small>Lot</small><b data-grat>${ct.lot ? clubs(ct.lot) : ''}</b></div>
      <div class="grille-morpion">${(ct.grille as string[]).map((s, i) => `<span data-grat data-case="${i}" class="${s === '♣' ? 'trefle' : ''}">${s}</span>`).join('')}</div>`;
  }
  if (r.type === 'numeros') {
    return `<div class="gagnants"><small>Numéros gagnants</small><span>${(ct.gagnants as number[]).map((n) => `<b data-grat>${n || ''}</b>`).join('')}</span></div>
      <div class="mes-numeros">${(ct.mes as { n: number; lot: number }[]).map((m) => `<span data-grat data-num="${m.n}"><b>${m.n || ''}</b><small>${m.lot ? fmt(m.lot) : '&nbsp;'}</small></span>`).join('')}</div>`;
  }
  const lots = [[2, 1_000], [3, 2_500], [4, 6_000], [5, 25_000], [6, 150_000]];
  return `<div class="mes-lettres">${(ct.lettres as string[]).map((l) => `<span data-grat data-lettre="${l}">${l}</span>`).join('')}</div>
    <div class="bareme-mots">${lots.map(([n, g]) => `<span>${n} mots : ${fmt(g)}</span>`).join('')}</div>`;
}

/** Arrondi d'une zone argentée. */
function rectArrondi(x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}

/**
 * La couche argentée : seules les cases du ticket sont recouvertes, chacune se gratte au doigt.
 * Une case grattée à plus de moitié se découvre d'elle-même ; quand toutes le sont, le ticket est fini.
 */
function installerGrattage(cv: HTMLCanvasElement, zones: HTMLElement[], surZone: (el: HTMLElement) => void, fini: () => void) {
  if (!cv || !cv.isConnected) return;
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
    const rayon = parseFloat(getComputedStyle(el).borderRadius) || 10;
    return { el, l: b.left - r.left, t: b.top - r.top, w: b.width, h: b.height, rayon: Math.min(rayon, b.height / 2, b.width / 2), vu: false };
  });
  for (const z of cases) {
    x.fillStyle = x.createPattern(motif, 'repeat')!;
    rectArrondi(x, z.l, z.t, z.w, z.h, z.rayon); x.fill();
    x.strokeStyle = '#A39BB6'; x.lineWidth = 2; x.stroke();
    x.fillStyle = 'rgba(58,45,94,.4)'; x.font = `700 ${Math.round(Math.min(22, z.h * 0.42))}px Fredoka, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♣', z.l + z.w / 2, z.t + z.h / 2 + 1);
  }
  x.globalCompositeOperation = 'destination-out';
  let dernier: { x: number; y: number } | null = null, coups = 0, son = 0;
  const gratter = (px: number, py: number) => {
    x.lineCap = 'round'; x.lineWidth = 26;
    x.beginPath();
    if (dernier) { x.moveTo(dernier.x, dernier.y); x.lineTo(px, py); x.stroke(); }
    x.arc(px, py, 13, 0, Math.PI * 2); x.fill();
    dernier = { x: px, y: py };
    const t = performance.now(); if (t - son > 110) { son = t; jouerSon('carte'); }
    if (++coups % 6 === 0) verifier();
  };
  const verifier = () => {
    for (const z of cases) {
      if (z.vu) continue;
      const l = Math.max(0, Math.floor(z.l * dpr)), t = Math.max(0, Math.floor(z.t * dpr));
      const w = Math.max(1, Math.min(cv.width - l, Math.floor(z.w * dpr))), h = Math.max(1, Math.min(cv.height - t, Math.floor(z.h * dpr)));
      const d = x.getImageData(l, t, w, h).data;
      let vides = 0, n = 0;
      for (let i = 3; i < d.length; i += 4 * 7) { n++; if (d[i] < 40) vides++; }
      if (vides / n > 0.5) {
        z.vu = true;
        x.save(); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#000';
        rectArrondi(x, z.l - 3, z.t - 3, z.w + 6, z.h + 6, z.rayon + 3); x.fill(); x.restore();
        surZone(z.el);
      }
    }
    if (cases.every((z) => z.vu)) fini();
  };
  const pos = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); dernier = null; const p = pos(e); gratter(p.x, p.y); });
  cv.addEventListener('pointermove', (e) => { if (!cv.hasPointerCapture(e.pointerId)) return; const p = pos(e); gratter(p.x, p.y); });
  cv.addEventListener('pointerup', () => { dernier = null; verifier(); });
}

/* ================================ Keno ================================ */

interface EtatKeno {
  prochain: { id: number; heure: number; fermeture: number };
  dernier: { id: number; numeros: number[]; heure: number } | null;
  grilles: { id: number; tirage: number; numeros: number[]; mise: number; gain: number | null }[];
  maintenant: number;
}

let choixKeno: number[] = [];
let miseKeno = 100;
let tiragesKeno = 1;

export function vueKeno(c: HTMLElement, ctx: ContexteKiosque) {
  c.innerHTML = `<div class="vue-keno">
    <div class="ligne" style="gap:10px;margin-bottom:10px"><button class="btn btn-rond btn-fantome" data-retour aria-label="Retour au Kiosque">←</button>
      <h1 style="font-size:26px;flex:1">KENO <span style="color:var(--or)">du Club</span></h1><span class="chrono grand" data-chrono>…</span></div>
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
  let etat: EtatKeno | null = null, decalage = 0, enDirect = false;
  const maj = () => {
    $$('[data-n]', c).forEach((b) => b.classList.toggle('on', choixKeno.includes(Number(b.dataset.n))));
    $$('[data-mise]', c).forEach((b) => b.classList.toggle('on', Number(b.dataset.mise) === miseKeno));
    $$('[data-tirages]', c).forEach((b) => b.classList.toggle('on', Number(b.dataset.tirages) === tiragesKeno));
    $('[data-compte]', c).textContent = `${choixKeno.length} / 10`;
    const g = KENO_GAINS[choixKeno.length];
    $('[data-bareme]', c).innerHTML = g ? `<small>Avec ${choixKeno.length} numéro${choixKeno.length > 1 ? 's' : ''} et ${miseKeno} ♣ :</small>${Object.entries(g).sort((a, b) => +b[0] - +a[0]).map(([k, mult]) => `<span>${k} bon${+k > 1 ? 's' : ''} → <b>${clubs(mult * miseKeno)}</b></span>`).join('')}` : '<small>Coche entre 1 et 10 numéros</small>';
    const b = $('[data-jouer]', c) as HTMLButtonElement;
    b.disabled = !choixKeno.length;
    b.textContent = `Jouer ${clubs(miseKeno * tiragesKeno)}${tiragesKeno > 1 ? ` (${tiragesKeno} tirages)` : ''}`;
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
        <b class="${g.gain ? 'plus' : ''}">${g.gain === null ? `${fmt(g.mise)} ♣` : g.gain ? `+${fmt(g.gain)}` : 'perdu'}</b></div>`;
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
    let t: { numeros: number[] } | null = null;
    for (let i = 0; i < 8 && !t; i++) {
      try { t = (await api<{ tirage: { numeros: number[] } | null }>(`/api/kiosque/keno/${id}`)).tirage; } catch { /* réessayer */ }
      if (!t) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!t || !c.isConnected) { enDirect = false; return; }
    const ordre = t.numeros.slice().sort(() => Math.random() - 0.5);
    // Mes numéros joués pour ce tirage (ou ceux cochés à l'écran)
    const joues = etat?.grilles.filter((g) => g.tirage === id).flatMap((g) => g.numeros) ?? [];
    const mes = joues.length ? joues : choixKeno;
    for (let i = 1; i <= ordre.length; i++) {
      if (!c.isConnected) return;
      afficherDernier(ordre.slice(0, i), `Tirage en direct · boule ${i} / 20`, mes);
      jouerSon(mes.includes(ordre[i - 1]) ? 'jeton' : 'clic');
      await new Promise((r) => setTimeout(r, 380));
    }
    await charger();
    const p = await api<EtatPortefeuille>('/api/portefeuille').catch(() => null);
    if (p) ctx.majPorte(p);
    enDirect = false;
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
  ctx.nettoyer(() => clearInterval(m));
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
    <b class="sous-titre">5 numéros sur ${LOTO.numeros}</b>
    <div class="grille-loto" data-grille>${Array.from({ length: LOTO.numeros }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
    <b class="sous-titre">1 étoile sur ${LOTO.etoiles}</b>
    <div class="etoiles-loto">${Array.from({ length: LOTO.etoiles }, (_, i) => `<button data-e="${i + 1}">★ ${i + 1}</button>`).join('')}</div>
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
    $('[data-cagnotte]', c).textContent = clubs(etat.cagnotte);
    $('[data-heure]', c).textContent = heure(etat.prochain.heure);
    afficherDernier();
    $('[data-grilles]', c).innerHTML = etat.grilles.length ? etat.grilles.map((g) => {
      const t = g.tirage === etat!.dernier?.id ? etat!.dernier : null;
      return `<div class="ma-grille"><span class="quand">${g.gain === null ? `Tirage de ${heure(g.tirage * LOTO.periode)}` : g.rang ?? `n° ${g.tirage}`}</span>
        <span class="nums">${g.numeros.map((n) => `<i class="${t?.numeros.includes(n) ? 'bon' : ''}">${n}</i>`).join('')}<i class="etoile ${t?.etoile === g.etoile ? 'bon' : ''}">★${g.etoile}</i></span>
        <b class="${g.gain ? 'plus' : ''}">${g.gain === null ? `${fmt(LOTO.prix)} ♣` : g.gain ? `+${fmt(g.gain)}` : 'perdu'}</b></div>`;
    }).join('') : '<span class="doux petit">Aucune grille pour l\'instant</span>';
  }

  function afficherDernier(n?: number[], e?: number | null, titre?: string) {
    const d = etat?.dernier;
    const nums = n ?? d?.numeros ?? [];
    const et = e === undefined ? d?.etoile ?? null : e;
    $('[data-dernier]', c).innerHTML = `<small>${titre ?? (d ? `Tirage de ${heure(d.heure)}${d.gagnants ? ` · ${d.gagnants} grille${d.gagnants > 1 ? 's' : ''} gagnante${d.gagnants > 1 ? 's' : ''}` : ''}` : 'Pas encore de tirage')}</small>
      <div class="boules">${nums.map((x) => `<i>${x}</i>`).join('')}${et ? `<i class="etoile">★${et}</i>` : ''}</div>`;
  }

  async function direct(id: number) {
    enDirect = true;
    let t: { numeros: number[]; etoile: number } | null = null;
    for (let i = 0; i < 8 && !t; i++) {
      try { t = (await api<{ tirage: { numeros: number[]; etoile: number } | null }>(`/api/kiosque/loto/${id}`)).tirage; } catch { /* réessayer */ }
      if (!t) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!t || !c.isConnected) { enDirect = false; return; }
    for (let i = 1; i <= 6; i++) {
      if (!c.isConnected) return;
      afficherDernier(t.numeros.slice(0, Math.min(i, 5)), i === 6 ? t.etoile : null, 'Tirage en direct !');
      jouerSon(i === 6 ? 'gagne' : 'jeton');
      await new Promise((r) => setTimeout(r, 900));
    }
    await charger();
    const p = await api<EtatPortefeuille>('/api/portefeuille').catch(() => null);
    if (p) ctx.majPorte(p);
    enDirect = false;
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
  ctx.nettoyer(() => clearInterval(m));
}
