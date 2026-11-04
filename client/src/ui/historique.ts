/**
 * Historique des mains et lecteur pas à pas.
 */
import type { EnregistrementMain } from '../../../moteur/analyse';
import { Scene } from '../vue/scene';
import { preparerRelecture } from '../vue/relecture';
import { fmt } from '../art/rendu';
import { $, esc, html, panneau, lirePrefs } from './commun';

const RANGS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SYMB = ['♠', '♥', '♦', '♣'];
export function miniCartes(cartes: number[] | null, n = 2): string {
  if (!cartes) return Array.from({ length: n }, () => '<span class="mini-carte dos"></span>').join('');
  const quatre = lirePrefs().quatreCouleurs;
  return cartes.map((c) => {
    const s = c & 3;
    const cl = quatre ? ['noir', 'rouge', 'bleu', 'vert'][s] : s === 1 || s === 2 ? 'rouge' : 'noir';
    return `<span class="mini-carte ${cl}">${RANGS[c >> 2]}${SYMB[s]}</span>`;
  }).join('');
}

export interface SourcesHistorique {
  partie: () => Promise<EnregistrementMain[]>;
  perso?: () => Promise<EnregistrementMain[]>;
  moi: string;
}

export function ouvrirHistorique(src: SourcesHistorique) {
  let onglet: 'partie' | 'perso' = 'partie';
  const p = panneau(`<h2>Historique des mains</h2>
    ${src.perso ? '<div class="choix" style="margin-bottom:12px"><button data-o="partie" class="on">Cette partie</button><button data-o="perso">Mes 50 dernières mains</button></div>' : ''}
    <div class="liste-mains" data-liste><div class="doux">Chargement…</div></div>`);
  p.el.classList.add('panneau-large');
  const charger = async () => {
    const zone = $('[data-liste]', p.el);
    zone.innerHTML = '<div class="doux">Chargement…</div>';
    try {
      const mains = (onglet === 'partie' ? await src.partie() : await src.perso!()).slice().reverse();
      if (!mains.length) { zone.innerHTML = '<div class="vide-liste">Aucune main pour l\'instant.</div>'; return; }
      zone.innerHTML = mains.map((m, i) => {
        const moi = m.joueurs.find((j) => j.id === src.moi);
        const g = m.gagnants[0];
        const nomG = g ? m.joueurs.find((j) => j.siege === g.siege)?.nom ?? '?' : '';
        const net = moi?.net ?? 0;
        return `<button class="ligne-main" data-i="${i}">
          <span class="num">#${m.numero}<small>${new Date(m.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small></span>
          <span class="cartes">${moi ? miniCartes(moi.cartes) : '<span class="doux petit">spectateur</span>'}</span>
          <span class="tableau">${m.tableau.length ? miniCartes(m.tableau) : '<span class="doux petit">pas de flop</span>'}</span>
          <span class="resume">${esc(nomG)} <span class="doux">${g?.main ? `· ${esc(g.main)}` : '· sans abattage'}</span><br><span class="doux petit">Pot ${fmt(m.pot)}${onglet === 'perso' ? ` · ${esc(m.table)}` : ''}</span></span>
          <span class="bilan ${net > 0 ? 'plus' : net < 0 ? 'moins' : ''}">${moi ? (net > 0 ? '+' : '') + fmt(net) : ''}</span>
        </button>`;
      }).join('');
      zone.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.onclick = () => ouvrirRelecture(mains[Number(b.dataset.i)], src.moi));
    } catch (e) {
      zone.innerHTML = `<div class="vide-liste">${esc(e instanceof Error ? e.message : 'Erreur')}</div>`;
    }
  };
  p.el.querySelectorAll<HTMLElement>('[data-o]').forEach((b) => b.onclick = () => {
    onglet = b.dataset.o as typeof onglet;
    p.el.querySelectorAll('[data-o]').forEach((x) => x.classList.toggle('on', x === b));
    void charger();
  });
  void charger();
}

/** Rejoue une main sur une petite table. */
export async function ouvrirRelecture(rec: EnregistrementMain, moi: string) {
  const { initial, etapes } = preparerRelecture(rec, moi);
  let k = -1;
  let occupe = false, lecture = false;
  let scene: Scene | null = null;
  const p = panneau(`<h2>Main n°${rec.numero} <span class="doux petit">${esc(rec.table)} · blindes ${fmt(rec.pb)}/${fmt(rec.gb)}</span></h2>
    <div class="relecture-scene" data-scene></div>
    <div class="relecture-texte" data-texte>Début de la main</div>
    <div class="relecture-commandes">
      <button class="btn btn-rond" data-c="debut" title="Début">⏮</button>
      <button class="btn btn-rond" data-c="prec" title="Étape précédente">◀</button>
      <button class="btn btn-or" data-c="lecture" style="min-width:120px">▶ Lecture</button>
      <button class="btn btn-rond" data-c="suiv" title="Étape suivante">▶</button>
      <button class="btn btn-rond" data-c="fin" title="Fin">⏭</button>
      <span class="doux petit" data-etape></span>
    </div>`, { onFerme: () => { lecture = false; scene?.detruire(); } });
  p.el.classList.add('panneau-large');
  const prefs = lirePrefs();
  scene = await Scene.creer($('[data-scene]', p.el), { quatreCouleurs: prefs.quatreCouleurs, vitesse: 1, cartesCachees: false });
  scene.appliquerEtat(initial);
  const maj = () => {
    $('[data-texte]', p.el).textContent = k < 0 ? 'Début de la main' : etapes[k].texte || 'Fin de la main';
    $('[data-etape]', p.el).textContent = `${k + 1} / ${etapes.length}`;
    $('[data-c="lecture"]', p.el).textContent = lecture ? '⏸ Pause' : '▶ Lecture';
  };
  const aller = (n: number) => {
    if (!scene) return;
    scene.accelerer();
    k = Math.max(-1, Math.min(etapes.length - 1, n));
    scene.appliquerEtat(k < 0 ? initial : etapes[k].etat);
    maj();
  };
  const suivant = async () => {
    if (!scene || occupe || k >= etapes.length - 1) return false;
    occupe = true;
    k++;
    maj();
    await scene.jouer(etapes[k].evenements, etapes[k].etat);
    occupe = false;
    return true;
  };
  p.el.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => b.onclick = async () => {
    switch (b.dataset.c) {
      case 'debut': lecture = false; aller(-1); break;
      case 'prec': lecture = false; aller(k - 1); break;
      case 'fin': lecture = false; aller(etapes.length - 1); break;
      case 'suiv': lecture = false; await suivant(); break;
      case 'lecture':
        lecture = !lecture;
        maj();
        if (lecture && k >= etapes.length - 1) aller(-1);
        while (lecture && p.el.isConnected) {
          if (!(await suivant())) { lecture = false; break; }
          await new Promise((r) => setTimeout(r, 600));
        }
        maj();
        break;
    }
  });
  maj();
}

void html;
