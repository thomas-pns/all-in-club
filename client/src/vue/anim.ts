/**
 * Petit moteur d'interpolation, branché sur le ticker de PixiJS.
 */
import { Ticker } from 'pixi.js';

export type Ease = (t: number) => number;
export const EASE = {
  lineaire: (t: number) => t,
  sortie: (t: number) => 1 - (1 - t) ** 3,
  entreeSortie: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  rebond: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  entree: (t: number) => t * t * t,
};

interface Tw {
  cible: any;
  depart: Record<string, number>;
  arrivee: Record<string, number>;
  debut: number;
  duree: number;
  ease: Ease;
  fini: () => void;
  maj?: (t: number) => void;
}

export class Animateur {
  private tweens: Tw[] = [];
  private temps = 0;
  /** Facteur de vitesse : 2 = deux fois plus rapide. 0 = instantané. */
  vitesse = 1;

  constructor(ticker: Ticker) {
    ticker.add((t) => this.avancer(t.deltaMS));
  }

  private avancer(dt: number) {
    this.temps += dt;
    const actifs = this.tweens;
    this.tweens = [];
    for (const tw of actifs) {
      const t = Math.min(1, Math.max(0, (this.temps - tw.debut) / tw.duree));
      if (this.temps < tw.debut) { this.tweens.push(tw); continue; }
      const e = tw.ease(t);
      for (const k in tw.arrivee) tw.cible[k] = tw.depart[k] + (tw.arrivee[k] - tw.depart[k]) * e;
      tw.maj?.(e);
      if (t >= 1) tw.fini();
      else this.tweens.push(tw);
    }
  }

  /** Anime les propriétés numériques de `cible` jusqu'à `vers`. */
  tween(cible: any, vers: Record<string, number>, duree: number, opts: { ease?: Ease; delai?: number; maj?: (t: number) => void } = {}): Promise<void> {
    if (opts.delai && opts.delai > 0 && this.vitesse > 0)
      return this.attendre(opts.delai).then(() => this.tween(cible, vers, duree, { ...opts, delai: 0 }));
    const d = this.vitesse <= 0 ? 0 : duree / this.vitesse;
    if (d <= 0) {
      Object.assign(cible, vers);
      opts.maj?.(1);
      return Promise.resolve();
    }
    return new Promise((fini) => {
      const depart: Record<string, number> = {};
      for (const k in vers) depart[k] = cible[k];
      this.tweens.push({ cible, depart, arrivee: vers, debut: this.temps, duree: d, ease: opts.ease ?? EASE.sortie, fini, maj: opts.maj });
    });
  }

  attendre(ms: number): Promise<void> {
    const d = this.vitesse <= 0 ? 0 : ms / this.vitesse;
    if (d <= 0) return Promise.resolve();
    return new Promise((ok) => {
      this.tweens.push({ cible: {}, depart: {}, arrivee: {}, debut: this.temps, duree: d, ease: EASE.lineaire, fini: ok });
    });
  }

  /** Termine immédiatement toutes les animations en cours. */
  terminerTout() {
    const actifs = this.tweens;
    this.tweens = [];
    for (const tw of actifs) {
      for (const k in tw.arrivee) tw.cible[k] = tw.arrivee[k];
      tw.maj?.(1);
      tw.fini();
    }
  }
}
