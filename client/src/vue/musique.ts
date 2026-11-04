/**
 * Musique d'ambiance jazz lounge, composée en direct avec la Web Audio API :
 * grille de 16 mesures (ii-V-I), piano électrique, contrebasse qui « marche », ride et balais,
 * quelques phrases de vibraphone, le tout dans une petite réverbération. Aucun fichier audio.
 */
import { contexteAudio } from './son';

const TEMPO = 84;
const TEMPS = 60 / TEMPO;
const SWING = 2 / 3; // la croche du temps faible tombe aux deux tiers du temps

const hz = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** [basse (MIDI), accord sans fondamentale (MIDI), mineur ?] */
const GRILLE: [number, number[], boolean][] = [
  [36, [52, 55, 59, 62], false], // Cmaj9
  [33, [55, 59, 60, 64], true],  // Am9
  [38, [53, 57, 60, 64], true],  // Dm9
  [31, [53, 57, 59, 64], false], // G13
  [40, [55, 59, 62, 66], true],  // Em9
  [33, [55, 58, 61, 64], false], // A7b9
  [38, [53, 57, 60, 64], true],  // Dm9
  [31, [53, 57, 59, 64], false], // G13
  [29, [57, 60, 64, 67], false], // Fmaj9
  [29, [56, 60, 63, 67], true],  // Fm9
  [40, [55, 59, 62, 66], true],  // Em9
  [33, [55, 58, 61, 64], false], // A7b9
  [38, [53, 57, 60, 64], true],  // Dm9
  [31, [53, 57, 59, 64], false], // G13
  [36, [52, 55, 59, 62], false], // Cmaj9
  [31, [53, 57, 59, 64], false], // G13
];

const RYTHMES_PIANO = [[0, 1 + SWING], [SWING, 2], [0, 2 + SWING], [1 + SWING, 3], [0.0], [1, 3 + SWING], [SWING, 2 + SWING]];

let maitre: GainNode | null = null;
let filtre: BiquadFilterNode | null = null;
let reverb: ConvolverNode | null = null;
let envoiReverb: GainNode | null = null;
let minuterie: ReturnType<typeof setInterval> | null = null;
let prochaineMesure = 0;
let mesure = 0;
let volume = 0.35;
let joue = false;

function chaine(c: AudioContext) {
  if (maitre) return;
  maitre = c.createGain();
  maitre.gain.value = 0;
  filtre = c.createBiquadFilter();
  filtre.type = 'lowpass';
  filtre.frequency.value = 5200;
  // Réverbération : réponse impulsionnelle fabriquée (bruit qui s'éteint)
  reverb = c.createConvolver();
  const duree = 2.4, n = Math.floor(c.sampleRate * duree);
  const ir = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3.2;
  }
  reverb.buffer = ir;
  envoiReverb = c.createGain();
  envoiReverb.gain.value = 0.32;
  maitre.connect(filtre).connect(c.destination);
  maitre.connect(envoiReverb).connect(reverb).connect(c.destination);
}

/** Piano électrique (synthèse FM : une « lame » métallique qui s'adoucit). */
function piano(c: AudioContext, note: number, t: number, duree: number, force: number) {
  const f = hz(note);
  const porteuse = c.createOscillator();
  porteuse.frequency.value = f;
  const mod = c.createOscillator();
  mod.frequency.value = f;
  const indice = c.createGain();
  indice.gain.setValueAtTime(f * 1.4, t);
  indice.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.6);
  mod.connect(indice).connect(porteuse.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.055 * force, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.02 * force, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree + 0.6);
  const pan = c.createStereoPanner();
  pan.pan.value = (note - 60) / 30;
  porteuse.connect(g).connect(pan).connect(maitre!);
  mod.start(t); porteuse.start(t);
  mod.stop(t + duree + 0.7); porteuse.stop(t + duree + 0.7);
}

/** Contrebasse : note grave pincée, un peu ronde. */
function basse(c: AudioContext, note: number, t: number) {
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.value = hz(note);
  const o2 = c.createOscillator();
  o2.frequency.value = hz(note);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(260, t + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + TEMPS * 0.98);
  o.connect(lp); o2.connect(lp);
  lp.connect(g).connect(maitre!);
  o.start(t); o2.start(t); o.stop(t + TEMPS); o2.stop(t + TEMPS);
}

let bruitCache: AudioBuffer | null = null;
function bruit(c: AudioContext): AudioBuffer {
  if (bruitCache) return bruitCache;
  const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (bruitCache = b);
}

/** Cymbale ride (bruit aigu filtré) ou balai (souffle doux). */
function percussion(c: AudioContext, t: number, type: 'ride' | 'balai', force: number) {
  const s = c.createBufferSource();
  s.buffer = bruit(c);
  const f = c.createBiquadFilter();
  const g = c.createGain();
  if (type === 'ride') {
    f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045 * force, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  } else {
    f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03 * force, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  }
  const pan = c.createStereoPanner();
  pan.pan.value = type === 'ride' ? 0.35 : -0.2;
  s.connect(f).connect(g).connect(pan).connect(maitre!);
  s.start(t, Math.random() * 0.5, 0.6);
}

/** Vibraphone : sinus avec léger trémolo. */
function vibraphone(c: AudioContext, note: number, t: number) {
  const o = c.createOscillator();
  o.frequency.value = hz(note);
  const trem = c.createOscillator();
  trem.frequency.value = 5.5;
  const tg = c.createGain();
  tg.gain.value = 0.25;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  const ampli = c.createGain();
  ampli.gain.value = 0.75;
  trem.connect(tg).connect(ampli.gain);
  o.connect(g).connect(ampli).connect(maitre!);
  o.start(t); trem.start(t); o.stop(t + 1.7); trem.stop(t + 1.7);
}

function jouerMesure(c: AudioContext, i: number, t: number) {
  const [racine, accord, mineur] = GRILLE[i % GRILLE.length];
  const [suivante] = GRILLE[(i + 1) % GRILLE.length];
  const tempsA = (b: number) => t + b * TEMPS + (Math.random() - 0.5) * 0.012;

  // Contrebasse qui marche : fondamentale, tierce, quinte, note d'approche
  const tierce = racine + (mineur ? 3 : 4);
  const quinte = racine + 7;
  const approche = suivante + (Math.random() < 0.5 ? -1 : 1);
  const ligne = Math.random() < 0.5 ? [racine, tierce, quinte, approche] : [racine, quinte, racine + 12 > 50 ? tierce : racine + 12, approche];
  ligne.forEach((n, b) => basse(c, n, tempsA(b)));

  // Piano : rythme pris au hasard, voicing parfois renversé
  const rythme = RYTHMES_PIANO[Math.floor(Math.random() * RYTHMES_PIANO.length)];
  const voicing = Math.random() < 0.3 ? accord.map((n, k) => (k === 0 ? n + 12 : n)) : accord;
  rythme.forEach((b, k) => {
    const duree = k === rythme.length - 1 ? (4 - b) * TEMPS * 0.9 : TEMPS * 0.7;
    voicing.forEach((n, j) => piano(c, n, tempsA(b) + j * 0.006, duree, 0.75 + Math.random() * 0.25));
  });

  // Ride « ding ding-a ding » et balais sur 2 et 4
  for (let b = 0; b < 4; b++) {
    percussion(c, tempsA(b), 'ride', b % 2 ? 0.8 : 1);
    if (b === 1 || b === 3) { percussion(c, tempsA(b + SWING), 'ride', 0.55); percussion(c, tempsA(b), 'balai', 1); }
  }

  // Une petite phrase de vibraphone de temps en temps
  if (Math.random() < 0.32 && i % 16 !== 15) {
    const notes = accord.map((n) => n + 12).concat(accord[1] + 24);
    const n = 2 + Math.floor(Math.random() * 3);
    let b = Math.random() < 0.5 ? SWING : 1;
    for (let k = 0; k < n && b < 4; k++) {
      vibraphone(c, notes[Math.floor(Math.random() * notes.length)], tempsA(b));
      b += Math.random() < 0.5 ? 1 : SWING + (Math.random() < 0.5 ? 0 : 1 - SWING);
    }
  }
}

function boucle() {
  const c = contexteAudio();
  if (!c || !joue) return;
  while (prochaineMesure < c.currentTime + 0.35) {
    jouerMesure(c, mesure++, prochaineMesure);
    prochaineMesure += 4 * TEMPS;
  }
}

/** Démarre la musique (à appeler après un geste de l'utilisateur). */
export function demarrerMusique() {
  const c = contexteAudio();
  if (!c || c.state !== 'running' || volume <= 0 || document.visibilityState !== 'visible') return;
  chaine(c);
  if (joue) return;
  joue = true;
  prochaineMesure = c.currentTime + 0.15;
  maitre!.gain.cancelScheduledValues(c.currentTime);
  maitre!.gain.setValueAtTime(maitre!.gain.value, c.currentTime);
  maitre!.gain.linearRampToValueAtTime(volume, c.currentTime + 2.5);
  minuterie = setInterval(boucle, 60);
  boucle();
}

export function arreterMusique() {
  const c = contexteAudio();
  joue = false;
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
  if (c && maitre) {
    maitre.gain.cancelScheduledValues(c.currentTime);
    maitre.gain.setValueAtTime(maitre.gain.value, c.currentTime);
    maitre.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
  }
}

export function volumeMusique(v: number) {
  volume = Math.max(0, Math.min(1, v));
  const c = contexteAudio();
  if (volume <= 0) { arreterMusique(); return; }
  if (c && maitre && joue) {
    maitre.gain.cancelScheduledValues(c.currentTime);
    maitre.gain.setValueAtTime(maitre.gain.value, c.currentTime);
    maitre.gain.linearRampToValueAtTime(volume, c.currentTime + 0.3);
  } else demarrerMusique();
}

// En arrière-plan, les minuteries ralentissent : on coupe proprement et on reprend au retour.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') demarrerMusique(); else arreterMusique();
  });
}
