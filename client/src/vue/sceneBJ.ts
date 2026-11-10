/**
 * Table de Black Jack animée (PixiJS) : le croupier en haut, le sabot, les places des joueurs en arc.
 */
import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { VueBJ, VueSiegeBJ, EvenementBJPublic } from '../../../moteur/blackjack/salleBJ';
import type { Issue } from '../../../moteur/blackjack/regles';
import { Animateur, EASE } from './anim';
import { textureAvatar, texturesCartes, fmt, CARTE_L, textureCanvas, textureEmote } from '../art/rendu';
import type { Expression } from '../art/avatars';
import { PileJetons, pastille } from './scene';
import { jouerSon } from './son';

const T = 0x2a1e3f, OR = 0xffc23d, CREME = 0xfff4df;
const POLICE = 'Fredoka, Nunito, sans-serif';

interface GeoBJ {
  W: number; H: number; cx: number; haut: number; rx: number; ry: number;
  carte: number; avatar: number; croupier: { x: number; y: number }; cartesCroupier: { x: number; y: number };
  sabot: { x: number; y: number }; defausse: { x: number; y: number }; plateau: { x: number; y: number };
  texte: number; kCercle: number; kAvatar: number; aplat: number;
}

/** Sur téléphone, avec beaucoup de places, personnages et cartes rapetissent pour que tout tienne. */
const geometrie = (portrait: boolean, places = 1): GeoBJ => {
  const g = geometrieBase(portrait);
  return portrait && places >= 4 ? { ...g, avatar: 100, carte: 96 } : g;
};
const geometrieBase = (portrait: boolean): GeoBJ => portrait
  ? { W: 900, H: 1300, cx: 450, haut: 170, rx: 425, ry: 880, carte: 118, avatar: 128, croupier: { x: 450, y: 84 }, cartesCroupier: { x: 450, y: 300 }, sabot: { x: 795, y: 240 }, defausse: { x: 105, y: 240 }, plateau: { x: 450, y: 230 }, texte: 525, kCercle: 0.8, kAvatar: 0.985, aplat: 0.93 }
  : { W: 1600, H: 900, cx: 800, haut: 90, rx: 690, ry: 640, carte: 92, avatar: 104, croupier: { x: 800, y: 74 }, cartesCroupier: { x: 800, y: 215 }, sabot: { x: 1405, y: 168 }, defausse: { x: 195, y: 168 }, plateau: { x: 800, y: 175 }, texte: 345, kCercle: 0.8, kAvatar: 1.04, aplat: 1 };

interface PlaceVue {
  siege: number;
  cercle: { x: number; y: number };      // cercle de mise
  avatarPos: { x: number; y: number };
  cont: Container;                         // avatar, plaque
  avatar: Sprite;
  anneau: Graphics;
  nom: Text;
  tapis: Text;
  bulle: Container;
  pile: PileJetons;
  mains: { cartes: Sprite[]; badge: Container; pile: PileJetons }[];
  vide: boolean;
  cle: string;
  phase: number;
}

const LIBELLES: Record<Issue, [string, number, number]> = {
  blackjack: ['BLACK JACK !', OR, T], gagne: ['Gagné', 0x5bd08a, T], egalite: ['Égalité', CREME, T],
  perd: ['Perdu', 0x6b5f8a, 0xffffff], depasse: ['Dépassé', 0xff6b5b, 0xffffff], abandon: ['Abandon', 0x6b5f8a, 0xffffff],
};

export class SceneBJ {
  app!: Application;
  private anim!: Animateur;
  private racine = new Container();
  private fond = new Sprite();
  private coucheTable = new Container();
  private coucheCartes = new Container();
  private couchePlaces = new Container();
  private coucheEffets = new Container();
  private portrait = false;
  private geo = geometrie(false);
  private places = new Map<number, PlaceVue>();
  private cleDisposition = '';
  private croupier = new Sprite();
  private cartesCroupier: Sprite[] = [];
  private badgeCroupier = new Container();
  private bulleCroupier = new Container();
  private etat: VueBJ | null = null;
  private tour: { siege: number; fin: number; total: number } | null = null;
  private quatre = false;
  private observateur: ResizeObserver | null = null;
  private confettis: { g: Graphics; vx: number; vy: number; vr: number; vie: number }[] = [];
  onClicPlace: ((siege: number) => void) | null = null;

  static async creer(el: HTMLElement, opts: { quatreCouleurs: boolean; vitesse: number }) {
    const s = new SceneBJ();
    s.quatre = opts.quatreCouleurs;
    s.app = new Application();
    await s.app.init({ resizeTo: el, antialias: true, backgroundAlpha: 0, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    el.appendChild(s.app.canvas);
    s.anim = new Animateur(s.app.ticker);
    s.anim.vitesse = opts.vitesse;
    s.racine.addChild(s.fond, s.coucheTable, s.coucheCartes, s.couchePlaces, s.coucheEffets);
    s.app.stage.addChild(s.racine);
    s.croupier.anchor.set(0.5);
    s.coucheTable.addChild(s.croupier, s.badgeCroupier, s.bulleCroupier);
    s.app.ticker.add(() => s.image());
    s.observateur = new ResizeObserver(() => { s.app.resize(); s.redimensionner(); });
    s.observateur.observe(el);
    s.redimensionner();
    void textureAvatar('croupier', 'content').then((t) => { s.croupier.texture = t; s.croupier.width = s.croupier.height = s.geo.avatar * 1.1; });
    return s;
  }

  options(o: { quatreCouleurs?: boolean; vitesse?: number }) {
    if (o.vitesse !== undefined) this.anim.vitesse = o.vitesse;
    if (o.quatreCouleurs !== undefined && o.quatreCouleurs !== this.quatre) { this.quatre = o.quatreCouleurs; if (this.etat) this.appliquerEtat(this.etat, true); }
  }

  detruire() { this.observateur?.disconnect(); this.app.destroy(true, { children: true }); }
  accelerer() { this.anim.terminerTout(); }

  /* ------------------------------ Disposition ------------------------------ */

  private redimensionner() {
    const w = this.app.screen.width, h = this.app.screen.height;
    const portrait = h > w * 1.05;
    if (portrait !== this.portrait || !this.fond.texture || this.fond.texture === Texture.EMPTY) {
      this.portrait = portrait;
      this.geo = geometrie(portrait);
      this.dessinerFond();
      this.cleDisposition = '';
      if (this.etat) this.appliquerEtat(this.etat, true);
    }
    const g = this.geo, e = Math.min(w / g.W, h / g.H);
    this.racine.scale.set(e);
    this.racine.position.set((w - g.W * e) / 2, (h - g.H * e) / 2);
    this.croupier.position.set(g.croupier.x, g.croupier.y);
    this.croupier.width = this.croupier.height = g.avatar * 1.1;
  }

  private dessinerFond() {
    const g = this.geo, res = 1.5;
    const c = document.createElement('canvas');
    c.width = g.W * res; c.height = g.H * res;
    const x = c.getContext('2d')!;
    x.scale(res, res);
    const forme = (marge: number) => {
      x.beginPath();
      x.moveTo(g.cx - g.rx - marge, g.haut - marge * 0.4);
      x.lineTo(g.cx + g.rx + marge, g.haut - marge * 0.4);
      x.ellipse(g.cx, g.haut, g.rx + marge, g.ry + marge, 0, 0, Math.PI, false);
      x.closePath();
    };
    x.save(); x.filter = 'blur(18px)'; x.translate(0, 26); forme(40); x.fillStyle = 'rgba(0,0,0,.45)'; x.fill(); x.restore();
    const bois = x.createLinearGradient(0, g.haut, 0, g.haut + g.ry);
    bois.addColorStop(0, '#C9824A'); bois.addColorStop(1, '#8A4E24');
    forme(40); x.fillStyle = bois; x.fill(); x.lineWidth = 7; x.strokeStyle = '#2A1E3F'; x.stroke();
    const feutre = x.createRadialGradient(g.cx, g.haut + g.ry * 0.25, 0, g.cx, g.haut + g.ry * 0.3, g.rx);
    feutre.addColorStop(0, '#4FC07E'); feutre.addColorStop(0.75, '#2E9A5E'); feutre.addColorStop(1, '#1F7A4A');
    forme(0); x.fillStyle = feutre; x.fill(); x.lineWidth = 5; x.strokeStyle = '#2A1E3F'; x.stroke();
    // Bord du croupier
    x.fillStyle = '#5A3418'; x.fillRect(g.cx - g.rx - 40, g.haut - 30, (g.rx + 40) * 2, 22);
    x.strokeStyle = '#2A1E3F'; x.lineWidth = 5; x.strokeRect(g.cx - g.rx - 40, g.haut - 30, (g.rx + 40) * 2, 22);
    // Inscriptions
    x.textAlign = 'center';
    const yTexte = g.texte;
    x.font = `700 ${this.portrait ? 34 : 34}px Fredoka, Nunito, sans-serif`;
    x.fillStyle = 'rgba(255,214,107,.55)';
    if (this.portrait) { x.fillText('BLACK JACK', g.cx, yTexte - 40); x.fillText('PAIE 3 CONTRE 2', g.cx, yTexte); }
    else x.fillText('BLACK JACK PAIE 3 CONTRE 2', g.cx, yTexte);
    x.font = `600 ${this.portrait ? 22 : 21}px Fredoka, Nunito, sans-serif`;
    x.fillStyle = 'rgba(255,255,255,.35)';
    if (this.portrait) {
      x.fillText('Le croupier s\'arrête à 17', g.cx, yTexte + 36);
      x.fillText('Assurance paie 2 contre 1', g.cx, yTexte + 64);
    } else x.fillText('Le croupier tire jusqu\'à 16 et s\'arrête à 17 · Assurance paie 2 contre 1', g.cx, yTexte + 34);
    // Sabot
    const s = g.sabot;
    x.fillStyle = '#3A2D5E'; x.strokeStyle = '#2A1E3F'; x.lineWidth = 5;
    x.beginPath(); x.roundRect(s.x - 56, s.y - 44, 112, 88, 14); x.fill(); x.stroke();
    x.fillStyle = '#8E5BD6'; x.beginPath(); x.roundRect(s.x - 40, s.y - 30, 80, 56, 8); x.fill(); x.lineWidth = 3; x.stroke();
    x.fillStyle = 'rgba(255,255,255,.4)'; x.font = '700 14px Fredoka, sans-serif'; x.fillText('SABOT', s.x, s.y + 66);
    // Défausse
    const d = g.defausse;
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.setLineDash([6, 8]); x.lineWidth = 3;
    x.beginPath(); x.roundRect(d.x - 44, d.y - 52, 88, 104, 12); x.stroke(); x.setLineDash([]);
    const ancienne = this.fond.texture;
    this.fond.texture = textureCanvas(c, res);
    if (ancienne && ancienne !== Texture.EMPTY) ancienne.destroy(true);
  }

  /** Positions d'une place : cercle de mise sur le feutre, avatar sur le bord. */
  private positionPlace(siege: number, n: number) {
    const g = this.geo;
    // Le siège 0 est à droite du point de vue des joueurs (première place servie)
    const debut = this.portrait ? (n >= 4 ? 27 : 40) : 34, fin = this.portrait ? (n >= 4 ? 153 : 140) : 146;
    const a = (n === 1 ? 90 : debut + ((fin - debut) * siege) / (n - 1)) * (Math.PI / 180);
    const p = (k: number) => ({ x: g.cx + g.rx * k * Math.cos(a), y: g.haut + g.ry * k * Math.sin(a) * g.aplat });
    return { cercle: p(g.kCercle), avatarPos: p(g.kAvatar) };
  }

  private construirePlaces(e: VueBJ) {
    for (const p of this.places.values()) { p.cont.destroy({ children: true }); p.pile.destroy(); p.mains.forEach((m) => { m.cartes.forEach((c) => c.destroy()); m.badge.destroy({ children: true }); m.pile.destroy(); }); }
    this.places.clear();
    this.coucheCartes.removeChildren().forEach((c) => c.destroy());
    this.cartesCroupier = [];
    const g = this.geo;
    for (let i = 0; i < e.reglages.places; i++) {
      const { cercle, avatarPos } = this.positionPlace(i, e.reglages.places);
      const rond = new Graphics().circle(cercle.x, cercle.y, g.carte * 0.44).stroke({ width: 4, color: 0xffffff, alpha: 0.3 });
      this.coucheTable.addChild(rond);
      const cont = new Container();
      cont.position.set(avatarPos.x, avatarPos.y);
      const anneau = new Graphics();
      const avatar = new Sprite(); avatar.anchor.set(0.5);
      const f = g.avatar / 104;
      const plaque = new Graphics().roundRect(-72 * f, g.avatar / 2 - 14 * f, 144 * f, 50 * f, 15).fill(0x3a2d5e).stroke({ width: 4, color: T });
      const nom = new Text({ text: '', style: new TextStyle({ fontFamily: POLICE, fontWeight: '600', fontSize: 18 * f, fill: CREME }) });
      const tapis = new Text({ text: '', style: new TextStyle({ fontFamily: POLICE, fontWeight: '600', fontSize: 17 * f, fill: OR }) });
      nom.anchor.set(0.5); tapis.anchor.set(0.5);
      nom.position.set(0, g.avatar / 2 + 4 * f); tapis.position.set(0, g.avatar / 2 + 23 * f);
      const bulle = new Container(); bulle.position.set(g.avatar * 0.5, -g.avatar * 0.6); bulle.visible = false;
      cont.addChild(anneau, avatar, plaque, nom, tapis, bulle);
      cont.eventMode = 'static';
      cont.on('pointertap', () => { if (this.places.get(i)?.vide) this.onClicPlace?.(i); });
      this.couchePlaces.addChild(cont);
      const pile = new PileJetons(15);
      pile.position.set(cercle.x, cercle.y + 6);
      this.coucheTable.addChild(pile);
      this.places.set(i, { siege: i, cercle, avatarPos, cont, avatar, anneau, nom, tapis, bulle, pile, mains: [], vide: true, cle: '', phase: Math.random() * 6 });
    }
  }

  /** Où poser la carte n° k de la main m (sur n mains) d'une place. */
  private posCarte(p: PlaceVue, m: number, nMains: number, k: number) {
    const g = this.geo;
    const echelle = nMains > 2 ? 0.72 : nMains > 1 ? 0.85 : 1;
    const ecart = nMains > 1 ? g.carte * 0.95 * echelle : 0;
    const x0 = p.cercle.x + (m - (nMains - 1) / 2) * ecart;
    // Téléphone : les places du haut des côtés posent leurs cartes vers le centre (sinon elles montent sur le sabot)
    const cote = p.cercle.x - g.cx;
    if (this.portrait && Math.abs(cote) > g.rx * 0.55) {
      const dir = -Math.sign(cote);
      return {
        x: x0 + dir * g.carte * 0.95 + k * g.carte * 0.3 * echelle,
        y: p.cercle.y - g.carte * 0.38 - k * g.carte * 0.2 * echelle,
        w: g.carte * echelle,
      };
    }
    return {
      x: x0 + k * g.carte * 0.3 * echelle - g.carte * 0.15,
      y: p.cercle.y - g.carte * (this.portrait ? 1.02 : 1.12) - k * g.carte * 0.2 * echelle,
      w: g.carte * echelle,
    };
  }

  private texCarte(c: number | null) { const t = texturesCartes(this.quatre); return c === null ? t.dos : t.textures[c]; }

  private nouvelleCarte(c: number | null, w: number): Sprite {
    const s = new Sprite(this.texCarte(c));
    s.anchor.set(0.5);
    s.scale.set(w / CARTE_L);
    this.coucheCartes.addChild(s);
    return s;
  }

  /* ------------------------------ État ------------------------------ */

  appliquerEtat(e: VueBJ, force = false) {
    const cle = `${this.portrait}|${e.reglages.places}`;
    if (force || cle !== this.cleDisposition) { this.cleDisposition = cle; this.geo = geometrie(this.portrait, e.reglages.places); this.coucheTable.removeChildren(); this.coucheTable.addChild(this.croupier, this.badgeCroupier, this.bulleCroupier); this.construirePlaces(e); }
    this.etat = e;
    const g = this.geo;
    for (const [i, p] of this.places) {
      const s = e.sieges[i] ?? null;
      this.majPlace(p, s, e);
      // Mains
      const mains = s?.mains ?? [];
      while (p.mains.length > mains.length) { const m = p.mains.pop()!; m.cartes.forEach((c) => c.destroy()); m.badge.destroy({ children: true }); m.pile.destroy(); }
      mains.forEach((mv, mi) => {
        if (!p.mains[mi]) { const pile = new PileJetons(13); this.coucheTable.addChild(pile); const badge = new Container(); this.coucheEffets.addChild(badge); p.mains[mi] = { cartes: [], badge, pile }; }
        const m = p.mains[mi];
        while (m.cartes.length > mv.cartes.length) m.cartes.pop()!.destroy();
        mv.cartes.forEach((c, k) => {
          const pos = this.posCarte(p, mi, mains.length, k);
          if (!m.cartes[k]) m.cartes[k] = this.nouvelleCarte(c, pos.w);
          const sp = m.cartes[k];
          sp.texture = this.texCarte(c); sp.position.set(pos.x, pos.y); sp.scale.set(pos.w / CARTE_L); sp.rotation = 0; sp.alpha = 1;
          sp.zIndex = k;
        });
        const base = this.posCarte(p, mi, mains.length, 0);
        m.pile.position.set(base.x, p.cercle.y + 6);
        m.pile.maj(mv.mise);
        this.badgeMain(m.badge, mv.issue ? LIBELLES[mv.issue] : null, mv.total, mv.souple, mv.cartes.length, mv.issue ? mv.retour - mv.mise : 0);
        const der = this.posCarte(p, mi, mains.length, Math.max(0, mv.cartes.length - 1));
        m.badge.position.set(der.x + g.carte * 0.35, der.y - g.carte * 0.82);
        m.badge.visible = true;
        const actif = e.aParler?.siege === i && e.aParler.main === mi;
        m.cartes.forEach((c) => (c.tint = actif || !e.aParler || e.aParler.siege !== i ? 0xffffff : 0x9a9aaa));
      });
      p.pile.maj(mains.length ? 0 : s?.mise ?? 0);
    }
    // Croupier
    while (this.cartesCroupier.length > e.croupier.cartes.length) this.cartesCroupier.pop()!.destroy();
    e.croupier.cartes.forEach((c, k) => {
      const pos = this.posCroupier(k, e.croupier.cartes.length);
      if (!this.cartesCroupier[k]) this.cartesCroupier[k] = this.nouvelleCarte(c, g.carte);
      const sp = this.cartesCroupier[k];
      sp.texture = this.texCarte(c); sp.position.set(pos.x, pos.y); sp.scale.set(g.carte / CARTE_L); sp.alpha = 1;
    });
    this.badgeMain(this.badgeCroupier, null, e.croupier.total ?? 0, e.croupier.souple, e.croupier.cartes.filter((c) => c !== null).length);
    this.badgeCroupier.position.set(g.cartesCroupier.x, g.cartesCroupier.y + g.carte * 0.88);
    this.badgeCroupier.visible = e.croupier.total !== null;
    // Temps
    if (e.aParler && e.resteMs !== null) this.tour = { siege: e.aParler.siege, fin: performance.now() + e.resteMs, total: e.reglages.tempsReflexion * 1000 };
    else this.tour = e.aParler ? { siege: e.aParler.siege, fin: 0, total: 0 } : null;
  }

  private posCroupier(k: number, n: number) {
    const g = this.geo, ecart = g.carte * (n > 3 ? 0.5 : 0.62);
    return { x: g.cartesCroupier.x + (k - (Math.max(2, n) - 1) / 2) * ecart, y: g.cartesCroupier.y };
  }

  private badgeMain(c: Container, issue: [string, number, number] | null, total: number, souple: boolean, nCartes: number, gainNet = 0) {
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    if (!nCartes) return;
    if (issue) {
      const texte = issue[0] + (gainNet > 0 ? ` +${fmt(gainNet)}` : '');
      c.addChild(pastille(texte, issue[1], issue[2], 18 * this.geo.carte / 92));
      return;
    }
    const txt = total > 21 ? `${total}` : souple && total < 21 ? `${total - 10}/${total}` : `${total}`;
    c.addChild(pastille(txt, total > 21 ? 0xff6b5b : total === 21 ? OR : 0x2a1e3f, total > 21 || total !== 21 ? 0xffffff : T, 21 * this.geo.carte / 92));
  }

  private majPlace(p: PlaceVue, s: VueSiegeBJ | null, e: VueBJ) {
    p.vide = !s;
    const g = this.geo;
    const plaque = p.cont.children[2] as Graphics;
    if (!s) {
      // Place libre : discrète, et visible seulement pour qui peut s'y asseoir
      p.avatar.visible = false;
      plaque.visible = false;
      const peut = e.monSiege === null && e.statut !== 'terminee';
      p.cont.visible = peut;
      p.anneau.clear().circle(0, 0, g.avatar * 0.32).fill({ color: 0, alpha: 0.2 }).stroke({ width: 4, color: CREME, alpha: 0.5 });
      p.nom.text = "S'asseoir"; p.nom.alpha = 0.75; p.nom.style.fill = CREME; p.tapis.text = '';
      p.cont.cursor = 'pointer';
      return;
    }
    p.cont.visible = true;
    plaque.visible = true;
    p.cont.cursor = 'default';
    p.avatar.visible = true;
    p.nom.alpha = 1;
    p.nom.text = s.nom.length > 12 ? s.nom.slice(0, 11) + '…' : s.nom;
    p.tapis.text = fmt(s.tapis);
    const moi = s.id === e.moi;
    const ex = this.expression(s, e);
    const cle = `${s.avatar}:${ex}:${s.cadre}:${s.deconnecte}`;
    if (p.cle !== cle) {
      p.cle = cle;
      void textureAvatar(s.avatar, ex, s.deconnecte, s.cadre).then((t) => { if (p.cle === cle && !p.avatar.destroyed) { p.avatar.texture = t; p.avatar.width = p.avatar.height = g.avatar; } });
    }
    const actif = e.aParler?.siege === s.siege || (e.phase === 'mises' && !s.pret && moi);
    const f = g.avatar / 104;
    plaque.clear().roundRect(-72 * f, g.avatar / 2 - 14 * f, 144 * f, 50 * f, 15).fill(actif ? 0xfff4df : moi ? 0x4a3a78 : 0x3a2d5e).stroke({ width: 4, color: actif ? OR : T });
    p.nom.style.fill = actif ? T : CREME;
    p.tapis.style.fill = actif ? 0xe59a12 : OR;
  }

  private expression(s: VueSiegeBJ, e: VueBJ): Expression {
    const issues = s.mains.map((m) => m.issue).filter(Boolean);
    if (issues.includes('blackjack')) return 'ravi';
    if (issues.length && issues.every((i) => i === 'gagne')) return 'content';
    if (issues.length && issues.every((i) => i === 'perd' || i === 'depasse')) return 'decu';
    if (e.aParler?.siege === s.siege) return s.mains.some((m) => m.total >= 15 && m.total < 21) ? 'sueur' : 'concentre';
    return 'neutre';
  }

  /* ------------------------------ Image par image ------------------------------ */

  private image() {
    const t = performance.now();
    for (const p of this.places.values()) {
      if (p.vide || !p.avatar.texture?.width) continue;
      const base = this.geo.avatar / p.avatar.texture.width;
      const souffle = 1 + 0.018 * Math.sin(t / 1150 + p.phase);
      p.avatar.scale.set(base * souffle ** 0.7, base * souffle);
      p.anneau.clear();
      if (this.tour?.siege === p.siege) {
        const r = this.geo.avatar / 2 + 7;
        p.anneau.circle(0, 0, r).stroke({ width: 10, color: CREME, alpha: 0.2 });
        if (this.tour.total > 0) {
          const f = Math.max(0, this.tour.fin - t) / this.tour.total;
          p.anneau.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, f)).stroke({ width: 10, color: f < 0.25 ? 0xff6b5b : OR, cap: 'round' });
        } else { const a = (t / 600) % (Math.PI * 2); p.anneau.arc(0, 0, r, a, a + 2.2).stroke({ width: 10, color: OR, cap: 'round' }); }
      }
    }
    if (this.croupier.texture?.width) {
      const base = (this.geo.avatar * 1.1) / this.croupier.texture.width;
      const s = 1 + 0.015 * Math.sin(t / 1300);
      this.croupier.scale.set(base * s ** 0.7, base * s);
    }
    if (this.confettis.length) {
      const dt = this.app.ticker.deltaMS / 16.67;
      this.confettis = this.confettis.filter((c) => {
        c.vy += 0.35 * dt; c.g.x += c.vx * dt; c.g.y += c.vy * dt; c.g.rotation += c.vr * dt; c.vie -= dt; c.g.alpha = Math.min(1, c.vie / 30);
        if (c.vie <= 0) { c.g.destroy(); return false; }
        return true;
      });
    }
  }

  private confetti(x: number, y: number) {
    const couleurs = [0xffc23d, 0xff6b5b, 0x46c2f0, 0x8e5bd6, 0x43b072, 0xfff4df];
    for (let i = 0; i < 60; i++) {
      const g = new Graphics().rect(-5, -3, 10, 6).fill(couleurs[i % couleurs.length]);
      g.position.set(x, y);
      const a = Math.random() * Math.PI * 2, v = 5 + Math.random() * 8;
      this.coucheEffets.addChild(g);
      this.confettis.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 8, vr: (Math.random() - 0.5) * 0.4, vie: 70 + Math.random() * 40 });
    }
  }

  /* ------------------------------ Animations ------------------------------ */

  private bulle(c: Container, texte: string, fond: number, couleur = T) {
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    c.addChild(pastille(texte, fond, couleur, 19 * this.geo.avatar / 104));
    c.visible = true; c.alpha = 1; c.scale.set(0.3);
    void this.anim.tween(c.scale, { x: 1, y: 1 }, 240, { ease: EASE.rebond });
    const id = Symbol(); (c as any).__id = id;
    void this.anim.attendre(1400).then(() => { if ((c as any).__id === id && !c.destroyed) return this.anim.tween(c, { alpha: 0 }, 300).then(() => { if ((c as any).__id === id) c.visible = false; }); });
  }

  private async voler(montant: number, de: { x: number; y: number }, vers: { x: number; y: number }, duree = 420) {
    if (montant <= 0) return;
    const p = new PileJetons(13);
    p.maj(montant);
    (p.children[1] as Container).visible = false;
    p.position.set(de.x, de.y);
    this.coucheEffets.addChild(p);
    await this.anim.tween(p.position, vers, duree, { ease: EASE.entreeSortie });
    p.destroy({ children: true });
  }

  private async retourner(sp: Sprite, c: number) {
    const sx = sp.scale.x;
    await this.anim.tween(sp.scale, { x: 0 }, 110, { ease: EASE.entree });
    sp.texture = this.texCarte(c);
    jouerSon('retourne');
    await this.anim.tween(sp.scale, { x: sx }, 110);
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
    sp.position.set(p.avatarPos.x, p.avatarPos.y - this.geo.avatar * 0.95);
    this.coucheEffets.addChild(sp);
    await this.anim.tween(sp.scale, { x: base, y: base }, 300, { ease: EASE.rebond });
    await this.anim.attendre(1600);
    await this.anim.tween(sp, { alpha: 0 }, 300);
    sp.destroy();
  }

  async jouer(evts: EvenementBJPublic[], apres: VueBJ) {
    const avant = this.etat;
    if (!avant || this.cleDisposition !== `${this.portrait}|${apres.reglages.places}` || !evts.length) { this.appliquerEtat(apres); return; }
    const g = this.geo;
    // Modèle local : nombre de cartes par main, pour savoir où poser la suivante
    const mains = new Map<number, number[]>();
    for (const s of avant.sieges) if (s) mains.set(s.siege, s.mains.map((m) => m.cartes.length));
    let nCroupier = avant.croupier.cartes.length;
    const nMainsApres = (siege: number) => apres.sieges[siege]?.mains.length ?? 1;

    for (const ev of evts) {
      switch (ev.t) {
        case 'melange':
          this.bulle(this.bulleCroupier, 'Mélange du sabot', CREME);
          this.bulleCroupier.position.set(g.croupier.x + 110, g.croupier.y);
          jouerSon('carte');
          await this.anim.attendre(1200);
          break;
        case 'nouvelleManche': {
          // Les cartes partent à la défausse
          const toutes = [...this.cartesCroupier, ...[...this.places.values()].flatMap((p) => p.mains.flatMap((m) => m.cartes))];
          await Promise.all(toutes.map((c, i) => this.anim.tween(c, { x: g.defausse.x, y: g.defausse.y, rotation: 0.3 }, 300, { delai: i * 15 })));
          toutes.forEach((c) => c.destroy());
          this.cartesCroupier = [];
          for (const p of this.places.values()) { p.mains.forEach((m) => { m.badge.destroy({ children: true }); m.pile.destroy(); }); p.mains = []; }
          this.badgeCroupier.visible = false;
          mains.clear(); nCroupier = 0;
          const neuf: VueBJ = { ...apres, phase: 'mises', croupier: { cartes: [], total: null, souple: false }, sieges: apres.sieges.map((s) => s && { ...s, mains: [] }) };
          this.appliquerEtat(neuf);
          break;
        }
        case 'mise': {
          const p = this.places.get(ev.siege);
          if (!p) break;
          jouerSon('jetons');
          await this.voler(ev.montant, p.avatarPos, p.cercle, 300);
          p.pile.maj(ev.montant);
          break;
        }
        case 'donne': {
          let cible: { x: number; y: number; w: number };
          let sp: Sprite;
          if (ev.siege === null) {
            const k = nCroupier++;
            cible = { ...this.posCroupier(k, Math.max(2, nCroupier)), w: g.carte };
            sp = this.nouvelleCarte(null, g.carte);
            this.cartesCroupier[k] = sp;
          } else {
            const p = this.places.get(ev.siege);
            if (!p) break;
            const l = mains.get(ev.siege) ?? [];
            while (l.length <= ev.main) l.push(0);
            const k = l[ev.main]++;
            mains.set(ev.siege, l);
            const n = Math.max(l.length, ev.main + 1);
            cible = this.posCarte(p, ev.main, n === 1 ? 1 : nMainsApres(ev.siege), k);
            sp = this.nouvelleCarte(null, cible.w);
            if (!p.mains[ev.main]) { const pile = new PileJetons(13); this.coucheTable.addChild(pile); const badge = new Container(); this.coucheEffets.addChild(badge); p.mains[ev.main] = { cartes: [], badge, pile }; }
            p.mains[ev.main].cartes[k] = sp;
            // Le total de la main suivait l'ancienne dernière carte : on le cache le temps de la donne
            // (sinon il recouvre la nouvelle carte, et l'étiquette « Sauté » la cache complètement)
            const b = p.mains[ev.main].badge;
            b.visible = false;
            b.position.set(cible.x + g.carte * 0.35, cible.y - g.carte * 0.82);
            if (k === 0 && ev.main === 0) { p.mains[0].pile.position.set(p.cercle.x, p.cercle.y + 6); p.mains[0].pile.maj(p.pile.montant); p.pile.maj(0); }
          }
          sp.position.set(g.sabot.x, g.sabot.y);
          sp.rotation = -0.5;
          jouerSon('carte');
          await this.anim.tween(sp, { x: cible.x, y: cible.y, rotation: 0 }, 260, { ease: EASE.sortie });
          if (ev.carte !== null) await this.retourner(sp, ev.carte);
          break;
        }
        case 'action': {
          const p = this.places.get(ev.siege);
          if (!p) break;
          const nom = { tirer: 'Carte !', rester: 'Je reste', doubler: 'Double !', separer: 'Je sépare', abandonner: 'J\'abandonne' }[ev.action];
          this.bulle(p.bulle, nom, ev.action === 'doubler' ? OR : ev.action === 'abandonner' ? 0x6b5f8a : CREME, ev.action === 'abandonner' ? 0xffffff : T);
          if (ev.action === 'doubler' || ev.action === 'separer') { jouerSon('jetons'); const m = p.mains[ev.main]; if (m) await this.voler(m.pile.montant, p.avatarPos, m.pile.position, 300); }
          else if (ev.action === 'rester') jouerSon('parole');
          await this.anim.attendre(200);
          break;
        }
        case 'separe': {
          // La deuxième carte glisse vers sa nouvelle main
          const p = this.places.get(ev.siege);
          if (!p || !p.mains[ev.main]) break;
          const src = p.mains[ev.main];
          const carte = src.cartes.pop()!;
          const n = nMainsApres(ev.siege);
          const pile = new PileJetons(13); this.coucheTable.addChild(pile);
          const badge = new Container(); this.coucheEffets.addChild(badge);
          p.mains.splice(ev.main + 1, 0, { cartes: [carte], badge, pile });
          const l = mains.get(ev.siege) ?? [2];
          l[ev.main] = 1; l.splice(ev.main + 1, 0, 1);
          mains.set(ev.siege, l);
          await Promise.all(p.mains.flatMap((m, mi) => m.cartes.map((c, k) => { const pos = this.posCarte(p, mi, n, k); return this.anim.tween(c, { x: pos.x, y: pos.y }, 300); })));
          p.mains.forEach((m, mi) => { const pos = this.posCarte(p, mi, n, 0); m.pile.position.set(pos.x, p.cercle.y + 6); m.pile.maj(src.pile.montant); });
          break;
        }
        case 'revele': {
          const sp = this.cartesCroupier[1];
          if (sp) await this.retourner(sp, ev.carte);
          break;
        }
        case 'blackjackCroupier':
          this.bulle(this.bulleCroupier, 'Black Jack !', OR);
          this.bulleCroupier.position.set(g.croupier.x + 110, g.croupier.y);
          await this.anim.attendre(700);
          break;
        case 'assurance': {
          const p = this.places.get(ev.siege);
          if (p) { this.bulle(p.bulle, `Assurance ${fmt(ev.montant)}`, 0x46c2f0); jouerSon('jeton'); }
          break;
        }
        case 'resultatAssurance': {
          const p = this.places.get(ev.siege);
          if (p) this.bulle(p.bulle, ev.retour ? `Assurance +${fmt(ev.retour)}` : 'Assurance perdue', ev.retour ? OR : 0x6b5f8a, ev.retour ? T : 0xffffff);
          await this.anim.attendre(300);
          break;
        }
        case 'resultat': {
          const p = this.places.get(ev.siege);
          if (!p) break;
          const m = p.mains[ev.main];
          const [txt, fond, coul] = LIBELLES[ev.issue];
          if (m) {
            this.badgeMain(m.badge, [txt, fond, coul], 0, false, 1, ev.retour - ev.mise);
            const der = m.cartes[m.cartes.length - 1];
            if (der) m.badge.position.set(der.x + g.carte * 0.35, der.y - g.carte * 0.82);
            m.badge.visible = true;
            const pos = m.pile.position;
            if (ev.retour > ev.mise) { jouerSon(ev.issue === 'blackjack' ? 'grosGain' : 'gagne'); await this.voler(ev.retour - ev.mise, g.plateau, pos, 300); m.pile.maj(ev.retour); }
            else if (ev.retour === 0) { await this.voler(m.pile.montant, pos, g.plateau, 300); m.pile.maj(0); }
            else m.pile.maj(ev.retour);
            if (ev.retour > 0) { const r = m.pile.montant; m.pile.maj(0); await this.voler(r, pos, p.avatarPos, 320); }
            if (ev.issue === 'blackjack') this.confetti(p.avatarPos.x, p.avatarPos.y - 40);
          }
          break;
        }
        case 'fin':
          break;
      }
    }
    this.appliquerEtat(apres);
  }
}
