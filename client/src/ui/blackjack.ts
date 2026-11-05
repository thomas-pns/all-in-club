/**
 * Écran de Black Jack : la scène PixiJS + l'interface (mises, décisions, conseil, hôte, fin de partie).
 * Fonctionne en ligne (WebSocket) et en solo (salle locale), comme l'écran de poker.
 */
import type { CommandeBJ, MessageBJ, VueBJ, ReglagesBJ } from '../../../moteur/blackjack/salleBJ';
import type { MessageChat } from '../../../moteur/salle';
import type { ActionBJ } from '../../../moteur/blackjack/regles';
import { conseil } from '../../../moteur/blackjack/strategie';
import { EMOTES } from '../../../moteur/social';
import { emoteSVG } from '../art/emotes';
import { SceneBJ } from '../vue/sceneBJ';
import { jouerSon, reglerSon, debloquerSon } from '../vue/son';
import { fmt, JETONS } from '../art/rendu';
import { $, $$, esc, html, toast, panneau, confirmer, avatar, lirePrefs, suivrePrefs, ouvrirReglagesPerso } from './commun';
import { ChatLateral } from './chatLateral';

export interface CanalBJ {
  envoyer(cmd: CommandeBJ): void;
  quitter(): void;
  brancher(f: (m: MessageBJ) => void): () => void;
  enLigne: boolean;
}

const NOMS_ACTIONS: Record<ActionBJ, string> = { tirer: 'Tirer', rester: 'Rester', doubler: 'Doubler', separer: 'Séparer', abandonner: 'Abandon' };
const AIDE_ACTIONS: Record<ActionBJ, string> = { tirer: 'une carte', rester: 'je garde', doubler: 'mise ×2, 1 carte', separer: 'deux mains', abandonner: 'récupère ½' };
const COULEUR_ACTIONS: Record<ActionBJ, string> = { tirer: 'btn-vert', rester: 'btn-corail', doubler: 'btn-or', separer: 'btn-ciel', abandonner: '' };

const hexa = (n: number) => (n === 0x2a1e3f ? '#4A6FD6' : '#' + n.toString(16).padStart(6, '0'));

export class EcranBJ {
  private el: HTMLElement;
  private scene: SceneBJ | null = null;
  private file: Extract<MessageBJ, { type: 'majBJ' }>[] = [];
  private enCours = false;
  private etat: VueBJ | null = null;
  private debrancher: () => void;
  private detruit = false;
  private nettoyages: (() => void)[] = [];
  private panneauFin: { fermer: () => void } | null = null;
  private resultatsVus = '';
  private chat: MessageChat[] = [];
  private nonLus = 0;
  private lateral!: ChatLateral;
  /** Mise en préparation (phase des mises) et dernière mise jouée, pour « Même mise ». */
  private miseEnCours = 0;
  private derniereMise = 0;
  private mancheMise = -1;
  private cleBarre = '';
  private derniereAction = 0;
  private minuterieMises: ReturnType<typeof setInterval> | null = null;

  constructor(racine: HTMLElement, private canal: CanalBJ, private onQuitter: () => void) {
    this.el = html(`<div class="ecran-table ecran-bj">
      <div class="barre-haut">
        <button class="btn btn-rond btn-fantome" data-quitter title="Quitter la table" aria-label="Quitter">←</button>
        <div style="min-width:0"><div class="titre" data-nom>Black Jack</div><div class="infos" data-infos></div></div>
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
        <div class="bulle-conseil cache" data-conseil></div>
      </div>
      <div class="barre-actions barre-bj" data-barre></div>
    </div>`);
    racine.replaceChildren(this.el);
    this.lateral = new ChatLateral(this.el, () => { this.nonLus = 0; this.majNonLus(); });
    this.nettoyages.push(() => this.lateral.detruire());
    $('[data-quitter]', this.el).onclick = () => this.quitter();
    $('[data-menu]', this.el).onclick = () => this.menu();
    $('[data-regles]', this.el).onclick = () => ouvrirReglesBJ();
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
    const clavier = (e: KeyboardEvent) => this.clavier(e);
    document.addEventListener('keydown', clavier);
    this.nettoyages.push(() => document.removeEventListener('keydown', clavier));
    const p = lirePrefs();
    reglerSon(p.effets > 0, p.effets);
    this.nettoyages.push(suivrePrefs((p) => { reglerSon(p.effets > 0, p.effets); this.scene?.options({ quatreCouleurs: p.quatreCouleurs, vitesse: p.rapide ? 2 : 1 }); }));
    const vis = () => { if (document.visibilityState === 'visible') this.scene?.accelerer(); };
    document.addEventListener('visibilitychange', vis);
    this.nettoyages.push(() => document.removeEventListener('visibilitychange', vis));
    this.minuterieMises = setInterval(() => this.majCompteur(), 250);
    this.nettoyages.push(() => { if (this.minuterieMises) clearInterval(this.minuterieMises); });
    void this.initScene();
  }

  private async initScene() {
    await document.fonts.ready.catch(() => {});
    if (this.detruit) return;
    const p = lirePrefs();
    this.scene = await SceneBJ.creer($('[data-scene]', this.el), { quatreCouleurs: p.quatreCouleurs, vitesse: p.rapide ? 2 : 1 });
    if (this.detruit) { this.scene.detruire(); return; }
    this.scene.onClicPlace = (s) => { if (this.etat?.monSiege === null) this.canal.envoyer({ c: 'asseoir', siege: s }); };
    if (this.etat) this.scene.appliquerEtat(this.etat);
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

  private recevoir(m: MessageBJ) {
    if (m.type === 'info') return toast(m.texte);
    if (m.type === 'erreur') { this.cleBarre = ''; if (this.etat) this.majBarre(this.etat); return toast(m.texte, true); }
    if (m.type === 'exclu') return;
    if (m.type === 'chat') return this.ajouterChat(m.message, true);
    if (m.type === 'chatHistorique') { this.chat = []; $('[data-messages]', this.el).replaceChildren(); m.messages.forEach((x) => this.ajouterChat(x, false)); return; }
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

  private majInterface(e: VueBJ) {
    const r = e.reglages;
    $('[data-nom]', this.el).textContent = r.nom;
    const infos = [`Mise ${fmt(r.miseMin)} à ${fmt(r.miseMax)}`];
    if (e.numeroManche) infos.push(r.manches ? `Manche ${e.numeroManche}/${r.manches}` : `Manche ${e.numeroManche}`);
    if (e.spectateurs.length) infos.push(`👁 ${e.spectateurs.length}`);
    $('[data-infos]', this.el).textContent = infos.join(' · ');
    const code = $('[data-code]', this.el);
    code.textContent = e.code;
    code.classList.toggle('cache', !this.canal.enLigne);
    if (!e.legales) this.cacherConseil();
    this.majCentre(e);
    this.majBarre(e);
    this.majFin(e);
  }

  private majCentre(e: VueBJ) {
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
      <p class="doux" style="margin:6px 0 14px">${nb} joueur${nb > 1 ? 's' : ''} sur ${e.reglages.places} · ${fmt(e.reglages.tapisDepart)} jetons chacun${e.reglages.manches ? ` · ${e.reglages.manches} manches` : ''}</p>
      ${hote ? `<button class="btn btn-or" data-lancer>Lancer la partie</button>
        <p class="doux petit" style="margin:10px 0 0">Tout le monde joue contre le croupier : pas besoin d'attendre d'être plusieurs.</p>`
        : `<p>En attente de l'hôte…</p>`}
      <p style="margin:12px 0 0"><button class="lien" data-regles2>Jamais joué ? Les règles en 1 minute</button></p>`;
    const cp = $('[data-copier]', c); if (cp) cp.onclick = () => this.copierCode();
    const bl = $('[data-lancer]', c); if (bl) bl.onclick = () => { debloquerSon(); this.canal.envoyer({ c: 'lancer' }); };
    $('[data-regles2]', c).onclick = () => ouvrirReglesBJ();
  }

  /** Compte à rebours des mises dans la barre. */
  private majCompteur() {
    const e = this.etat;
    const el = $('[data-compte]', this.el);
    if (!el || !e || e.resteMs === null) return;
    const fin = Number(el.dataset.fin);
    el.textContent = `${Math.max(0, Math.ceil((fin - performance.now()) / 1000))} s`;
  }

  private majBarre(e: VueBJ) {
    const barre = $('[data-barre]', this.el);
    const moi = e.monSiege !== null ? e.sieges[e.monSiege] : null;
    const mains = moi?.mains ?? [];
    // Évite de reconstruire la barre (et de perdre la mise en préparation) quand rien ne change pour moi
    const cle = JSON.stringify([e.statut, e.phase, e.numeroManche, e.monSiege, moi?.pret, moi?.tapis, moi?.recavesRestantes, e.legales, e.assuranceAMoi, e.aParler, mains.map((m) => m.cartes.length)]);
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

    // À sec
    if (e.phase === 'mises' && moi.tapis < e.reglages.miseMin) {
      const r = moi.recavesRestantes;
      barre.innerHTML = `<div class="message-barre">${r > 0
        ? `Plus assez de jetons. <button class="btn btn-or btn-petit" data-recave>Se recaver (${fmt(e.reglages.tapisDepart)})</button><span class="doux petit">${r >= 99 ? 'illimité' : `${r} restante${r > 1 ? 's' : ''}`}</span>`
        : 'Plus assez de jetons et plus de recave. L\'hôte peut t\'en offrir une.'}</div>`;
      const b = $('[data-recave]', barre); if (b) b.onclick = () => this.canal.envoyer({ c: 'recave' });
      return;
    }

    if (e.phase === 'mises') {
      if (moi.pret) {
        barre.innerHTML = `<div class="message-barre">${moi.mise ? `Mise posée : <b class="or">${fmt(moi.mise)}</b>` : 'Tu passes cette manche'} · on attend les autres… <span class="compte" data-compte data-fin="${performance.now() + (e.resteMs ?? 0)}"></span></div>`;
        this.majCompteur();
        return;
      }
      this.afficherMises(barre, e, moi.tapis);
      return;
    }

    if (e.assuranceAMoi) {
      const m0 = mains[0];
      const cout = Math.floor((m0?.mise ?? 0) / 2);
      barre.innerHTML = `<div class="titre-barre">Le croupier montre un As</div>
        <div class="question-assurance">Prendre l'assurance pour <b>${fmt(cout)}</b> ? <span class="doux petit">Elle paie 2 contre 1 si le croupier a Black Jack.</span></div>
        <div class="actions-principales" style="grid-template-columns:1fr 1fr">
          <button class="btn btn-corail" data-ass="0"><span class="col">Non merci<small>conseillé</small></span></button>
          <button class="btn btn-ciel" data-ass="1" ${moi.tapis < cout ? 'disabled' : ''}>Assurance</button>
        </div>`;
      jouerSon('tour');
      $$('[data-ass]', barre).forEach((b) => b.onclick = () => { this.canal.envoyer({ c: 'assurance', oui: b.dataset.ass === '1' }); barre.innerHTML = '<div class="message-barre doux">…</div>'; });
      return;
    }

    if (e.legales && e.aParler) {
      const L = e.legales;
      jouerSon('tour');
      navigator.vibrate?.(40);
      const ordre: ActionBJ[] = ['tirer', 'rester', 'doubler', 'separer', 'abandonner'];
      const visibles = ordre.filter((a) => a !== 'abandonner' || L.abandonner).filter((a) => a !== 'separer' || L.separer);
      const main = mains[e.aParler.main];
      const plusieurs = mains.length > 1;
      barre.innerHTML = `<div class="ligne-conseil">
          <span class="titre-barre">${plusieurs ? `Main ${e.aParler.main + 1} sur ${mains.length} · ` : ''}${main ? `Tu as ${main.souple && main.total < 21 ? `${main.total - 10} ou ${main.total}` : main.total}` : ''}</span>
          <button class="btn btn-petit btn-fantome" data-conseil-btn>💡 Conseil</button>
        </div>
        <div class="actions-bj" style="--n:${visibles.length}">${visibles.map((a) => `<button class="btn ${COULEUR_ACTIONS[a]}" data-bj="${a}" ${L[a] ? '' : 'disabled'}><span class="col">${NOMS_ACTIONS[a]}<small>${AIDE_ACTIONS[a]}</small></span></button>`).join('')}</div>`;
      $$('[data-bj]', barre).forEach((b) => b.onclick = () => this.decider(b.dataset.bj as ActionBJ));
      $('[data-conseil-btn]', barre).onclick = () => this.montrerConseil(e);
      return;
    }

    if (e.phase === 'assurance') { barre.innerHTML = '<div class="message-barre doux">Les joueurs décident de l\'assurance…</div>'; return; }
    if (e.phase === 'jeu' && e.aParler) {
      const s = e.sieges[e.aParler.siege];
      barre.innerHTML = `<div class="message-barre doux">${mains.length && mains.every((m) => m.issue) ? '' : mains.length ? 'Ta main est jouée · ' : ''}${s ? `${esc(s.nom)} réfléchit…` : '…'}</div>`;
      return;
    }
    if (e.phase === 'croupier') { barre.innerHTML = '<div class="message-barre doux">Le croupier joue…</div>'; return; }
    if (e.phase === 'resultats') {
      const net = mains.reduce((s, m) => s + (m.issue ? m.retour - m.mise : 0), 0) + (moi.assurance ? 0 : 0);
      barre.innerHTML = mains.length
        ? `<div class="message-barre">${net > 0 ? `<b class="vert">+${fmt(net)}</b> cette manche !` : net < 0 ? `<b class="rouge">${fmt(net)}</b> cette manche` : 'Manche nulle'}</div>`
        : '<div class="message-barre doux">Prochaine manche dans un instant…</div>';
      return;
    }
    barre.innerHTML = '<div class="message-barre doux">Prochaine manche dans un instant…</div>';
  }

  private afficherMises(barre: HTMLElement, e: VueBJ, tapis: number) {
    const r = e.reglages;
    if (this.mancheMise !== e.numeroManche) { this.mancheMise = e.numeroManche; this.miseEnCours = 0; }
    const plafond = Math.min(r.miseMax, tapis);
    const jetons = JETONS.filter((j) => j.valeur >= Math.min(5, r.miseMin) && j.valeur <= plafond).slice(-5).reverse();
    const reprise = this.derniereMise >= r.miseMin && this.derniereMise <= plafond ? this.derniereMise : 0;
    barre.innerHTML = `<div class="ligne-conseil"><span class="titre-barre">Place ta mise · ${fmt(r.miseMin)} à ${fmt(r.miseMax)}</span><span class="compte" data-compte data-fin="${performance.now() + (e.resteMs ?? 0)}"></span></div>
      <div class="mises-bj">
        <div class="jetons-bj">${jetons.map((j) => `<button class="jeton-bj" data-jeton="${j.valeur}" style="--c:${hexa(j.couleur)}" title="+${fmt(j.valeur)}"><span>${j.valeur >= 1000 ? `${j.valeur / 1000}k` : j.valeur}</span></button>`).join('')}</div>
        <div class="montant-bj"><small>Ma mise</small><b data-mise>${fmt(this.miseEnCours)}</b></div>
      </div>
      <div class="actions-bj" style="--n:3">
        <button class="btn btn-fantome" data-m="passer"><span class="col">Passer<small>cette manche</small></span></button>
        <button class="btn" data-m="effacer"><span class="col" data-txt-eff>${reprise && !this.miseEnCours ? `Même mise<small>${fmt(reprise)}</small>` : 'Effacer'}</span></button>
        <button class="btn btn-or" data-m="miser" disabled><span class="col">Miser<small data-mt>${fmt(this.miseEnCours)}</small></span></button>
      </div>`;
    this.majCompteur();
    const maj = () => {
      $('[data-mise]', barre).textContent = fmt(this.miseEnCours);
      $('[data-mt]', barre).textContent = fmt(this.miseEnCours);
      ($('[data-m="miser"]', barre) as HTMLButtonElement).disabled = this.miseEnCours < r.miseMin;
      $('[data-txt-eff]', barre).innerHTML = reprise && !this.miseEnCours ? `Même mise<small>${fmt(reprise)}</small>` : 'Effacer';
      $$<HTMLButtonElement>('[data-jeton]', barre).forEach((b) => (b.disabled = this.miseEnCours + Number(b.dataset.jeton) > plafond));
    };
    maj();
    $$('[data-jeton]', barre).forEach((b) => b.onclick = () => {
      const v = Number(b.dataset.jeton);
      if (this.miseEnCours + v > plafond) return;
      this.miseEnCours += v;
      jouerSon('jeton');
      b.classList.remove('saute'); void b.offsetWidth; b.classList.add('saute');
      maj();
    });
    $('[data-m="effacer"]', barre).onclick = () => {
      if (!this.miseEnCours && reprise) { this.miseEnCours = reprise; jouerSon('jetons'); }
      else { this.miseEnCours = 0; jouerSon('clic'); }
      maj();
    };
    $('[data-m="miser"]', barre).onclick = () => {
      if (this.miseEnCours < r.miseMin) return;
      debloquerSon();
      this.derniereMise = this.miseEnCours;
      this.canal.envoyer({ c: 'miser', montant: this.miseEnCours });
    };
    $('[data-m="passer"]', barre).onclick = () => this.canal.envoyer({ c: 'miser', montant: 0 });
  }

  private decider(a: ActionBJ) {
    const t = Date.now();
    if (t - this.derniereAction < 300) return;
    this.derniereAction = t;
    debloquerSon();
    this.cacherConseil();
    this.canal.envoyer({ c: 'decision', action: a });
    $('[data-barre]', this.el).innerHTML = '<div class="message-barre doux">…</div>';
    this.cleBarre = '';
  }

  private montrerConseil(e: VueBJ) {
    const moi = e.monSiege !== null ? e.sieges[e.monSiege] : null;
    const main = moi && e.aParler ? moi.mains[e.aParler.main] : null;
    const up = e.croupier.cartes[0];
    if (!main || !e.legales || up === null || up === undefined) return;
    const c = conseil(main.cartes, up, e.legales);
    const bulle = $('[data-conseil]', this.el);
    bulle.innerHTML = `<div class="titre-conseil">💡 Le conseil du pro : <b>${NOMS_ACTIONS[c.action]}</b></div><div>${esc(c.pourquoi)}</div>`;
    bulle.classList.remove('cache');
    $$('[data-bj]', this.el).forEach((b) => b.classList.toggle('conseille', b.dataset.bj === c.action));
    jouerSon('clic');
  }

  private cacherConseil() {
    $('[data-conseil]', this.el)?.classList.add('cache');
  }

  private clavier(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input[type=text],input[type=number],select,textarea') || $('.voile')) return;
    const barre = $('[data-barre]', this.el);
    const k = e.key.toLowerCase();
    const clic = (sel: string) => { const b = $(sel, barre) as HTMLButtonElement | null; if (b && !b.disabled) { e.preventDefault(); b.click(); } };
    const touches: Record<string, string> = { t: '[data-bj="tirer"]', h: '[data-bj="tirer"]', r: '[data-bj="rester"]', s: '[data-bj="rester"]', d: '[data-bj="doubler"]', p: '[data-bj="separer"]', a: '[data-bj="abandonner"]', enter: '[data-m="miser"]' };
    if (touches[k]) clic(touches[k]);
  }

  /* ------------------------------ Fin de partie ------------------------------ */

  private majFin(e: VueBJ) {
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
        <div style="font-family:Fredoka;font-size:20px">${top[0].bilan > 0 ? 'Tu as battu le casino !' : top[0].bilan === 0 ? 'Pile à l\'équilibre' : 'Le casino gagne cette fois…'}</div>
        <div class="bilan ${top[0].bilan >= 0 ? 'plus' : 'moins'}" style="font-family:Fredoka;font-size:30px;font-weight:700">${signe(top[0].bilan)}</div></div>` : ''}
      ${r.classement.length > 1 ? `<table class="classement">${r.classement.map((c, i) => `<tr><td>${i + 1}.</td><td>${esc(c.nom)}</td><td class="bilan ${c.bilan >= 0 ? 'plus' : 'moins'}">${signe(c.bilan)}</td></tr>`).join('')}</table>` : ''}
      ${r.distinctions.length ? `<div class="distinctions">${r.distinctions.map((d) => `<div><b>${esc(d.titre)}</b>${esc(nomDe(d.id))}<div class="doux petit">${esc(d.detail)}</div></div>`).join('')}</div>` : ''}
      <p class="doux petit" style="text-align:center">${r.manches} manche${r.manches > 1 ? 's' : ''} jouée${r.manches > 1 ? 's' : ''}</p>
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
    this.chat.push(m);
    if (this.chat.length > 100) this.chat.shift();
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
    if (e && e.monSiege !== null && e.statut === 'en_jeu' && !(await confirmer('Quitter la table ?', 'Quitter', 'Rester'))) return;
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
        ${hote ? '<button class="btn btn-or" data-m="hote">Gérer la table (hôte)</button>' : ''}
        <button class="btn" data-m="regles">Comment jouer ?</button>
        <button class="btn" data-m="reglages">Mes réglages</button>
        ${this.canal.enLigne ? `<button class="btn" data-m="code">Code de la table : <b style="letter-spacing:2px">${esc(e.code)}</b></button>` : ''}
        ${moi && e.statut !== 'en_jeu' ? '<button class="btn" data-m="lever">Me lever (regarder)</button>' : ''}
        <button class="btn btn-corail" data-m="quitter">Quitter la table</button>
      </div>`);
    $$('[data-m]', p.el).forEach((b) => b.onclick = () => {
      p.fermer();
      switch (b.dataset.m) {
        case 'hote': return this.panneauHote();
        case 'regles': return ouvrirReglesBJ();
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
    const humains = (e.sieges.filter(Boolean) as NonNullable<VueBJ['sieges'][number]>[]).filter((s) => s.id !== e.moi);
    const p = panneau(`<h2>Gérer la table</h2>
      <div class="ligne" style="margin-bottom:6px">
        ${e.statut === 'en_jeu' ? '<button class="btn btn-petit" data-h="pause">Pause</button>' : ''}
        ${e.statut === 'pause' ? '<button class="btn btn-petit btn-vert" data-h="reprendre">Reprendre</button>' : ''}
        ${e.statut === 'attente' ? '<button class="btn btn-petit btn-or" data-h="lancer">Lancer</button>' : ''}
        ${e.statut === 'en_jeu' || e.statut === 'pause' ? '<button class="btn btn-petit btn-corail" data-h="terminer">Terminer la partie</button>' : ''}
        ${e.statut !== 'attente' ? '<button class="btn btn-petit" data-h="rejouer">Recommencer (jetons neufs)</button>' : ''}
      </div>
      ${humains.length ? `<hr class="sep"><h3 style="margin-bottom:6px">Joueurs</h3><div class="liste-joueurs">${humains.map((h) => `<div class="lj">${avatar(h.avatar, 'neutre', 38)}<span class="nom">${esc(h.nom)}${h.deconnecte ? ' <span class="doux petit">déconnecté</span>' : ''}</span>
        ${h.tapis < r.miseMin ? `<button class="btn btn-petit btn-or" data-offrir="${h.id}">Offrir une recave</button>` : ''}
        <button class="btn btn-petit btn-fantome" data-exclure="${h.id}">Exclure</button></div>`).join('')}</div>` : ''}
      <hr class="sep">
      <h3 style="margin-bottom:10px">Réglages <span class="doux petit">(appliqués à la manche suivante)</span></h3>
      <div class="grille2">
        <label class="champ"><span>Mise minimum</span><select data-r="miseMin">${[5, 10, 25, 50, 100].map((v) => `<option value="${v}" ${v === r.miseMin ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="champ"><span>Manches</span><select data-r="manches">${[10, 20, 30, 50, 0].map((v) => `<option value="${v}" ${v === r.manches ? 'selected' : ''}>${v ? v : 'Illimité'}</option>`).join('')}</select></label>
        <label class="champ"><span>Recaves</span><select data-r="recaves">${['interdites', 1, 2, 3, 5, 'illimitees'].map((v) => `<option value="${v}" ${String(v) === String(r.recaves) ? 'selected' : ''}>${v === 'interdites' ? 'Interdites' : v === 'illimitees' ? 'Illimitées' : `${v} par joueur`}</option>`).join('')}</select></label>
        <label class="champ"><span>Temps de réflexion</span><select data-r="temps">${[10, 20, 30, 0].map((v) => `<option value="${v}" ${v === r.tempsReflexion ? 'selected' : ''}>${v ? `${v} s` : 'Illimité'}</option>`).join('')}</select></label>
        <label class="champ"><span>Abandon</span><select data-r="abandon"><option value="1" ${r.abandon ? 'selected' : ''}>Autorisé</option><option value="0" ${r.abandon ? '' : 'selected'}>Interdit</option></select></label>
        <label class="champ"><span>Filtre des insultes</span><select data-r="filtre"><option value="1" ${r.filtreInsultes ? 'selected' : ''}>Activé</option><option value="0" ${r.filtreInsultes ? '' : 'selected'}>Désactivé</option></select></label>
      </div>
      <button class="btn btn-or btn-plein" data-h="enregistrer">Enregistrer les réglages</button>`);
    const envoyer = (cmd: CommandeBJ) => this.canal.envoyer(cmd);
    $$('[data-h]', p.el).forEach((b) => b.onclick = async () => {
      switch (b.dataset.h) {
        case 'pause': envoyer({ c: 'pause' }); break;
        case 'reprendre': envoyer({ c: 'reprendre' }); break;
        case 'lancer': envoyer({ c: 'lancer' }); break;
        case 'terminer': if (await confirmer('Terminer la partie et afficher les résultats ?', 'Terminer')) envoyer({ c: 'terminer' }); break;
        case 'rejouer': if (await confirmer('Recommencer une partie avec des jetons neufs ?', 'Recommencer')) envoyer({ c: 'rejouer' }); break;
        case 'enregistrer': {
          const v = (k: string) => ($(`[data-r="${k}"]`, p.el) as HTMLSelectElement).value;
          const miseMin = Number(v('miseMin'));
          const rc = v('recaves');
          const reglages: Partial<ReglagesBJ> = {
            miseMin, miseMax: miseMin * 50, manches: Number(v('manches')), tempsReflexion: Number(v('temps')),
            recaves: rc === 'interdites' || rc === 'illimitees' ? rc : Number(rc), abandon: v('abandon') === '1', filtreInsultes: v('filtre') === '1',
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

/** Les règles du Black Jack, expliquées simplement. */
export function ouvrirReglesBJ() {
  const p = panneau(`<h2>Le Black Jack en 1 minute</h2>
    <div class="regles-bj">
      <p><b>Le but :</b> battre le croupier en s'approchant le plus possible de <b>21</b>, sans le dépasser. Chacun joue contre le croupier, pas contre les autres joueurs.</p>
      <p><b>Valeur des cartes :</b> 2 à 10 = leur valeur · Valet, Dame, Roi = 10 · As = 1 ou 11 (au mieux pour toi). Une main avec un As compté 11 est dite « souple » : on l'affiche « 7/17 ».</p>
      <p><b>Déroulé :</b> tu mises, tu reçois 2 cartes visibles, le croupier en a une visible et une cachée. Puis tu choisis :</p>
      <ul>
        <li><b>Tirer</b> : une carte de plus. Au-delà de 21, tu as perdu.</li>
        <li><b>Rester</b> : tu gardes ta main.</li>
        <li><b>Doubler</b> : sur tes 2 premières cartes, tu doubles ta mise et reçois exactement une carte.</li>
        <li><b>Séparer</b> : avec une paire, tu en fais deux mains (même mise sur chacune).</li>
        <li><b>Abandon</b> : sur tes 2 premières cartes, tu renonces et récupères la moitié de ta mise.</li>
      </ul>
      <p><b>Le croupier</b> retourne sa carte et tire obligatoirement jusqu'à 16, puis s'arrête à 17 ou plus. S'il dépasse 21, tous les joueurs encore en jeu gagnent.</p>
      <p><b>Paiements :</b> gagné = ta mise ×2 · <b>Black Jack</b> (As + figure ou 10 dès les 2 premières cartes) = payé 3 contre 2 · égalité = mise rendue.</p>
      <p><b>Assurance :</b> quand le croupier montre un As, tu peux payer la moitié de ta mise pour te protéger d'un Black Jack. Elle paie 2 contre 1… mais sur le long terme, mieux vaut la refuser.</p>
      <p>💡 Bloqué ? Le bouton <b>Conseil</b> te donne le meilleur coup selon la « stratégie de base », celle des pros.</p>
    </div>
    <button class="btn btn-or btn-plein" data-ok>C'est parti !</button>`);
  $('[data-ok]', p.el).onclick = () => p.fermer();
}
