/**
 * Écran de roulette : la scène PixiJS + l'interface (jetons, rejouer, prêt, hôte, fin de partie).
 * En ligne (WebSocket) ou en solo (salle locale), comme les autres jeux.
 */
import { ouvrirApprendre } from './apprendre';
import type { CommandeRoulette, MessageRoulette, VueRoulette, ReglagesRoulette } from '../../../moteur/roulette/salleRoulette';
import type { MessageChat } from '../../../moteur/salle';
import { MISES } from '../../../moteur/roulette/regles';
import { EMOTES } from '../../../moteur/social';
import { emoteSVG } from '../art/emotes';
import { SceneRoulette, COULEURS_SIEGES } from '../vue/sceneRoulette';
import { jouerSon, reglerSon, debloquerSon } from '../vue/son';
import { fmt } from '../art/rendu';
import { $, $$, esc, html, toast, panneau, confirmer, avatar, lirePrefs, suivrePrefs, ouvrirReglagesPerso } from './commun';
import { ChatLateral } from './chatLateral';

export interface CanalRoulette {
  envoyer(cmd: CommandeRoulette): void;
  quitter(): void;
  brancher(f: (m: MessageRoulette) => void): () => void;
  enLigne: boolean;
  /** Table du Casino : on y joue ses Clubs ♣ (nom de la ville). */
  casino?: string;
}

const VALEURS_JETONS = [1, 5, 10, 25, 100, 500, 1000];
const hexa = (n: number) => '#' + n.toString(16).padStart(6, '0');
const court = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(n));

export class EcranRoulette {
  private el: HTMLElement;
  private scene: SceneRoulette | null = null;
  private file: Extract<MessageRoulette, { type: 'majRoulette' }>[] = [];
  private enCours = false;
  /** Une animation est en cours (les notifications attendent). */
  get occupe() { return this.enCours || this.file.length > 0; }
  private etat: VueRoulette | null = null;
  private debrancher: () => void;
  private detruit = false;
  private nettoyages: (() => void)[] = [];
  private panneauFin: { fermer: () => void } | null = null;
  private resultatsVus = '';
  private nonLus = 0;
  private lateral!: ChatLateral;
  private jeton = 0;
  /** Mes derniers jetons posés, pour « Annuler ». */
  private pile: { mise: string; montant: number }[] = [];
  private tourPile = -1;
  private derniere: string | null = null;
  private cleBarre = '';
  private cleVue = '';
  /** Dernier état affiché dans la barre (peut précéder this.etat pendant une animation). */
  private etatBarre: VueRoulette | null = null;

  constructor(racine: HTMLElement, private canal: CanalRoulette, private onQuitter: () => void) {
    this.el = html(`<div class="ecran-table ecran-roulette">
      <div class="barre-haut">
        <button class="btn btn-rond btn-fantome" data-quitter title="Quitter la table" aria-label="Quitter">←</button>
        <div style="min-width:0"><div class="titre" data-nom>Roulette</div><div class="infos" data-infos></div></div>
        <div class="espace"></div>
        <span class="code cache" data-code title="Copier le code"></span>
        <button class="btn btn-rond btn-fantome facultatif-tel" data-regles title="Comment jouer ?" aria-label="Règles">?</button>
        <button class="btn btn-rond btn-fantome" data-emotes title="Émotes" aria-label="Émotes">😀</button>
        <button class="btn btn-rond btn-fantome bouton-chat" data-chat title="Chat" aria-label="Chat">💬<span class="pastille-non-lus cache" data-nonlus></span></button>
        <button class="btn btn-rond" data-menu title="Menu" aria-label="Menu">☰</button>
      </div>
      <div class="zone-scene" data-scene>
        <div class="panneau-chat cache" data-panneau-chat>
          <div class="entete-chat"><b>Chat de la table</b><button class="btn btn-petit btn-fantome" data-fermer-chat>✕</button></div>
          <div class="messages-chat" data-messages></div>
          <form class="saisie-chat" data-form-chat><input type="text" maxlength="200" placeholder="Écrire un message…" autocomplete="off" enterkeyhint="send"><button class="btn btn-petit btn-or">Envoyer</button></form>
        </div>
        <div class="roue-emotes cache" data-roue>${EMOTES.map((e) => `<button data-emote="${e.id}" title="${e.nom}">${emoteSVG(e.id, 56)}</button>`).join('')}</div>
        <div class="bulles-chat" data-bulles></div>
      </div>
      <div class="barre-actions barre-roulette" data-barre></div>
    </div>`);
    racine.replaceChildren(this.el);
    this.lateral = new ChatLateral(this.el, () => { this.nonLus = 0; this.majNonLus(); });
    this.nettoyages.push(() => this.lateral.detruire());
    $('[data-quitter]', this.el).onclick = () => this.quitter();
    $('[data-menu]', this.el).onclick = () => this.menu();
    $('[data-regles]', this.el).onclick = () => ouvrirReglesRoulette();
    $('[data-code]', this.el).onclick = () => this.copierCode();
    $('[data-chat]', this.el).onclick = () => this.basculerChat();
    $('[data-fermer-chat]', this.el).onclick = () => this.basculerChat(false);
    $('[data-emotes]', this.el).onclick = (e) => { e.stopPropagation(); $('[data-roue]', this.el).classList.toggle('cache'); };
    $$('[data-emote]', this.el).forEach((b) => b.onclick = () => { this.canal.envoyer({ c: 'emote', id: b.dataset.emote! }); $('[data-roue]', this.el).classList.add('cache'); });
    const fermerRoue = (e: Event) => { if (!(e.target as HTMLElement).closest('[data-roue],[data-emotes]')) $('[data-roue]', this.el)?.classList.add('cache'); };
    document.addEventListener('pointerdown', fermerRoue);
    this.nettoyages.push(() => document.removeEventListener('pointerdown', fermerRoue));
    const fc = $('[data-form-chat]', this.el) as HTMLFormElement;
    fc.onsubmit = (e) => {
      e.preventDefault();
      const i = $('input', fc) as HTMLInputElement;
      const t = i.value.trim();
      if (t) this.canal.envoyer({ c: 'chat', texte: t });
      i.value = '';
    };
    this.debrancher = canal.brancher((m) => this.recevoir(m));
    const p = lirePrefs();
    reglerSon(p.effets > 0, p.effets);
    this.nettoyages.push(suivrePrefs((p) => { reglerSon(p.effets > 0, p.effets); this.scene?.options({ vitesse: p.rapide ? 2 : 1 }); }));
    const vis = () => { if (document.visibilityState === 'visible') this.scene?.accelerer(); };
    document.addEventListener('visibilitychange', vis);
    this.nettoyages.push(() => document.removeEventListener('visibilitychange', vis));
    const minuterie = setInterval(() => this.majCompteur(), 250);
    this.nettoyages.push(() => clearInterval(minuterie));
    const clavier = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea') || $('.voile')) return;
      const b = (sel: string) => { const x = $(sel, this.el) as HTMLButtonElement | null; if (x && !x.disabled) { e.preventDefault(); x.click(); } };
      if (e.key === 'Enter' || e.key === ' ') b('[data-r="pret"]');
      else if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) b('[data-r="annuler"]');
    };
    document.addEventListener('keydown', clavier);
    this.nettoyages.push(() => document.removeEventListener('keydown', clavier));
    void this.initScene();
  }

  private async initScene() {
    await document.fonts.ready.catch(() => {});
    if (this.detruit) return;
    const p = lirePrefs();
    this.scene = await SceneRoulette.creer($('[data-scene]', this.el), { vitesse: p.rapide ? 2 : 1 });
    if (this.detruit) { this.scene.detruire(); return; }
    this.scene.onMise = (id) => this.poser(id);
    this.scene.onVue = () => { this.cleBarre = ''; if (this.etatBarre) this.majBarre(this.etatBarre); };
    this.scene.onClicPlace = (s) => { if (this.etat?.monSiege === null) this.canal.envoyer({ c: 'asseoir', siege: s }); };
    if (this.etat) { this.scene.appliquerEtat(this.etat); this.majInterface(this.etat); }
    void this.traiter();
  }

  detruire() {
    this.detruit = true;
    this.debrancher();
    this.nettoyages.forEach((f) => f());
    this.panneauFin?.fermer();
    $$('.voile').forEach((v) => v.remove());
    this.scene?.detruire();
  }

  /* ------------------------------ Messages ------------------------------ */

  private recevoir(m: MessageRoulette) {
    if (m.type === 'info') return toast(m.texte);
    if (m.type === 'erreur') { this.cleBarre = ''; if (this.etat) this.majBarre(this.etat); return toast(m.texte, true); }
    if (m.type === 'exclu') return;
    if (m.type === 'chat') return this.ajouterChat(m.message, true);
    if (m.type === 'chatHistorique') { $('[data-messages]', this.el).replaceChildren(); m.messages.forEach((x) => this.ajouterChat(x, false)); return; }
    if (m.type === 'emote') { if (m.siege !== null) void this.scene?.afficherEmote(m.siege, m.id); return; }
    this.file.push(m);
    void this.traiter();
  }

  private async traiter() {
    if (this.enCours || !this.scene) return;
    this.enCours = true;
    try {
      while (this.file.length && !this.detruit) {
        const m = this.file.shift()!;
        // Pendant la roue, l'interface montre déjà « rien ne va plus »
        if (m.evenements.some((e) => e.t === 'rienNeVaPlus') && this.etat) this.majInterface({ ...this.etat, phase: 'tirage' });
        if (this.file.length > 3) { this.scene.accelerer(); this.scene.appliquerEtat(m.etat); }
        else if (!m.evenements.length) this.scene.appliquerEtat(m.etat);
        else await this.scene.jouer(m.evenements, m.etat);
        this.etat = m.etat;
        this.majInterface(m.etat);
      }
    } finally {
      this.enCours = false;
    }
  }

  /* ------------------------------ Interface ------------------------------ */

  private majInterface(e: VueRoulette) {
    const r = e.reglages;
    $('[data-nom]', this.el).textContent = r.nom;
    const infos = [`Jeton min. ${fmt(r.miseMin)}`];
    if (this.canal.casino) infos.unshift('♣ en Clubs');
    if (e.numeroTour) infos.push(r.tours ? `Tour ${e.numeroTour}/${r.tours}` : `Tour ${e.numeroTour}`);
    if (e.spectateurs.length) infos.push(`👁 ${e.spectateurs.length}`);
    $('[data-infos]', this.el).textContent = infos.join(' · ');
    const code = $('[data-code]', this.el);
    code.textContent = e.code;
    code.classList.toggle('cache', !this.canal.enLigne);
    const moi = e.monSiege !== null ? e.sieges[e.monSiege] : null;
    this.scene?.activer(e.statut === 'en_jeu' && e.phase === 'mises' && !!moi);
    // Téléphone : le tapis pour miser, la roue en grand une fois prêt (on peut toujours basculer à la main)
    const cleVue = `${e.numeroTour}|${e.phase}|${moi?.pret}`;
    if (cleVue !== this.cleVue) {
      this.cleVue = cleVue;
      if (e.phase === 'mises') this.scene?.afficherVue(moi?.pret ? 'roue' : 'tapis');
    }
    if (this.tourPile !== e.numeroTour) { this.tourPile = e.numeroTour; this.pile = []; this.derniere = null; }
    this.majCentre(e);
    this.majBarre(e);
    this.majFin(e);
  }

  private majCentre(e: VueRoulette) {
    const zone = $('[data-scene]', this.el);
    let c = $('.attente-centre', zone);
    const hote = e.hote === e.moi;
    if (e.statut !== 'attente' && e.statut !== 'pause') { c?.remove(); return; }
    if (!c) { c = html('<div class="attente-centre"></div>'); zone.appendChild(c); }
    const nb = e.sieges.filter(Boolean).length;
    if (e.statut === 'pause') {
      c.innerHTML = `<h2>Partie en pause</h2><p class="doux">${hote ? 'Reprends quand tout le monde est prêt.' : "En attente de l'hôte…"}</p>
        ${hote ? '<button class="btn btn-or" data-reprendre>Reprendre la partie</button>' : ''}`;
      const b = $('[data-reprendre]', c); if (b) b.onclick = () => this.canal.envoyer({ c: 'reprendre' });
      return;
    }
    c.innerHTML = `<h2>${this.canal.enLigne ? 'Invite tes potes !' : 'Prêt à jouer ?'}</h2>
      ${this.canal.enLigne ? `<div class="doux petit">Code de la table</div><div class="gros-code" data-copier title="Copier">${esc(e.code)}</div>` : ''}
      <p class="doux" style="margin:6px 0 14px">${nb} joueur${nb > 1 ? 's' : ''} sur ${e.reglages.places} · ${fmt(e.reglages.tapisDepart)} jetons chacun${e.reglages.tours ? ` · ${e.reglages.tours} tours` : ''}</p>
      ${hote ? '<button class="btn btn-or" data-lancer>Lancer la partie</button>' : "<p>En attente de l'hôte…</p>"}
      <p style="margin:12px 0 0"><button class="lien" data-regles2>Jamais joué ? Apprends en 2 minutes</button></p>`;
    const cp = $('[data-copier]', c); if (cp) cp.onclick = () => this.copierCode();
    const bl = $('[data-lancer]', c); if (bl) bl.onclick = () => { debloquerSon(); this.canal.envoyer({ c: 'lancer' }); };
    $('[data-regles2]', c).onclick = () => ouvrirReglesRoulette();
  }

  private majCompteur() {
    const el = $('[data-compte]', this.el);
    if (!el || !el.dataset.fin) return;
    const s = Math.max(0, Math.ceil((Number(el.dataset.fin) - performance.now()) / 1000));
    el.textContent = `${s} s`;
    el.classList.toggle('urgent', s <= 5);
  }

  private jetonsDispo(e: VueRoulette) { return VALEURS_JETONS.filter((v) => v >= e.reglages.miseMin).slice(0, 5); }

  private poser(id: string): void {
    const e = this.etat;
    const moi = e && e.monSiege !== null ? e.sieges[e.monSiege] : null;
    if (!e || !moi || e.phase !== 'mises') return;
    const v = this.jeton || this.jetonsDispo(e)[1] || e.reglages.miseMin;
    if (v > moi.tapis) {
      const possible = [...this.jetonsDispo(e)].reverse().find((x) => x <= moi.tapis);
      if (!possible) { toast("Plus assez de jetons", true); return; }
      this.jeton = possible;
      return this.poser(id);
    }
    debloquerSon();
    this.pile.push({ mise: id, montant: v });
    this.derniere = id;
    this.canal.envoyer({ c: 'poser', mise: id, montant: v });
  }

  private majBarre(e: VueRoulette) {
    this.etatBarre = e;
    const barre = $('[data-barre]', this.el);
    const moi = e.monSiege !== null ? e.sieges[e.monSiege] : null;
    const cle = JSON.stringify([this.scene?.enPortrait, this.scene?.vueActuelle, e.statut, e.phase, e.numeroTour, e.monSiege, moi?.pret, moi?.tapis, moi?.totalMise, moi?.retour, moi?.recavesRestantes, this.jeton, this.derniere, e.resteMs === null]);
    if (cle === this.cleBarre) return;
    this.cleBarre = cle;

    if (e.statut === 'terminee') { barre.innerHTML = '<div class="message-barre">Partie terminée</div>'; return; }
    if (!moi) {
      const libre = e.sieges.some((s) => !s);
      barre.innerHTML = `<div class="message-barre">👁 Tu regardes la partie ${libre ? '<button class="btn btn-petit btn-or" data-asseoir>S\'asseoir</button>' : ''}</div>`;
      const b = $('[data-asseoir]', barre); if (b) b.onclick = () => this.canal.envoyer({ c: 'asseoir' });
      return;
    }
    if (e.statut === 'attente' || e.statut === 'pause') { barre.innerHTML = ''; return; }
    if (e.phase === 'tirage') { barre.innerHTML = `<div class="message-barre rien-ne-va-plus">Rien ne va plus…${moi.totalMise ? ` <span class="doux">tu as misé ${fmt(moi.totalMise)}</span>` : ''}</div>`; return; }
    if (e.phase === 'resultats') {
      const net = moi.retour !== null ? moi.retour - moi.totalMise : null;
      barre.innerHTML = `<div class="message-barre">${net === null || !moi.totalMise ? '<span class="doux">Prochain tour dans un instant…</span>'
        : net > 0 ? `<b class="vert">+${fmt(net)}</b> ce tour-ci !` : net === 0 ? 'Mise remboursée' : `<b class="rouge">${fmt(net)}</b> ce tour-ci`}</div>`;
      return;
    }
    if (e.phase !== 'mises') { barre.innerHTML = '<div class="message-barre doux">…</div>'; return; }

    // À sec
    if (moi.tapis + moi.totalMise < e.reglages.miseMin) {
      const r = moi.recavesRestantes;
      barre.innerHTML = `<div class="message-barre">${r > 0
        ? `Plus assez de jetons. <button class="btn btn-or btn-petit" data-recave>Se recaver (${fmt(e.reglages.tapisDepart)})</button><span class="doux petit">${r >= 99 ? 'illimité' : `${r} restante${r > 1 ? 's' : ''}`}</span>`
        : 'Plus de jetons ni de recave. L\'hôte peut t\'en offrir une.'}</div>`;
      const b = $('[data-recave]', barre); if (b) b.onclick = () => this.canal.envoyer({ c: 'recave' });
      return;
    }

    const dispo = this.jetonsDispo(e);
    if (!dispo.includes(this.jeton)) this.jeton = dispo[Math.min(1, dispo.length - 1)];
    const couleur = hexa(COULEURS_SIEGES[moi.siege % 6]);
    const d = this.derniere ? MISES.get(this.derniere) : null;
    const aide = d ? `${esc(d.nom)} · paie ${d.gain} contre 1` : window.matchMedia('(pointer: fine)').matches ? 'Clique sur le tapis pour poser tes jetons' : 'Touche le tapis pour poser tes jetons';
    const precedentes = Object.values(moi.precedentes).reduce((s, x) => s + x, 0);
    const bascule = this.scene?.enPortrait ? `<button class="btn btn-petit btn-fantome" data-vue>${this.scene.vueActuelle === 'roue' ? '▦ Tapis' : '🎡 Roue'}</button>` : '';
    barre.innerHTML = `<div class="ligne-conseil"><span class="titre-barre aide-mise">${this.scene?.vueActuelle === 'roue' && this.scene.enPortrait ? 'Touche la roue pour revenir au tapis' : aide}</span><span class="ligne">${bascule}<span class="compte" data-compte ${e.resteMs !== null ? `data-fin="${performance.now() + e.resteMs}"` : ''}></span></span></div>
      <div class="mises-bj">
        <div class="jetons-bj">${dispo.map((v) => `<button class="jeton-bj ${v === this.jeton ? 'choisi' : ''}" data-jeton="${v}" style="--c:${couleur}" ${v > moi.tapis ? 'disabled' : ''} title="Jeton de ${fmt(v)}"><span>${court(v)}</span></button>`).join('')}</div>
        <div class="montant-bj"><small>Misé</small><b>${fmt(moi.totalMise)}</b></div>
      </div>
      <div class="actions-bj actions-roulette">
        <button class="btn" data-r="annuler" ${this.pile.length ? '' : 'disabled'}><span class="col">Annuler<small>dernier jeton</small></span></button>
        ${moi.totalMise
          ? `<button class="btn" data-r="effacer"><span class="col">Effacer<small>tout reprendre</small></span></button>
             <button class="btn btn-ciel" data-r="doubler" ${moi.totalMise > moi.tapis ? 'disabled' : ''}><span class="col">Doubler<small>×2 partout</small></span></button>`
          : `<button class="btn btn-ciel" data-r="rejouer" ${precedentes && precedentes <= moi.tapis ? '' : 'disabled'}><span class="col">Rejouer<small>${precedentes ? fmt(precedentes) : 'mes mises'}</small></span></button>
             <button class="btn btn-ciel" data-r="rejouer2" ${precedentes && precedentes * 2 <= moi.tapis ? '' : 'disabled'}><span class="col">Rejouer ×2<small>${precedentes ? fmt(precedentes * 2) : '—'}</small></span></button>`}
        <button class="btn ${moi.pret ? 'btn-vert' : 'btn-or'}" data-r="pret" ${moi.pret ? 'disabled' : ''}><span class="col">${moi.pret ? '✓ Prêt' : moi.totalMise ? 'Prêt !' : 'Je passe'}<small>${moi.pret ? 'on attend les autres' : moi.totalMise ? 'lancer la bille' : 'ce tour-ci'}</small></span></button>
      </div>`;
    this.majCompteur();
    const bv = $('[data-vue]', barre); if (bv) bv.onclick = () => this.scene?.afficherVue(this.scene.vueActuelle === 'roue' ? 'tapis' : 'roue');
    $$('[data-jeton]', barre).forEach((b) => b.onclick = () => { this.jeton = Number(b.dataset.jeton); jouerSon('clic'); $$('[data-jeton]', barre).forEach((x) => x.classList.toggle('choisi', x === b)); });
    const act = (k: string, f: () => void) => { const b = $(`[data-r="${k}"]`, barre); if (b) b.onclick = () => { debloquerSon(); f(); }; };
    act('annuler', () => { const x = this.pile.pop(); if (x) { this.canal.envoyer({ c: 'retirer', mise: x.mise, montant: x.montant }); jouerSon('clic'); } });
    act('effacer', () => { this.pile = []; this.canal.envoyer({ c: 'effacer' }); });
    act('doubler', () => this.canal.envoyer({ c: 'repeter', double: true }));
    act('rejouer', () => this.canal.envoyer({ c: 'repeter' }));
    act('rejouer2', () => this.canal.envoyer({ c: 'repeter', double: true }));
    act('pret', () => this.canal.envoyer({ c: 'pret' }));
  }

  /* ------------------------------ Fin de partie ------------------------------ */

  private majFin(e: VueRoulette) {
    if (e.statut !== 'terminee' || !e.resultats) {
      if (this.panneauFin) { this.panneauFin.fermer(); this.panneauFin = null; this.resultatsVus = ''; }
      return;
    }
    const cle = JSON.stringify(e.resultats);
    if (cle === this.resultatsVus) return;
    this.resultatsVus = cle;
    this.panneauFin?.fermer();
    const r = e.resultats;
    const hote = e.hote === e.moi;
    const top = r.classement.slice(0, 3);
    const ordre = [top[1], top[0], top[2]].filter(Boolean);
    const hauteurs: Record<number, [number, string]> = { 0: [96, '#FFC23D'], 1: [70, '#C9D3E0'], 2: [52, '#E39B5C'] };
    const signe = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
    const nomDe = (id: string) => r.classement.find((c) => c.id === id)?.nom ?? '?';
    const p = panneau(`<h2 style="text-align:center">Fin de la partie</h2>
      ${ordre.length > 1 ? `<div class="podium">${ordre.map((c) => {
        const rang = top.indexOf(c);
        const [h, coul] = hauteurs[rang];
        return `<div class="marche">${avatar(c.avatar, rang === 0 ? 'ravi' : c.bilan < 0 ? 'decu' : 'content', 74)}<div class="nom">${esc(c.nom)}</div>
          <div class="bilan ${c.bilan >= 0 ? 'plus' : 'moins'}" style="font-family:Fredoka;font-weight:700">${signe(c.bilan)}</div>
          <div class="socle" style="height:${h}px;background:${coul}">${rang + 1}</div></div>`;
      }).join('')}</div>` : top[0] ? `<div style="text-align:center">${avatar(top[0].avatar, top[0].bilan >= 0 ? 'ravi' : 'decu', 96)}
        <div style="font-family:Fredoka;font-size:20px">${top[0].bilan > 0 ? 'Tu as fait sauter la banque !' : top[0].bilan === 0 ? 'Pile à l\'équilibre' : 'La banque gagne cette fois…'}</div>
        <div class="bilan ${top[0].bilan >= 0 ? 'plus' : 'moins'}" style="font-family:Fredoka;font-size:30px;font-weight:700">${signe(top[0].bilan)}</div></div>` : ''}
      ${r.classement.length > 1 ? `<table class="classement">${r.classement.map((c, i) => `<tr><td>${i + 1}.</td><td>${esc(c.nom)}</td><td class="bilan ${c.bilan >= 0 ? 'plus' : 'moins'}">${signe(c.bilan)}</td></tr>`).join('')}</table>` : ''}
      ${r.distinctions.length ? `<div class="distinctions">${r.distinctions.map((d) => `<div><b>${esc(d.titre)}</b>${esc(nomDe(d.id))}<div class="doux petit">${esc(d.detail)}</div></div>`).join('')}</div>` : ''}
      <p class="doux petit" style="text-align:center">${r.tours} tour${r.tours > 1 ? 's' : ''} de roue</p>
      <div class="ligne" style="justify-content:center;margin-top:8px">
        <button class="btn btn-fantome" data-sortir>Quitter la table</button>
        ${hote ? '<button class="btn btn-or" data-rejouer>On remet ça !</button>' : '<span class="doux">On remet ça ? En attente de l\'hôte…</span>'}
      </div>`, { fermable: false });
    this.panneauFin = p;
    jouerSon((r.classement.find((c) => c.id === e.moi)?.bilan ?? 0) > 0 ? 'grosGain' : 'gagne');
    $('[data-sortir]', p.el).onclick = () => { p.fermer(); this.panneauFin = null; this.sortir(); };
    const rj = $('[data-rejouer]', p.el); if (rj) rj.onclick = () => this.canal.envoyer({ c: 'rejouer' });
  }

  /* ------------------------------ Chat ------------------------------ */

  private basculerChat(ouvrir?: boolean) { this.lateral.basculer(ouvrir); }


  private majNonLus() {
    const b = $('[data-nonlus]', this.el);
    b.textContent = this.nonLus > 9 ? '9+' : String(this.nonLus);
    b.classList.toggle('cache', this.nonLus === 0);
    this.lateral?.nonLus(this.nonLus);
  }

  private ajouterChat(m: MessageChat, nouveau: boolean) {
    const zone = $('[data-messages]', this.el);
    const moi = this.etat?.moi === m.de;
    zone.appendChild(html(`<div class="msg-chat ${moi ? 'moi' : ''}">${avatar(m.avatar, 'neutre', 30)}<div><span class="auteur">${esc(m.nom)}</span><div class="texte">${esc(m.texte)}</div></div></div>`));
    while (zone.children.length > 100) zone.firstElementChild!.remove();
    zone.scrollTop = zone.scrollHeight;
    if (!nouveau) return;
    if (!this.lateral.ouvert) {
      if (!moi) { this.nonLus++; this.majNonLus(); jouerSon('clic'); }
      const bulles = $('[data-bulles]', this.el);
      const bl = html(`<div class="bulle-chat">${avatar(m.avatar, 'neutre', 26)}<span><b>${esc(m.nom)}</b> ${esc(m.texte)}</span></div>`);
      bulles.appendChild(bl);
      while (bulles.children.length > 3) bulles.firstElementChild!.remove();
      setTimeout(() => { bl.classList.add('part'); setTimeout(() => bl.remove(), 400); }, 10000);
    }
  }

  /* ------------------------------ Menus ------------------------------ */

  private copierCode() {
    if (!this.etat) return;
    navigator.clipboard?.writeText(this.etat.code).then(() => toast(`Code ${this.etat!.code} copié`), () => toast(`Code : ${this.etat!.code}`));
  }

  private async quitter() {
    const e = this.etat;
    if (e && e.monSiege !== null && e.statut === 'en_jeu' && !(await confirmer(this.canal.casino ? 'Quitter la table ? Tes jetons retournent dans ton portefeuille.' : 'Quitter la table ?', 'Quitter', 'Rester'))) return;
    this.sortir();
  }

  private sortir() { this.canal.quitter(); this.onQuitter(); }

  private menu() {
    const e = this.etat;
    if (!e) return;
    const moi = e.monSiege !== null ? e.sieges[e.monSiege] : null;
    const hote = e.hote === e.moi;
    const p = panneau(`<h2>Menu</h2>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${hote && !this.canal.casino ? '<button class="btn btn-or" data-m="hote">Gérer la table (hôte)</button>' : ''}
        <button class="btn" data-m="regles">Comment jouer ?</button>
        <button class="btn" data-m="reglages">Mes réglages</button>
        ${this.canal.enLigne ? `<button class="btn" data-m="code">Code de la table : <b style="letter-spacing:2px">${esc(e.code)}</b></button>` : ''}
        ${moi && e.phase !== 'tirage' ? '<button class="btn" data-m="lever">Me lever (regarder)</button>' : ''}
        <button class="btn btn-corail" data-m="quitter">Quitter la table</button>
      </div>`);
    $$('[data-m]', p.el).forEach((b) => b.onclick = () => {
      p.fermer();
      switch (b.dataset.m) {
        case 'hote': return this.panneauHote();
        case 'regles': return ouvrirReglesRoulette();
        case 'code': return this.copierCode();
        case 'reglages': return ouvrirReglagesPerso();
        case 'lever': return this.canal.envoyer({ c: 'lever' });
        case 'quitter': return void this.quitter();
      }
    });
  }

  private panneauHote() {
    const e = this.etat;
    if (!e) return;
    const r = e.reglages;
    const humains = (e.sieges.filter(Boolean) as NonNullable<VueRoulette['sieges'][number]>[]).filter((s) => s.id !== e.moi);
    const p = panneau(`<h2>Gérer la table</h2>
      <div class="ligne" style="margin-bottom:6px">
        ${e.statut === 'en_jeu' ? '<button class="btn btn-petit" data-h="pause">Pause</button>' : ''}
        ${e.statut === 'pause' ? '<button class="btn btn-petit btn-vert" data-h="reprendre">Reprendre</button>' : ''}
        ${e.statut === 'attente' ? '<button class="btn btn-petit btn-or" data-h="lancer">Lancer</button>' : ''}
        ${e.statut === 'en_jeu' || e.statut === 'pause' ? '<button class="btn btn-petit btn-corail" data-h="terminer">Terminer la partie</button>' : ''}
        ${e.statut !== 'attente' ? '<button class="btn btn-petit" data-h="rejouer">Recommencer (jetons neufs)</button>' : ''}
      </div>
      ${humains.length ? `<hr class="sep"><h3 style="margin-bottom:6px">Joueurs</h3><div class="liste-joueurs">${humains.map((h) => `<div class="lj">${avatar(h.avatar, 'neutre', 38)}<span class="nom">${esc(h.nom)}${h.deconnecte ? ' <span class="doux petit">déconnecté</span>' : ''}</span>
        ${h.tapis + h.totalMise < r.miseMin ? `<button class="btn btn-petit btn-or" data-offrir="${h.id}">Offrir une recave</button>` : ''}
        <button class="btn btn-petit btn-fantome" data-exclure="${h.id}">Exclure</button></div>`).join('')}</div>` : ''}
      <hr class="sep">
      <h3 style="margin-bottom:10px">Réglages <span class="doux petit">(appliqués au tour suivant)</span></h3>
      <div class="grille2">
        <label class="champ"><span>Jeton minimum</span><select data-r="miseMin">${[1, 5, 10, 25].map((v) => `<option value="${v}" ${v === r.miseMin ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="champ"><span>Tours de roue</span><select data-r="tours">${[10, 20, 30, 50, 0].map((v) => `<option value="${v}" ${v === r.tours ? 'selected' : ''}>${v || 'Illimité'}</option>`).join('')}</select></label>
        <label class="champ"><span>Temps pour miser</span><select data-r="temps">${[15, 20, 30, 45, 0].map((v) => `<option value="${v}" ${v === r.tempsMises ? 'selected' : ''}>${v ? `${v} s` : 'Illimité'}</option>`).join('')}</select></label>
        <label class="champ"><span>Recaves</span><select data-r="recaves">${['interdites', 1, 2, 3, 5, 'illimitees'].map((v) => `<option value="${v}" ${String(v) === String(r.recaves) ? 'selected' : ''}>${v === 'interdites' ? 'Interdites' : v === 'illimitees' ? 'Illimitées' : `${v} par joueur`}</option>`).join('')}</select></label>
        <label class="champ"><span>La partage</span><select data-r="partage"><option value="1" ${r.partage ? 'selected' : ''}>Oui</option><option value="0" ${r.partage ? '' : 'selected'}>Non</option></select></label>
        <label class="champ"><span>Filtre des insultes</span><select data-r="filtre"><option value="1" ${r.filtreInsultes ? 'selected' : ''}>Activé</option><option value="0" ${r.filtreInsultes ? '' : 'selected'}>Désactivé</option></select></label>
      </div>
      <button class="btn btn-or btn-plein" data-h="enregistrer">Enregistrer les réglages</button>`);
    const envoyer = (cmd: CommandeRoulette) => this.canal.envoyer(cmd);
    $$('[data-h]', p.el).forEach((b) => b.onclick = async () => {
      switch (b.dataset.h) {
        case 'pause': envoyer({ c: 'pause' }); break;
        case 'reprendre': envoyer({ c: 'reprendre' }); break;
        case 'lancer': envoyer({ c: 'lancer' }); break;
        case 'terminer': if (await confirmer('Terminer la partie et afficher les résultats ?', 'Terminer')) envoyer({ c: 'terminer' }); break;
        case 'rejouer': if (await confirmer('Recommencer une partie avec des jetons neufs ?', 'Recommencer')) envoyer({ c: 'rejouer' }); break;
        case 'enregistrer': {
          const v = (k: string) => ($(`[data-r="${k}"]`, p.el) as HTMLSelectElement).value;
          const rc = v('recaves');
          const reglages: Partial<ReglagesRoulette> = {
            miseMin: Number(v('miseMin')), tours: Number(v('tours')), tempsMises: Number(v('temps')),
            recaves: rc === 'interdites' || rc === 'illimitees' ? rc : Number(rc), partage: v('partage') === '1', filtreInsultes: v('filtre') === '1',
          };
          envoyer({ c: 'reglages', reglages });
          break;
        }
      }
      p.fermer();
    });
    $$('[data-exclure]', p.el).forEach((b) => b.onclick = async () => { p.fermer(); if (await confirmer('Exclure ce joueur de la table ?', 'Exclure')) envoyer({ c: 'exclure', id: b.dataset.exclure! }); });
    $$('[data-offrir]', p.el).forEach((b) => b.onclick = () => { envoyer({ c: 'accorderRecave', id: b.dataset.offrir! }); p.fermer(); });
  }
}

/** Les règles, en petite leçon interactive. */
export function ouvrirReglesRoulette() { ouvrirApprendre('roulette'); }
