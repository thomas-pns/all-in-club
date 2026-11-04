/**
 * La table animée (PixiJS). Elle affiche une VueSalle et anime les événements du moteur.
 * Disposition « paysage » (ordinateur) ou « portrait » (téléphone), joueur toujours en bas.
 */
import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { VueSalle, VueSiege, EvenementPublic } from '../../../moteur/salle';
import type { AvatarId } from '../../../moteur/avatars';
import { RYTHME } from '../../../moteur/rythme';
import { Animateur, EASE } from './anim';
import { textureAvatar, texturesCartes, decomposer, fmt, CARTE_L, textureCanvas, textureEmote } from '../art/rendu';
import { Expression } from '../art/avatars';
import { jouerSon } from './son';
import { evaluer, decrire } from '../../../moteur/evaluation';

const NOMS_RANG = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi', 'As'];
const PAIRES = ['de 2', 'de 3', 'de 4', 'de 5', 'de 6', 'de 7', "d'8", 'de 9', 'de 10', 'de valets', 'de dames', 'de rois', "d'as"];
/** Nom de ma main : « Paire de dames », « As-Roi assortis »… */
export function nomMaMain(cartes: number[], tableau: number[]): string {
  if (tableau.length) return decrire(evaluer(cartes.concat(tableau)));
  const [a, b] = cartes.map((x) => x >> 2).sort((x, y) => y - x);
  if (a === b) return `Paire ${PAIRES[a]}`;
  return `${NOMS_RANG[a]}-${NOMS_RANG[b]}${(cartes[0] & 3) === (cartes[1] & 3) ? ' assortis' : ''}`;
}

const T = 0x2a1e3f;
const OR = 0xffc23d;
const CREME = 0xfff4df;
const POLICE = 'Fredoka, Nunito, sans-serif';

type Disposition = 'paysage' | 'portrait';

interface Geo {
  W: number; H: number; cx: number; cy: number;
  feutre: { x: number; y: number; w: number; h: number };
  rx: number; ry: number;           // ellipse des sièges
  avatar: number;
  carteTable: number;
  petiteCarte: number;
  maCarte: number;
  maCartePos: (s: { x: number; y: number }) => { x: number; y: number };
  donneur: { x: number; y: number };
}

function geometrie(d: Disposition): Geo {
  if (d === 'paysage') {
    return {
      W: 1600, H: 900, cx: 800, cy: 425,
      feutre: { x: 140, y: 120, w: 1320, h: 610 },
      rx: 700, ry: 338, avatar: 124, carteTable: 98, petiteCarte: 48, maCarte: 112,
      maCartePos: (s) => ({ x: s.x + 168, y: s.y - 8 }),
      donneur: { x: 800, y: 255 },
    };
  }
  return {
    W: 900, H: 1500, cx: 450, cy: 700,
    feutre: { x: 70, y: 165, w: 760, h: 1075 },
    rx: 392, ry: 588, avatar: 134, carteTable: 114, petiteCarte: 50, maCarte: 130,
    maCartePos: (s) => ({ x: s.x, y: s.y - 186 }),
    donneur: { x: 450, y: 450 },
  };
}

/* ------------------------------ Piles de jetons ------------------------------ */

class PileJetons extends Container {
  private g = new Graphics();
  private etiquette = new Container();
  private fondEtiquette = new Graphics();
  private texte: Text;
  montant = 0;
  constructor(private rayon = 15, private prefixe = '') {
    super();
    this.texte = new Text({ text: '', style: new TextStyle({ fontFamily: POLICE, fontWeight: '600', fontSize: 19, fill: OR }) });
    this.texte.anchor.set(0.5);
    this.etiquette.addChild(this.fondEtiquette, this.texte);
    this.addChild(this.g, this.etiquette);
  }
  maj(montant: number) {
    this.montant = montant;
    this.visible = montant > 0;
    const g = this.g.clear();
    if (montant <= 0) return;
    const piles = decomposer(montant, 15);
    const r = this.rayon, ry = r * 0.42;
    const largeur = piles.length * (r * 2 + 3);
    piles.forEach((p, i) => {
      const x = -largeur / 2 + r + i * (r * 2 + 3);
      for (let k = 0; k < Math.min(p.n, 8); k++) {
        const y = -k * 4.5;
        g.ellipse(x, y + 3.5, r, ry).fill(T);
        g.ellipse(x, y, r, ry).fill(p.couleur).stroke({ width: 2.4, color: T });
      }
      const k = Math.min(p.n, 8) - 1;
      g.ellipse(x, -k * 4.5, r * 0.78, ry * 0.78).stroke({ width: 2.6, color: p.couleur === 0xf4f1ea ? 0xff6b5b : 0xffffff, alpha: 0.9 });
    });
    this.texte.text = this.prefixe + fmt(montant);
    const w = this.texte.width + 24;
    this.fondEtiquette.clear().roundRect(-w / 2, -14, w, 28, 14).fill({ color: T, alpha: 0.85 });
    this.etiquette.position.set(this.prefixe ? largeur / 2 + w / 2 + 6 : 0, this.prefixe ? -4 : 26);
  }
}

/* ------------------------------ Sièges ------------------------------ */

interface VueSiegeScene {
  siege: number;
  cont: Container;
  avatar: Sprite;
  anneau: Graphics;
  plaque: Graphics;
  nom: Text;
  tapis: Text;
  badge: Container;
  bulle: Container;
  libMain: Container;
  mise: PileJetons;
  cartes: Sprite[];
  pos: { x: number; y: number };
  avatarId: AvatarId | null;
  expression: string;
  forcee: { ex: Expression; jusqua: number } | null;
  vide: boolean;
}

function pastille(texte: string, fond: number, couleur: number, taille = 17): Container {
  const c = new Container();
  const t = new Text({ text: texte, style: new TextStyle({ fontFamily: POLICE, fontWeight: '700', fontSize: taille, fill: couleur }) });
  t.anchor.set(0.5);
  const w = t.width + 26, h = taille + 16;
  const g = new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).fill(fond).stroke({ width: 3.5, color: T });
  c.addChild(g, t);
  return c;
}

/* ------------------------------ Scène ------------------------------ */

export interface OptionsScene { quatreCouleurs: boolean; vitesse: number; cartesCachees: boolean; dos?: string }

export class Scene {
  app!: Application;
  private anim!: Animateur;
  private racine = new Container();
  private fond = new Sprite();
  private coucheTable = new Container();
  private coucheSieges = new Container();
  private coucheCartes = new Container();
  private coucheEffets = new Container();
  private disposition: Disposition = 'paysage';
  private geo: Geo = geometrie('paysage');
  private sieges = new Map<number, VueSiegeScene>();
  private plancheCle = '';
  private tableau: Sprite[] = [];
  private pot = new PileJetons(16, 'Pot ');
  private bouton = new Container();
  private etat: VueSalle | null = null;
  private tour: { siege: number; fin: number; total: number; banque: boolean } | null = null;
  private dernierTic = 0;
  private opts: OptionsScene = { quatreCouleurs: false, vitesse: 1, cartesCachees: false };
  /** Mode « côte à côte » : mes cartes restent retournées sauf quand je les survole ou appuie dessus. */
  private revele = false;
  private mesValeurs: number[] | null = null;
  private indice = new Container();
  onRevele: ((visible: boolean) => void) | null = null;
  private etatCible: VueSalle | null = null;
  private confettis: { g: Graphics; vx: number; vy: number; vr: number; vie: number }[] = [];
  onClicSiegeVide: ((siege: number) => void) | null = null;
  private observateur: ResizeObserver | null = null;

  static async creer(el: HTMLElement, opts: OptionsScene): Promise<Scene> {
    const s = new Scene();
    s.opts = opts;
    s.app = new Application();
    await s.app.init({ resizeTo: el, antialias: true, backgroundAlpha: 0, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    el.appendChild(s.app.canvas);
    s.anim = new Animateur(s.app.ticker);
    s.anim.vitesse = opts.vitesse;
    s.racine.addChild(s.fond, s.coucheTable, s.coucheCartes, s.coucheSieges, s.coucheEffets);
    s.app.stage.addChild(s.racine);
    const bt = new Graphics().circle(0, 0, 19).fill(CREME).stroke({ width: 4, color: T });
    const btT = new Text({ text: 'D', style: new TextStyle({ fontFamily: POLICE, fontWeight: '700', fontSize: 20, fill: T }) });
    btT.anchor.set(0.5);
    s.bouton.addChild(bt, btT);
    s.bouton.visible = false;
    s.coucheTable.addChild(s.pot, s.bouton);
    s.indice.visible = false;
    s.coucheEffets.addChild(s.indice);
    s.app.ticker.add(() => s.image());
    s.app.renderer.on('resize', () => s.redimensionner());
    // Pixi ne suit que la fenêtre : on suit aussi la taille de la zone (barre d'actions qui change…)
    const obs = new ResizeObserver(() => { s.app.resize(); s.redimensionner(); });
    obs.observe(el);
    s.observateur = obs;
    s.redimensionner();
    return s;
  }

  options(o: Partial<OptionsScene>) {
    const avant = `${this.opts.quatreCouleurs}|${this.opts.dos}`;
    Object.assign(this.opts, o);
    this.anim.vitesse = this.opts.vitesse;
    if (`${this.opts.quatreCouleurs}|${this.opts.dos}` !== avant && this.etat) this.appliquerEtat(this.etat, true);
    else this.majMesCartes();
  }

  /* ------------------------------ Cartes cachées (jeu côte à côte) ------------------------------ */

  private estCachee(): boolean {
    return this.opts.cartesCachees && !this.revele && !!this.etat?.mainEnCours;
  }

  private rendreInteractive(c: Sprite) {
    if ((c as any).__regard) return;
    (c as any).__regard = true;
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const montrer = () => this.reveler(true), cacher = () => this.reveler(false);
    c.on('pointerover', montrer).on('pointerdown', montrer);
    c.on('pointerout', cacher).on('pointerup', cacher).on('pointerupoutside', cacher).on('pointercancel', cacher);
  }

  /** Pendant l'animation d'une rue, le nom de ma main tient compte des cartes déjà posées. */
  private indiceTableau(_n: number) {
    const e = this.etat;
    if (!e) return;
    const vals = this.tableau.filter((s) => !s.destroyed).length;
    const sv = e.monSiege !== null ? this.sieges.get(e.monSiege) : undefined;
    if (!sv || !this.mesValeurs || this.estCachee() || !this.indice.visible) return;
    const tab = (this.etatCible?.tableau ?? e.tableau).slice(0, vals);
    this.indice.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.indice.addChild(pastille(nomMaMain(this.mesValeurs, tab), OR, T, 17));
  }

  private reveler(v: boolean) {
    if (this.revele === v) return;
    this.revele = v;
    this.majMesCartes();
    this.onRevele?.(v);
  }

  /** Met à jour la face de mes cartes et l'indice « Maintiens pour voir ». */
  private majMesCartes() {
    const e = this.etat;
    const sv = e?.monSiege !== null && e?.monSiege !== undefined ? this.sieges.get(e.monSiege) : undefined;
    const valeurs = this.mesValeurs;
    const actives = !!sv && sv.cartes.length === 2 && !!valeurs;
    if (actives) {
      sv!.cartes.forEach((c, i) => {
        if (c.destroyed) return;
        c.texture = this.textureCarte(this.estCachee() ? null : valeurs![i]);
        this.rendreInteractive(c);
      });
    }
    // Sous mes cartes : le nom de ma main, ou l'indice si elles sont cachées
    const enJeu = actives && sv!.cartes[0].alpha > 0.9 && !!e?.mainEnCours;
    this.indice.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.indice.visible = enJeu;
    if (enJeu) {
      const cachee = this.estCachee();
      const tableau = this.tableau.length === (e?.tableau.length ?? 0) ? e!.tableau : (e?.tableau ?? []).slice(0, this.tableau.length);
      this.indice.addChild(cachee ? pastille('👁 Maintiens pour voir', 0x3a2d5e, CREME, 15) : pastille(nomMaMain(valeurs!, tableau), OR, T, 17));
      const p = this.geo.maCartePos(sv!.pos);
      this.indice.position.set(p.x, p.y + this.geo.maCarte * 0.84);
    }
  }

  detruire() {
    this.observateur?.disconnect();
    this.app.destroy(true, { children: true });
  }

  /* ------------------------------ Disposition ------------------------------ */

  private redimensionner() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const d: Disposition = h > w * 1.05 ? 'portrait' : 'paysage';
    if (d !== this.disposition) {
      this.disposition = d;
      this.geo = geometrie(d);
      this.plancheCle = '';
      this.dessinerFond();
      if (this.etat) this.appliquerEtat(this.etat, true);
    } else if (!this.fond.texture || this.fond.texture === Texture.EMPTY) this.dessinerFond();
    const g = this.geo;
    const e = Math.min(w / g.W, h / g.H);
    this.racine.scale.set(e);
    this.racine.position.set((w - g.W * e) / 2, (h - g.H * e) / 2);
  }

  private dessinerFond() {
    const g = this.geo, res = 1.5;
    const c = document.createElement('canvas');
    c.width = g.W * res; c.height = g.H * res;
    const x = c.getContext('2d')!;
    x.scale(res, res);
    const f = g.feutre;
    const stade = (dx: number, dy: number, w: number, h: number) => {
      const r = Math.min(w, h) / 2;
      x.beginPath();
      x.roundRect(dx, dy, w, h, r);
    };
    // Lumière de la lampe
    // (rayon assez court pour s'éteindre avant les bords : pas de rectangle visible)
    const lampe = x.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, Math.min(g.W, g.H) * 0.55);
    lampe.addColorStop(0, 'rgba(255,217,138,0.28)');
    lampe.addColorStop(1, 'rgba(255,217,138,0)');
    x.fillStyle = lampe; x.fillRect(0, 0, g.W, g.H);
    // Ombre, bois, feutre
    x.save(); x.filter = 'blur(18px)'; stade(f.x - 40, f.y - 10, f.w + 80, f.h + 80); x.fillStyle = 'rgba(0,0,0,0.45)'; x.fill(); x.restore();
    const bois = x.createLinearGradient(0, f.y - 40, 0, f.y + f.h + 40);
    bois.addColorStop(0, '#C9824A'); bois.addColorStop(1, '#8A4E24');
    stade(f.x - 44, f.y - 44, f.w + 88, f.h + 88); x.fillStyle = bois; x.fill();
    x.lineWidth = 7; x.strokeStyle = '#2A1E3F'; x.stroke();
    stade(f.x - 28, f.y - 28, f.w + 56, f.h + 56); x.lineWidth = 3; x.strokeStyle = 'rgba(233,165,106,0.7)'; x.stroke();
    const feutre = x.createRadialGradient(g.cx, g.cy - f.h * 0.08, 0, g.cx, g.cy, Math.max(f.w, f.h) * 0.62);
    feutre.addColorStop(0, '#4FC07E'); feutre.addColorStop(0.7, '#2E9A5E'); feutre.addColorStop(1, '#1F7A4A');
    stade(f.x, f.y, f.w, f.h); x.fillStyle = feutre; x.fill();
    x.lineWidth = 5; x.strokeStyle = '#2A1E3F'; x.stroke();
    // Motif à pois
    x.save(); stade(f.x, f.y, f.w, f.h); x.clip();
    x.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = f.x; i < f.x + f.w; i += 34) for (let j = f.y; j < f.y + f.h; j += 34) { x.beginPath(); x.arc(i + 17, j + 17, 1.7, 0, 7); x.fill(); }
    x.restore();
    // Ligne de mise
    const m = Math.min(f.w, f.h) * 0.1;
    stade(f.x + m, f.y + m, f.w - 2 * m, f.h - 2 * m);
    x.setLineDash([2, 13]); x.lineCap = 'round'; x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.22)'; x.stroke(); x.setLineDash([]);
    // Logo
    x.save();
    x.font = `700 ${this.disposition === 'paysage' ? 46 : 42}px Fredoka, Nunito, sans-serif`;
    x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,0.12)';
    x.letterSpacing = '4px';
    x.fillText('ALL-IN CLUB', g.cx, g.cy + (this.disposition === 'paysage' ? 150 : 230));
    x.restore();
    const ancienne = this.fond.texture;
    this.fond.texture = textureCanvas(c, res);
    if (ancienne && ancienne !== Texture.EMPTY) ancienne.destroy(true);
  }

  /** Position d'affichage d'un siège : le joueur (ou le siège 0 pour un spectateur) en bas. */
  private positionSiege(siege: number, places: number, monSiege: number | null): { x: number; y: number } {
    const g = this.geo;
    const ref = monSiege ?? 0;
    const k = (siege - ref + places) % places;
    const angle = (90 + (k * 360) / places) * (Math.PI / 180);
    return { x: g.cx + g.rx * Math.cos(angle), y: g.cy + g.ry * Math.sin(angle) };
  }

  private versCentre(p: { x: number; y: number }, t: number) {
    const g = this.geo;
    return { x: p.x + (g.cx - p.x) * t, y: p.y + (g.cy - p.y) * t };
  }

  /* ------------------------------ Construction des sièges ------------------------------ */

  private construireSieges(e: VueSalle) {
    for (const s of this.sieges.values()) { s.cont.destroy({ children: true }); s.cartes.forEach((c) => c.destroy()); s.mise.destroy(); }
    this.sieges.clear();
    const g = this.geo;
    for (let i = 0; i < e.reglages.places; i++) {
      const pos = this.positionSiege(i, e.reglages.places, e.monSiege);
      const cont = new Container();
      cont.position.set(pos.x, pos.y);
      const avatar = new Sprite();
      avatar.anchor.set(0.5);
      avatar.width = avatar.height = g.avatar;
      const anneau = new Graphics();
      const plaque = new Graphics();
      const style = new TextStyle({ fontFamily: POLICE, fontWeight: '600', fontSize: 19, fill: CREME });
      const nom = new Text({ text: '', style });
      const tapis = new Text({ text: '', style: new TextStyle({ fontFamily: POLICE, fontWeight: '600', fontSize: 18, fill: OR }) });
      nom.anchor.set(0.5); tapis.anchor.set(0.5);
      const yPlaque = g.avatar / 2 - 12;
      nom.position.set(0, yPlaque + 17);
      tapis.position.set(0, yPlaque + 38);
      const badge = new Container(); badge.position.set(0, -g.avatar / 2 + 2);
      const bulle = new Container(); bulle.position.set(g.avatar * 0.45, -g.avatar * 0.62); bulle.visible = false;
      const libMain = new Container(); libMain.position.set(0, -g.avatar / 2 - 26); libMain.visible = false;
      cont.addChild(anneau, avatar, plaque, nom, tapis, badge, libMain, bulle);
      cont.eventMode = 'static';
      cont.cursor = 'default';
      cont.on('pointertap', () => { if (this.sieges.get(i)?.vide) this.onClicSiegeVide?.(i); });
      this.coucheSieges.addChild(cont);
      const mise = new PileJetons(14);
      const pm = this.versCentre(pos, this.disposition === 'paysage' ? 0.4 : 0.36);
      mise.position.set(pm.x, pm.y);
      this.coucheTable.addChild(mise);
      this.sieges.set(i, {
        siege: i, cont, avatar, anneau, plaque, nom, tapis, badge, bulle, libMain, mise, cartes: [], pos,
        avatarId: null, expression: '', forcee: null, vide: true,
      });
    }
    // Emplacements du tableau
    const ct = g.carteTable, ecart = ct + 10;
    this.tableau.forEach((c) => c.destroy());
    this.tableau = [];
    this.pot.position.set(g.cx - 20, g.cy - ct * 1.4 / 2 - 46);
    void ecart;
  }

  private posTableau(i: number) {
    const g = this.geo, ct = g.carteTable, ecart = ct + 10;
    return { x: g.cx - 2 * ecart + i * ecart, y: g.cy };
  }

  private posCartesSiege(s: VueSiegeScene, i: number, moi: boolean) {
    const g = this.geo;
    if (moi) {
      const p = g.maCartePos(s.pos);
      return { x: p.x + (i - 0.5) * g.maCarte * 0.62, y: p.y + (i === 0 ? 4 : 0), rot: (i - 0.5) * 0.14, w: g.maCarte };
    }
    const p = this.versCentre(s.pos, 0.2);
    return { x: p.x + (i - 0.5) * g.petiteCarte * 0.45 + 34, y: p.y - 14, rot: (i - 0.5) * 0.3, w: g.petiteCarte };
  }

  private nouvelleCarte(w: number): Sprite {
    const sp = new Sprite(texturesCartes(this.opts.quatreCouleurs, this.opts.dos).dos);
    sp.anchor.set(0.5);
    sp.scale.set(w / CARTE_L);
    this.coucheCartes.addChild(sp);
    return sp;
  }

  private textureCarte(c: number | null) {
    const t = texturesCartes(this.opts.quatreCouleurs, this.opts.dos);
    return c === null ? t.dos : t.textures[c];
  }

  /* ------------------------------ État ------------------------------ */

  /** Affiche un état sans animation (réconciliation après les animations, ou reconnexion). */
  appliquerEtat(e: VueSalle, force = false) {
    const cle = `${this.disposition}|${e.reglages.places}|${e.monSiege}`;
    if (force || cle !== this.plancheCle) {
      this.plancheCle = cle;
      this.coucheCartes.removeChildren().forEach((c) => c.destroy());
      this.construireSieges(e);
    }
    this.etat = e;
    const g = this.geo;
    for (const [i, sv] of this.sieges) {
      const s = e.sieges[i] ?? null;
      this.majSiege(sv, s, e);
      // Cartes privées
      const moi = s?.id === e.moi;
      const doitAvoir = !!s && s.dansLaMain && (s.aDesCartes || (moi && s.cartes !== null)) && (e.mainEnCours || s.cartes !== null);
      if (!doitAvoir) { sv.cartes.forEach((c) => c.destroy()); sv.cartes = []; continue; }
      while (sv.cartes.length < 2) sv.cartes.push(this.nouvelleCarte(g.petiteCarte));
      sv.cartes.forEach((c, k) => {
        const p = this.posCartesSiege(sv, k, moi);
        c.position.set(p.x, p.y);
        c.rotation = p.rot;
        c.scale.set(p.w / CARTE_L);
        c.texture = this.textureCarte(s!.cartes && !(moi && this.estCachee()) ? s!.cartes[k] : null);
        c.alpha = s!.couche ? 0.45 : 1;
        c.tint = 0xffffff;
        if (moi) this.rendreInteractive(c);
      });
      if (moi) this.mesValeurs = s!.cartes;
    }
    if (!e.mainEnCours && this.revele) this.revele = false;
    this.majMesCartes();
    // Tableau
    while (this.tableau.length > e.tableau.length) this.tableau.pop()!.destroy();
    e.tableau.forEach((c, i) => {
      if (!this.tableau[i]) this.tableau[i] = this.nouvelleCarte(g.carteTable);
      const sp = this.tableau[i];
      const p = this.posTableau(i);
      sp.position.set(p.x, p.y); sp.rotation = 0; sp.scale.set(g.carteTable / CARTE_L);
      sp.texture = this.textureCarte(c); sp.alpha = 1; sp.tint = 0xffffff;
    });
    // Pot et bouton
    this.pot.maj(e.pot);
    this.placerBouton(e.bouton, false);
    // Temps de parole
    if (e.aParler !== null && e.resteMs !== null) {
      const total = e.banqueMs !== null ? Math.max(e.banqueMs, 1000) : e.reglages.tempsReflexion * 1000;
      this.tour = { siege: e.aParler, fin: performance.now() + e.resteMs, total, banque: e.banqueMs !== null };
    } else this.tour = e.aParler !== null ? { siege: e.aParler, fin: 0, total: 0, banque: false } : null;
  }

  private majSiege(sv: VueSiegeScene, s: VueSiege | null, e: VueSalle) {
    const g = this.geo;
    sv.vide = !s;
    sv.mise.maj(s?.mise ?? 0);
    const yPlaque = g.avatar / 2 - 12;
    if (!s) {
      sv.avatar.visible = false;
      sv.anneau.clear().circle(0, 0, g.avatar * 0.42).fill({ color: 0x000000, alpha: 0.18 }).stroke({ width: 4, color: CREME, alpha: 0.45 });
      sv.plaque.clear();
      sv.nom.text = e.monSiege === null && e.statut !== 'terminee' ? 'S\'asseoir ici' : 'Place libre';
      sv.nom.alpha = 0.7;
      sv.nom.position.set(0, g.avatar * 0.42 + 22);
      sv.tapis.text = '+';
      sv.tapis.style.fontSize = 40; sv.tapis.style.fill = CREME;
      sv.tapis.alpha = 0.6;
      sv.tapis.position.set(0, -2);
      sv.badge.removeChildren();
      sv.libMain.visible = false;
      sv.cont.cursor = e.monSiege === null ? 'pointer' : 'default';
      sv.avatarId = null;
      return;
    }
    sv.cont.cursor = 'default';
    sv.avatar.visible = true;
    sv.nom.alpha = 1;
    sv.tapis.alpha = 1;
    sv.tapis.style.fontSize = 18; sv.tapis.style.fill = OR;
    sv.nom.position.set(0, yPlaque + 17);
    sv.tapis.position.set(0, yPlaque + 38);
    const moi = s.id === e.moi;
    sv.nom.text = s.nom + (s.bot ? ' 🤖' : '');
    if (sv.nom.width > 150) { while (sv.nom.width > 140 && sv.nom.text.length > 3) sv.nom.text = sv.nom.text.slice(0, -2) + '…'; }
    sv.tapis.text = s.tapis > 0 || s.dansLaMain ? fmt(s.tapis) : 'À sec';
    const actif = e.aParler === s.siege;
    sv.plaque.clear().roundRect(-80, yPlaque, 160, 52, 16).fill(actif ? 0xfff4df : moi ? 0x4a3a78 : 0x3a2d5e).stroke({ width: 4, color: actif ? OR : T });
    sv.nom.style.fill = actif ? T : CREME;
    sv.tapis.style.fill = actif ? 0xe59a12 : OR;
    // Badge d'état
    sv.badge.removeChildren();
    const etiquette = s.deconnecte ? ['Déconnecté', 0x8a8fa3] : s.absent ? ['Absent', 0x8a8fa3] : s.attendGB ? ['Attend la GB', 0x46c2f0]
      : s.aTapis && e.mainEnCours ? ['Tapis', 0xff6b5b] : s.couche && e.mainEnCours ? ['Couché', 0x6b5f8a] : null;
    if (etiquette) { const p = pastille(etiquette[0] as string, etiquette[1] as number, 0xffffff, 14); sv.badge.addChild(p); }
    if (e.hote === s.id && !s.bot) {
      const c = pastille('Hôte', OR, T, 12);
      c.position.set(g.avatar * 0.42, -g.avatar * 0.34);
      c.scale.set(0.9);
      sv.badge.addChild(c);
    }
    // Main montrée
    if (s.main && !e.mainEnCours) this.montrerLibMain(sv, s.main); else if (e.mainEnCours) sv.libMain.visible = false;
    void this.majAvatar(sv, s, e);
  }

  private expressionDe(s: VueSiege, e: VueSalle, sv: VueSiegeScene): Expression {
    if (sv.forcee && sv.forcee.jusqua > performance.now()) return sv.forcee.ex;
    sv.forcee = null;
    if (e.aParler === s.siege) return 'concentre';
    if (s.aTapis && e.mainEnCours) return 'sueur';
    return 'neutre';
  }

  private async majAvatar(sv: VueSiegeScene, s: VueSiege, e: VueSalle) {
    const ex = this.expressionDe(s, e, sv);
    const gris = s.absent || s.deconnecte || (s.tapis === 0 && !s.dansLaMain) || (s.couche && e.mainEnCours);
    const cle = `${s.avatar}:${ex}:${gris}:${s.cadre}`;
    if (sv.expression === cle && sv.avatarId === s.avatar) return;
    sv.expression = cle;
    sv.avatarId = s.avatar;
    const t = await textureAvatar(s.avatar, ex, gris, s.cadre);
    if (sv.expression !== cle || sv.avatar.destroyed) return;
    sv.avatar.texture = t;
    sv.avatar.width = sv.avatar.height = this.geo.avatar;
  }

  private forcerExpression(siege: number, ex: Expression, ms: number) {
    const sv = this.sieges.get(siege);
    const s = this.etat?.sieges[siege];
    if (!sv || !s || !this.etat) return;
    sv.forcee = { ex, jusqua: performance.now() + ms / Math.max(0.5, this.opts.vitesse) };
    void this.majAvatar(sv, s, this.etat);
    setTimeout(() => { if (this.etat && this.etat.sieges[siege] && !sv.cont.destroyed) void this.majAvatar(sv, this.etat.sieges[siege]!, this.etat); }, ms + 50);
  }

  private montrerLibMain(sv: VueSiegeScene, texte: string) {
    sv.libMain.removeChildren();
    sv.libMain.addChild(pastille(texte, OR, T, 16));
    sv.libMain.visible = true;
  }

  private placerBouton(siege: number, anime: boolean) {
    if (!this.etat || siege < 0 || !this.sieges.get(siege)) { this.bouton.visible = false; return; }
    const sv = this.sieges.get(siege)!;
    const p = this.versCentre(sv.pos, this.disposition === 'paysage' ? 0.27 : 0.22);
    const dx = this.disposition === 'paysage' ? -62 : -58;
    const cible = { x: p.x + dx, y: p.y + 6 };
    this.bouton.visible = true;
    if (anime) void this.anim.tween(this.bouton.position, cible, 500, { ease: EASE.entreeSortie });
    else this.bouton.position.set(cible.x, cible.y);
  }

  /* ------------------------------ Image par image ------------------------------ */

  private image() {
    // Anneau de temps
    const t = performance.now();
    for (const sv of this.sieges.values()) {
      if (sv.vide) continue;
      sv.anneau.clear();
      const r = this.geo.avatar / 2 + 7;
      if (this.tour && this.tour.siege === sv.siege) {
        sv.anneau.circle(0, 0, r).stroke({ width: 10, color: CREME, alpha: 0.2 });
        if (this.tour.total > 0) {
          const reste = Math.max(0, this.tour.fin - t);
          const f = reste / this.tour.total;
          const coul = this.tour.banque ? 0xff9f2e : f < 0.25 ? 0xff6b5b : OR;
          sv.anneau.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, f)).stroke({ width: 10, color: coul, cap: 'round' });
          // Tic-tac pour moi dans les 5 dernières secondes
          if (this.etat && this.etat.sieges[sv.siege]?.id === this.etat.moi && reste < 5000 && reste > 0) {
            const s = Math.ceil(reste / 1000);
            if (s !== this.dernierTic) { this.dernierTic = s; jouerSon('tic'); navigator.vibrate?.(30); }
          }
        } else {
          // Sans limite de temps : anneau doré qui tourne doucement
          const a = (t / 600) % (Math.PI * 2);
          sv.anneau.arc(0, 0, r, a, a + Math.PI * 0.7).stroke({ width: 10, color: OR, cap: 'round' });
        }
      }
    }
    // Confettis
    if (this.confettis.length) {
      const dt = this.app.ticker.deltaMS / 16.67;
      this.confettis = this.confettis.filter((c) => {
        c.vy += 0.35 * dt; c.g.x += c.vx * dt; c.g.y += c.vy * dt; c.g.rotation += c.vr * dt; c.vie -= dt;
        c.g.alpha = Math.min(1, c.vie / 30);
        if (c.vie <= 0) { c.g.destroy(); return false; }
        return true;
      });
    }
  }

  private confetti(x: number, y: number, n = 70) {
    const couleurs = [0xffc23d, 0xff6b5b, 0x46c2f0, 0x8e5bd6, 0x43b072, 0xfff4df];
    for (let i = 0; i < n; i++) {
      const g = new Graphics().rect(-5, -3, 10, 6).fill(couleurs[i % couleurs.length]);
      g.position.set(x, y);
      const a = Math.random() * Math.PI * 2, v = 5 + Math.random() * 9;
      this.coucheEffets.addChild(g);
      this.confettis.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 8, vr: (Math.random() - 0.5) * 0.4, vie: 70 + Math.random() * 40 });
    }
  }

  /* ------------------------------ Animations des événements ------------------------------ */

  private bulle(siege: number, texte: string, fond: number, couleur = T) {
    const sv = this.sieges.get(siege);
    if (!sv) return;
    sv.bulle.removeChildren();
    const p = pastille(texte, fond, couleur, 18);
    sv.bulle.addChild(p);
    sv.bulle.visible = true;
    sv.bulle.scale.set(0.3);
    sv.bulle.alpha = 1;
    void this.anim.tween(sv.bulle.scale, { x: 1, y: 1 }, 260, { ease: EASE.rebond });
    const id = Symbol();
    (sv.bulle as any).__id = id;
    void this.anim.attendre(1500).then(() => {
      if ((sv.bulle as any).__id !== id || sv.bulle.destroyed) return;
      return this.anim.tween(sv.bulle, { alpha: 0 }, 300).then(() => { if ((sv.bulle as any).__id === id) sv.bulle.visible = false; });
    });
  }

  /** Jetons qui volent d'un point à un autre. */
  private async volerJetons(montant: number, de: { x: number; y: number }, vers: { x: number; y: number }, duree: number, delai = 0) {
    if (montant <= 0) return;
    const p = new PileJetons(14);
    p.maj(montant);
    (p.children[1] as Container).visible = false;
    p.position.set(de.x, de.y);
    this.coucheEffets.addChild(p);
    await this.anim.tween(p.position, vers, duree, { ease: EASE.entreeSortie, delai });
    p.destroy({ children: true });
  }

  private async retourner(sp: Sprite, carte: number, duree = 240) {
    const sx = sp.scale.x;
    await this.anim.tween(sp.scale, { x: 0, y: sp.scale.y * 1.08 }, duree / 2, { ease: EASE.entree });
    sp.texture = this.textureCarte(carte);
    jouerSon('retourne');
    await this.anim.tween(sp.scale, { x: sx, y: sx }, duree / 2, { ease: EASE.sortie });
  }

  /**
   * Anime une liste d'événements puis applique l'état final.
   * Les stocks et mises affichés sont mis à jour au fil des événements.
   */
  async jouer(evts: EvenementPublic[], apres: VueSalle): Promise<void> {
    const avant = this.etat;
    if (!avant || this.plancheCle !== `${this.disposition}|${apres.reglages.places}|${apres.monSiege}` || evts.length === 0) {
      this.appliquerEtat(apres);
      return;
    }
    const g = this.geo;
    const R = RYTHME;
    this.etatCible = apres;
    // Modèle local
    const tapis = new Map<number, number>(), mise = new Map<number, number>();
    for (const s of avant.sieges) if (s) { tapis.set(s.siege, s.tapis); mise.set(s.siege, s.mise); }
    let pot = avant.pot;
    const majTexte = (siege: number) => {
      const sv = this.sieges.get(siege);
      if (!sv || sv.vide || !apres.sieges[siege]) return;
      sv.tapis.text = fmt(tapis.get(siege) ?? 0);
      sv.mise.maj(mise.get(siege) ?? 0);
    };
    const moi = apres.monSiege;

    for (const ev of evts) {
      switch (ev.t) {
        case 'nouvelleMain': {
          for (const sv of this.sieges.values()) { sv.cartes.forEach((c) => c.destroy()); sv.cartes = []; sv.libMain.visible = false; sv.mise.maj(0); }
          this.tableau.forEach((c) => c.destroy()); this.tableau = [];
          pot = 0; this.pot.maj(0);
          mise.clear();
          this.mesValeurs = null;
          this.revele = false;
          this.indice.visible = false;
          this.etat = { ...avant, sieges: avant.sieges.map((s) => s && { ...s, couche: false, aTapis: false, main: null, dansLaMain: true }), mainEnCours: true };
          for (const [i, sv] of this.sieges) { const s = apres.sieges[i]; if (s) this.majSiege(sv, s, { ...apres, aParler: null }); }
          for (const [i] of this.sieges) { const s = apres.sieges[i]; if (s) tapis.set(i, s.tapis + (s.mise ?? 0)); }
          // Les tapis sont remis à l'état avant blindes
          for (const [i] of this.sieges) majTexte(i);
          this.placerBouton(ev.bouton, true);
          await this.anim.attendre(250);
          break;
        }
        case 'blinde': {
          const sv = this.sieges.get(ev.siege);
          if (!sv) break;
          tapis.set(ev.siege, (tapis.get(ev.siege) ?? 0) - ev.montant);
          if (ev.mort) pot += ev.montant; else mise.set(ev.siege, (mise.get(ev.siege) ?? 0) + ev.montant);
          jouerSon('jeton');
          await this.volerJetons(ev.montant, sv.pos, ev.mort ? this.pot.position : sv.mise.position, R.blinde - 50);
          majTexte(ev.siege);
          if (ev.mort) this.pot.maj(pot);
          break;
        }
        case 'donne': {
          const promesses: Promise<void>[] = [];
          let k = 0;
          for (let tour = 0; tour < 2; tour++) {
            for (const s of ev.ordre) {
              const sv = this.sieges.get(s);
              if (!sv) continue;
              const estMoi = s === moi;
              const p = this.posCartesSiege(sv, tour, estMoi);
              const c = this.nouvelleCarte(g.petiteCarte);
              c.position.set(g.donneur.x, g.donneur.y);
              c.rotation = -0.6;
              c.alpha = 0;
              sv.cartes[tour] = c;
              if (estMoi) this.rendreInteractive(c);
              const d = k++ * R.donneParCarte;
              promesses.push(this.anim.attendre(d).then(() => {
                c.alpha = 1;
                jouerSon('carte');
                return this.anim.tween(c, { x: p.x, y: p.y, rotation: p.rot }, 300, { ease: EASE.sortie, maj: (t) => c.scale.set((g.petiteCarte + (p.w - g.petiteCarte) * t) / CARTE_L) });
              }));
            }
          }
          await Promise.all(promesses);
          break;
        }
        case 'mesCartes': {
          if (moi === null) break;
          const sv = this.sieges.get(moi);
          if (!sv) break;
          this.mesValeurs = ev.cartes;
          if (this.estCachee()) { this.majMesCartes(); break; }
          await Promise.all(ev.cartes.map((c, i) => sv.cartes[i] ? this.anim.attendre(i * 90).then(() => this.retourner(sv.cartes[i], c)) : Promise.resolve()));
          this.majMesCartes();
          break;
        }
        case 'action': {
          const sv = this.sieges.get(ev.siege);
          if (!sv) break;
          const ajoute = ev.miseTour - (mise.get(ev.siege) ?? 0);
          if (ajoute > 0) {
            tapis.set(ev.siege, (tapis.get(ev.siege) ?? 0) - ajoute);
            mise.set(ev.siege, ev.miseTour);
          }
          const nom = { coucher: 'Couché', parole: 'Parole', suivre: `Suit ${fmt(ajoute)}`, miser: `Mise ${fmt(ev.montant)}`, relancer: `Relance à ${fmt(ev.montant)}`, tapis: 'Tapis !' }[ev.action];
          if (ev.tapis) {
            this.bulle(ev.siege, 'Tapis !', 0xff6b5b, 0xffffff);
            jouerSon('tapis');
            this.forcerExpression(ev.siege, 'sueur', 2500);
          } else if (ev.action === 'coucher') {
            this.bulle(ev.siege, nom, 0x6b5f8a, 0xffffff);
            jouerSon('coucher');
            const estMoi = ev.siege === moi;
            if (estMoi) this.indice.visible = false;
            sv.cartes.forEach((c) => {
              if (estMoi) { c.alpha = 0.45; return; }
              void this.anim.tween(c, { x: g.cx, y: g.cy - 40, alpha: 0, rotation: c.rotation + 1.2 }, 380, { ease: EASE.entree }).then(() => c.destroy());
            });
            if (!estMoi) sv.cartes = [];
            this.forcerExpression(ev.siege, 'decu', 1200);
          } else if (ev.action === 'parole') {
            this.bulle(ev.siege, nom, CREME);
            jouerSon('parole');
          } else {
            this.bulle(ev.siege, nom, ev.action === 'suivre' ? 0x5bd08a : OR);
            if (ev.action !== 'suivre') this.forcerExpression(ev.siege, 'content', 1000);
          }
          if (ajoute > 0) {
            jouerSon(ajoute > 3 * (this.etat?.reglages.gb ?? 20) ? 'jetons' : 'jeton');
            await this.volerJetons(ajoute, sv.pos, sv.mise.position, R.action - 120);
          } else await this.anim.attendre(R.action - 120);
          majTexte(ev.siege);
          break;
        }
        case 'remboursement': {
          const sv = this.sieges.get(ev.siege);
          if (!sv) break;
          mise.set(ev.siege, (mise.get(ev.siege) ?? 0) - ev.montant);
          tapis.set(ev.siege, (tapis.get(ev.siege) ?? 0) + ev.montant);
          majTexte(ev.siege);
          await this.volerJetons(ev.montant, sv.mise.position, sv.pos, R.remboursement);
          break;
        }
        case 'ramassage': {
          const vols: Promise<void>[] = [];
          for (const [s, m] of mise) {
            if (m <= 0) continue;
            const sv = this.sieges.get(s);
            if (!sv) continue;
            sv.mise.maj(0);
            vols.push(this.volerJetons(m, sv.mise.position, this.pot.position, R.ramassage - 80));
          }
          if (vols.length) jouerSon('jetons');
          await Promise.all(vols);
          mise.clear();
          pot = ev.pot;
          this.pot.maj(pot);
          if (vols.length) {
            this.pot.scale.set(1.18);
            void this.anim.tween(this.pot.scale, { x: 1, y: 1 }, 260, { ease: EASE.rebond });
          }
          break;
        }
        case 'rue': {
          const debut = this.tableau.length;
          await Promise.all(ev.cartes.map((c, i) => {
            const sp = this.nouvelleCarte(g.carteTable);
            const p = this.posTableau(debut + i);
            sp.position.set(g.donneur.x, g.donneur.y);
            sp.alpha = 0;
            this.tableau[debut + i] = sp;
            return this.anim.attendre(i * 150).then(async () => {
              sp.alpha = 1;
              jouerSon('carte');
              await this.anim.tween(sp, { x: p.x, y: p.y }, 280, { ease: EASE.sortie });
              await this.retourner(sp, c, 260);
            });
          }));
          if (this.mesValeurs) this.indiceTableau(ev.cartes.length);
          await this.anim.attendre(R.rue - 600);
          break;
        }
        case 'abattage': {
          const sv = this.sieges.get(ev.siege);
          if (!sv) break;
          const estMoi = ev.siege === moi;
          while (sv.cartes.length < 2) sv.cartes.push(this.nouvelleCarte(g.petiteCarte));
          await Promise.all(sv.cartes.map(async (c, i) => {
            const p = this.posCartesSiege(sv, i, estMoi);
            if (!estMoi) {
              // Les cartes montrées grossissent pour être lisibles
              const w = g.petiteCarte * 1.5;
              await this.anim.tween(c, { x: p.x + (i - 0.5) * 22, y: p.y }, 160);
              c.scale.set(w / CARTE_L);
            }
            await this.retourner(c, ev.cartes[i], 260);
          }));
          this.montrerLibMain(sv, ev.main);
          // Mise en valeur des 5 cartes
          const gagnantes = new Set(ev.meilleures);
          const toutes = [...this.tableau.map((sp, i) => ({ sp, c: apres.tableau[i] })), ...sv.cartes.map((sp, i) => ({ sp, c: ev.cartes[i] }))];
          for (const { sp, c } of toutes) sp.tint = gagnantes.has(c) ? 0xffffff : 0x8a8a9a;
          await this.anim.attendre(R.abattage - 300);
          for (const { sp } of toutes) if (!sp.destroyed) sp.tint = 0xffffff;
          break;
        }
        case 'jette': {
          const sv = this.sieges.get(ev.siege);
          if (sv) {
            sv.cartes.forEach((c) => void this.anim.tween(c, { alpha: 0.3 }, R.jette));
            this.forcerExpression(ev.siege, 'decu', 2000);
          }
          await this.anim.attendre(R.jette);
          break;
        }
        case 'pot': {
          const gros = ev.montant >= 40 * (apres.reglages.gb || 20);
          await Promise.all(ev.gagnants.map(async (gg, i) => {
            const sv = this.sieges.get(gg.siege);
            if (!sv) return;
            pot = Math.max(0, pot - gg.montant);
            this.pot.maj(pot);
            this.bulle(gg.siege, `+${fmt(gg.montant)}`, OR);
            this.forcerExpression(gg.siege, gros ? 'ravi' : 'content', 2800);
            await this.volerJetons(gg.montant, this.pot.position, sv.pos, 650, i * 120);
            tapis.set(gg.siege, (tapis.get(gg.siege) ?? 0) + gg.montant);
            majTexte(gg.siege);
            if (gros) this.confetti(sv.pos.x, sv.pos.y);
          }));
          jouerSon(gros && ev.gagnants.some((x) => x.siege === moi) ? 'grosGain' : ev.gagnants.some((x) => x.siege === moi) ? 'gagne' : 'jetons');
          if (ev.main) for (const s of apres.sieges) if (s && s.dansLaMain && !s.couche && !ev.gagnants.some((x) => x.siege === s.siege)) this.forcerExpression(s.siege, 'decu', 2500);
          await this.anim.attendre(R.pot - 650);
          break;
        }
        case 'fin':
          break;
      }
    }
    this.appliquerEtat(apres);
  }

  /** Émote affichée en grand au-dessus d'un avatar. */
  async afficherEmote(siege: number, id: string) {
    const sv = this.sieges.get(siege);
    if (!sv || sv.vide) return;
    const tex = await textureEmote(id);
    if (sv.cont.destroyed) return;
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    const taille = this.geo.avatar * 0.95;
    sp.width = sp.height = taille;
    const base = sp.scale.x;
    sp.scale.set(0.1);
    // Au-dessus de l'avatar, ou en dessous pour les sièges du haut
    const enHaut = sv.pos.y < this.geo.cy - this.geo.ry * 0.6;
    sp.position.set(sv.pos.x, sv.pos.y + (enHaut ? this.geo.avatar * 0.95 : -this.geo.avatar * 0.95));
    this.coucheEffets.addChild(sp);
    jouerSon('clic');
    await this.anim.tween(sp.scale, { x: base, y: base }, 320, { ease: EASE.rebond });
    await this.anim.tween(sp, { y: sp.y - 8 }, 500, { ease: EASE.entreeSortie });
    await this.anim.tween(sp, { y: sp.y + 8 }, 500, { ease: EASE.entreeSortie });
    await this.anim.attendre(700);
    await this.anim.tween(sp, { alpha: 0 }, 350);
    sp.destroy();
  }

  /** Termine les animations en cours (file trop longue, onglet revenu au premier plan). */
  accelerer() { this.anim.terminerTout(); }
}
