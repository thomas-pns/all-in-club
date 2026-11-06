import { illustrationVille } from '../art/villes';
import { ouvrirApprendre } from './apprendre';
/**
 * Le Club : l'accueil une fois connecté.
 * La rue du Club (Casino, Kiosque, Grande Roue, salon Entre potes) qui suit l'heure de la journée,
 * les annonces des gros gains, les missions du jour, le portefeuille en Clubs ♣
 * et une barre d'onglets : Le Club, Kiosque, Classement, Profil.
 */
import type { Utilisateur } from '../../../serveur/comptes';
import type { ResumeTable } from '../../../serveur/hall';
import type { JourSerie, EtatBonus } from '../../../moteur/bonus';
import { ROUE } from '../../../moteur/bonus';
import { sceneRue, momentParis, LARGEUR_RUE } from '../art/rue';
import type { Annonce, EtatMission } from '../../../serveur/activites';
import type { JeuCasino } from './ecrans';
import { api, ErreurApi } from '../reseau';
import { fmt } from '../art/rendu';
import { avatarSVG } from '../art/avatars';
import { jouerSon } from '../vue/son';
import { $, $$, esc, html, toast, panneau, avatar, avecPieces, logoHTML } from './commun';
import { vueVitrine, vueTicket, vueKeno, vueLoto, ContexteKiosque } from './kiosque';
import { vueAmis, choisirAmis } from './amis';
import { ouvrirCloche, type Notif } from './cloche';
import { ouvrirAdmin } from './admin';
import type { TypeTicket } from '../../../moteur/kiosque';
import { VILLES, Ville } from '../../../moteur/casino';

export interface ActionsHall {
  creer: (jeu?: JeuCasino) => void;
  rejoindreCode: (code: string) => void;
  rejoindre: (id: string) => void;
  regarder: (id: string) => void;
  solo: (jeu?: JeuCasino) => void;
  profil: () => void;
  joueurs: () => void;
  casino: (jeu: JeuCasino, ville: string, inviter?: string[]) => void;
  creerPrivee: (jeu: JeuCasino, ville: string, inviter: string[]) => void;
}

interface EtatPortefeuille { solde: number; tickets: number; bonus: EtatBonus & { calendrier: JourSerie[] }; toursBonus: number; coupDePouce: boolean }
interface TourDeRoue { segment: number; clubs: number; tickets: number; jour: number; multiplicateur: number; quotidien: boolean; etat: EtatPortefeuille }

type Onglet = 'club' | 'kiosque' | 'classement' | 'amis';
/** On revient là où on était en quittant une table. */
let memoire: { onglet: Onglet; jeu: JeuCasino | null; vueK?: string | null; salon?: JeuCasino | null } = { onglet: 'club', jeu: null };

const NOMS: Record<JeuCasino, string> = { poker: 'Poker', blackjack: 'Black Jack', roulette: 'Roulette' };
const ICONE_ROULETTE = '<svg width="28" height="28" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="15" fill="none" stroke="#FF6B5B" stroke-width="7" stroke-dasharray="5 4"/><circle cx="23" cy="23" r="7" fill="#FFC23D"/></svg>';
const icone = (j: JeuCasino) => (j === 'poker' ? '<span class="sym">♠</span>' : j === 'blackjack' ? '<span class="sym or">21</span>' : ICONE_ROULETTE);
const SVG_ONGLETS: Record<string, string> = {
  club: '<path d="M3 11l9-7 9 7v9H3z"/>',
  kiosque: '<path d="M4 8h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4z"/>',
  amis: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-4.5 12.2-4.5 13 0"/><circle cx="17" cy="7" r="2.8"/><path d="M16.5 13.2c2.8-.2 5 1.2 5.5 4.3"/>',
  classement: '<path d="M6 20V10M12 20V4M18 20v-7"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/>',
};
const clubs = (n: number) => `${fmt(n)}&nbsp;<i class="pc"></i>`;
const mult = (m: number) => `×${String(m).replace('.', ',')}`;

export class EcranHall {
  el: HTMLElement;
  private tables: ResumeTable[] = [];
  private enLigne = 0;
  private villes: Record<string, number> = {};
  private porte: EtatPortefeuille | null = null;
  private arrets: (() => void)[] = [];
  private annonces: Annonce[] = [];
  private vueAmisOuverte: { recharger: () => void } | null = null;
  /** Bâtiment d'où l'on revient (pour l'animation de retour). */
  private retourDe: string | null = null;

  /** Revenir à la rue depuis la page d'un bâtiment, avec le dézoom. */
  private retourRue(lieu: string) { this.retourDe = lieu; memoire = { onglet: 'club', jeu: null }; jouerSon('carte'); this.afficher(); }
  private missions: { missions: EtatMission[]; nouvellesDans: number; recu: number } | null = null;

  constructor(racine: HTMLElement, private u: Utilisateur, private a: ActionsHall) {
    this.el = html(`<div class="club">
      <header class="club-entete">
        <button class="logo-club" data-accueil aria-label="All-In Club : retour à la rue">${logoHTML()}</button>
        <button class="porte-monnaie" data-porte aria-label="Mon portefeuille"><span class="piece">♣</span><b data-solde>…</b></button>
        <button class="cloche" data-cloche aria-label="Notifications"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/></svg><i class="badge" data-badge-cloche hidden></i></button>
        <button class="club-moi" data-profil aria-label="Mon profil (${esc(u.pseudo)})">${avatarSVG(u.avatar, 'content', 42, { cadre: u.cadre })}</button>
      </header>
      <main class="club-contenu" data-contenu></main>
      <nav class="club-onglets">${(['club', 'amis', 'classement', 'profil'] as const).map((o) => `
        <button data-onglet="${o}"><span class="ico-onglet"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${SVG_ONGLETS[o]}</svg>${o === 'amis' ? '<i class="badge" data-badge-amis hidden></i>' : ''}</span>
          ${{ club: 'Le Club', amis: 'Amis', classement: 'Classement', profil: 'Profil' }[o]}</button>`).join('')}</nav>
    </div>`);
    racine.replaceChildren(this.el);
    $('[data-profil]', this.el).onclick = () => a.profil();
    $('[data-accueil]', this.el).onclick = () => { if (memoire.onglet === 'club' && !memoire.jeu && !memoire.salon) return; memoire = { onglet: 'club', jeu: null }; this.afficher(); };
    $('[data-porte]', this.el).onclick = () => this.ouvrirPortefeuille();
    $('[data-cloche]', this.el).onclick = () => { jouerSon('clic'); ouvrirCloche(this.annonces, (code) => this.a.rejoindreCode(code), () => this.badgeCloche(0)); };
    $$('[data-onglet]', this.el).forEach((b) => b.onclick = () => {
      const o = b.dataset.onglet!;
      if (o === 'profil') return a.profil();
      jouerSon('clic');
      memoire = { onglet: o as Onglet, jeu: null };
      this.afficher();
    });
    this.afficher();
    void this.chargerPortefeuille();
    void this.majBadgeAmis();
    void this.majCloche();
    void api<{ admin: boolean }>('/api/admin/moi').then((r) => { this.admin = r.admin; if (memoire.onglet === 'club' && !memoire.jeu && !memoire.salon) this.majPiedPlan(); }).catch(() => {});
    // La roue telle que réglée par l'admin
    void api<{ roue: typeof ROUE }>('/api/roue').then((r) => { if (r.roue?.length === ROUE.length) ROUE.splice(0, ROUE.length, ...r.roue); }).catch(() => {});
  }

  private admin = false;
  /** Les potes qu'on emmène au Casino (invités dès qu'on s'assoit). */
  private potes: string[] = [];

  /* ------------------------------ La cloche ------------------------------ */

  private badgeCloche(n: number) {
    const b = this.el.querySelector('[data-badge-cloche]') as HTMLElement | null;
    if (!b) return;
    b.hidden = !n;
    b.textContent = n > 9 ? '9+' : String(n);
  }

  private async majCloche() {
    try { const d = await api<{ nonLues: number }>('/api/boite'); this.badgeCloche(d.nonLues); } catch { /* rien */ }
  }

  /** Une notification arrive en direct (le contenu est dans la cloche). */
  nouvelleNotif(_n: Notif, nonLues: number) {
    this.badgeCloche(nonLues);
    const c = this.el.querySelector('[data-cloche]');
    c?.classList.remove('sonne'); void (c as HTMLElement | null)?.offsetWidth; c?.classList.add('sonne');
  }

  private majPiedPlan() {
    const z = this.el.querySelector('[data-pied-plan]') as HTMLElement | null;
    if (!z) return;
    z.innerHTML = this.admin ? '<button class="btn btn-petit btn-fantome" data-admin>🛠️ Mode admin</button>' : '';
    const b = z.querySelector('[data-admin]') as HTMLElement | null;
    if (b) b.onclick = () => ouvrirAdmin(() => this.rafraichirPortefeuille());
  }

  /* ------------------------------ Données ------------------------------ */

  private async chargerPortefeuille() {
    try {
      this.porte = await api<EtatPortefeuille>('/api/portefeuille');
      $('[data-solde]', this.el).textContent = fmt(this.porte.solde);
      this.majVilles();
      if (memoire.onglet === 'club' && !memoire.jeu && !memoire.salon) { this.majAnnonces(); this.majRoue(); }
      if (memoire.onglet === 'kiosque' && !memoire.vueK) this.afficher();
    } catch { $('[data-solde]', this.el).textContent = '—'; }
  }

  /* ------------------------------ Onglets ------------------------------ */

  private afficher() {
    this.arrets.splice(0).forEach((f) => f());
    $$('[data-onglet]', this.el).forEach((b) => b.classList.toggle('on', b.dataset.onglet === (memoire.onglet === 'kiosque' ? 'club' : memoire.onglet)));
    const c = $('[data-contenu]', this.el);
    c.scrollTop = 0;
    if (memoire.onglet === 'kiosque') {
      const v = memoire.vueK ?? 'kiosque';
      const ctx = this.contexteKiosque();
      if (v.startsWith('ticket:')) { const [, t, o] = v.split(':'); return vueTicket(c, ctx, t as TypeTicket, o === 'offert'); }
      if (v === 'keno') return vueKeno(c, ctx);
      if (v === 'loto') return vueLoto(c, ctx);
      return vueVitrine(c, ctx);
    }
    if (memoire.onglet === 'classement') return void this.vueClassement(c);
    if (memoire.onglet === 'amis') {
      this.vueAmisOuverte = vueAmis(c, {
        rejoindreCode: (code) => this.a.rejoindreCode(code),
        majSolde: (solde) => { if (this.porte) this.porte.solde = solde; $('[data-solde]', this.el).textContent = fmt(solde); },
        badge: (n) => this.badgeAmis(n),
        nettoyer: (f) => this.arrets.push(f),
      });
      this.arrets.push(() => { this.vueAmisOuverte = null; });
      return;
    }
    if (memoire.salon) return this.vueSalon(c, memoire.salon);
    if (memoire.jeu) return this.vueSalle(c, memoire.jeu);
    this.vuePlan(c);
  }

  /** La rue du Club : on touche un bâtiment pour y entrer. */
  private vuePlan(c: HTMLElement) {
    c.innerHTML = `<div class="club-plan-zone">
      <div data-annonces class="annonces"></div>
      <div class="bandeau-annonces" data-bandeau hidden><span class="defile" data-defile></span></div>
      <div class="rue-cadre"><div class="rue-defile" data-rue>${sceneRue(momentParis())}</div></div>
      <div class="missions-carte" data-missions><span class="doux petit">Missions du jour…</span></div>
      <p class="doux petit plan-legende" data-enligne></p>
      <div class="pied-plan" data-pied-plan></div>
    </div>`;
    this.majPiedPlan();
    const rue = $('[data-rue]', c);
    rue.addEventListener('click', (e) => {
      const cible = e.target as Element;
      const porte = cible.closest('[data-jeu]') as HTMLElement | null;
      const batiment = cible.closest('[data-lieu]') as HTMLElement | null;
      const lieu = batiment?.dataset.lieu;
      if (!lieu) return;
      jouerSon('clic');
      if (lieu === 'roue') return this.ouvrirRoue();
      // On « entre » dans le bâtiment : la rue zoome dessus, puis sa page arrive
      this.entrer(batiment!, () => {
        if (lieu === 'casino') memoire = { onglet: 'club', jeu: (porte?.dataset.jeu as JeuCasino) ?? 'poker' };
        else if (lieu === 'kiosque') memoire = { onglet: 'kiosque', jeu: null };
        else if (lieu === 'salon') memoire = { onglet: 'club', jeu: null, salon: 'poker' };
      });
    });
    rue.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest('[data-lieu],[data-jeu]')) { e.preventDefault(); (e.target as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    // Faire glisser la rue à la souris (au doigt, c'est natif), et la molette la fait défiler aussi
    let glisse: { x: number; depart: number; bouge: boolean } | null = null;
    rue.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button === 0) glisse = { x: e.clientX, depart: rue.scrollLeft, bouge: false }; });
    addEventListener('pointermove', (e) => {
      if (!glisse) return;
      const dx = e.clientX - glisse.x;
      if (Math.abs(dx) > 6) { glisse.bouge = true; rue.classList.add('glisse'); }
      if (glisse.bouge) rue.scrollLeft = glisse.depart - dx;
    });
    const lacher = () => { setTimeout(() => { glisse = null; rue.classList.remove('glisse'); }, 0); };
    addEventListener('pointerup', lacher);
    this.arrets.push(() => removeEventListener('pointerup', lacher));
    // Un glissé ne doit pas ouvrir un bâtiment
    rue.addEventListener('click', (e) => { if (glisse?.bouge) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    rue.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && rue.scrollWidth > rue.clientWidth) { const avant = rue.scrollLeft; rue.scrollLeft += e.deltaY; if (rue.scrollLeft !== avant) e.preventDefault(); } }, { passive: false });
    // Invitation à explorer : la rue glisse un peu vers la droite puis revient (une fois par session)
    if (!sessionStorage.getItem('aic-rue-vue') && rue.scrollWidth > rue.clientWidth + 40 && !this.retourDe) {
      sessionStorage.setItem('aic-rue-vue', '1');
      setTimeout(() => { rue.scrollTo({ left: 140, behavior: 'smooth' }); setTimeout(() => rue.scrollTo({ left: 0, behavior: 'smooth' }), 900); }, 1300);
    }
    // Retour d'un bâtiment : la rue « dézoome » depuis lui
    if (this.retourDe) {
      const b = rue.querySelector(`[data-lieu="${this.retourDe}"]`);
      this.retourDe = null;
      const cadre = c.querySelector('.rue-cadre') as HTMLElement;
      if (b && cadre && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (b.getBoundingClientRect().right > rue.getBoundingClientRect().right) rue.scrollLeft = 9999;
        const r = cadre.getBoundingClientRect(), bb = b.getBoundingClientRect();
        cadre.style.transformOrigin = `${bb.left + bb.width / 2 - r.left}px ${bb.top + bb.height * 0.7 - r.top}px`;
        cadre.classList.add('zoom-sortie');
        setTimeout(() => cadre.classList.remove('zoom-sortie'), 520);
      }
    }
    // Le ciel change avec l'heure
    const moment = momentParis();
    const minuterie = setInterval(() => { if (momentParis() !== moment && memoire.onglet === 'club' && !memoire.jeu && !memoire.salon) this.afficher(); }, 60_000);
    this.arrets.push(() => clearInterval(minuterie));
    this.majAnnonces();
    this.majRoue();
    this.majComptes();
    this.majBandeau();
    void this.chargerAnnonces();
    void this.chargerMissions();
  }

  /** L'animation d'entrée : la rue zoome sur le bâtiment touché, puis la page du bâtiment s'ouvre. */
  private entrer(batiment: Element, apres: () => void) {
    const cadre = this.el.querySelector('.rue-cadre') as HTMLElement | null;
    const fin = () => { apres(); this.afficher(); this.el.querySelector('[data-contenu] > *')?.classList.add('arrivee'); };
    if (!cadre || matchMedia('(prefers-reduced-motion: reduce)').matches) return fin();
    const r = cadre.getBoundingClientRect(), b = batiment.getBoundingClientRect();
    cadre.style.transformOrigin = `${b.left + b.width / 2 - r.left}px ${b.top + b.height * 0.7 - r.top}px`;
    cadre.classList.add('zoom-entree');
    cadre.parentElement?.classList.add('on-entre');
    jouerSon('carte');
    setTimeout(fin, 420);
  }

  /* ------------------------------ Amis ------------------------------ */

  private badgeAmis(n: number) {
    const b = this.el.querySelector('[data-badge-amis]') as HTMLElement | null;
    if (!b) return;
    b.hidden = !n;
    b.textContent = n ? String(n) : '';
  }

  private async majBadgeAmis() {
    try { const d = await api<{ recues: unknown[] }>('/api/amis'); this.badgeAmis(d.recues.length); } catch { /* rien */ }
  }

  /** Un événement d'ami en direct (demande, acceptation, cadeau) : on rafraîchit. */
  evenementAmi() {
    if (this.vueAmisOuverte) this.vueAmisOuverte.recharger();
    else void this.majBadgeAmis();
  }

  /** Le solde a changé ailleurs (cadeau reçu…). */
  rafraichirPortefeuille() { void this.chargerPortefeuille(); }

  /* ------------------------------ Annonces des gros gains ------------------------------ */

  private async chargerAnnonces() {
    try { this.annonces = (await api<{ annonces: Annonce[] }>('/api/annonces')).annonces; this.majBandeau(); } catch { /* rien */ }
  }

  /** Une annonce arrive en direct (message du serveur). */
  nouvelleAnnonce(a: Annonce) {
    this.annonces = [a, ...this.annonces.filter((x) => x.id !== a.id)].slice(0, 8);
    this.majBandeau();
  }

  private majBandeau() {
    const b = $('[data-bandeau]', this.el), d = $('[data-defile]', this.el);
    if (!b || !d) return;
    const recentes = this.annonces.filter((a) => Date.now() - a.date < 24 * 3_600_000).slice(0, 5);
    b.hidden = !recentes.length;
    if (!recentes.length) return;
    const texte = recentes.map((a) => `<span>🎉 <b>${esc(a.pseudo)}</b> ${avecPieces(esc(a.texte))}</span>`).join('<i>·</i>');
    // Le texte est doublé pour défiler en boucle sans à-coup
    d.innerHTML = `${texte}<i>·</i>${texte}<i>·</i>`;
    d.style.animationDuration = `${Math.max(12, recentes.length * 9)}s`;
  }

  /* ------------------------------ Missions du jour ------------------------------ */

  private async chargerMissions() {
    try {
      const r = await api<{ missions: EtatMission[]; nouvellesDans: number }>('/api/missions');
      this.missions = { ...r, recu: Date.now() };
      this.majMissions();
    } catch { const z = $('[data-missions]', this.el); if (z) z.innerHTML = ''; }
  }

  /** Une mission vient d'être réussie (message du serveur). */
  missionFaite(etat: EtatPortefeuille | null) {
    if (etat) { this.porte = etat; $('[data-solde]', this.el).textContent = fmt(etat.solde); this.majRoue(); this.majAnnonces(); }
    void this.chargerMissions();
  }

  private majMissions() {
    const z = $('[data-missions]', this.el);
    if (!z || !this.missions) return;
    const { missions, nouvellesDans, recu } = this.missions;
    const reste = Math.max(0, nouvellesDans - (Date.now() - recu));
    const h = Math.floor(reste / 3_600_000), mn = Math.floor((reste % 3_600_000) / 60_000);
    const faites = missions.filter((m) => m.fait).length;
    z.innerHTML = `<div class="entete-missions"><b>Missions du jour</b><small>${faites}/3 · nouvelles dans ${h ? `${h} h ` : ''}${String(mn).padStart(h ? 2 : 1, '0')} min</small></div>
      ${missions.map((m) => `<div class="mission ${m.fait ? 'faite' : ''}">
        <span class="coche">${m.fait ? '✓' : ''}</span>
        <span class="txt"><b>${esc(m.texte)}</b><span class="barre"><i style="width:${Math.round((m.progres / m.objectif) * 100)}%"></i></span></span>
        <span class="recompense">${m.progres}/${m.objectif}<br><b>+${clubs(m.recompense)}</b></span></div>`).join('')}
      <p class="bonus-missions">${faites === 3 ? 'Bravo ! Ton tour de Grande Roue en plus t\'attend 🎡' : 'Les 3 faites : un tour de Grande Roue en plus 🎡'}</p>`;
  }

  /** Tour de roue disponible et coup de pouce, au-dessus de la rue. */
  private majAnnonces() {
    const z = $('[data-annonces]', this.el);
    const p = this.porte;
    if (!z || !p) return;
    const m = p.bonus.calendrier[p.bonus.jour - 1]?.multiplicateur ?? 1;
    const tour = p.bonus.dispo ? `Tour du jour ${p.bonus.jour} sur 7${m > 1 ? ` · gains ${mult(m)}` : ''}` : p.toursBonus > 0 ? `${p.toursBonus} tour${p.toursBonus > 1 ? 's' : ''} en plus grâce aux missions` : '';
    z.innerHTML = `${tour ? `<button class="annonce bonus" data-tour><span class="mini-roue"><i></i></span><span><b>La Grande Roue t'attend !</b><small>${tour} · touche pour la lancer</small></span></button>` : ''}
      ${p.coupDePouce ? `<button class="annonce pouce" data-pouce><span class="coffre"><i></i></span><span><b>À sec ? Le Club t'aide</b><small>Coup de pouce de 1 000 <i class="pc"></i>, une fois par jour</small></span></button>` : ''}`;
    const t = $('[data-tour]', z); if (t) t.onclick = () => this.ouvrirRoue();
    const cp = $('[data-pouce]', z); if (cp) cp.onclick = () => this.coupDePouce(cp);
  }

  /** La bulle « Tour gratuit ! » au-dessus de la Grande Roue. */
  private majRoue() {
    const svg = this.el.querySelector('.scene-rue');
    const p = this.porte;
    if (!svg || !p) return;
    const dispo = p.bonus.dispo || p.toursBonus > 0;
    svg.classList.toggle('roue-dispo', dispo);
    const t = svg.querySelector('[data-bulle-roue]');
    if (t) t.textContent = p.bonus.dispo ? 'Tour gratuit !' : 'Tour en plus !';
  }

  /* ------------------------------ La Grande Roue ------------------------------ */

  private ouvrirRoue() {
    const p = this.porte;
    if (!p) return;
    const n = ROUE.length, R = 140, C = 160;
    const parts = ROUE.map((sg, i) => {
      const a0 = -Math.PI / 2 + (i - 0.5) * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n, am = (a0 + a1) / 2;
      let deg = (am * 180) / Math.PI; if (((deg % 360) + 360) % 360 > 90 && ((deg % 360) + 360) % 360 < 270) deg += 180;
      const tx = C + R * 0.68 * Math.cos(am), ty = C + R * 0.68 * Math.sin(am);
      return `<path d="M${C} ${C} L${(C + R * Math.cos(a0)).toFixed(1)} ${(C + R * Math.sin(a0)).toFixed(1)} A${R} ${R} 0 0 1 ${(C + R * Math.cos(a1)).toFixed(1)} ${(C + R * Math.sin(a1)).toFixed(1)}z" fill="${sg.couleur}" stroke="#2A1E3F" stroke-width="1.8"/>
        <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${deg.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="middle" dominant-baseline="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="${sg.label === 'JACKPOT' ? 12 : sg.label === '🎟️' ? 22 : 16}" fill="#2A1E3F">${sg.label}</text>`;
    }).join('');
    const ampoules = Array.from({ length: 24 }, (_, k) => `<circle cx="${(C + (R + 9) * Math.cos((k * Math.PI) / 12)).toFixed(1)}" cy="${(C + (R + 9) * Math.sin((k * Math.PI) / 12)).toFixed(1)}" r="4" fill="${k % 2 ? '#FFF4DF' : '#FFC23D'}" stroke="#2A1E3F" stroke-width="1.2" class="ampoule-roue" style="animation-delay:${(k % 2) * 0.4}s"/>`).join('');
    const jourCourant = p.bonus.jour;
    const v = html(`<div class="voile voile-roue"><div class="roue-ecran" role="dialog" aria-label="La Grande Roue">
      <div class="entete-lecon"><b>La Grande Roue</b><button class="btn btn-petit btn-fantome" data-fermer aria-label="Fermer">✕</button></div>
      <p class="doux petit" style="text-align:center;margin:0 0 6px">Un tour gratuit chaque jour : ta série de jours multiplie le gain.</p>
      <svg class="roue-svg" viewBox="0 0 320 340" aria-hidden="true">
        <path d="M160 300 L112 336 h96z" fill="#5A4A8C" stroke="#2A1E3F" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="${C}" cy="${C}" r="${R + 16}" fill="#3A2D5E" stroke="#2A1E3F" stroke-width="3"/>${ampoules}
        <g class="disque" data-disque style="transform-origin:${C}px ${C}px">${parts}</g>
        <circle cx="${C}" cy="${C}" r="28" fill="#FFF4DF" stroke="#2A1E3F" stroke-width="3"/><text x="${C}" y="${C + 9}" text-anchor="middle" font-size="26" fill="#25A05C">♣</text>
        <path class="aiguille" d="M160 34 l-14 -26 h28z" fill="#E5484D" stroke="#2A1E3F" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>
      <div class="serie-roue">${p.bonus.calendrier.map((j, i) => `<span class="${i < jourCourant - (p.bonus.dispo ? 1 : 0) ? 'fait' : ''} ${i === jourCourant - 1 ? 'auj' : ''}">J${i + 1}<small>${mult(j.multiplicateur)}</small></span>`).join('')}</div>
      <p class="info-roue" data-info>${p.bonus.dispo ? `Aujourd'hui : jour ${jourCourant}, gains ${mult(p.bonus.calendrier[jourCourant - 1].multiplicateur)}${p.bonus.reprise ? ' (série repartie à zéro)' : ''}` : p.toursBonus > 0 ? `Tour en plus des missions · gains ${mult(p.bonus.calendrier[jourCourant - 1].multiplicateur)}` : 'Tu as déjà tourné la roue aujourd\'hui. Reviens demain, ou finis tes 3 missions pour un tour en plus !'}<br><small>JACKPOT = ${clubs(25_000)} · 🎟️ = ticket Banco offert</small></p>
      <button class="btn btn-or btn-plein btn-lancer" data-lancer ${p.bonus.dispo || p.toursBonus > 0 ? '' : 'disabled'}>Lancer la roue !</button>
    </div></div>`);
    document.body.appendChild(v);
    const fermer = () => { if (!v.classList.contains('tourne')) v.remove(); };
    $('[data-fermer]', v).onclick = fermer;
    v.addEventListener('click', (e) => { if (e.target === v) fermer(); });
    $('[data-lancer]', v).onclick = async () => {
      const bouton = $('[data-lancer]', v) as HTMLButtonElement;
      bouton.disabled = true;
      let r: TourDeRoue;
      try { r = await api<TourDeRoue>('/api/portefeuille/roue', {}); }
      catch (e) { bouton.disabled = false; toast(e instanceof ErreurApi ? e.message : 'La roue est coincée, réessaie', true); return; }
      const avant = this.porte?.solde ?? 0;
      v.classList.add('tourne');
      // La case tirée s'arrête sous l'aiguille, après plusieurs tours
      const decalage = (Math.random() - 0.5) * (360 / n) * 0.7;
      const angle = 360 * 7 - r.segment * (360 / n) + decalage;
      const disque = $('[data-disque]', v) as unknown as SVGGElement;
      const duree = 5200;
      disque.style.transition = `transform ${duree}ms cubic-bezier(.12,.62,.08,1)`;
      requestAnimationFrame(() => { disque.style.transform = `rotate(${angle}deg)`; });
      // Le cliquetis de l'aiguille ralentit avec la roue
      let dernierCran = 0;
      const debut = performance.now();
      const cliquetis = () => {
        const t = Math.min(1, (performance.now() - debut) / duree);
        const actuel = new DOMMatrix(getComputedStyle(disque).transform);
        const a = (Math.atan2(actuel.b, actuel.a) * 180) / Math.PI;
        const cran = Math.floor((a + 360 + 15) / (360 / n));
        if (cran !== dernierCran) { dernierCran = cran; jouerSon('carte'); const ai = v.querySelector('.aiguille'); ai?.classList.remove('tic'); void (ai as HTMLElement | null)?.getBoundingClientRect(); ai?.classList.add('tic'); }
        if (t < 1 && v.isConnected) requestAnimationFrame(cliquetis);
      };
      requestAnimationFrame(cliquetis);
      setTimeout(() => {
        v.classList.remove('tourne');
        this.porte = r.etat;
        const sg = ROUE[r.segment];
        const jackpot = sg.label === 'JACKPOT';
        $('[data-info]', v).innerHTML = `<span class="resultat-roue ${jackpot ? 'jackpot' : ''}">${jackpot ? 'JACKPOT ! ' : ''}${r.clubs ? `+${clubs(r.clubs)}` : ''}${r.clubs && r.tickets ? ' et ' : ''}${r.tickets ? `${r.tickets} ticket${r.tickets > 1 ? 's' : ''} Banco offert${r.tickets > 1 ? 's' : ''}` : ''}</span>${r.multiplicateur > 1 ? `<small>Série jour ${r.jour} : ${mult(r.multiplicateur)}</small>` : ''}`;
        jouerSon(jackpot || r.clubs >= 5_000 ? 'grosGain' : 'gagne');
        this.pluieDePieces($('[data-info]', v), jackpot ? 20 : r.clubs >= 2_000 ? 12 : 8);
        if (r.clubs) this.compterJusqua(avant, r.etat.solde);
        const encore = r.etat.bonus.dispo || r.etat.toursBonus > 0;
        bouton.disabled = !encore;
        bouton.textContent = encore ? 'Encore un tour !' : 'À demain !';
        this.majAnnonces();
        this.majRoue();
      }, duree + 150);
    };
  }

  private async coupDePouce(b: HTMLElement) {
    try {
      const avant = this.porte?.solde ?? 0;
      this.porte = await api<EtatPortefeuille>('/api/portefeuille/coup-de-pouce', {});
      b.innerHTML = '<span class="gain">+1 000 <i class="pc"></i></span>';
      jouerSon('gagne');
      this.pluieDePieces(b, 8);
      this.compterJusqua(avant, this.porte.solde);
      setTimeout(() => { b.classList.add('part'); setTimeout(() => this.majAnnonces(), 450); }, 2200);
    } catch (e) { toast(e instanceof ErreurApi ? e.message : 'Impossible', true); }
  }

  /** Des pièces ♣ volent de l'annonce jusqu'au porte-monnaie. */
  private pluieDePieces(de: HTMLElement, n: number) {
    const a = de.getBoundingClientRect(), cible = $('[data-porte]', this.el).getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const p = html('<span class="piece-vol">♣</span>');
      const x0 = a.left + a.width * (0.2 + Math.random() * 0.6), y0 = a.top + a.height / 2;
      p.style.left = `${x0}px`; p.style.top = `${y0}px`;
      document.body.appendChild(p);
      const dx = cible.left + 16 - x0, dy = cible.top + cible.height / 2 - y0;
      p.animate([
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.15 + (Math.random() - 0.5) * 80}px), calc(-50% + ${-40 - Math.random() * 50}px)) scale(1.1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0.9 },
      ], { duration: 900 + i * 40, delay: i * 55, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'forwards' }).onfinish = () => p.remove();
    }
    setTimeout(() => { const pm = $('[data-porte]', this.el); pm.classList.remove('tinte'); void pm.offsetWidth; pm.classList.add('tinte'); jouerSon('jetons'); }, 900);
  }

  private compterJusqua(de: number, a: number, delai = 700) {
    const el = $('[data-solde]', this.el);
    const debut = performance.now() + delai, duree = 900;
    const pas = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - debut) / duree));
      el.textContent = fmt(Math.round(de + (a - de) * (1 - (1 - t) ** 3)));
      if (t < 1 && el.isConnected) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }

  /** Le portefeuille : solde, tickets, calendrier du bonus et derniers mouvements. */
  private async ouvrirPortefeuille() {
    const p = this.porte;
    if (!p) return;
    const jourFait = (i: number) => (p.bonus.dispo ? i < p.bonus.jour - 1 : i < p.bonus.jour);
    const pn = panneau(`<h2>Mon portefeuille</h2>
      <div class="solde-grand"><span class="piece">♣</span><b>${fmt(p.solde)}</b><small>Clubs</small></div>
      <p class="doux petit" style="text-align:center;margin:4px 0 14px">Argent fictif du Club : il ne s'achète pas et ne se retire jamais.${p.tickets ? ` · ${p.tickets} ticket${p.tickets > 1 ? 's' : ''} à gratter offert${p.tickets > 1 ? 's' : ''} (des Banco gratuits au Kiosque)` : ''}</p>
      <h3 style="margin-bottom:8px">La série de la Grande Roue</h3>
      <p class="doux petit" style="margin:0 0 10px">Un tour gratuit par jour. Viens chaque jour : la série multiplie tes gains jusqu'à ×5 le 7e jour, avec des tickets Banco offerts les jours 3, 6 et 7. Rate un jour et la série repart au jour 1.</p>
      <div class="calendrier">${p.bonus.calendrier.map((r, i) => `<div class="jour ${jourFait(i) ? 'fait' : ''} ${p.bonus.dispo && i === p.bonus.jour - 1 ? 'auj' : ''} ${i === 6 ? 'large' : ''}">
        <small>Jour ${i + 1}</small><span class="piece">♣</span><b>${mult(r.multiplicateur)}${r.tickets ? ` + ${r.tickets} ticket${r.tickets > 1 ? 's' : ''}` : ''}</b></div>`).join('')}</div>
      <h3 style="margin:16px 0 8px">Derniers mouvements</h3><div class="mouvements" data-mvt><span class="doux petit">…</span></div>`);
    try {
      const { mouvements } = await api<{ mouvements: { date: number; montant: number; motif: string }[] }>('/api/portefeuille/mouvements');
      $('[data-mvt]', pn.el).innerHTML = mouvements.map((m) => `<div><span>${esc(m.motif)}<small>${new Date(m.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small></span><b class="${m.montant >= 0 ? 'plus' : 'moins'}">${m.montant >= 0 ? '+' : ''}${fmt(m.montant)}</b></div>`).join('') || '<span class="doux petit">Rien pour l\'instant</span>';
    } catch { /* rien */ }
  }

  /** Le Casino : une salle par jeu, chacune avec son décor ; on y joue ses Clubs dans les villes. */
  private vueSalle(c: HTMLElement, jeu: JeuCasino) {
    const deco: Record<JeuCasino, string> = {
      poker: `<span class="deco-titre">Texas Hold'em</span><small>No-limit · tables de 6 · règles officielles</small>`,
      blackjack: `<span class="deco-titre">Black Jack</span><small>Le Black Jack paie 3 contre 2 · le croupier tire jusqu'à 16</small>`,
      roulette: `<span class="deco-titre">Roulette européenne</span><small>37 cases · un seul zéro · la partage</small>`,
    };
    c.innerHTML = `<div class="page-batiment page-casino theme-${jeu}">
      <div class="fronton">
        <button class="btn btn-rond btn-fantome" data-retour aria-label="Retour à la rue">←</button>
        <div class="marquise"><b>CASINO</b></div>
      </div>
      <div class="onglets-jeux">${(['poker', 'blackjack', 'roulette'] as JeuCasino[]).map((j) => `<button data-seg="${j}" class="j-${j} ${j === jeu ? 'on' : ''}"><span class="ico">${icone(j)}</span>${NOMS[j]}</button>`).join('')}</div>
      <div class="decor-salle"><div class="tapis-salle">${deco[jeu]}</div></div>
      <button class="apprendre-salle" data-apprendre><span>🎓</span><span><b>Apprendre à jouer ${jeu === 'roulette' ? 'à la' : 'au'} ${NOMS[jeu]}</b><small>Une leçon de 2 minutes, avec des mises en situation</small></span><i>›</i></button>
      <button class="apprendre-salle bots" data-bots><span>🤖</span><span><b>S'entraîner contre des bots</b><small>Une partie solo, sans miser un seul Club</small></span><i>›</i></button>
      <h3 class="titre-rubrique">Choisis ta ville</h3>
      <p class="doux petit" style="margin:0 0 10px">Ici on joue avec tes vrais Clubs <i class="pc"></i> : la cave est prélevée sur ton portefeuille, et en te levant tes jetons y retournent.</p>
      <div class="avec-potes" data-potes></div>
      <div class="villes" data-villes></div>
      <button class="vers-salon" data-vers-salon><span class="neon-mini">Entre potes</span><span><b>Une table rien qu'à vous ?</b><small>Au salon Entre potes : pour le fun avec des jetons offerts, ou en vrais Clubs entre amis.</small></span><i>›</i></button>
    </div>`;
    $('[data-retour]', c).onclick = () => this.retourRue('casino');
    $$('[data-seg]', c).forEach((b) => b.onclick = () => { jouerSon('clic'); memoire.jeu = b.dataset.seg as JeuCasino; this.afficher(); });
    $('[data-apprendre]', c).onclick = () => ouvrirApprendre(jeu, (j) => this.a.solo(j));
    $('[data-bots]', c).onclick = () => this.a.solo(jeu);
    this.majPotes();
    $('[data-vers-salon]', c).onclick = () => { jouerSon('clic'); memoire = { onglet: 'club', jeu: null, salon: jeu }; this.afficher(); this.el.querySelector('[data-contenu] > *')?.classList.add('arrivee'); };
    this.majVilles();
  }

  /** « Jouer avec des potes » : on choisit ses amis, ils sont invités dès qu'on est assis. */
  private majPotes() {
    const z = this.el.querySelector('[data-potes]') as HTMLElement | null;
    if (!z) return;
    z.innerHTML = this.potes.length
      ? `<span class="potes-choisis">👥 Avec ${this.potes.map((p) => `<b>${esc(p)}</b>`).join(', ')}</span><button class="btn btn-petit btn-fantome" data-modif-potes>Modifier</button><button class="btn btn-petit btn-fantome" data-sans-potes aria-label="Jouer seul">✕</button>`
      : `<button class="btn btn-ciel btn-plein" data-modif-potes>👥 Jouer avec des potes</button>`;
    $('[data-modif-potes]', z).onclick = async () => { const r = await choisirAmis(this.potes); if (r) { this.potes = r; this.majPotes(); if (r.length) toast('Choisis ta ville : ils seront invités à ta table'); } };
    const sans = z.querySelector('[data-sans-potes]') as HTMLElement | null;
    if (sans) sans.onclick = () => { this.potes = []; this.majPotes(); };
  }

  /** Le salon Entre potes : sa table à soi, pour le fun (jetons offerts) ou en vrais Clubs. */
  private vueSalon(c: HTMLElement, jeu: JeuCasino) {
    const solde = this.porte?.solde ?? 0;
    let niveau = VILLES[0].id as string;
    c.innerHTML = `<div class="page-batiment page-salon">
      <div class="fronton">
        <button class="btn btn-rond btn-fantome" data-retour aria-label="Retour à la rue">←</button>
        <div class="enseigne-salon">Entre potes</div>
      </div>
      <div class="decor-salon" aria-hidden="true">${decorSalon()}</div>
      <div class="onglets-jeux salon">${(['poker', 'blackjack', 'roulette'] as JeuCasino[]).map((j) => `<button data-seg="${j}" class="j-${j} ${j === jeu ? 'on' : ''}"><span class="ico">${icone(j)}</span>${NOMS[j]}</button>`).join('')}</div>
      <div class="modes-salon">
        <section class="mode-salon fun">
          <h3>🎈 Pour le fun</h3>
          <p>Jetons offerts, ton portefeuille n'est jamais touché. Tu choisis toutes les règles.</p>
          <button class="btn btn-or btn-plein" data-creer>Créer une table de ${NOMS[jeu]}</button>
        </section>
        <section class="mode-salon clubs">
          <h3><i class="pc"></i> En vrais Clubs</h3>
          <p>Chacun paie sa cave et repart avec ce qu'il a devant lui. Mêmes enjeux qu'au Casino : il faut avoir de quoi s'asseoir.</p>
          <div class="niveaux" data-niveaux></div>
          <div class="avec-potes" data-potes-salon></div>
          <button class="btn btn-or btn-plein" data-privee>Ouvrir la table</button>
        </section>
      </div>
      <button class="btn btn-ciel btn-plein" data-code style="margin-top:12px">Rejoindre avec un code</button>
      <div class="ligne" style="justify-content:space-between;margin:18px 0 10px"><h2 style="font-size:20px">Tables ouvertes</h2><span class="doux petit" data-enligne></span></div>
      <div data-tables></div>
    </div>`;
    const enjeux = (v: Ville) => jeu === 'poker' ? `${fmt(v.poker.pb)}/${fmt(v.poker.pb * 2)}` : jeu === 'blackjack' ? `${fmt(v.blackjack.miseMin)}–${fmt(v.blackjack.miseMax)}` : `min. ${fmt(v.roulette.miseMin)}`;
    let invites: string[] = [];
    const majNiveaux = () => {
      $('[data-niveaux]', c).innerHTML = VILLES.map((v) => {
        const ferme = v[jeu].cave > solde;
        return `<button class="niveau ${v.id === niveau ? 'on' : ''}" data-niveau="${v.id}" style="--c:${v.couleur}" ${ferme ? 'disabled' : ''}>
          <b>${v.nom}</b><small>${enjeux(v)}</small><small>Cave ${clubs(v[jeu].cave)}</small>${ferme ? '<span class="cadenas">🔒</span>' : ''}</button>`;
      }).join('');
      $$('[data-niveau]', c).forEach((b) => b.onclick = () => { niveau = b.dataset.niveau!; jouerSon('clic'); majNiveaux(); });
      const z = $('[data-potes-salon]', c);
      z.innerHTML = invites.length
        ? `<span class="potes-choisis">👥 ${invites.map((p) => `<b>${esc(p)}</b>`).join(', ')}</span><button class="btn btn-petit btn-fantome" data-inv>Modifier</button>`
        : `<button class="btn btn-petit btn-fantome" data-inv>👥 Inviter des potes</button>`;
      $('[data-inv]', z).onclick = async () => { const r = await choisirAmis(invites, 'Ils recevront une invitation dès que la table sera ouverte.'); if (r) { invites = r; majNiveaux(); } };
      ($('[data-privee]', c) as HTMLButtonElement).disabled = VILLES.every((v) => v[jeu].cave > solde);
    };
    majNiveaux();
    $('[data-retour]', c).onclick = () => this.retourRue('salon');
    $$('[data-seg]', c).forEach((b) => b.onclick = () => { jouerSon('clic'); memoire.salon = b.dataset.seg as JeuCasino; this.afficher(); });
    $('[data-creer]', c).onclick = () => this.a.creer(jeu);
    $('[data-privee]', c).onclick = () => { jouerSon('jetons'); this.a.creerPrivee(jeu, niveau, invites); };
    $('[data-code]', c).onclick = () => this.demanderCode();
    this.majListe();
    this.majComptes();
  }

  private demanderCode() {
    const p = panneau(`<h2>Rejoindre une table</h2><form><label class="champ"><span>Code de la table (5 lettres)</span>
      <input type="text" name="code" maxlength="5" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:6px;font-family:Fredoka;font-size:26px;text-align:center" required></label>
      <button class="btn btn-or btn-plein">Rejoindre</button></form>`);
    const f = $('form', p.el) as HTMLFormElement;
    ($('input', f) as HTMLInputElement).focus();
    f.onsubmit = (e) => { e.preventDefault(); this.a.rejoindreCode((f.code as HTMLInputElement).value.trim().toUpperCase()); p.fermer(); };
  }

  private contexteKiosque(): ContexteKiosque {
    return {
      porte: () => this.porte,
      majPorte: (e, affiche) => {
        const avant = Number(($('[data-solde]', this.el).textContent ?? '0').replace(/\D/g, '')) || 0;
        this.porte = { ...(this.porte as EtatPortefeuille), ...(e as Partial<EtatPortefeuille>) };
        const cible = affiche ?? e.solde;
        if (cible > avant) this.compterJusqua(avant, cible, 0);
        else $('[data-solde]', this.el).textContent = fmt(cible);
      },
      aller: (v) => { memoire = { onglet: 'kiosque', jeu: null, vueK: v === 'kiosque' ? null : v }; this.afficher(); },
      celebrer: (el, n) => this.pluieDePieces(el, n),
      nettoyer: (f) => this.arrets.push(f),
      retourRue: () => this.retourRue('kiosque'),
    };
  }

  private async vueClassement(c: HTMLElement) {
    c.innerHTML = `<div class="classement-vue"><h1 style="font-size:26px;margin-bottom:4px">Les plus riches du Club</h1>
      <p class="doux petit" style="margin:0 0 14px">Classés par Clubs <i class="pc"></i> dans le portefeuille</p><div data-liste><span class="doux">Chargement…</span></div>
      <button class="btn btn-plein" data-stats style="margin-top:16px">Statistiques de jeu des joueurs</button></div>`;
    $('[data-stats]', c).onclick = () => this.a.joueurs();
    try {
      const { joueurs } = await api<{ joueurs: { pseudo: string; avatar: any; cadre: string; solde: number }[] }>('/api/classement');
      if (memoire.onglet !== 'classement') return;
      $('[data-liste]', c).innerHTML = `<div class="liste-riches">${joueurs.map((j, i) => `<div class="riche ${j.pseudo.toLowerCase() === this.u.pseudo.toLowerCase() ? 'moi' : ''}">
        <span class="rang">${i + 1}</span>${avatarSVG(j.avatar, i === 0 ? 'ravi' : 'content', 44, { cadre: j.cadre })}<b>${esc(j.pseudo)}</b><span class="montant">${clubs(j.solde)}</span></div>`).join('')}</div>`;
    } catch { $('[data-liste]', c).textContent = 'Classement indisponible'; }
  }

  /* ------------------------------ Tables ouvertes ------------------------------ */

  majTables(tables: ResumeTable[], enLigne: number, villes: Record<string, number> = {}) {
    this.tables = tables;
    this.enLigne = enLigne;
    this.villes = villes;
    this.majVilles();
    this.majListe();
    this.majComptes();
  }

  /** Nombre de tables ouvertes sur chaque porte du Casino. */
  private majComptes() {
    for (const j of ['poker', 'blackjack', 'roulette'] as JeuCasino[]) {
      const el = $(`[data-compte="${j}"]`, this.el);
      if (!el) continue;
      const n = this.tables.filter((t) => t.jeu === j && t.statut !== 'terminee').length;
      el.textContent = n ? `${n} table${n > 1 ? 's' : ''}` : '';
    }
    const e = $('[data-enligne]', this.el);
    if (e) e.textContent = `${this.enLigne} joueur${this.enLigne > 1 ? 's' : ''} connecté${this.enLigne > 1 ? 's' : ''} · v${__VERSION__}`;
  }

  /** Les villes du Casino pour le jeu choisi. */
  private majVilles() {
    const zone = this.el.querySelector('[data-villes]') as HTMLElement | null;
    const jeu = memoire.jeu;
    if (!zone || !jeu || memoire.salon) return;
    const solde = this.porte?.solde ?? 0;
    const enjeux = (v: Ville) => jeu === 'poker' ? `Blindes ${fmt(v.poker.pb)} / ${fmt(v.poker.pb * 2)}` : jeu === 'blackjack' ? `Mise ${fmt(v.blackjack.miseMin)} à ${fmt(v.blackjack.miseMax)}` : `Jeton min. ${fmt(v.roulette.miseMin)}`;
    zone.innerHTML = VILLES.map((v) => {
      const cave = v[jeu].cave, manque = cave - solde, n = this.villes[`${jeu}:${v.id}`] ?? 0;
      return `<div class="ville ${manque > 0 ? 'fermee' : ''}" style="--c:${v.couleur}">
        <div class="carte-postale">${illustrationVille(v.id)}
          <span class="titre-ville">${v.nom}</span>
          ${n ? `<span class="monde-ville"><i></i>${n} à table</span>` : ''}
          ${manque > 0 ? `<span class="cadenas-ville">🔒 Il te manque ${clubs(manque)}</span>` : ''}
        </div>
        <div class="bas-ville"><span class="enjeux-ville"><b>${enjeux(v)}</b><small><span class="nowrap">Cave ${clubs(cave)}</span> · ${esc(v.accroche)}</small></span>
          <button class="btn btn-petit ${manque > 0 ? '' : 'btn-or'}" data-ville="${v.id}" ${manque > 0 ? 'disabled' : ''}>S'asseoir</button></div></div>`;
    }).join('');
    $$('[data-ville]', zone).forEach((b) => b.onclick = () => { jouerSon('jetons'); const p = this.potes; this.potes = []; this.a.casino(jeu, b.dataset.ville!, p); });
  }

  private majListe() {
    const zone = this.el.querySelector('[data-tables]') as HTMLElement | null;
    const jeu = memoire.salon;
    if (!zone || !jeu) return;
    const tables = this.tables.filter((t) => (t.jeu ?? 'poker') === jeu);
    if (!tables.length) {
      zone.innerHTML = `<div class="vide-liste">Aucune table de ${NOMS[jeu]} ouverte pour l'instant.<br>Crée la tienne et envoie le code à tes potes !</div>`;
      return;
    }
    zone.innerHTML = `<div class="tables">${tables.map((t) => {
      const pleine = t.joueurs >= t.places;
      const statut = t.statut === 'attente' ? 'En attente' : t.statut === 'en_jeu' ? 'En jeu' : t.statut === 'pause' ? 'En pause' : 'Terminée';
      const bj = t.jeu === 'blackjack', ro = t.jeu === 'roulette';
      return `<div class="carte-table">
        <div class="ligne" style="justify-content:space-between"><h3>${esc(t.nom)}</h3><span class="etiq ${t.statut}">${statut}</span></div>
        <div class="doux petit">Hôte : ${esc(t.hote)} · ${bj ? `Mise ${fmt(t.pb)} à ${fmt(t.gb)}` : ro ? `Jeton min. ${fmt(t.pb)}` : `Blindes ${fmt(t.pb)}/${fmt(t.gb)}`} ${t.visibilite === 'privee' ? '<span class="etiq prive">Privée</span>' : ''}</div>
        <div class="ligne" style="justify-content:space-between">
          <div class="avs">${t.avatars.map((a) => avatar(a, 'neutre', 38)).join('')}</div>
          <b>${t.joueurs}/${t.places}</b></div>
        <div class="ligne"><button class="btn btn-petit btn-or" data-rejoindre="${t.id}" ${pleine ? 'disabled' : ''}>${pleine ? 'Complète' : 'Rejoindre'}</button>
          <button class="btn btn-petit btn-fantome" data-regarder="${t.id}">Regarder</button></div>
      </div>`;
    }).join('')}</div>`;
    $$('[data-rejoindre]', zone).forEach((b) => b.onclick = () => this.a.rejoindre(b.dataset.rejoindre!));
    $$('[data-regarder]', zone).forEach((b) => b.onclick = () => this.a.regarder(b.dataset.regarder!));
  }
}

/** Le décor du salon : un coin canapé, une lampe, la table des potes. */
function decorSalon() {
  const T = '#2A1E3F', st = `stroke="${T}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
  const potes = [[120, '#8EE07A', '#43B072'], [190, '#FFC23D', '#E59A12'], [410, '#FF9AC1', '#E5484D'], [480, '#46C2F0', '#2E7FB8']] as const;
  return `<svg viewBox="0 0 600 190" preserveAspectRatio="xMidYMax slice">
    <rect width="600" height="190" fill="#6B3F5E"/>
    ${Array.from({ length: 13 }, (_, i) => `<rect x="${i * 48}" y="0" width="24" height="140" fill="#734566"/>`).join('')}
    <rect x="0" y="140" width="600" height="50" fill="#8A5A3C"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M${i * 80} 140 v50" stroke="#7A4C31" stroke-width="2"/>`).join('')}
    <rect x="34" y="26" width="92" height="70" rx="6" fill="#2E2840" ${st}/><rect x="40" y="32" width="80" height="58" rx="3" fill="#46C2F0"/><circle cx="96" cy="50" r="10" fill="#FFF4DF"/>
    <path d="M40 90 l26 -26 l18 16 l14 -10 l22 20z" fill="#43B072"/>
    <rect x="476" y="20" width="84" height="56" rx="6" fill="#FFC23D" ${st}/><text x="518" y="54" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="17" fill="${T}">ALL-IN</text>
    <path d="M300 0 v34" stroke="${T}" stroke-width="2"/><path d="M270 54 q30 -34 60 0z" fill="#FF6B5B" ${st}/>
    <path d="M272 54 l-48 92 h152 l-48 -92z" fill="#FFF4DF" opacity=".22" class="halo-lampe"/>
    ${potes.map(([x, c, h], i) => `<g class="pote-salon" style="animation-delay:${i * 0.6}s;transform-origin:${x}px 150px">
      <path d="M${x - 24} 168 q0 -38 24 -38 q24 0 24 38z" fill="${h}" ${st}/>
      <circle cx="${x}" cy="106" r="22" fill="${c}" ${st}/>
      <circle cx="${x - 7}" cy="102" r="3" fill="${T}"/><circle cx="${x + 7}" cy="102" r="3" fill="${T}"/>
      <path d="M${x - 8} 113 q8 6 16 0" fill="none" stroke="${T}" stroke-width="2.5" stroke-linecap="round"/></g>`).join('')}
    <path d="M150 152 q150 -30 300 0 v14 q-150 26 -300 0z" fill="#25A05C" ${st}/>
    <path d="M150 166 q150 26 300 0 v10 q-150 24 -300 0z" fill="#7A4C31" ${st}/>
    ${[270, 288, 306, 324].map((x, i) => `<rect x="${x}" y="139" width="15" height="21" rx="3" fill="#FFF4DF" ${st} transform="rotate(${(i - 1.5) * 6} ${x + 7} 150)"/>`).join('')}
    ${[[210, '#E5484D'], [222, '#46C2F0'], [380, '#FFC23D'], [392, '#8E5BD6']].map(([x, c]) => `<ellipse cx="${x}" cy="152" rx="8" ry="4" fill="${c}" ${st}/><ellipse cx="${x}" cy="147" rx="8" ry="4" fill="${c}" ${st}/>`).join('')}
  </svg>`;
}
