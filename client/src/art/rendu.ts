/**
 * Fabrication des textures : avatars (SVG → image), cartes (Canvas 2D avec la police du jeu).
 */
import { Texture, CanvasSource } from 'pixi.js';
import type { AvatarId } from '../../../moteur/avatars';
import { avatarSVG, Expression } from './avatars';
import { emoteSVG, DOS_COULEURS } from './emotes';

export const T = '#2A1E3F';

/** Texture à partir d'un canvas dessiné à une résolution donnée (taille logique = taille / résolution). */
export function textureCanvas(c: HTMLCanvasElement, resolution: number): Texture {
  return new Texture({ source: new CanvasSource({ resource: c, resolution }) });
}
const RESOLUTION = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

/* ------------------------------ Avatars ------------------------------ */

const cacheAvatars = new Map<string, Promise<Texture>>();

export function svgVersImage(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return img.decode().then(() => img);
}

export function textureAvatar(id: AvatarId | 'croupier', ex: Expression, gris = false, cadre = 'aucun'): Promise<Texture> {
  const cle = `${id}:${ex}:${gris}:${cadre}`;
  let p = cacheAvatars.get(cle);
  if (!p) {
    const taille = Math.round(160 * RESOLUTION);
    p = svgVersImage(avatarSVG(id, ex, taille, { gris, cadre })).then((img) => {
      const c = document.createElement('canvas');
      c.width = c.height = taille;
      c.getContext('2d')!.drawImage(img, 0, 0, taille, taille);
      return textureCanvas(c, RESOLUTION);
    });
    cacheAvatars.set(cle, p);
  }
  return p;
}

const cacheEmotes = new Map<string, Promise<Texture>>();
export function textureEmote(id: string): Promise<Texture> {
  let p = cacheEmotes.get(id);
  if (!p) {
    const taille = Math.round(110 * RESOLUTION);
    p = svgVersImage(emoteSVG(id, taille)).then((img) => {
      const c = document.createElement('canvas');
      c.width = c.height = taille;
      c.getContext('2d')!.drawImage(img, 0, 0, taille, taille);
      return textureCanvas(c, RESOLUTION);
    });
    cacheEmotes.set(id, p);
  }
  return p;
}

/* ------------------------------ Cartes ------------------------------ */

const SYMBOLES: Record<number, Path2D> = {};
function symbole(s: number): Path2D {
  if (SYMBOLES[s]) return SYMBOLES[s];
  let p: Path2D;
  if (s === 1) p = new Path2D('M50 90 C22 68 4 52 4 31 C4 15 16 5 30 5 C40 5 47 11 50 19 C53 11 60 5 70 5 C84 5 96 15 96 31 C96 52 78 68 50 90Z');
  else if (s === 2) p = new Path2D('M50 3 C60 22 76 38 92 50 C76 62 60 78 50 97 C40 78 24 62 8 50 C24 38 40 22 50 3Z');
  else if (s === 0) p = new Path2D('M50 4 C62 22 94 40 94 62 C94 76 84 86 70 86 C62 86 56 82 53 77 C54 86 58 92 64 96 L36 96 C42 92 46 86 47 77 C44 82 38 86 30 86 C16 86 6 76 6 62 C6 40 38 22 50 4Z');
  else {
    p = new Path2D();
    p.arc(50, 27, 21, 0, Math.PI * 2);
    p.moveTo(47, 57); p.arc(26, 57, 21, 0, Math.PI * 2);
    p.moveTo(95, 57); p.arc(74, 57, 21, 0, Math.PI * 2);
    p.addPath(new Path2D('M44 52 L56 52 C56 78 60 90 68 96 L32 96 C40 90 44 78 44 52Z'));
  }
  return (SYMBOLES[s] = p);
}

export const COULEURS_2 = ['#2A1E3F', '#E5484D', '#E5484D', '#2A1E3F'];
export const COULEURS_4 = ['#2A1E3F', '#E5484D', '#2F80ED', '#25A05C'];
const RANGS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const CARTE_L = 100, CARTE_H = 140;

function arrondi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dessinerSymbole(ctx: CanvasRenderingContext2D, s: number, x: number, y: number, taille: number, coul: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(taille / 100, taille / 100);
  ctx.fillStyle = coul;
  ctx.fill(symbole(s));
  ctx.restore();
}

/** Canvas d'une carte (null = dos). Échelle 2 pour la netteté. */
export function canvasCarte(carte: number | null, quatre: boolean, echelle = 2.4, dos = 'prune'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(CARTE_L * echelle);
  c.height = Math.round(CARTE_H * echelle);
  const ctx = c.getContext('2d')!;
  ctx.scale(echelle, echelle);
  arrondi(ctx, 2, 2, 96, 136, 12);
  ctx.fillStyle = '#FFFDF7';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = T;
  ctx.stroke();
  if (carte === null) {
    const [fond, rayure, medaillon] = DOS_COULEURS[dos] ?? DOS_COULEURS.prune;
    ctx.save();
    arrondi(ctx, 9, 9, 82, 122, 7);
    ctx.clip();
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, 100, 140);
    ctx.strokeStyle = rayure;
    ctx.lineWidth = 5;
    for (let i = -140; i < 140; i += 12) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 140, 140); ctx.stroke(); }
    ctx.restore();
    arrondi(ctx, 9, 9, 82, 122, 7);
    ctx.lineWidth = 2.5; ctx.strokeStyle = T; ctx.stroke();
    if (dos === 'nuit' || dos === 'legende') {
      ctx.fillStyle = 'rgba(255,244,223,.8)';
      for (const [x, y, r] of [[22, 26, 2], [74, 34, 2.5], [30, 108, 2], [70, 112, 1.6], [50, 24, 1.4], [80, 86, 1.8], [20, 70, 1.5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    }
    ctx.beginPath(); ctx.arc(50, 70, 22, 0, Math.PI * 2);
    ctx.fillStyle = medaillon; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = T; ctx.stroke();
    ctx.fillStyle = medaillon === T ? '#FFC23D' : T;
    ctx.font = '700 30px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', 50, 72);
    return c;
  }
  const r = (carte >> 2), s = carte & 3;
  const coul = (quatre ? COULEURS_4 : COULEURS_2)[s];
  const txt = RANGS[r];
  ctx.fillStyle = coul;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 ${txt.length > 1 ? 36 : 42}px Fredoka, Nunito, sans-serif`;
  if (txt.length > 1) { ctx.save(); ctx.translate(8, 42); ctx.scale(0.86, 1); ctx.fillText(txt, 0, 0); ctx.restore(); }
  else ctx.fillText(txt, 11, 44);
  dessinerSymbole(ctx, s, 11, 52, 24, coul);
  dessinerSymbole(ctx, s, 40, 68, 54, coul);
  return c;
}

let cacheCartes: { quatre: boolean; textures: Texture[] } | null = null;
const cacheDos = new Map<string, Texture>();

/** Les 52 textures + le dos choisi, régénérées si l'option 4 couleurs change. */
export function texturesCartes(quatre: boolean, dos = 'prune') {
  const versTexture = (cv: HTMLCanvasElement) => textureCanvas(cv, 2.4);
  if (!cacheCartes || cacheCartes.quatre !== quatre) cacheCartes = { quatre, textures: Array.from({ length: 52 }, (_, i) => versTexture(canvasCarte(i, quatre))) };
  let d = cacheDos.get(dos);
  if (!d) { d = versTexture(canvasCarte(null, quatre, 2.4, dos)); cacheDos.set(dos, d); }
  return { quatre, textures: cacheCartes.textures, dos: d };
}

/* ------------------------------ Jetons ------------------------------ */

export const JETONS: { valeur: number; couleur: number }[] = [
  { valeur: 5000, couleur: 0xff6b9a },
  { valeur: 1000, couleur: 0xffc23d },
  { valeur: 500, couleur: 0x8e5bd6 },
  { valeur: 100, couleur: 0x2a1e3f },
  { valeur: 25, couleur: 0x43b072 },
  { valeur: 5, couleur: 0xff6b5b },
  { valeur: 1, couleur: 0xf4f1ea },
];

/** Décompose un montant en piles de jetons (au plus `max` jetons au total). */
export function decomposer(montant: number, max = 14): { couleur: number; n: number }[] {
  const out: { couleur: number; n: number }[] = [];
  let reste = montant;
  for (const j of JETONS) {
    const n = Math.floor(reste / j.valeur);
    if (n > 0) { out.push({ couleur: j.couleur, n }); reste -= n * j.valeur; }
  }
  let total = out.reduce((s, x) => s + x.n, 0);
  while (total > max) {
    const plus = out.reduce((a, b) => (b.n > a.n ? b : a));
    plus.n--; total--;
  }
  return out.filter((x) => x.n > 0);
}

export const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
