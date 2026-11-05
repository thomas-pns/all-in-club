/**
 * Table de roulette animée (PixiJS) : le cylindre qui tourne, la bille, le tapis où l'on pose ses jetons,
 * les joueurs et le croupier.
 *
 * Le tapis est décrit dans un repère « logique » (u le long des numéros, v en travers) puis projeté :
 * à l'horizontale sur grand écran, à la verticale sur téléphone (le zéro en haut, comme dans les applis de casino).
 */
import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { VueRoulette, VueSiegeRoulette, EvenementRoulette } from '../../../moteur/roulette/salleRoulette';
import { ROUE, MISES, couleurNumero, estMise, annonce } from '../../../moteur/roulette/regles';
import { Animateur, EASE } from './anim';
import { textureAvatar, textureCanvas, textureEmote, fmt } from '../art/rendu';
import type { Expression } from '../art/avatars';
import { pastille } from './scene';
import { jouerSon } from './son';

const T = 0x2a1e3f, OR = 0xffc23d, CREME = 0xfff4df;
const POLICE = 'Fredoka, Nunito, sans-serif';
export const COULEURS_SIEGES = [0xff6b5b, 0x46c2f0, 0xffc23d, 0x8e5bd6, 0x43b072, 0xff6b9a];
const PAS = (Math.PI * 2) / 37;
/** Rayon auquel la roue est dessinée ; elle est ensuite mise à l'échelle. */
const R0 = 400;
const ROUGE_C = '#E5484D', NOIR_C = '#2A1E3F', VERT_C = '#25A05C';

interface Geo {
  W: number; H: number;
  roue: { x: number; y: number; r: number };
  /** Téléphone : la roue en grand pendant le tirage (le tapis s'efface). */
  roueGrande?: { x: number; y: number; r: number };
  croupier: { x: number; y: number; taille: number };
  tapis: { vertical: boolean; x0: number; y0: number; cw: number; ch: number };
  histo: { x: number; y: number; w: number; h: number };
  ySieges: number; xSieges: [number, number]; avatar: number;
}

const geometrie = (portrait: boolean): Geo => portrait
  ? { W: 900, H: 1430, roue: { x: 800, y: 96, r: 84 }, roueGrande: { x: 450, y: 640, r: 405 }, croupier: { x: 62, y: 74, taille: 92 },
      tapis: { vertical: true, x0: 875, y0: 198, cw: 170, ch: 72 }, histo: { x: 122, y: 54, w: 580, h: 42 },
      ySieges: 1328, xSieges: [80, 820], avatar: 80 }
  : { W: 1600, H: 900, roue: { x: 330, y: 452, r: 262 }, croupier: { x: 96, y: 96, taille: 108 },
      tapis: { vertical: false, x0: 655, y0: 196, cw: 64, ch: 76 }, histo: { x: 655, y: 86, w: 896, h: 44 },
      ySieges: 752, xSieges: [700, 1510], avatar: 92 };

/* ------------------------------ Repère du tapis ------------------------------ */

/** Coin (u, v) du repère logique → point écran. u ∈ [-1, 13], v ∈ [0, 5]. */
function P(g: Geo, u: number, v: number) {
  const t = g.tapis;
  return t.vertical ? { x: t.x0 - v * t.cw, y: t.y0 + (u + 1) * t.ch } : { x: t.x0 + (u + 1) * t.cw, y: t.y0 + v * t.ch };
}
function versLogique(g: Geo, x: number, y: number) {
  const t = g.tapis;
  return t.vertical ? { u: (y - t.y0) / t.ch - 1, v: (t.x0 - x) / t.cw } : { u: (x - t.x0) / t.cw - 1, v: (y - t.y0) / t.ch };
}
function rect(g: Geo, u1: number, v1: number, u2: number, v2: number) {
  const a = P(g, u1, v1), b = P(g, u2, v2);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
/** Case d'un numéro (1 à 36) : colonne c (0..11) et rangée r (0 = rangée du 3, 2 = rangée du 1). */
const caseNumero = (n: number) => { const c = Math.floor((n - 1) / 3); return { c, r: 3 - (n - 3 * c) }; };
const numeroCase = (c: number, r: number) => 3 * c + (3 - r);

/** Zones des mises extérieures, en coordonnées logiques. */
const EXTERIEURES: Record<string, [number, number, number, number]> = {
  c3: [12, 0, 13, 1], c2: [12, 1, 13, 2], c1: [12, 2, 13, 3],
  d1: [0, 3, 4, 4], d2: [4, 3, 8, 4], d3: [8, 3, 12, 4],
  manque: [0, 4, 2, 5], pair: [2, 4, 4, 5], rouge: [4, 4, 6, 5], noir: [6, 4, 8, 5], impair: [8, 4, 10, 5], passe: [10, 4, 12, 5],
};

/** Point logique où se posent les jetons d'une mise. */
function pointMise(id: string): { u: number; v: number } {
  const z = EXTERIEURES[id];
  if (z) return { u: (z[0] + z[2]) / 2, v: (z[1] + z[3]) / 2 };
  const d = MISES.get(id)!;
  if (d.numeros.length === 1 && d.numeros[0] === 0) return { u: -0.5, v: 1.5 };
  if (id === '0-1-2-3') return { u: 0, v: 3 };
  const nz = d.numeros.filter((n) => n > 0).map(caseNumero);
  const mu = nz.reduce((s, x) => s + x.c + 0.5, 0) / nz.length;
  const mv = nz.reduce((s, x) => s + x.r + 0.5, 0) / nz.length;
  if (d.numeros.includes(0)) return { u: 0, v: d.numeros.length === 2 ? mv : nz.length === 2 ? Math.round(mv) : mv };
  if (d.type === 'transversale' || d.type === 'sixain') return { u: mu, v: 3 };
  return { u: mu, v: mv };
}

/** Mise visée par un point du tapis (coordonnées logiques), ou null. */
function miseEn(u: number, v: number): string | null {
  if (u < -1 || u >= 13 || v < 0 || v >= 5.05) return null;
  if (v >= 3) {
    if (u < 0 || u >= 12) return null;
    // Bord bas de la grille : transversale / sixain (et les quatre premiers)
    if (v < 3.22) {
      const c = Math.floor(u), fu = u - c;
      if (fu < 0.24 && c === 0) return '0-1-2-3';
      if (fu < 0.24 && c > 0) return sixain(c - 1);
      if (fu > 0.76 && c < 11) return sixain(c);
      return transversale(c);
    }
    for (const [id, z] of Object.entries(EXTERIEURES)) if (u >= z[0] && u < z[2] && v >= z[1] && v < z[3]) return id;
    return null;
  }
  if (u >= 12) return v < 1 ? 'c3' : v < 2 ? 'c2' : 'c1';
  if (u < 0) {
    if (u > -0.2) { const r = Math.min(2, Math.floor(v)); return zeroCheval(r, v - r); }
    return '0';
  }
  const c = Math.floor(u), r = Math.min(2, Math.floor(v)), fu = u - c, fv = v - r;
  const n = numeroCase(c, r);
  const pres = 0.24;
  if (c === 0 && fu < pres) return zeroCheval(r, fv);
  const bordU = fu < pres ? -1 : fu > 1 - pres ? 1 : 0;
  const bordV = fv < pres ? -1 : fv > 1 - pres ? 1 : 0;
  const voisinU = (d: number) => (c + d >= 0 && c + d <= 11 ? n + 3 * d : null);
  const voisinV = (d: number) => (r + d >= 0 && r + d <= 2 ? n - d : null);
  const nu = bordU ? voisinU(bordU) : null, nv = bordV ? voisinV(bordV) : null;
  let id: string | null = null;
  if (nu !== null && nv !== null) id = [n, nu, nv, nu - bordV].sort((a, b) => a - b).join('-');
  else if (nu !== null) id = [n, nu].sort((a, b) => a - b).join('-');
  else if (nv !== null) id = [n, nv].sort((a, b) => a - b).join('-');
  else if (bordV === 1 && r === 2) id = bordU ? sixain(bordU < 0 ? c - 1 : c) ?? transversale(c) : transversale(c);
  return id && estMise(id) ? id : String(n);
}
const transversale = (c: number) => `${3 * c + 1}-${3 * c + 2}-${3 * c + 3}`;
const sixain = (c: number) => (c < 0 || c > 10 ? transversale(Math.max(0, c)) : Array.from({ length: 6 }, (_, i) => 3 * c + 1 + i).join('-'));
/** Le long du zéro : cheval 0/n ou transversale 0-1-2 / 0-2-3 entre deux rangées. */
function zeroCheval(r: number, fv: number) {
  const n = 3 - r;
  if (fv < 0.24 && r > 0) return n === 1 ? '0-1-2' : '0-2-3';
  if (fv > 0.76 && r < 2) return n === 2 ? '0-1-2' : '0-2-3';
  return `0-${n}`;
}

/** Cases (rectangles logiques) couvertes par une mise, pour la surbrillance. */
function casesMise(id: string): [number, number, number, number][] {
  const z = EXTERIEURES[id];
  const d = MISES.get(id);
  if (!d) return [];
  const l: [number, number, number, number][] = d.numeros.map((n) => {
    if (n === 0) return [-1, 0, 0, 3];
    const { c, r } = caseNumero(n);
    return [c, r, c + 1, r + 1];
  });
  if (z) l.push(z);
  return l;
}

const court = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(n));

/* ------------------------------ Jetons ------------------------------ */

function dessinJeton(g: Graphics, r: number, couleur: number) {
  g.clear();
  g.circle(0, 2.5, r).fill({ color: 0, alpha: 0.3 });
  g.circle(0, 0, r).fill(couleur).stroke({ width: 2.5, color: T });
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    g.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72).lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97).stroke({ width: r * 0.22, color: 0xffffff, alpha: 0.85 });
  }
  g.circle(0, 0, r * 0.62).fill(couleur).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
}

class Jeton extends Container {
  private g = new Graphics();
  private t: Text;
  montant = 0;
  constructor(private r: number, private couleur: number) {
    super();
    this.t = new Text({ text: '', style: new TextStyle({ fontFamily: POLICE, fontWeight: '700', fontSize: r * 0.72, fill: 0xffffff, stroke: { color: T, width: 3 } }) });
    this.t.anchor.set(0.5);
    dessinJeton(this.g, r, couleur);
    this.addChild(this.g, this.t);
  }
  maj(m: number) { this.montant = m; this.t.text = court(m); this.t.style.fontSize = this.r * (this.t.text.length > 3 ? 0.56 : 0.72); }
}

/* ------------------------------ Scène ------------------------------ */

interface PlaceVue {
  siege: number; x: number; y: number;
  cont: Container; avatar: Sprite; anneau: Graphics; plaque: Graphics; nom: Text; tapis: Text; mise: Text; pret: Container; bulle: Container;
  vide: boolean; cle: string; phase: number;
}

export class SceneRoulette {
  app!: Application;
  private anim!: Animateur;
  private racine = new Container();
  private fond = new Sprite();
  private coucheTapis = new Container();
  private surbrillance = new Graphics();
  private marqueur = new Container();
  private coucheJetons = new Container();
  private couchePlaces = new Container();
  private coucheEffets = new Container();
  /** La roue (rayon de dessin R0, mise à l'échelle) et le tapis, déplaçables ensemble sur téléphone. */
  private roueC = new Container();
  private tapisC = new Container();
  private vue: 'tapis' | 'roue' = 'tapis';
  private roueFixe = new Sprite();
  private roueTournante = new Sprite();
  private bille = new Graphics();
  private croupier = new Sprite();
  private bulleCroupier = new Container();
  private historique = new Container();
  private grandNumero = new Container();
  private portrait = false;
  private geo = geometrie(false);
  private places = new Map<number, PlaceVue>();
  private cleDisposition = '';
  private jetons = new Map<string, Jeton>();
  private etat: VueRoulette | null = null;
  /** Bille : posée dans une case (repère de la roue) ou en mouvement (angle relatif + rayon). */
  private billeRel: { phi: number; rayon: number } | null = null;
  private vitesseRoue = 0.00045;
  private observateur: ResizeObserver | null = null;
  private interactif = false;
  private survol: string | null = null;
  private fin: { siege: number; fin: number; total: number } | null = null;
  onMise: ((id: string) => void) | null = null;
  onVue: ((v: 'tapis' | 'roue') => void) | null = null;
  onClicPlace: ((siege: number) => void) | null = null;

  static async creer(el: HTMLElement, opts: { vitesse: number }) {
    const s = new SceneRoulette();
    s.app = new Application();
    await s.app.init({ resizeTo: el, antialias: true, backgroundAlpha: 0, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    el.appendChild(s.app.canvas);
    s.anim = new Animateur(s.app.ticker);
    s.anim.vitesse = opts.vitesse;
    s.roueFixe.anchor.set(0.5); s.roueTournante.anchor.set(0.5); s.croupier.anchor.set(0.5);
    s.tapisC.addChild(s.fond, s.coucheTapis, s.coucheJetons);
    s.roueC.addChild(s.roueFixe, s.roueTournante, s.bille, s.grandNumero);
    s.racine.addChild(s.tapisC, s.roueC, s.historique, s.croupier, s.bulleCroupier, s.couchePlaces, s.coucheEffets);
    s.coucheTapis.addChild(s.surbrillance, s.marqueur);
    s.app.stage.addChild(s.racine);
    // Sur téléphone, toucher la roue l'agrandit (ou la réduit)
    s.roueC.eventMode = 'static';
    s.roueC.on('pointertap', () => { if (s.portrait) s.afficherVue(s.vue === 'roue' ? 'tapis' : 'roue'); });
    s.bille.circle(0, 0, 9).fill(0xffffff).stroke({ width: 2.5, color: T });
    s.bille.circle(-2.5, -2.5, 3).fill({ color: 0xffffff, alpha: 1 });
    s.app.ticker.add(() => s.image());
    s.installerTapis();
    s.observateur = new ResizeObserver(() => { s.app.resize(); s.redimensionner(); });
    s.observateur.observe(el);
    s.redimensionner();
    void textureAvatar('croupier', 'content').then((t) => { s.croupier.texture = t; s.croupier.width = s.croupier.height = s.geo.croupier.taille; });
    return s;
  }

  options(o: { vitesse?: number }) { if (o.vitesse !== undefined) this.anim.vitesse = o.vitesse; }
  detruire() { this.observateur?.disconnect(); this.app.destroy(true, { children: true }); }
  accelerer() { this.anim.terminerTout(); }
  /** Les clics sur le tapis posent des jetons seulement pendant « faites vos jeux ». */
  activer(oui: boolean) { this.interactif = oui; this.coucheTapis.cursor = oui ? 'pointer' : 'default'; if (!oui) this.majSurvol(null); }

  /* ------------------------------ Disposition ------------------------------ */

  private redimensionner() {
    const w = this.app.screen.width, h = this.app.screen.height;
    const portrait = h > w * 1.05;
    if (portrait !== this.portrait || this.fond.texture === Texture.EMPTY) {
      this.portrait = portrait;
      this.geo = geometrie(portrait);
      this.dessinerFond();
      this.dessinerRoue();
      this.cleDisposition = '';
      if (this.etat) this.appliquerEtat(this.etat);
    }
    const g = this.geo, e = Math.min(w / g.W, h / g.H);
    this.racine.scale.set(e);
    this.racine.position.set((w - g.W * e) / 2, (h - g.H * e) / 2);
    this.croupier.position.set(g.croupier.x, g.croupier.y);
    this.croupier.width = this.croupier.height = g.croupier.taille;
    if (this.portrait) this.bulleCroupier.position.set(g.croupier.x - g.croupier.taille * 0.42, g.croupier.y + g.croupier.taille * 0.66);
    else this.bulleCroupier.position.set(g.croupier.x + g.croupier.taille * 0.55, g.croupier.y - g.croupier.taille * 0.3);
    this.placerVue(false);
  }

  private installerTapis() {
    const t = this.coucheTapis;
    t.eventMode = 'static';
    const pos = (e: { global: { x: number; y: number } }) => { const p = this.racine.toLocal(e.global); return versLogique(this.geo, p.x, p.y); };
    t.on('pointermove', (e) => { if (!this.interactif || e.pointerType === 'touch') return; const p = pos(e); this.majSurvol(miseEn(p.u, p.v)); });
    t.on('pointerleave', () => this.majSurvol(null));
    t.on('pointertap', (e) => {
      if (!this.interactif) return;
      const p = pos(e);
      const id = miseEn(p.u, p.v);
      if (!id) return;
      if (e.pointerType === 'touch') { this.majSurvol(id); setTimeout(() => { if (this.survol === id) this.majSurvol(null); }, 450); }
      this.onMise?.(id);
    });
  }

  private majSurvol(id: string | null) {
    if (id === this.survol) return;
    this.survol = id;
    const s = this.surbrillance.clear();
    if (!id) return;
    for (const [u1, v1, u2, v2] of casesMise(id)) {
      const r = rect(this.geo, u1, v1, u2, v2);
      s.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 8).fill({ color: CREME, alpha: 0.32 }).stroke({ width: 3, color: CREME, alpha: 0.9 });
    }
  }

  private dessinerFond() {
    const g = this.geo, res = 1.5;
    const c = document.createElement('canvas');
    c.width = g.W * res; c.height = g.H * res;
    const x = c.getContext('2d')!;
    x.scale(res, res);
    // Le tapis : bois puis feutre
    const z = { a: P(g, -1.35, -0.35), b: P(g, 13.35, 5.35) };
    const zx = Math.min(z.a.x, z.b.x), zy = Math.min(z.a.y, z.b.y), zw = Math.abs(z.a.x - z.b.x), zh = Math.abs(z.a.y - z.b.y);
    x.save(); x.filter = 'blur(16px)'; x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.roundRect(zx - 10, zy + 14, zw + 20, zh + 20, 34); x.fill(); x.restore();
    const bois = x.createLinearGradient(0, zy, 0, zy + zh);
    bois.addColorStop(0, '#C9824A'); bois.addColorStop(1, '#8A4E24');
    x.fillStyle = bois; x.strokeStyle = '#2A1E3F'; x.lineWidth = 6;
    x.beginPath(); x.roundRect(zx - 18, zy - 18, zw + 36, zh + 36, 36); x.fill(); x.stroke();
    const feutre = x.createRadialGradient(zx + zw / 2, zy + zh / 2, 0, zx + zw / 2, zy + zh / 2, Math.max(zw, zh) * 0.7);
    feutre.addColorStop(0, '#4FC07E'); feutre.addColorStop(1, '#22844F');
    x.fillStyle = feutre; x.lineWidth = 5;
    x.beginPath(); x.roundRect(zx, zy, zw, zh, 22); x.fill(); x.stroke();
    // Cases
    const ligne = 'rgba(255,244,223,.85)';
    const caseR = (u1: number, v1: number, u2: number, v2: number) => rect(g, u1, v1, u2, v2);
    const texte = (s: string, cx: number, cy: number, taille: number, couleur = '#FFF4DF', tourne = false) => {
      x.save(); x.translate(cx, cy); if (tourne) x.rotate(-Math.PI / 2);
      x.font = `700 ${taille}px Fredoka, Nunito, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = couleur; x.fillText(s, 0, 1);
      x.restore();
    };
    const cadre = (r: { x: number; y: number; w: number; h: number }) => { x.strokeStyle = ligne; x.lineWidth = 2.5; x.strokeRect(r.x, r.y, r.w, r.h); };
    const tn = Math.min(g.tapis.cw, g.tapis.ch);
    // Zéro (en pointe)
    {
      const r = caseR(-1, 0, 0, 3);
      x.fillStyle = 'rgba(37,160,92,.55)'; x.fillRect(r.x, r.y, r.w, r.h); cadre(r);
      texte('0', r.x + r.w / 2, r.y + r.h / 2, tn * 0.62);
    }
    for (let n = 1; n <= 36; n++) {
      const { c, r: rg } = caseNumero(n);
      const r = caseR(c, rg, c + 1, rg + 1);
      cadre(r);
      const rr = Math.min(r.w, r.h) * 0.4;
      x.fillStyle = couleurNumero(n) === 'rouge' ? ROUGE_C : NOIR_C;
      x.beginPath(); x.ellipse(r.x + r.w / 2, r.y + r.h / 2, g.tapis.vertical ? rr * 1.6 : rr * 0.95, g.tapis.vertical ? rr * 1.08 : rr * 1.15, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1.5; x.stroke();
      texte(String(n), r.x + r.w / 2, r.y + r.h / 2, tn * (g.tapis.vertical ? 0.52 : 0.42));
    }
    const tourne = g.tapis.vertical;
    for (const [id, [u1, v1, u2, v2]] of Object.entries(EXTERIEURES)) {
      const r = caseR(u1, v1, u2, v2);
      cadre(r);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const t = tn * (g.tapis.vertical ? 0.46 : 0.36);
      if (id === 'rouge' || id === 'noir') {
        const l = Math.min(r.w, r.h) * 0.36, L = Math.max(r.w, r.h) * 0.2;
        x.fillStyle = id === 'rouge' ? ROUGE_C : NOIR_C; x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2;
        x.beginPath();
        if (tourne) { x.moveTo(cx - l, cy); x.lineTo(cx, cy - L); x.lineTo(cx + l, cy); x.lineTo(cx, cy + L); }
        else { x.moveTo(cx - L, cy); x.lineTo(cx, cy - l); x.lineTo(cx + L, cy); x.lineTo(cx, cy + l); }
        x.closePath(); x.fill(); x.stroke();
        continue;
      }
      const nom: Record<string, string> = { c1: '2 à 1', c2: '2 à 1', c3: '2 à 1', d1: '1re douzaine', d2: '2e douzaine', d3: '3e douzaine', manque: '1 - 18', pair: 'PAIR', impair: 'IMPAIR', passe: '19 - 36' };
      texte(nom[id], cx, cy, id.startsWith('c') ? t * 0.85 : t, '#FFF4DF', tourne && !id.startsWith('c'));
    }
    const ancienne = this.fond.texture;
    this.fond.texture = textureCanvas(c, res);
    if (ancienne && ancienne !== Texture.EMPTY) ancienne.destroy(true);
    this.coucheTapis.hitArea = { contains: (px: number, py: number) => px >= zx && px <= zx + zw && py >= zy && py <= zy + zh };
  }

  /** Le cylindre : la partie fixe (bois, piste de la bille) et la partie qui tourne (cases, cône, croisillon). */
  private dessinerRoue() {
    const R = R0, res = 1.5; // R·2·res entier : sinon CanvasSource redimensionne (et efface) la toile
    const toile = () => { const c = document.createElement('canvas'); c.width = c.height = R * 2 * res; const x = c.getContext('2d')!; x.scale(res, res); x.translate(R, R); return { c, x }; };
    {
      const { c, x } = toile();
      x.beginPath(); x.arc(0, 0, R - 3, 0, Math.PI * 2);
      const bois = x.createRadialGradient(0, -R * 0.3, R * 0.2, 0, 0, R);
      bois.addColorStop(0, '#D8935A'); bois.addColorStop(1, '#7A4220');
      x.fillStyle = bois; x.fill(); x.lineWidth = 6; x.strokeStyle = '#2A1E3F'; x.stroke();
      // Piste de la bille
      x.beginPath(); x.arc(0, 0, R * 0.88, 0, Math.PI * 2);
      const piste = x.createRadialGradient(0, 0, R * 0.7, 0, 0, R * 0.88);
      piste.addColorStop(0, '#4A2A14'); piste.addColorStop(0.7, '#8C5A30'); piste.addColorStop(1, '#5A3418');
      x.fillStyle = piste; x.fill(); x.lineWidth = 4; x.stroke();
      // Losanges déflecteurs
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        x.save(); x.rotate(a); x.translate(0, -R * 0.8);
        x.beginPath(); x.moveTo(0, -9); x.lineTo(5, 0); x.lineTo(0, 9); x.lineTo(-5, 0); x.closePath();
        x.fillStyle = '#FFD25E'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#2A1E3F'; x.stroke();
        x.restore();
      }
      this.roueFixe.texture = textureCanvas(c, res);
    }
    {
      const { c, x } = toile();
      const r1 = R * 0.745, r2 = R * 0.58, r3 = R * 0.5;
      for (let i = 0; i < 37; i++) {
        const n = ROUE[i], a = -Math.PI / 2 + i * PAS;
        x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, r1, a - PAS / 2, a + PAS / 2); x.closePath();
        x.fillStyle = n === 0 ? VERT_C : couleurNumero(n) === 'rouge' ? ROUGE_C : NOIR_C; x.fill();
        x.save(); x.rotate(a + Math.PI / 2);
        x.font = `700 ${R * 0.072}px Fredoka, Nunito, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#FFF4DF';
        x.fillText(String(n), 0, -R * 0.682);
        x.restore();
      }
      // Cases de la bille (anneau intérieur un peu plus sombre) et séparations
      x.beginPath(); x.arc(0, 0, R * 0.635, 0, Math.PI * 2); x.arc(0, 0, r2, 0, Math.PI * 2, true); x.fillStyle = 'rgba(0,0,0,.28)'; x.fill();
      x.strokeStyle = '#E8C77A'; x.lineWidth = 1.6;
      for (let i = 0; i < 37; i++) { const a = -Math.PI / 2 + i * PAS + PAS / 2; x.beginPath(); x.moveTo(Math.cos(a) * r2, Math.sin(a) * r2); x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); x.stroke(); }
      x.beginPath(); x.arc(0, 0, r1, 0, Math.PI * 2); x.lineWidth = 3; x.strokeStyle = '#2A1E3F'; x.stroke();
      // Cône central
      x.beginPath(); x.arc(0, 0, r2, 0, Math.PI * 2);
      const cone = x.createRadialGradient(-R * 0.12, -R * 0.15, R * 0.05, 0, 0, r2);
      cone.addColorStop(0, '#E9A866'); cone.addColorStop(0.6, '#A8622E'); cone.addColorStop(1, '#6B3A18');
      x.fillStyle = cone; x.fill(); x.lineWidth = 3; x.strokeStyle = '#2A1E3F'; x.stroke();
      x.beginPath(); x.arc(0, 0, r3 * 0.55, 0, Math.PI * 2); x.strokeStyle = 'rgba(255,214,107,.5)'; x.lineWidth = 2; x.stroke();
      // Croisillon doré
      for (let i = 0; i < 4; i++) {
        x.save(); x.rotate((i * Math.PI) / 2);
        x.beginPath(); x.roundRect(-5, -r3 * 0.78, 10, r3 * 0.78, 5); x.fillStyle = '#FFC23D'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#2A1E3F'; x.stroke();
        x.beginPath(); x.arc(0, -r3 * 0.78, 8, 0, Math.PI * 2); x.fill(); x.stroke();
        x.restore();
      }
      x.beginPath(); x.arc(0, 0, 18, 0, Math.PI * 2); x.fillStyle = '#FFD25E'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#2A1E3F'; x.stroke();
      this.roueTournante.texture = textureCanvas(c, res);
    }
  }

  /* ------------------------------ Vue tapis / vue roue (téléphone) ------------------------------ */

  get enPortrait() { return this.portrait; }
  get vueActuelle() { return this.vue; }

  /** Sur téléphone : le tapis (avec une mini-roue) ou la roue en grand. Sans effet sur grand écran. */
  afficherVue(v: 'tapis' | 'roue', anime = true) {
    if (v === this.vue) return;
    this.vue = v;
    this.placerVue(anime);
    this.onVue?.(v);
  }

  private placerVue(anime: boolean) {
    const g = this.geo;
    const grande = this.portrait && this.vue === 'roue' && g.roueGrande;
    const cible = grande ? g.roueGrande! : g.roue;
    const pos = { x: cible.x, y: cible.y }, ech = cible.r / R0;
    const tapisAlpha = grande ? 0 : 1;
    this.tapisC.eventMode = grande ? 'none' : 'auto';
    this.roueC.cursor = this.portrait ? 'pointer' : 'default';
    if (!anime) {
      this.roueC.position.set(pos.x, pos.y); this.roueC.scale.set(ech);
      this.tapisC.alpha = tapisAlpha; this.tapisC.y = grande ? 60 : 0; this.tapisC.visible = tapisAlpha > 0;
      return;
    }
    this.tapisC.visible = true;
    void this.anim.tween(this.roueC.position, pos, 480, { ease: EASE.entreeSortie });
    void this.anim.tween(this.roueC.scale, { x: ech, y: ech }, 480, { ease: EASE.entreeSortie });
    void this.anim.tween(this.tapisC, { alpha: tapisAlpha, y: grande ? 60 : 0 }, 380, { ease: EASE.entreeSortie }).then(() => { this.tapisC.visible = this.tapisC.alpha > 0; });
  }

  /* ------------------------------ Places ------------------------------ */

  private construirePlaces(e: VueRoulette) {
    for (const p of this.places.values()) p.cont.destroy({ children: true });
    this.places.clear();
    const g = this.geo, n = e.reglages.places;
    const [x1, x2] = g.xSieges;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? (x1 + x2) / 2 : x1 + ((x2 - x1) * i) / (n - 1);
      const cont = new Container(); cont.position.set(x, g.ySieges);
      const anneau = new Graphics();
      const avatar = new Sprite(); avatar.anchor.set(0.5);
      const plaque = new Graphics();
      const st = (taille: number, fill: number) => new TextStyle({ fontFamily: POLICE, fontWeight: '600', fontSize: taille, fill });
      const nom = new Text({ text: '', style: st(18, CREME) }), tapis = new Text({ text: '', style: st(17, OR) }), mise = new Text({ text: '', style: st(16, CREME) });
      nom.anchor.set(0.5); tapis.anchor.set(0.5); mise.anchor.set(0.5);
      nom.position.set(0, g.avatar / 2 + 6); tapis.position.set(0, g.avatar / 2 + 26); mise.position.set(0, -g.avatar / 2 - 18);
      const pret = new Container(); pret.position.set(g.avatar * 0.38, -g.avatar * 0.36);
      pret.addChild(new Graphics().circle(0, 0, 15).fill(0x5bd08a).stroke({ width: 3, color: T }), Object.assign(new Text({ text: '✓', style: st(19, 0xffffff) }), { anchor: { x: 0.5, y: 0.5 } }));
      const bulle = new Container(); bulle.position.set(0, -g.avatar * 0.95); bulle.visible = false;
      cont.addChild(anneau, avatar, plaque, nom, tapis, mise, pret, bulle);
      cont.eventMode = 'static';
      cont.on('pointertap', () => { if (this.places.get(i)?.vide) this.onClicPlace?.(i); });
      this.couchePlaces.addChild(cont);
      this.places.set(i, { siege: i, x, y: g.ySieges, cont, avatar, anneau, plaque, nom, tapis, mise, pret, bulle, vide: true, cle: '', phase: Math.random() * 6 });
    }
  }

  private majPlace(p: PlaceVue, s: VueSiegeRoulette | null, e: VueRoulette) {
    const g = this.geo, coul = COULEURS_SIEGES[p.siege % 6];
    p.vide = !s;
    p.pret.visible = !!s && e.phase === 'mises' && s.pret;
    p.plaque.clear();
    if (!s) {
      p.avatar.visible = false;
      p.anneau.clear().circle(0, 0, g.avatar * 0.4).fill({ color: 0, alpha: 0.18 }).stroke({ width: 4, color: CREME, alpha: 0.35 });
      p.nom.text = e.monSiege === null && e.statut !== 'terminee' ? "S'asseoir" : 'Libre';
      p.nom.alpha = 0.6; p.tapis.text = ''; p.mise.text = '';
      p.cont.cursor = e.monSiege === null ? 'pointer' : 'default';
      return;
    }
    p.cont.cursor = 'default';
    p.avatar.visible = true; p.nom.alpha = 1;
    p.nom.text = s.nom.length > 11 ? s.nom.slice(0, 10) + '…' : s.nom;
    p.tapis.text = fmt(s.tapis);
    p.mise.text = s.totalMise ? `Misé ${fmt(s.totalMise)}` : '';
    const moi = s.id === e.moi;
    p.plaque.roundRect(-70, g.avatar / 2 - 10, 140, 50, 15).fill(moi ? 0x4a3a78 : 0x3a2d5e).stroke({ width: 4, color: coul });
    p.anneau.clear().circle(0, 0, g.avatar / 2 + 5).stroke({ width: 7, color: coul });
    const net = s.retour !== null ? s.retour - s.totalMise : null;
    const ex: Expression = e.phase !== 'mises' && net !== null ? (net > s.totalMise * 3 ? 'ravi' : net > 0 ? 'content' : net < 0 ? 'decu' : 'neutre') : e.phase === 'tirage' ? 'concentre' : 'neutre';
    const cle = `${s.avatar}:${ex}:${s.cadre}:${s.deconnecte}`;
    if (p.cle !== cle) {
      p.cle = cle;
      void textureAvatar(s.avatar, ex, s.deconnecte, s.cadre).then((t) => { if (p.cle === cle && !p.avatar.destroyed) { p.avatar.texture = t; p.avatar.width = p.avatar.height = g.avatar; } });
    }
  }

  /* ------------------------------ État ------------------------------ */

  appliquerEtat(e: VueRoulette) {
    const cle = `${this.portrait}|${e.reglages.places}`;
    if (cle !== this.cleDisposition) { this.cleDisposition = cle; this.construirePlaces(e); this.viderJetons(); }
    this.etat = e;
    for (const [i, p] of this.places) this.majPlace(p, e.sieges[i] ?? null, e);
    // Jetons sur le tapis
    const vus = new Set<string>();
    for (const s of e.sieges) {
      if (!s) continue;
      for (const [id, m] of Object.entries(s.mises)) {
        const k = `${s.siege}|${id}`;
        vus.add(k);
        this.jeton(s.siege, id).maj(m);
      }
    }
    for (const [k, j] of this.jetons) if (!vus.has(k)) { j.destroy({ children: true }); this.jetons.delete(k); }
    // Bille au repos dans la dernière case sortie
    const n = e.numero ?? e.historique[0] ?? null;
    if (n !== null) this.billeRel = { phi: this.anglePoche(n), rayon: R0 * 0.6 };
    else this.billeRel = null;
    this.majMarqueur(e.phase !== 'mises' ? e.numero : null);
    this.majHistorique(e.historique);
    if (e.phase === 'mises' || e.numero === null) this.grandNumero.removeChildren();
    if (e.phase === 'mises' && e.resteMs !== null) this.fin = { siege: -1, fin: performance.now() + e.resteMs, total: e.reglages.tempsMises * 1000 };
    else this.fin = null;
  }

  private viderJetons() { for (const j of this.jetons.values()) j.destroy({ children: true }); this.jetons.clear(); }

  private posJeton(siege: number, id: string) {
    const p = pointMise(id), q = P(this.geo, p.u, p.v);
    const k = siege % 6;
    return { x: q.x + (k % 3 - 1) * 5, y: q.y - k * 3.5 };
  }

  private rayonJeton() { return Math.min(this.geo.tapis.cw, this.geo.tapis.ch) * 0.33; }

  private jeton(siege: number, id: string): Jeton {
    const k = `${siege}|${id}`;
    let j = this.jetons.get(k);
    if (!j) {
      j = new Jeton(this.rayonJeton(), COULEURS_SIEGES[siege % 6]);
      const p = this.posJeton(siege, id);
      j.position.set(p.x, p.y);
      j.zIndex = siege === this.etat?.monSiege ? 100 : siege;
      this.coucheJetons.addChild(j);
      this.coucheJetons.sortableChildren = true;
      this.jetons.set(k, j);
    }
    return j;
  }

  private anglePoche(n: number) { return -Math.PI / 2 + ROUE.indexOf(n as (typeof ROUE)[number]) * PAS; }

  private majMarqueur(n: number | null) {
    const m = this.marqueur;
    m.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (n === null) return;
    const [u1, v1, u2, v2] = n === 0 ? [-1, 0, 0, 3] : (() => { const { c, r } = caseNumero(n); return [c, r, c + 1, r + 1]; })();
    const r = rect(this.geo, u1, v1, u2, v2);
    const g = new Graphics().roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8).stroke({ width: 5, color: OR });
    // La « dame » posée sur le numéro gagnant
    const d = new Graphics();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rd = Math.min(r.w, r.h) * 0.24;
    d.ellipse(cx, cy + rd * 0.5, rd, rd * 0.45).fill(0xfff4df).stroke({ width: 2.5, color: T });
    d.rect(cx - rd * 0.35, cy - rd * 1.2, rd * 0.7, rd * 1.7).fill(0xfff4df).stroke({ width: 2.5, color: T });
    d.circle(cx, cy - rd * 1.3, rd * 0.5).fill(OR).stroke({ width: 2.5, color: T });
    m.addChild(g, d);
  }

  private majHistorique(l: number[]) {
    const h = this.geo.histo;
    this.historique.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.historique.addChild(new Graphics().roundRect(h.x, h.y, h.w, h.h, h.h / 2).fill({ color: 0, alpha: 0.25 }));
    const taille = h.h - 10, ecart = taille + 7;
    const max = Math.floor((h.w - 20) / ecart);
    l.slice(0, max).forEach((n, i) => {
      const c = new Container();
      const fond = n === 0 ? 0x25a05c : couleurNumero(n) === 'rouge' ? 0xe5484d : 0x2a1e3f;
      c.addChild(new Graphics().circle(0, 0, taille / 2).fill(fond).stroke({ width: i === 0 ? 3.5 : 2, color: i === 0 ? OR : 0xfff4df, alpha: i === 0 ? 1 : 0.5 }));
      const t = new Text({ text: String(n), style: new TextStyle({ fontFamily: POLICE, fontWeight: '700', fontSize: taille * 0.5, fill: 0xfff4df }) });
      t.anchor.set(0.5);
      c.addChild(t);
      c.position.set(h.x + 10 + taille / 2 + i * ecart, h.y + h.h / 2);
      c.alpha = 1 - Math.min(0.55, i * 0.035);
      this.historique.addChild(c);
    });
  }

  /* ------------------------------ Image par image ------------------------------ */

  private image() {
    const t = performance.now(), dt = this.app.ticker.deltaMS;
    this.roueTournante.rotation += this.vitesseRoue * dt;
    const g = this.geo;
    if (this.billeRel) {
      this.bille.visible = true;
      const a = this.roueTournante.rotation + this.billeRel.phi;
      this.bille.position.set(Math.cos(a) * this.billeRel.rayon, Math.sin(a) * this.billeRel.rayon);
      this.bille.scale.set(Math.max(1, 0.55 / this.roueC.scale.x) * 1.6);
    } else this.bille.visible = false;
    for (const p of this.places.values()) {
      if (p.vide || !p.avatar.texture?.width) continue;
      const base = g.avatar / p.avatar.texture.width;
      const souffle = 1 + 0.018 * Math.sin(t / 1150 + p.phase);
      p.avatar.scale.set(base * souffle ** 0.7, base * souffle);
    }
    if (this.croupier.texture?.width) {
      const base = g.croupier.taille / this.croupier.texture.width, s = 1 + 0.015 * Math.sin(t / 1300);
      this.croupier.scale.set(base * s ** 0.7, base * s);
    }
  }

  /* ------------------------------ Animations ------------------------------ */

  private bulle(c: Container, texte: string, fond: number, couleur = T, taille = 24) {
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    const p = pastille(texte, fond, couleur, taille);
    c.addChild(p);
    c.visible = true; c.alpha = 1; c.scale.set(0.3);
    void this.anim.tween(c.scale, { x: 1, y: 1 }, 240, { ease: EASE.rebond });
    const id = Symbol(); (c as any).__id = id;
    void this.anim.attendre(2000).then(() => { if ((c as any).__id === id && !c.destroyed) return this.anim.tween(c, { alpha: 0 }, 300).then(() => { if ((c as any).__id === id) c.visible = false; }); });
  }

  private parler(texte: string, fond = CREME) {
    this.bulle(this.bulleCroupier, texte, fond);
    // La bulle part vers la droite du croupier
    const p = this.bulleCroupier.children[0];
    if (p) p.x = (p as Container).width / 2;
  }

  async afficherEmote(siege: number, id: string) {
    const p = this.places.get(siege);
    if (!p || p.vide) return;
    const sp = new Sprite(await textureEmote(id));
    if (p.cont.destroyed) return;
    sp.anchor.set(0.5);
    sp.width = sp.height = this.geo.avatar * 0.95;
    const base = sp.scale.x;
    sp.scale.set(0.1);
    sp.position.set(p.x, p.y - this.geo.avatar * 1.05);
    this.coucheEffets.addChild(sp);
    await this.anim.tween(sp.scale, { x: base, y: base }, 300, { ease: EASE.rebond });
    await this.anim.attendre(1600);
    await this.anim.tween(sp, { alpha: 0 }, 300);
    sp.destroy();
  }

  private async voler(siege: number, montant: number, de: { x: number; y: number }, vers: { x: number; y: number }, duree: number, delai = 0) {
    const j = new Jeton(this.rayonJeton(), COULEURS_SIEGES[siege % 6]);
    j.maj(montant);
    j.position.set(de.x, de.y);
    this.coucheEffets.addChild(j);
    await this.anim.tween(j.position, vers, duree, { ease: EASE.entreeSortie, delai });
    j.destroy({ children: true });
  }

  /** La bille est lancée et finit dans la case du numéro. */
  private async lancerBille(n: number) {
    const R = R0;
    const depart = this.billeRel ?? { phi: -Math.PI / 2 - this.roueTournante.rotation, rayon: R * 0.6 };
    // Lancée sur la piste, en sens inverse de la roue
    const cible = this.anglePoche(n);
    const phi0 = depart.phi;
    let tours = 9 * Math.PI * 2;
    // Distance relative parcourue (la bille va « à reculons » par rapport à la roue)
    let delta = phi0 - cible;
    delta = ((delta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    tours += delta;
    const rPiste = R * 0.8, rCase = R * 0.6;
    this.billeRel = { phi: phi0, rayon: rPiste };
    jouerSon('bille');
    await this.anim.tween({ t: 0 }, { t: 1 }, 6200, {
      ease: EASE.lineaire,
      maj: (t) => {
        const e = 1 - (1 - t) ** 2.4;
        let rayon = rPiste;
        if (t > 0.6) {
          const k = Math.min(1, (t - 0.6) / 0.25);
          rayon = rCase + (rPiste - rCase) * (1 - k) + Math.sin(k * Math.PI * 3) * (1 - k) * R * 0.05;
        }
        this.billeRel = { phi: phi0 - tours * e, rayon };
      },
    });
    this.billeRel = { phi: cible, rayon: rCase };
  }

  async jouer(evts: EvenementRoulette[], apres: VueRoulette) {
    const avant = this.etat;
    if (!avant || this.cleDisposition !== `${this.portrait}|${apres.reglages.places}`) { this.appliquerEtat(apres); return; }
    const pertes: Promise<void>[] = [];
    const gains: EvenementRoulette[] = [];
    for (const ev of evts) {
      switch (ev.t) {
        case 'nouveauTour':
          this.grandNumero.removeChildren();
          this.majMarqueur(null);
          this.parler('Faites vos jeux !');
          break;
        case 'pose': {
          const p = this.places.get(ev.siege);
          if (!p) break;
          jouerSon('jeton');
          if (ev.siege !== apres.monSiege) await this.voler(ev.siege, ev.montant, { x: p.x, y: p.y }, this.posJeton(ev.siege, ev.mise), 260);
          const j = this.jeton(ev.siege, ev.mise);
          j.maj(j.montant + ev.montant);
          j.scale.set(1.25); void this.anim.tween(j.scale, { x: 1, y: 1 }, 160);
          break;
        }
        case 'retire': {
          const j = this.jetons.get(`${ev.siege}|${ev.mise}`);
          if (j && !ev.reste) { j.destroy({ children: true }); this.jetons.delete(`${ev.siege}|${ev.mise}`); }
          else if (j && ev.reste) j.maj(ev.reste);
          break;
        }
        case 'rienNeVaPlus':
          this.activer(false);
          this.afficherVue('roue');
          this.parler('Rien ne va plus !', OR);
          await this.anim.attendre(500);
          break;
        case 'tirage': {
          await this.lancerBille(ev.numero);
          this.majMarqueur(ev.numero);
          this.afficherGrandNumero(ev.numero);
          this.parler(annonce(ev.numero), ev.numero === 0 ? 0x5bd08a : couleurNumero(ev.numero) === 'rouge' ? 0xff8a7e : CREME);
          jouerSon('retourne');
          await this.anim.attendre(this.portrait ? 1500 : 700);
          if (this.portrait) { this.afficherVue('tapis'); await this.anim.attendre(520); }
          break;
        }
        case 'perte': {
          const k = `${ev.siege}|${ev.mise}`;
          const j = this.jetons.get(k);
          if (j) {
            this.jetons.delete(k);
            const g = this.geo;
            pertes.push(this.anim.tween(j, { x: this.roueC.x, y: this.roueC.y, alpha: 0 }, 520, { ease: EASE.entree, delai: pertes.length * 25 }).then(() => j.destroy({ children: true })));
          }
          break;
        }
        case 'gain': gains.push(ev); break;
        case 'bilan': {
          if (pertes.length) { jouerSon('jetons'); await Promise.all(pertes.splice(0)); }
          if (gains.length) {
            // La banque paie sur le tapis, puis tout revient au joueur
            const g = this.geo;
            jouerSon('jetons');
            await Promise.all(gains.map((x, i) => x.t === 'gain' ? this.voler(x.siege, x.retour - x.montant, { x: this.roueC.x, y: this.roueC.y }, this.posJeton(x.siege, x.mise), 420, i * 60).then(() => this.jeton(x.siege, x.mise).maj(x.retour)) : Promise.resolve()));
            const p = this.places.get(ev.siege);
            if (p) {
              await Promise.all(gains.filter((x) => x.t === 'gain' && x.siege === ev.siege).map((x, i) => {
                if (x.t !== 'gain') return Promise.resolve();
                const k = `${x.siege}|${x.mise}`, j = this.jetons.get(k);
                if (!j) return Promise.resolve();
                this.jetons.delete(k);
                return this.anim.tween(j.position, { x: p.x, y: p.y }, 380, { ease: EASE.entreeSortie, delai: i * 40 }).then(() => j.destroy({ children: true }));
              }));
            }
            for (let i = gains.length - 1; i >= 0; i--) if (gains[i].t === 'gain' && (gains[i] as { siege: number }).siege === ev.siege) gains.splice(i, 1);
          }
          const p = this.places.get(ev.siege);
          const net = ev.retour - ev.mise;
          if (p) {
            this.bulle(p.bulle, net > 0 ? `+${fmt(net)}` : net === 0 ? 'Remboursé' : `−${fmt(-net)}`, net > 0 ? 0x5bd08a : net === 0 ? CREME : 0x6b5f8a, net > 0 ? T : net === 0 ? T : 0xffffff, 20);
            if (ev.siege === apres.monSiege) jouerSon(net > ev.mise * 5 ? 'grosGain' : net > 0 ? 'gagne' : 'parole');
          }
          break;
        }
      }
    }
    if (pertes.length) await Promise.all(pertes);
    this.appliquerEtat(apres);
  }

  private afficherGrandNumero(n: number) {
    const c = this.grandNumero;
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    const r = R0 * 0.3;
    const fond = n === 0 ? 0x25a05c : couleurNumero(n) === 'rouge' ? 0xe5484d : 0x2a1e3f;
    c.addChild(new Graphics().circle(0, 0, r).fill(fond).stroke({ width: 6, color: OR }));
    const t = new Text({ text: String(n), style: new TextStyle({ fontFamily: POLICE, fontWeight: '700', fontSize: r * 1.05, fill: 0xfff4df }) });
    t.anchor.set(0.5);
    c.addChild(t);
    c.scale.set(0.2);
    void this.anim.tween(c.scale, { x: 1, y: 1 }, 380, { ease: EASE.rebond });
  }
}
