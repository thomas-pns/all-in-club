/**
 * Écran de table : la scène PixiJS + l'interface HTML (actions, hôte, attente, fin de partie).
 * Fonctionne de la même façon en ligne (WebSocket) et en solo (salle locale).
 */
import type { CommandeClient, MessageSalle, VueSalle, ReglagesSalle, Resultats, MessageChat } from '../../../moteur/salle';
import type { EnregistrementMain } from '../../../moteur/analyse';
import { EMOTES } from '../../../moteur/social';
import { emoteSVG } from '../art/emotes';
import { ouvrirHistorique } from './historique';
import type { Legales, Action } from '../../../moteur/main';
import { Scene } from '../vue/scene';
import { jouerSon, reglerSon, debloquerSon } from '../vue/son';
import { fmt } from '../art/rendu';
import { $, $$, esc, html, toast, panneau, confirmer, avatar, lirePrefs, suivrePrefs, ouvrirReglagesPerso, ecrirePrefs } from './commun';
import { ChatLateral } from './chatLateral';

export interface Canal {
  envoyer(cmd: CommandeClient): void;
  quitter(): void;
  brancher(f: (m: MessageSalle) => void): () => void;
  enLigne: boolean;
}

type PreAction = 'parole_couche' | 'parole' | 'suivre_tout' | null;

export class EcranTable {
  private el: HTMLElement;
  private scene: Scene | null = null;
  private file: Extract<MessageSalle, { type: 'maj' }>[] = [];
  private enCours = false;
  private etat: VueSalle | null = null;
  private debrancher: () => void;
  private preAction: PreAction = null;
  private mainPreAction = -1;
  private panneauFin: { fermer: () => void } | null = null;
  private resultatsVus: Resultats | null = null;
  private derniereAction = 0;
  private detruit = false;
  private nettoyages: (() => void)[] = [];
  private revele = false;

  /** Le nom de ma main reste masqué en mode « cartes cachées ». */
  private majMaMain() {
    $('.ma-main', this.el)?.classList.toggle('masquee', lirePrefs().cartesCachees && !this.revele);
  }

  private chat: MessageChat[] = [];
  private nonLus = 0;
  private lateral!: ChatLateral;
  private attenteHistorique: ((m: EnregistrementMain[]) => void) | null = null;
  private masques = new Set<string>(lireMasques());

  constructor(racine: HTMLElement, private canal: Canal, private onQuitter: () => void, private opts: { dos?: string; mesMains?: () => Promise<EnregistrementMain[]> } = {}) {
    this.el = html(`<div class="ecran-table">
      <div class="barre-haut">
        <button class="btn btn-rond btn-fantome" data-quitter title="Quitter la table" aria-label="Quitter">←</button>
        <div style="min-width:0"><div class="titre" data-nom>Table</div><div class="infos" data-infos></div></div>
        <div class="espace"></div>
        <span class="code cache" data-code title="Copier le code"></span>
        <button class="btn btn-rond btn-fantome" data-emotes title="Émotes" aria-label="Émotes">😀</button>
        <button class="btn btn-rond btn-fantome bouton-chat" data-chat title="Chat" aria-label="Chat">💬<span class="pastille-non-lus cache" data-nonlus></span></button>
        <button class="btn btn-rond btn-fantome" data-cacher title="Cacher mes cartes (jeu côte à côte)" aria-label="Cacher mes cartes"></button>
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
      <div class="barre-actions" data-barre></div>
    </div>`);
    racine.replaceChildren(this.el);
    this.lateral = new ChatLateral(this.el, () => { this.nonLus = 0; this.majNonLus(); });
    this.nettoyages.push(() => this.lateral.detruire());
    $('[data-quitter]', this.el).onclick = () => this.quitter();
    $('[data-menu]', this.el).onclick = () => this.menu();
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
    const bCacher = $('[data-cacher]', this.el);
    const majCacher = () => { const on = lirePrefs().cartesCachees; bCacher.textContent = on ? '🙈' : '👁'; bCacher.classList.toggle('btn-or', on); bCacher.classList.toggle('btn-fantome', !on); };
    majCacher();
    bCacher.onclick = () => { ecrirePrefs({ cartesCachees: !lirePrefs().cartesCachees }); toast(lirePrefs().cartesCachees ? 'Cartes cachées : survole-les ou maintiens le doigt dessus pour les voir' : 'Cartes visibles'); };
    this.nettoyages.push(suivrePrefs(majCacher));
    this.debrancher = canal.brancher((m) => this.recevoir(m));
    const clavier = (e: KeyboardEvent) => this.clavier(e);
    document.addEventListener('keydown', clavier);
    this.nettoyages.push(() => document.removeEventListener('keydown', clavier));
    const deb = () => debloquerSon();
    document.addEventListener('pointerdown', deb);
    this.nettoyages.push(() => document.removeEventListener('pointerdown', deb));
    const p = lirePrefs();
    reglerSon(p.effets > 0, p.effets);
    this.nettoyages.push(suivrePrefs((p) => {
      reglerSon(p.effets > 0, p.effets);
      this.scene?.options({ quatreCouleurs: p.quatreCouleurs, vitesse: p.rapide ? 2 : 1, cartesCachees: p.cartesCachees });
      this.majMaMain();
    }));
    const vis = () => { if (document.visibilityState === 'visible') this.scene?.accelerer(); };
    document.addEventListener('visibilitychange', vis);
    this.nettoyages.push(() => document.removeEventListener('visibilitychange', vis));
    void this.initScene();
  }

  private async initScene() {
    await document.fonts.ready.catch(() => {});
    if (this.detruit) return;
    const p = lirePrefs();
    this.scene = await Scene.creer($('[data-scene]', this.el), { quatreCouleurs: p.quatreCouleurs, vitesse: p.rapide ? 2 : 1, cartesCachees: p.cartesCachees, dos: this.opts.dos });
    this.scene.onRevele = (v) => { this.revele = v; this.majMaMain(); };
    if (this.detruit) { this.scene.detruire(); return; }
    this.scene.onClicSiegeVide = (s) => { if (this.etat?.monSiege === null) this.canal.envoyer({ c: 'asseoir', siege: s }); };
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

  private recevoir(m: MessageSalle) {
    if (m.type === 'info') return toast(m.texte);
    if (m.type === 'erreur') return toast(m.texte, true);
    if (m.type === 'exclu') return;
    if (m.type === 'chat') return this.ajouterChat(m.message, true);
    if (m.type === 'chatHistorique') { this.chat = []; m.messages.forEach((x) => this.ajouterChat(x, false)); return; }
    if (m.type === 'emote') { if (m.siege !== null && !this.masques.has(m.de)) void this.scene?.afficherEmote(m.siege, m.id); return; }
    if (m.type === 'historique') { this.attenteHistorique?.(m.mains); this.attenteHistorique = null; return; }
    this.file.push(m);
    void this.traiter();
  }

  private async traiter() {
    if (this.enCours || !this.scene) return;
    this.enCours = true;
    try {
      while (this.file.length && !this.detruit) {
        const m = this.file.shift()!;
        // Retard trop important (onglet en arrière-plan) : on saute les animations
        if (this.file.length > 3) { this.scene.accelerer(); this.scene.appliquerEtat(m.etat); }
        else {
          // L'interface (boutons) se met à jour avant l'animation si c'est déjà à moi de jouer
          if (!m.evenements.length) this.scene.appliquerEtat(m.etat);
          else await this.scene.jouer(m.evenements, m.etat);
        }
        this.etat = m.etat;
        this.majInterface(m.etat);
      }
    } finally {
      this.enCours = false;
    }
  }

  /* ------------------------------ Interface ------------------------------ */

  private majInterface(e: VueSalle) {
    const r = e.reglages;
    $('[data-nom]', this.el).textContent = r.nom;
    const infos = [`Blindes ${fmt(r.pb)}/${fmt(r.gb)}`];
    if (e.numeroMain) infos.push(`Main ${e.numeroMain}`);
    if (e.finPrevue !== null) infos.push(`Fin dans ${Math.ceil(e.finPrevue / 60000)} min`);
    if (e.spectateurs.length) infos.push(`👁 ${e.spectateurs.length}`);
    $('[data-infos]', this.el).textContent = infos.join(' · ');
    const code = $('[data-code]', this.el);
    code.textContent = e.code;
    code.classList.toggle('cache', !this.canal.enLigne);
    this.majCentre(e);
    this.majBarre(e);
    this.majFin(e);
  }

  /** Panneau central pendant l'attente du lancement ou la pause. */
  private majCentre(e: VueSalle) {
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
      <p class="doux" style="margin:6px 0 14px">${nb} joueur${nb > 1 ? 's' : ''} sur ${e.reglages.places} · tapis de ${fmt(e.reglages.tapisDepart)}</p>
      ${hote ? `<div class="ligne" style="justify-content:center">
          <button class="btn btn-petit" data-bot ${nb >= e.reglages.places ? 'disabled' : ''}>+ Bot</button>
          <button class="btn btn-or" data-lancer ${nb < 2 ? 'disabled' : ''}>Lancer la partie</button></div>
          ${nb < 2 ? '<p class="doux petit" style="margin:10px 0 0">Il faut au moins 2 joueurs : attends tes potes ou ajoute un bot.</p>' : ''}`
        : `<p>En attente de l'hôte…</p>`}`;
    const cp = $('[data-copier]', c); if (cp) cp.onclick = () => this.copierCode();
    const bl = $('[data-lancer]', c); if (bl) bl.onclick = () => { debloquerSon(); this.canal.envoyer({ c: 'lancer' }); };
    const bb = $('[data-bot]', c); if (bb) bb.onclick = () => this.canal.envoyer({ c: 'ajouterBot' });
  }

  private majBarre(e: VueSalle) {
    const barre = $('[data-barre]', this.el);
    const moi = e.monSiege !== null ? e.sieges[e.monSiege] : null;
    if (e.numeroMain !== this.mainPreAction) { this.preAction = null; this.mainPreAction = e.numeroMain; }

    const maMain = '';

    if (e.statut === 'terminee') { barre.innerHTML = `<div class="message-barre">Partie terminée</div>`; return; }
    if (!moi) {
      const libre = e.sieges.slice(0, e.reglages.places).some((s) => !s) || e.sieges.length < e.reglages.places;
      barre.innerHTML = `<div class="message-barre">👁 Tu regardes la partie ${libre ? '<button class="btn btn-petit btn-or" data-asseoir>S\'asseoir</button>' : ''}</div>`;
      const b = $('[data-asseoir]', barre); if (b) b.onclick = () => this.canal.envoyer({ c: 'asseoir' });
      return;
    }
    if (e.statut === 'attente' || e.statut === 'pause') { barre.innerHTML = maMain; return; }

    // À moi de jouer
    if (e.legales) {
      if (this.appliquerPreAction(e.legales)) { barre.innerHTML = maMain; return; }
      this.afficherActions(barre, e, e.legales, maMain);
      return;
    }

    if (moi.dansLaMain && !moi.couche && !moi.aTapis && e.mainEnCours) {
      const L = e.aParler !== null ? e : null; void L;
      const miseMax = Math.max(...e.sieges.map((s) => s?.mise ?? 0));
      const aSuivre = miseMax - moi.mise;
      const bascule = (v: PreAction, texte: string) => `<button class="bascule ${this.preAction === v ? 'on' : ''}" data-pre="${v}"><span class="voyant"></span>${texte}</button>`;
      barre.innerHTML = `<div class="titre-barre">Prépare ta réponse</div><div class="pre-actions" style="--n:${aSuivre === 0 ? 3 : 2}">
        ${bascule('parole_couche', aSuivre > 0 ? 'Me coucher' : 'Parole / Couché')}
        ${aSuivre === 0 ? bascule('parole', 'Parole') : ''}
        ${bascule('suivre_tout', aSuivre > 0 ? `Suivre ${fmt(Math.min(aSuivre, moi.tapis))}` : 'Suivre tout')}
      </div>`;
      $$('[data-pre]', barre).forEach((b) => b.onclick = () => {
        const v = b.dataset.pre as PreAction;
        this.preAction = this.preAction === v ? null : v;
        $$('[data-pre]', barre).forEach((x) => x.classList.toggle('on', x.dataset.pre === this.preAction));
        jouerSon('clic');
      });
      return;
    }

    const recaves = moi.recavesRestantes;
    if (moi.tapis === 0 && !e.mainEnCours || (moi.tapis === 0 && !moi.dansLaMain)) {
      barre.innerHTML = `<div class="message-barre">${recaves > 0
        ? `Tu es à sec. <button class="btn btn-or btn-petit" data-recave>Se recaver (${fmt(e.reglages.tapisDepart)})</button><span class="doux petit">${recaves >= 99 ? 'illimité' : `${recaves} restante${recaves > 1 ? 's' : ''}`}</span>`
        : 'Tu es à sec et il ne reste plus de recave. L\'hôte peut t\'en offrir une.'}</div>`;
      const b = $('[data-recave]', barre); if (b) b.onclick = () => this.canal.envoyer({ c: 'recave' });
      return;
    }
    if (moi.absent) {
      barre.innerHTML = `<div class="message-barre">Tu es absent. <button class="btn btn-or btn-petit" data-retour>Je reviens</button></div>`;
      $('[data-retour]', barre).onclick = () => this.canal.envoyer({ c: 'retour', poster: true });
      return;
    }
    if (moi.attendGB) {
      barre.innerHTML = `<div class="message-barre">Tu recevras des cartes à la grosse blinde. <button class="btn btn-petit" data-poster>Payer ${fmt(e.reglages.gb)} pour jouer maintenant</button></div>`;
      $('[data-poster]', barre).onclick = () => this.canal.envoyer({ c: 'poster' });
      return;
    }
    barre.innerHTML = '<div class="message-barre doux">Prochaine main dans un instant…</div>';
  }

  private appliquerPreAction(L: Legales): boolean {
    const p = this.preAction;
    if (!p) return false;
    this.preAction = null;
    if (p === 'parole_couche') { this.agir(L.peutParler ? { type: 'parole' } : { type: 'coucher' }); return true; }
    if (p === 'parole') { if (L.peutParler) { this.agir({ type: 'parole' }); return true; } return false; }
    if (p === 'suivre_tout') { this.agir(L.peutParler ? { type: 'parole' } : { type: 'suivre' }); return true; }
    return false;
  }

  private afficherActions(barre: HTMLElement, e: VueSalle, L: Legales, maMain: string) {
    const moi = e.sieges[e.monSiege!]!;
    jouerSon('tour');
    navigator.vibrate?.(40);
    const pas = e.reglages.pb;
    const potApresSuivre = e.potTotal + L.aSuivre;
    const miseActuelle = moi.mise + L.aSuivre;
    const tapisTotal = L.aSuivre >= moi.tapis;
    const verbe = L.estMise ? 'Miser' : 'Relancer à';
    barre.innerHTML = `${maMain}
      ${L.peutRelancer && L.minA < L.maxA ? `<div class="curseur-mise">
        <div class="raccourcis">
          <button data-r="min">Min</button><button data-r="0.5">½ pot</button><button data-r="0.75">¾ pot</button><button data-r="1">Pot</button><button data-r="max" class="tapis">Tapis</button>
        </div>
        <div class="reglage-mise">
          <button class="pas" data-pas="-1" aria-label="Moins">−</button>
          <div class="glissiere"><input type="range" min="${L.minA}" max="${L.maxA}" step="${pas}" value="${L.minA}" data-curseur aria-label="Montant"></div>
          <button class="pas" data-pas="1" aria-label="Plus">+</button>
          <span class="montant" data-montant>${fmt(L.minA)}</span>
        </div>
      </div>` : ''}
      <div class="actions-principales">
        <button class="btn btn-corail" data-a="coucher">Se coucher</button>
        <button class="btn btn-vert" data-a="suivre"><span class="col">${L.peutParler ? 'Parole' : tapisTotal ? 'Tapis' : 'Suivre'}${L.peutParler ? '' : `<small>${fmt(L.aSuivre)}</small>`}</span></button>
        <button class="btn btn-or" data-a="relancer" ${L.peutRelancer ? '' : 'disabled'}><span class="col"><span data-verbe>${L.minA >= L.maxA ? 'Tapis' : verbe}</span><small data-mt>${fmt(L.minA)}</small></span></button>
      </div>`;
    const curseur = $('[data-curseur]', barre) as HTMLInputElement | null;
    const montant = () => (curseur ? Number(curseur.value) : L.minA);
    const majMontant = () => {
      const v = montant();
      if (curseur) curseur.style.setProperty('--rempli', `${((v - L.minA) / Math.max(1, L.maxA - L.minA)) * 100}%`);
      const m = $('[data-montant]', barre); if (m) m.textContent = fmt(v);
      $('[data-mt]', barre).textContent = fmt(v);
      $('[data-verbe]', barre).textContent = v >= L.maxA ? 'Tapis' : verbe;
    };
    if (curseur) curseur.oninput = majMontant;
    majMontant();
    // Boutons − / + : une grosse blinde par appui, en continu si on maintient
    const pasMise = Math.max(pas, e.reglages.gb);
    $$('[data-pas]', barre).forEach((b) => {
      let minuterie: ReturnType<typeof setTimeout> | null = null;
      const pousser = () => {
        if (!curseur) return;
        const v = Math.max(L.minA, Math.min(L.maxA, Math.round((Number(curseur.value) + Number(b.dataset.pas) * pasMise) / pas) * pas));
        curseur.value = String(v);
        $$('[data-r]', barre).forEach((x) => x.classList.remove('on'));
        majMontant();
        jouerSon('jeton');
      };
      const arreter = () => { if (minuterie) clearTimeout(minuterie); minuterie = null; };
      const repeter = (d: number) => { pousser(); minuterie = setTimeout(() => repeter(Math.max(45, d * 0.8)), d); };
      b.onpointerdown = (ev) => { ev.preventDefault(); arreter(); repeter(380); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = arreter;
    });
    if (curseur) curseur.addEventListener('input', () => $$('[data-r]', barre).forEach((x) => x.classList.remove('on')));
    $$('[data-r]', barre).forEach((b) => b.onclick = () => {
      if (!curseur) return;
      $$('[data-r]', barre).forEach((x) => x.classList.toggle('on', x === b));
      const r = b.dataset.r!;
      let v = r === 'min' ? L.minA : r === 'max' ? L.maxA : L.estMise ? e.potTotal * Number(r) : miseActuelle + potApresSuivre * Number(r);
      v = Math.round(v / pas) * pas;
      curseur.value = String(Math.max(L.minA, Math.min(L.maxA, v)));
      majMontant();
      jouerSon('clic');
    });
    $('[data-a="coucher"]', barre).onclick = async () => {
      if (L.peutParler && !(await confirmer('Te coucher alors que tu peux parler gratuitement ?', 'Me coucher', 'Annuler'))) return;
      this.agir({ type: 'coucher' });
    };
    $('[data-a="suivre"]', barre).onclick = () => this.agir(L.peutParler ? { type: 'parole' } : { type: 'suivre' });
    $('[data-a="relancer"]', barre).onclick = () => {
      const v = montant();
      this.agir(v >= L.maxA ? { type: 'tapis' } : { type: L.estMise ? 'miser' : 'relancer', a: v });
    };
  }

  private agir(action: Action) {
    const t = Date.now();
    if (t - this.derniereAction < 300) return; // double clic
    this.derniereAction = t;
    debloquerSon();
    this.canal.envoyer({ c: 'action', action });
    $('[data-barre]', this.el).innerHTML = '';
  }

  private clavier(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input[type=text],input[type=number],select,textarea') || $('.voile')) return;
    const barre = $('[data-barre]', this.el);
    const k = e.key.toLowerCase();
    const clic = (sel: string) => { const b = $(sel, barre) as HTMLButtonElement | null; if (b && !b.disabled) { e.preventDefault(); b.click(); } };
    if (k === 'f') clic('[data-a="coucher"]');
    else if (k === 'c' || k === ' ') clic('[data-a="suivre"]');
    else if (k === 'r' || k === 'enter') clic('[data-a="relancer"]');
    else if (k === 'arrowup' || k === 'arrowdown') {
      const c = $('[data-curseur]', barre) as HTMLInputElement | null;
      if (!c) return;
      e.preventDefault();
      c.value = String(Number(c.value) + (k === 'arrowup' ? 1 : -1) * Number(c.step) * (e.shiftKey ? 5 : 1));
      c.dispatchEvent(new Event('input'));
    }
  }

  /* ------------------------------ Fin de partie ------------------------------ */

  private majFin(e: VueSalle) {
    if (e.statut !== 'terminee' || !e.resultats) {
      if (this.panneauFin) { this.panneauFin.fermer(); this.panneauFin = null; this.resultatsVus = null; }
      return;
    }
    if (this.resultatsVus === e.resultats || (this.resultatsVus && JSON.stringify(this.resultatsVus) === JSON.stringify(e.resultats))) {
      // Mise à jour du bouton (changement d'hôte)
      return;
    }
    this.resultatsVus = e.resultats;
    this.panneauFin?.fermer();
    const r = e.resultats;
    const hote = e.hote === e.moi;
    const top = r.classement.slice(0, 3);
    const ordre = [top[1], top[0], top[2]].filter(Boolean);
    const hauteurs: Record<number, [number, string]> = { 0: [96, '#FFC23D'], 1: [70, '#C9D3E0'], 2: [52, '#E39B5C'] };
    const signe = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
    const nomDe = (id: string) => r.classement.find((c) => c.id === id)?.nom ?? '?';
    const p = panneau(`<h2 style="text-align:center">Fin de la partie</h2>
      <div class="podium">${ordre.map((c) => {
        const rang = top.indexOf(c);
        const [h, coul] = hauteurs[rang];
        return `<div class="marche">${avatar(c.avatar, rang === 0 ? 'ravi' : c.bilan < 0 ? 'decu' : 'content', 74)}<div class="nom">${esc(c.nom)}</div>
          <div class="bilan ${c.bilan >= 0 ? 'plus' : 'moins'}" style="font-family:Fredoka;font-weight:700">${signe(c.bilan)}</div>
          <div class="socle" style="height:${h}px;background:${coul}">${rang + 1}</div></div>`;
      }).join('')}</div>
      <table class="classement">${r.classement.map((c, i) => `<tr><td>${i + 1}.</td><td>${esc(c.nom)}${c.bot ? ' 🤖' : ''}</td><td class="bilan ${c.bilan >= 0 ? 'plus' : 'moins'}">${signe(c.bilan)}</td></tr>`).join('')}</table>
      ${r.distinctions.length ? `<div class="distinctions">${r.distinctions.map((d) => `<div><b>${esc(d.titre)}</b>${esc(nomDe(d.id))}<div class="doux petit">${esc(d.detail)}</div></div>`).join('')}</div>` : ''}
      <p class="doux petit" style="text-align:center">${r.mains} mains jouées${r.plusGrosPot ? ` · plus gros pot : ${fmt(r.plusGrosPot.montant)} (${esc(nomDe(r.plusGrosPot.id))})` : ''}</p>
      <div class="ligne" style="justify-content:center;margin-top:8px">
        <button class="btn btn-fantome" data-sortir>Quitter la table</button>
        ${hote ? '<button class="btn btn-or" data-rejouer>On remet ça !</button>' : '<span class="doux">On remet ça ? En attente de l\'hôte…</span>'}
      </div>`, { fermable: false });
    this.panneauFin = p;
    jouerSon(r.classement[0]?.id === e.moi ? 'grosGain' : 'gagne');
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
    if (this.masques.has(m.de)) return;
    this.chat.push(m);
    if (this.chat.length > 100) this.chat.shift();
    const zone = $('[data-messages]', this.el);
    const moi = this.etat?.moi === m.de;
    const el = html(`<div class="msg-chat ${moi ? 'moi' : ''}">${avatar(m.avatar, 'neutre', 30)}<div><button class="auteur" data-auteur>${esc(m.nom)}</button><div class="texte">${esc(m.texte)}</div></div></div>`);
    const b = $('[data-auteur]', el);
    b.onclick = async () => {
      if (moi) return;
      if (await confirmer(`Masquer ${m.nom} ? Tu ne verras plus ses messages ni ses émotes.`, 'Masquer')) {
        this.masques.add(m.de);
        ecrireMasques([...this.masques]);
        toast(`${m.nom} est masqué`);
      }
    };
    zone.appendChild(el);
    while (zone.children.length > 100) zone.firstElementChild!.remove();
    zone.scrollTop = zone.scrollHeight;
    if (!nouveau) return;
    if (!this.lateral.ouvert) {
      if (!moi) { this.nonLus++; this.majNonLus(); jouerSon('clic'); }
      // Petite bulle par-dessus la table
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
    const enJeu = e && e.monSiege !== null && e.statut === 'en_jeu';
    if (enJeu && !(await confirmer('Quitter la table ?', 'Quitter', 'Rester'))) return;
    this.sortir();
  }

  private sortir() {
    this.canal.quitter();
    this.onQuitter();
  }

  private menu() {
    const e = this.etat;
    if (!e) return;
    const moi = e.monSiege !== null ? e.sieges[e.monSiege] : null;
    const hote = e.hote === e.moi;
    const p = panneau(`<h2>Menu</h2>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${hote ? '<button class="btn btn-or" data-m="hote">Gérer la table (hôte)</button>' : ''}
        <button class="btn" data-m="historique">Historique des mains</button>
        <button class="btn" data-m="reglages">Mes réglages</button>
        ${this.canal.enLigne ? `<button class="btn" data-m="code">Code de la table : <b style="letter-spacing:2px">${esc(e.code)}</b></button>` : ''}
        ${moi && !moi.absent && e.statut === 'en_jeu' ? '<button class="btn" data-m="absent">M\'absenter</button>' : ''}
        ${moi?.absent ? '<button class="btn" data-m="retour">Je reviens</button>' : ''}
        ${moi && e.statut !== 'en_jeu' ? '<button class="btn" data-m="lever">Me lever (regarder)</button>' : ''}
        <button class="btn btn-corail" data-m="quitter">Quitter la table</button>
      </div>`);
    $$('[data-m]', p.el).forEach((b) => b.onclick = () => {
      p.fermer();
      switch (b.dataset.m) {
        case 'hote': return this.panneauHote();
        case 'code': return this.copierCode();
        case 'reglages': return ouvrirReglagesPerso((oui) => this.canal.envoyer({ c: 'toujoursMontrer', oui }));
        case 'historique': return ouvrirHistorique({
          moi: e.moi,
          partie: () => new Promise((ok) => { this.attenteHistorique = ok; this.canal.envoyer({ c: 'historique' }); }),
          perso: this.opts.mesMains,
        });
        case 'absent': return this.canal.envoyer({ c: 'absent' });
        case 'retour': return this.canal.envoyer({ c: 'retour', poster: true });
        case 'lever': return this.canal.envoyer({ c: 'lever' });
        case 'quitter': return void this.quitter();
      }
    });
  }

  private panneauHote() {
    const e = this.etat;
    if (!e) return;
    const r = e.reglages;
    const assis = e.sieges.filter(Boolean) as NonNullable<VueSalle['sieges'][number]>[];
    const bots = assis.filter((s) => s.bot), humains = assis.filter((s) => !s.bot && s.id !== e.moi);
    const blindes = [[5, 10], [10, 20], [25, 50], [50, 100], [100, 200], [250, 500], [500, 1000]];
    const p = panneau(`<h2>Gérer la table</h2>
      <div class="ligne" style="margin-bottom:6px">
        ${e.statut === 'en_jeu' ? '<button class="btn btn-petit" data-h="pause">Pause</button>' : ''}
        ${e.statut === 'pause' ? '<button class="btn btn-petit btn-vert" data-h="reprendre">Reprendre</button>' : ''}
        ${e.statut === 'attente' ? '<button class="btn btn-petit btn-or" data-h="lancer">Lancer</button>' : ''}
        ${e.statut === 'en_jeu' || e.statut === 'pause' ? '<button class="btn btn-petit btn-corail" data-h="terminer">Terminer la partie</button>' : ''}
        ${e.statut !== 'attente' ? '<button class="btn btn-petit" data-h="rejouer">Recommencer (tapis neufs)</button>' : ''}
      </div>
      <hr class="sep">
      <h3 style="margin-bottom:6px">Bots</h3>
      <div class="liste-joueurs">${bots.map((b) => `<div class="lj">${avatar(b.avatar, 'neutre', 38)}<span class="nom">${esc(b.nom)} <span class="doux petit">${b.niveau ?? ''}</span></span><button class="btn btn-petit btn-fantome" data-retirer="${b.id}">Retirer</button></div>`).join('') || '<div class="doux petit">Aucun bot</div>'}</div>
      <div class="ligne"><select data-niveau style="width:auto"><option value="facile">Facile</option><option value="moyen" selected>Moyen</option><option value="difficile">Difficile</option></select>
        <button class="btn btn-petit" data-h="bot" ${assis.length >= r.places ? 'disabled' : ''}>+ Ajouter un bot</button></div>
      ${humains.length ? `<hr class="sep"><h3 style="margin-bottom:6px">Joueurs</h3><div class="liste-joueurs">${humains.map((h) => `<div class="lj">${avatar(h.avatar, 'neutre', 38)}<span class="nom">${esc(h.nom)}${h.deconnecte ? ' <span class="doux petit">déconnecté</span>' : ''}</span>
        ${h.tapis === 0 ? `<button class="btn btn-petit btn-or" data-offrir="${h.id}">Offrir une recave</button>` : ''}
        <button class="btn btn-petit btn-fantome" data-exclure="${h.id}">Exclure</button></div>`).join('')}</div>` : ''}
      <hr class="sep">
      <h3 style="margin-bottom:10px">Réglages <span class="doux petit">(appliqués entre deux mains)</span></h3>
      <div class="grille2">
        <label class="champ"><span>Blindes</span><select data-r="blindes">${blindes.map(([a, b]) => `<option value="${a}" ${a === r.pb ? 'selected' : ''}>${a} / ${b}</option>`).join('')}</select></label>
        <label class="champ"><span>Places</span><select data-r="places">${[2, 3, 4, 5, 6].map((n) => `<option ${n === r.places ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="champ"><span>Recaves</span><select data-r="recaves">${['interdites', 1, 2, 3, 5, 'illimitees'].map((v) => `<option value="${v}" ${String(v) === String(r.recaves) ? 'selected' : ''}>${v === 'interdites' ? 'Interdites' : v === 'illimitees' ? 'Illimitées' : `${v} par joueur`}</option>`).join('')}</select></label>
        <label class="champ"><span>Filtre des insultes</span><select data-r="filtre"><option value="1" ${r.filtreInsultes ? 'selected' : ''}>Activé</option><option value="0" ${r.filtreInsultes ? '' : 'selected'}>Désactivé</option></select></label>
        <label class="champ"><span>Temps de réflexion</span><select data-r="temps">${[10, 20, 30, 0].map((v) => `<option value="${v}" ${v === r.tempsReflexion ? 'selected' : ''}>${v ? `${v} s` : 'Illimité'}</option>`).join('')}</select></label>
      </div>
      <button class="btn btn-or btn-plein" data-h="enregistrer">Enregistrer les réglages</button>`);
    const envoyer = (cmd: CommandeClient) => this.canal.envoyer(cmd);
    $$('[data-h]', p.el).forEach((b) => b.onclick = async () => {
      switch (b.dataset.h) {
        case 'pause': envoyer({ c: 'pause' }); break;
        case 'reprendre': envoyer({ c: 'reprendre' }); break;
        case 'lancer': envoyer({ c: 'lancer' }); break;
        case 'terminer': if (await confirmer('Terminer la partie et afficher les résultats ?', 'Terminer')) envoyer({ c: 'terminer' }); break;
        case 'rejouer': if (await confirmer('Recommencer une partie avec des tapis neufs ?', 'Recommencer')) envoyer({ c: 'rejouer' }); break;
        case 'bot': envoyer({ c: 'ajouterBot', niveau: ($('[data-niveau]', p.el) as HTMLSelectElement).value as any }); break;
        case 'enregistrer': {
          const v = (k: string) => ($(`[data-r="${k}"]`, p.el) as HTMLSelectElement).value;
          const pb = Number(v('blindes'));
          const rc = v('recaves');
          const reglages: Partial<ReglagesSalle> = { pb, gb: pb * 2, places: Number(v('places')), tempsReflexion: Number(v('temps')), recaves: rc === 'interdites' || rc === 'illimitees' ? rc : Number(rc), filtreInsultes: v('filtre') === '1' };
          envoyer({ c: 'reglages', reglages });
          break;
        }
      }
      p.fermer();
    });
    $$('[data-retirer]', p.el).forEach((b) => b.onclick = () => { envoyer({ c: 'retirerBot', id: b.dataset.retirer! }); p.fermer(); });
    $$('[data-exclure]', p.el).forEach((b) => b.onclick = async () => { p.fermer(); if (await confirmer('Exclure ce joueur de la table ?', 'Exclure')) envoyer({ c: 'exclure', id: b.dataset.exclure! }); });
    $$('[data-offrir]', p.el).forEach((b) => b.onclick = () => { envoyer({ c: 'accorderRecave', id: b.dataset.offrir! }); p.fermer(); });
  }
}


const CLE_MASQUES = 'aic-masques';
function lireMasques(): string[] { try { return JSON.parse(localStorage.getItem(CLE_MASQUES) ?? '[]'); } catch { return []; } }
function ecrireMasques(l: string[]) { try { localStorage.setItem(CLE_MASQUES, JSON.stringify(l)); } catch { /* rien */ } }
