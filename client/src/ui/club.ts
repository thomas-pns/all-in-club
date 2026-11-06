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
import { $, $$, esc, html, toast, panneau, avatar } from './commun';
import { vueVitrine, vueTicket, vueKeno, vueLoto, ContexteKiosque } from './kiosque';
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
  casino: (jeu: JeuCasino, ville: string) => void;
}

interface EtatPortefeuille { solde: number; tickets: number; bonus: EtatBonus & { calendrier: JourSerie[] }; toursBonus: number; coupDePouce: boolean }
interface TourDeRoue { segment: number; clubs: number; tickets: number; jour: number; multiplicateur: number; quotidien: boolean; etat: EtatPortefeuille }

type Onglet = 'club' | 'kiosque' | 'classement';
/** On revient là où on était en quittant une table. */
let memoire: { onglet: Onglet; jeu: JeuCasino | null; vueK?: string | null } = { onglet: 'club', jeu: null };

const NOMS: Record<JeuCasino, string> = { poker: 'Poker', blackjack: 'Black Jack', roulette: 'Roulette' };
const ICONE_ROULETTE = '<svg width="28" height="28" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="15" fill="none" stroke="#FF6B5B" stroke-width="7" stroke-dasharray="5 4"/><circle cx="23" cy="23" r="7" fill="#FFC23D"/></svg>';
const icone = (j: JeuCasino) => (j === 'poker' ? '<span class="sym">♠</span>' : j === 'blackjack' ? '<span class="sym or">21</span>' : ICONE_ROULETTE);
const SVG_ONGLETS: Record<string, string> = {
  club: '<path d="M3 11l9-7 9 7v9H3z"/>',
  kiosque: '<path d="M4 8h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4z"/>',
  classement: '<path d="M6 20V10M12 20V4M18 20v-7"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/>',
};
const clubs = (n: number) => `${fmt(n)} ♣`;
const mult = (m: number) => `×${String(m).replace('.', ',')}`;

export class EcranHall {
  el: HTMLElement;
  private tables: ResumeTable[] = [];
  private enLigne = 0;
  private villes: Record<string, number> = {};
  private porte: EtatPortefeuille | null = null;
  private rang: number | null = null;
  private arrets: (() => void)[] = [];
  private annonces: Annonce[] = [];
  private missions: { missions: EtatMission[]; nouvellesDans: number; recu: number } | null = null;

  constructor(racine: HTMLElement, private u: Utilisateur, private a: ActionsHall) {
    this.el = html(`<div class="club">
      <header class="club-entete">
        <button class="club-moi" data-profil aria-label="Mon profil">${avatarSVG(u.avatar, 'content', 46, { cadre: u.cadre })}
          <span><b>${esc(u.pseudo)}</b><small data-rang>Membre du Club</small></span></button>
        <button class="porte-monnaie" data-porte aria-label="Mon portefeuille"><span class="piece">♣</span><b data-solde>…</b></button>
      </header>
      <main class="club-contenu" data-contenu></main>
      <nav class="club-onglets">${(['club', 'kiosque', 'classement', 'profil'] as const).map((o) => `
        <button data-onglet="${o}"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${SVG_ONGLETS[o]}</svg>
          ${{ club: 'Le Club', kiosque: 'Kiosque', classement: 'Classement', profil: 'Profil' }[o]}</button>`).join('')}</nav>
    </div>`);
    racine.replaceChildren(this.el);
    $('[data-profil]', this.el).onclick = () => a.profil();
    $('[data-porte]', this.el).onclick = () => this.ouvrirPortefeuille();
    $$('[data-onglet]', this.el).forEach((b) => b.onclick = () => {
      const o = b.dataset.onglet!;
      if (o === 'profil') return a.profil();
      jouerSon('clic');
      memoire = { onglet: o as Onglet, jeu: null };
      this.afficher();
    });
    this.afficher();
    void this.chargerPortefeuille();
    void this.chargerRang();
  }

  /* ------------------------------ Données ------------------------------ */

  private async chargerPortefeuille() {
    try {
      this.porte = await api<EtatPortefeuille>('/api/portefeuille');
      $('[data-solde]', this.el).textContent = fmt(this.porte.solde);
      this.majVilles();
      if (memoire.onglet === 'club' && !memoire.jeu) { this.majAnnonces(); this.majRoue(); }
      if (memoire.onglet === 'kiosque' && !memoire.vueK) this.afficher();
    } catch { $('[data-solde]', this.el).textContent = '—'; }
  }

  private async chargerRang() {
    try {
      const { joueurs } = await api<{ joueurs: { pseudo: string }[] }>('/api/classement');
      const i = joueurs.findIndex((j) => j.pseudo.toLowerCase() === this.u.pseudo.toLowerCase());
      this.rang = i >= 0 ? i + 1 : null;
      if (this.rang) $('[data-rang]', this.el).textContent = this.rang === 1 ? 'Le plus riche du Club !' : `${this.rang}e du classement`;
    } catch { /* rien */ }
  }

  /* ------------------------------ Onglets ------------------------------ */

  private afficher() {
    this.arrets.splice(0).forEach((f) => f());
    $$('[data-onglet]', this.el).forEach((b) => b.classList.toggle('on', b.dataset.onglet === memoire.onglet));
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
    if (memoire.jeu) return this.vueSalle(c, memoire.jeu);
    this.vuePlan(c);
  }

  /** La rue du Club : on touche un bâtiment pour y entrer. */
  private vuePlan(c: HTMLElement) {
    c.innerHTML = `<div class="club-plan-zone">
      <div data-annonces class="annonces"></div>
      <div class="bandeau-annonces" data-bandeau hidden><span class="defile" data-defile></span></div>
      <div class="rue-cadre"><div class="rue-defile" data-rue>${sceneRue(momentParis())}</div><button class="indice-defile" data-indice aria-label="Voir la suite de la rue">›</button></div>
      <div class="missions-carte" data-missions><span class="doux petit">Missions du jour…</span></div>
      <p class="doux petit plan-legende" data-enligne></p>
    </div>`;
    const rue = $('[data-rue]', c);
    rue.addEventListener('click', (e) => {
      const cible = e.target as Element;
      const porte = cible.closest('[data-jeu]') as HTMLElement | null;
      if (porte) return this.entrerCasino(porte.dataset.jeu as JeuCasino);
      const lieu = (cible.closest('[data-lieu]') as HTMLElement | null)?.dataset.lieu;
      jouerSon('clic');
      if (lieu === 'casino') this.choisirJeu();
      else if (lieu === 'kiosque') { memoire = { onglet: 'kiosque', jeu: null }; this.afficher(); }
      else if (lieu === 'roue') this.ouvrirRoue();
      else if (lieu === 'salon') this.ouvrirSalon();
    });
    rue.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest('[data-lieu],[data-jeu]')) { e.preventDefault(); (e.target as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    // Une flèche invite à faire défiler la rue ; elle disparaît au bout du chemin
    const indice = $('[data-indice]', c);
    const majIndice = () => indice.classList.toggle('cache', rue.scrollLeft + rue.clientWidth >= rue.scrollWidth - 8);
    rue.addEventListener('scroll', majIndice, { passive: true });
    indice.onclick = () => rue.scrollBy({ left: rue.clientWidth * 0.8, behavior: 'smooth' });
    requestAnimationFrame(majIndice);
    // Le ciel change avec l'heure
    const moment = momentParis();
    const minuterie = setInterval(() => { if (momentParis() !== moment && memoire.onglet === 'club' && !memoire.jeu) this.afficher(); }, 60_000);
    this.arrets.push(() => clearInterval(minuterie));
    this.majAnnonces();
    this.majRoue();
    this.majComptes();
    this.majBandeau();
    void this.chargerAnnonces();
    void this.chargerMissions();
  }

  private entrerCasino(jeu: JeuCasino) { jouerSon('clic'); memoire = { onglet: 'club', jeu }; this.afficher(); }

  /** Toucher le Casino (ailleurs que sur une porte) : choisir son jeu. */
  private choisirJeu() {
    const p = panneau(`<h2>Le Casino</h2><p class="doux petit" style="margin:0 0 12px">À quoi on joue ?</p>
      <div class="choix-jeux">${(['poker', 'blackjack', 'roulette'] as JeuCasino[]).map((j) => `<button class="btn" data-j="${j}">${icone(j)} ${NOMS[j]}</button>`).join('')}</div>`);
    $$('[data-j]', p.el).forEach((b) => b.onclick = () => { p.fermer(); this.entrerCasino(b.dataset.j as JeuCasino); });
  }

  /** Le salon Entre potes : les parties perso, sans toucher au portefeuille. */
  private ouvrirSalon() {
    const p = panneau(`<h2>Entre potes</h2>
      <p class="doux petit" style="margin:0 0 14px">Tes parties perso : tu choisis les règles, les jetons sont offerts et ton portefeuille n'est pas touché.</p>
      <div class="choix-salon">
        <button class="btn btn-or btn-plein" data-creer>＋ Créer une table</button>
        <button class="btn btn-ciel btn-plein" data-code>Rejoindre avec un code</button>
        <button class="btn btn-plein" data-solo>S'entraîner en solo</button>
      </div>
      <h3 style="margin:16px 0 8px">Tables ouvertes entre potes</h3><div data-liste-salon></div>`);
    $('[data-creer]', p.el).onclick = () => { p.fermer(); this.a.creer(); };
    $('[data-code]', p.el).onclick = () => { p.fermer(); this.demanderCode(); };
    $('[data-solo]', p.el).onclick = () => { p.fermer(); this.a.solo(); };
    const ouvertes = this.tables.filter((t) => t.statut !== 'terminee');
    $('[data-liste-salon]', p.el).innerHTML = ouvertes.length
      ? ouvertes.map((t) => `<button class="table-salon" data-id="${t.id}"><b>${esc(t.nom)}</b><small>${NOMS[(t.jeu ?? 'poker') as JeuCasino]} · ${t.joueurs}/${t.places} joueurs</small></button>`).join('')
      : '<span class="doux petit">Aucune pour l\'instant : crée la tienne et envoie le code à tes potes !</span>';
    $$('[data-id]', p.el).forEach((b) => b.onclick = () => { p.fermer(); this.a.rejoindre(b.dataset.id!); });
  }

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
    const texte = recentes.map((a) => `<span>🎉 <b>${esc(a.pseudo)}</b> ${esc(a.texte)}</span>`).join('<i>·</i>');
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
      ${p.coupDePouce ? `<button class="annonce pouce" data-pouce><span class="coffre"><i></i></span><span><b>À sec ? Le Club t'aide</b><small>Coup de pouce de 1 000 ♣, une fois par jour</small></span></button>` : ''}`;
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
      b.innerHTML = '<span class="gain">+1 000 ♣</span>';
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

  /** Une salle du Casino : les tables ouvertes d'un jeu. */
  private vueSalle(c: HTMLElement, jeu: JeuCasino) {
    c.innerHTML = `<div class="salle-jeu">
      <div class="ligne" style="gap:10px;margin-bottom:12px"><button class="btn btn-rond btn-fantome" data-retour aria-label="Retour au Club">←</button><h1 style="font-size:24px">Le Casino</h1></div>
      <div class="segments">${(['poker', 'blackjack', 'roulette'] as JeuCasino[]).map((j) => `<button data-seg="${j}" class="${j === jeu ? 'on' : ''}">${NOMS[j]}</button>`).join('')}</div>
      <button class="apprendre-salle" data-apprendre><span>🎓</span><span><b>Apprendre à jouer ${jeu === 'roulette' ? 'à la' : 'au'} ${NOMS[jeu]}</b><small>Une leçon de 2 minutes, avec des mises en situation</small></span><i>›</i></button>
      <h3 class="titre-rubrique" style="margin-top:4px">Le Casino · avec tes Clubs ♣</h3>
      <p class="doux petit" style="margin:0 0 10px">La cave est prélevée sur ton portefeuille. En te levant, tes jetons y retournent.</p>
      <div class="villes" data-villes></div>
      <h3 class="titre-rubrique">Entre potes · jetons offerts</h3>
      <p class="doux petit" style="margin:0 0 10px">Rien en jeu : ton portefeuille n'est pas touché.</p>
      <div class="actions-salle">
        <button class="btn btn-or" data-creer>＋ Créer une table</button>
        <button class="btn btn-ciel" data-code>Rejoindre avec un code</button>
        <button class="btn" data-solo>Jouer en solo</button>
      </div>
      <div class="ligne" style="justify-content:space-between;margin:18px 0 10px"><h2 style="font-size:20px">Tables ouvertes</h2><span class="doux petit" data-enligne></span></div>
      <div data-tables></div>
    </div>`;
    $('[data-retour]', c).onclick = () => { memoire = { onglet: 'club', jeu: null }; this.afficher(); };
    $$('[data-seg]', c).forEach((b) => b.onclick = () => { memoire.jeu = b.dataset.seg as JeuCasino; this.afficher(); });
    $('[data-creer]', c).onclick = () => this.a.creer(jeu);
    $('[data-solo]', c).onclick = () => this.a.solo(jeu);
    $('[data-apprendre]', c).onclick = () => ouvrirApprendre(jeu, (j) => this.a.solo(j));
    $('[data-code]', c).onclick = () => this.demanderCode();
    this.majVilles();
    this.majListe();
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
    };
  }

  private async vueClassement(c: HTMLElement) {
    c.innerHTML = `<div class="classement-vue"><h1 style="font-size:26px;margin-bottom:4px">Les plus riches du Club</h1>
      <p class="doux petit" style="margin:0 0 14px">Classés par Clubs ♣ dans le portefeuille</p><div data-liste><span class="doux">Chargement…</span></div>
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
    if (e) e.textContent = `${this.enLigne} joueur${this.enLigne > 1 ? 's' : ''} connecté${this.enLigne > 1 ? 's' : ''}`;
  }

  /** Les villes du Casino pour le jeu choisi. */
  private majVilles() {
    const zone = $('[data-villes]', this.el);
    const jeu = memoire.jeu;
    if (!zone || !jeu) return;
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
    $$('[data-ville]', zone).forEach((b) => b.onclick = () => { jouerSon('jetons'); this.a.casino(jeu, b.dataset.ville!); });
  }

  private majListe() {
    const zone = $('[data-tables]', this.el);
    if (!zone || !memoire.jeu) return;
    const tables = this.tables.filter((t) => t.jeu === memoire.jeu);
    if (!tables.length) {
      zone.innerHTML = `<div class="vide-liste">Aucune table de ${NOMS[memoire.jeu]} ouverte pour l'instant.<br>Crée la tienne et envoie le code à tes potes !</div>`;
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
