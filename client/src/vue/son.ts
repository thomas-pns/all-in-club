/**
 * Effets sonores synthétisés avec la Web Audio API (aucun fichier à télécharger).
 */
let ctx: AudioContext | null = null;
let volume = 0.7;
let actif = true;

export function reglerSon(on: boolean, vol = volume) { actif = on; volume = vol; }

/** Le contexte audio partagé (effets et musique), créé au premier geste de l'utilisateur. */
export function contexteAudio(): AudioContext | null { return ctx; }

/** À appeler sur un geste de l'utilisateur (exigé par les navigateurs, surtout iOS). */
export function debloquerSon() {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
}

function bruit(c: AudioContext, duree: number): AudioBuffer {
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * duree)), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(c: AudioContext, g: GainNode, t: number, pic: number, attaque: number, chute: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pic * volume), t + attaque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + chute);
}

function souffle(c: AudioContext, t: number, duree: number, freq: number, q: number, pic: number, type: BiquadFilterType = 'bandpass') {
  const s = c.createBufferSource(); s.buffer = bruit(c, duree);
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); env(c, g, t, pic, 0.004, duree);
  s.connect(f).connect(g).connect(c.destination);
  s.start(t); s.stop(t + duree + 0.05);
  return f;
}

function ton(c: AudioContext, t: number, freq: number, duree: number, pic: number, type: OscillatorType = 'sine', glisse?: number) {
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glisse) o.frequency.exponentialRampToValueAtTime(glisse, t + duree);
  const g = c.createGain(); env(c, g, t, pic, 0.005, duree);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + duree + 0.05);
}

export type NomSon = 'carte' | 'retourne' | 'jeton' | 'jetons' | 'parole' | 'coucher' | 'tapis' | 'gagne' | 'grosGain' | 'tic' | 'tour' | 'clic' | 'bille';

export function jouerSon(nom: NomSon) {
  if (!actif || !ctx || ctx.state !== 'running') return;
  const c = ctx, t = c.currentTime + 0.005;
  switch (nom) {
    case 'carte': souffle(c, t, 0.07, 3200, 0.8, 0.5, 'highpass'); break;
    case 'retourne': souffle(c, t, 0.05, 2400, 1.2, 0.35); souffle(c, t + 0.04, 0.04, 4200, 1, 0.25, 'highpass'); break;
    case 'jeton':
      ton(c, t, 2900, 0.08, 0.18, 'triangle'); ton(c, t + 0.012, 4100, 0.06, 0.1); souffle(c, t, 0.03, 5000, 2, 0.15); break;
    case 'jetons':
      for (let i = 0; i < 5; i++) { const d = t + i * 0.035 + Math.random() * 0.015; ton(c, d, 2600 + Math.random() * 1200, 0.07, 0.13, 'triangle'); souffle(c, d, 0.025, 5200, 2, 0.1); }
      break;
    case 'parole':
      for (const d of [0, 0.13]) { ton(c, t + d, 140, 0.09, 0.6, 'sine', 70); souffle(c, t + d, 0.05, 700, 1, 0.35, 'lowpass'); }
      break;
    case 'coucher': souffle(c, t, 0.22, 1400, 0.6, 0.3).frequency.exponentialRampToValueAtTime(500, t + 0.2); break;
    case 'tapis':
      souffle(c, t, 0.5, 600, 0.7, 0.5).frequency.exponentialRampToValueAtTime(3200, t + 0.45);
      ton(c, t + 0.35, 90, 0.5, 0.7, 'sine', 45);
      for (let i = 0; i < 8; i++) ton(c, t + 0.3 + i * 0.03, 2500 + Math.random() * 1500, 0.07, 0.1, 'triangle');
      break;
    case 'gagne': [523, 659, 784, 1047].forEach((f, i) => ton(c, t + i * 0.08, f, 0.28, 0.22, 'triangle')); break;
    case 'grosGain':
      [523, 659, 784, 1047, 1319].forEach((f, i) => ton(c, t + i * 0.07, f, 0.4, 0.22, 'triangle'));
      for (let i = 0; i < 14; i++) ton(c, t + 0.3 + i * 0.045, 2400 + Math.random() * 2000, 0.08, 0.09, 'triangle');
      break;
    case 'tic': ton(c, t, 1800, 0.03, 0.2, 'square'); break;
    case 'tour': ton(c, t, 880, 0.12, 0.2, 'sine'); ton(c, t + 0.1, 1320, 0.16, 0.18, 'sine'); break;
    case 'clic': ton(c, t, 1200, 0.03, 0.12, 'triangle'); break;
    case 'bille': {
      // La bille roule dans le cylindre puis rebondit dans les cases
      const f = souffle(c, t, 5.2, 900, 3, 0.14, 'bandpass');
      f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(380, t + 5.1);
      let d = 4.6;
      for (let i = 0; i < 9; i++) { ton(c, t + d, 2200 + Math.random() * 900, 0.04, 0.16 - i * 0.012, 'triangle'); d += 0.09 + i * 0.045; }
      break;
    }
  }
}
