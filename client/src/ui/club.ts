import { illustrationVille } from '../art/villes';
import { ouvrirApprendre } from './apprendre';
/**
 * Le Club : l'accueil une fois connecté.
 * Un plan cartoon (le Casino et le Kiosque côte à côte), le portefeuille en Clubs ♣, le bonus du jour
 * et une barre d'onglets : Le Club, Kiosque, Classement, Profil.
 */
import type { Utilisateur } from '../../../serveur/comptes';
import type { ResumeTable } from '../../../serveur/hall';
import type { Recompense, EtatBonus } from '../../../moteur/bonus';
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

interface EtatPortefeuille { solde: number; tickets: number; bonus: EtatBonus & { calendrier: Recompense[] }; coupDePouce: boolean }

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

export class EcranHall {
  el: HTMLElement;
  private tables: ResumeTable[] = [];
  private enLigne = 0;
  private villes: Record<string, number> = {};
  private porte: EtatPortefeuille | null = null;
  private rang: number | null = null;
  private arrets: (() => void)[] = [];

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
      if (memoire.onglet === 'club' && !memoire.jeu) this.majAnnonces();
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

  /** Le plan : le Casino et le Kiosque, côte à côte, la nuit. */
  private vuePlan(c: HTMLElement) {
    c.innerHTML = `<div class="club-plan-zone">
      <div data-annonces class="annonces"></div>
      <div class="plan">
        <span class="etoile" style="left:7%;top:5%"></span><span class="etoile" style="left:42%;top:8%"></span><span class="etoile" style="left:68%;top:4%"></span>
        <span class="lune"></span>
        <div class="trottoir"></div>
        <div class="batiment casino">
          <div class="enseigne">CASINO</div>
          <div class="ampoules"></div>
          <div class="facade">
            ${(['poker', 'blackjack', 'roulette'] as JeuCasino[]).map((j) => `<button class="porte" data-jeu="${j}"><span class="hublot">${icone(j)}</span><b>${NOMS[j]}</b><small data-compte="${j}"></small></button>`).join('')}
          </div>
        </div>
        <button class="batiment kiosque" data-kiosque>
          <span class="auvent"></span>
          <span class="vitrine"><b>Kiosque</b>
            <span class="mini-ticket"><i></i><i class="g"></i><i></i><i class="g"></i><i></i><i class="g"></i></span>
            <small>grattage, keno, loto flash</small><span class="bientot">ouvert</span></span>
        </button>
        <button class="salon-prive" data-salon>Salon privé : une table entre potes</button>
      </div>
      <p class="doux petit plan-legende" data-enligne></p>
    </div>`;
    $$('[data-jeu]', c).forEach((b) => b.onclick = () => { jouerSon('clic'); memoire = { onglet: 'club', jeu: b.dataset.jeu as JeuCasino }; this.afficher(); });
    $('[data-kiosque]', c).onclick = () => { memoire = { onglet: 'kiosque', jeu: null }; this.afficher(); };
    $('[data-salon]', c).onclick = () => this.a.creer();
    this.majAnnonces();
    this.majComptes();
  }

  /** Bonus du jour et coup de pouce, au-dessus du plan. */
  private majAnnonces() {
    const z = $('[data-annonces]', this.el);
    const p = this.porte;
    if (!z || !p) return;
    const r = p.bonus.calendrier[p.bonus.jour - 1];
    z.innerHTML = `${p.bonus.dispo ? `<button class="annonce bonus" data-bonus>
        <span class="coffre ${r.coffre ? 'gros' : ''}"><i></i></span>
        <span><b>Bonus du jour ${p.bonus.jour} sur 7</b><small>${r.coffre ? 'Coffre : ' : ''}${clubs(r.clubs)}${r.tickets ? ` + ${r.tickets} ticket${r.tickets > 1 ? 's' : ''} offert${r.tickets > 1 ? 's' : ''}` : ''} · touche pour l'ouvrir</small></span></button>` : ''}
      ${p.coupDePouce ? `<button class="annonce pouce" data-pouce><span class="coffre"><i></i></span><span><b>À sec ? Le Club t'aide</b><small>Coup de pouce de 1 000 ♣, une fois par jour</small></span></button>` : ''}`;
    const b = $('[data-bonus]', z); if (b) b.onclick = () => this.encaisser(b);
    const cp = $('[data-pouce]', z); if (cp) cp.onclick = () => this.coupDePouce(cp);
  }

  private async encaisser(b: HTMLElement) {
    if (b.classList.contains('ouvert')) return;
    b.classList.add('ouvert');
    try {
      const avant = this.porte?.solde ?? 0;
      const r = await api<{ recompense: Recompense; jour: number; etat: EtatPortefeuille }>('/api/portefeuille/bonus', {});
      this.porte = r.etat;
      b.innerHTML = `<span class="gain">+${clubs(r.recompense.clubs)}${r.recompense.tickets ? ` <small>et ${r.recompense.tickets} ticket${r.recompense.tickets > 1 ? 's' : ''}</small>` : ''}</span>`;
      jouerSon(r.recompense.coffre ? 'grosGain' : 'gagne');
      this.pluieDePieces(b, r.recompense.coffre ? 14 : 8);
      this.compterJusqua(avant, r.etat.solde);
      setTimeout(() => { b.classList.add('part'); setTimeout(() => this.majAnnonces(), 450); }, 2600);
    } catch (e) {
      b.classList.remove('ouvert');
      toast(e instanceof ErreurApi ? e.message : 'Impossible de récupérer le bonus', true);
    }
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
      <p class="doux petit" style="text-align:center;margin:4px 0 14px">Argent fictif du Club : il ne s'achète pas et ne se retire jamais.${p.tickets ? ` · ${p.tickets} ticket${p.tickets > 1 ? 's' : ''} à gratter offert${p.tickets > 1 ? 's' : ''} (des Morpion gratuits au Kiosque)` : ''}</p>
      <h3 style="margin-bottom:8px">Bonus du jour</h3>
      <p class="doux petit" style="margin:0 0 10px">Connecte-toi chaque jour : un coffre tous les 3 jours, le grand coffre le 7e. Rate un jour et la série repart au jour 1.</p>
      <div class="calendrier">${p.bonus.calendrier.map((r, i) => `<div class="jour ${jourFait(i) ? 'fait' : ''} ${p.bonus.dispo && i === p.bonus.jour - 1 ? 'auj' : ''} ${i === 6 ? 'large' : ''}">
        <small>Jour ${i + 1}</small>${r.coffre ? '<span class="coffre gros"><i></i></span>' : '<span class="piece">♣</span>'}<b>${clubs(r.clubs)}${r.tickets ? ` + ${r.tickets} ticket${r.tickets > 1 ? 's' : ''}` : ''}</b></div>`).join('')}</div>
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
