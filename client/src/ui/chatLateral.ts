/**
 * Le chat sur le côté des tables :
 * - sur grand écran, il reste ouvert à droite (on peut le replier) ;
 * - sinon, une languette sur le bord ouvre le chat, et les derniers messages défilent en transparence sur la table.
 */
import { $, html } from './commun';

const CLE = 'aic-chat-ancre';
const lireAncre = () => { try { return localStorage.getItem(CLE) !== '0'; } catch { return true; } };
const ecrireAncre = (v: boolean) => { try { localStorage.setItem(CLE, v ? '1' : '0'); } catch { /* rien */ } };

export class ChatLateral {
  private panneau: HTMLElement;
  private languette: HTMLElement;
  private mq = window.matchMedia('(min-width: 1200px)');

  constructor(private ecran: HTMLElement, private surOuverture: () => void) {
    this.panneau = $('[data-panneau-chat]', ecran);
    ecran.appendChild(this.panneau);
    this.languette = html('<button class="languette-chat" aria-label="Ouvrir le chat"><span>‹ Chat</span><b class="cache"></b></button>');
    $('[data-scene]', ecran).appendChild(this.languette);
    this.languette.onclick = () => this.basculer(true);
    this.mq.addEventListener('change', this.surEcran);
    this.surEcran();
  }

  private surEcran = () => {
    if (this.mq.matches) this.appliquer(lireAncre(), false);
    else this.appliquer(false, false);
  };

  get ouvert() { return !this.panneau.classList.contains('cache'); }

  basculer(ouvrir?: boolean) {
    const v = ouvrir ?? !this.ouvert;
    if (this.mq.matches) ecrireAncre(v);
    this.appliquer(v, true);
  }

  private appliquer(v: boolean, focus: boolean) {
    this.panneau.classList.toggle('cache', !v);
    this.ecran.classList.toggle('chat-ancre', v && this.mq.matches);
    this.languette.classList.toggle('cache', v);
    if (!v) return;
    this.surOuverture();
    const m = $('[data-messages]', this.panneau); m.scrollTop = m.scrollHeight;
    if (focus && window.matchMedia('(pointer: fine)').matches) ($('input', this.panneau) as HTMLInputElement).focus();
  }

  nonLus(n: number) {
    const b = $('b', this.languette);
    b.textContent = n > 9 ? '9+' : String(n);
    b.classList.toggle('cache', n === 0);
  }

  detruire() { this.mq.removeEventListener('change', this.surEcran); }
}
