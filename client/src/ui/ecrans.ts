/**
 * Écrans hors table : connexion, inscription, mot de passe, hall des tables, création de table, profil.
 */
import type { ReglagesSalle } from '../../../moteur/salle';
import { REGLAGES_DEFAUT } from '../../../moteur/salle';
import type { ReglagesBJ } from '../../../moteur/blackjack/salleBJ';
import { REGLAGES_BJ_DEFAUT } from '../../../moteur/blackjack/salleBJ';
import type { ReglagesRoulette } from '../../../moteur/roulette/salleRoulette';
import { REGLAGES_ROULETTE_DEFAUT } from '../../../moteur/roulette/salleRoulette';
import type { AvatarId } from '../../../moteur/avatars';
import type { Utilisateur } from '../../../serveur/comptes';
import type { ResumeTable } from '../../../serveur/hall';
import { api, ErreurApi, enregistrerJeton } from '../reseau';
import { fmt, canvasCarte } from '../art/rendu';
import { avatarSVG } from '../art/avatars';
import type { Stats } from '../../../moteur/succes';
import { jouerSon } from '../vue/son';
import { $, $$, esc, html, toast, panneau, avatar, choixAvatars, logoHTML, ouvrirReglagesPerso } from './commun';
import { enSuspense } from './commun';

function erreurForm(el: HTMLElement, e: unknown) {
  $('.erreur-form', el).textContent = e instanceof ErreurApi ? e.message : 'Erreur inattendue';
}

/* ------------------------------ Connexion / inscription ------------------------------ */

export function ecranConnexion(racine: HTMLElement, opts: { onConnecte: (u: Utilisateur, jeton: string) => void; onSolo: () => void; horsLigne?: boolean }) {
  let mode: 'connexion' | 'inscription' = 'connexion';
  let av: AvatarId = 'renard';
  const el = html(`<div class="ecran"><div class="etroit">
    <div style="display:flex;justify-content:center;margin:10px 0 6px">${logoHTML()}</div>
    <p class="doux" style="text-align:center;margin:0 0 22px">Le poker entre potes, version cartoon.</p>
    ${opts.horsLigne ? '<div class="boite" style="margin-bottom:16px;text-align:center"><b>Pas de connexion au serveur.</b><br><span class="doux">Tu peux quand même jouer en solo contre les bots.</span></div>' : ''}
    <div class="boite">
      <div class="choix" style="margin-bottom:16px"><button data-mode="connexion" class="on">Connexion</button><button data-mode="inscription">Créer un compte</button></div>
      <form data-form>
        <label class="champ"><span>Pseudo</span><input type="text" name="pseudo" autocomplete="username" maxlength="16" required></label>
        <label class="champ"><span>Mot de passe</span><input type="password" name="mdp" autocomplete="current-password" required></label>
        <div data-inscription class="cache">
          <label class="champ"><span>E-mail <span class="doux">(facultatif, pour récupérer ton mot de passe)</span></span><input type="email" name="email" autocomplete="email"></label>
          <label class="champ" style="margin-bottom:6px"><span>Ton personnage</span></label>
          <div data-avatars style="margin-bottom:14px"></div>
        </div>
        <div class="erreur-form"></div>
        <button class="btn btn-or btn-plein" data-valider>Se connecter</button>
      </form>
      <div style="text-align:center;margin-top:14px"><button class="lien" data-oubli>Mot de passe oublié ?</button></div>
    </div>
    <div style="text-align:center;margin-top:20px"><button class="btn btn-ciel" data-solo>🤖 Jouer en solo, sans compte</button></div>
  </div></div>`);
  racine.replaceChildren(el);
  $('[data-avatars]', el).appendChild(choixAvatars(av, (a) => (av = a)));
  const form = $('[data-form]', el) as HTMLFormElement;
  $$('[data-mode]', el).forEach((b) => b.onclick = () => {
    mode = b.dataset.mode as typeof mode;
    $$('[data-mode]', el).forEach((x) => x.classList.toggle('on', x === b));
    $('[data-inscription]', el).classList.toggle('cache', mode !== 'inscription');
    $('[data-valider]', el).textContent = mode === 'connexion' ? 'Se connecter' : 'Créer mon compte';
    (form.mdp as HTMLInputElement).autocomplete = mode === 'connexion' ? 'current-password' : 'new-password';
    $('.erreur-form', el).textContent = '';
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const b = $('[data-valider]', el) as HTMLButtonElement;
    b.disabled = true;
    try {
      const r = mode === 'connexion'
        ? await api('/api/connexion', { pseudo: d.pseudo, mdp: d.mdp })
        : await api('/api/inscription', { pseudo: d.pseudo, mdp: d.mdp, email: d.email || null, avatar: av });
      enregistrerJeton(r.jeton);
      opts.onConnecte(r.utilisateur, r.jeton);
    } catch (err) { erreurForm(el, err); }
    finally { b.disabled = false; }
  };
  $('[data-oubli]', el).onclick = () => {
    const p = panneau(`<h2>Mot de passe oublié</h2>
      <p class="doux">Indique ton pseudo ou ton e-mail. Si ton compte a une adresse e-mail, tu recevras un lien pour choisir un nouveau mot de passe.</p>
      <form><label class="champ"><span>Pseudo ou e-mail</span><input type="text" name="id" required></label>
      <div class="erreur-form"></div><button class="btn btn-or btn-plein">Envoyer le lien</button></form>`);
    const f = $('form', p.el) as HTMLFormElement;
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/mdp-oublie', { identifiant: (f.id as unknown as HTMLInputElement).value });
        p.el.innerHTML = `<h2>C'est parti</h2><p>${esc(r.message)}</p><button class="btn btn-or btn-plein" data-fermer>OK</button>`;
        $('[data-fermer]', p.el).onclick = () => p.fermer();
      } catch (err) { erreurForm(p.el, err); }
    };
  };
  $('[data-solo]', el).onclick = () => opts.onSolo();
}

export function ecranReinitialiser(racine: HTMLElement, jeton: string, fini: () => void) {
  const el = html(`<div class="ecran"><div class="etroit">
    <div style="display:flex;justify-content:center;margin:10px 0 20px">${logoHTML()}</div>
    <div class="boite"><h2 style="margin-bottom:14px">Nouveau mot de passe</h2>
      <form><label class="champ"><span>Nouveau mot de passe (8 caractères minimum)</span><input type="password" name="mdp" autocomplete="new-password" required minlength="8"></label>
      <div class="erreur-form"></div><button class="btn btn-or btn-plein">Enregistrer</button></form></div></div></div>`);
  racine.replaceChildren(el);
  const f = $('form', el) as HTMLFormElement;
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/reinitialiser', { jeton, mdp: (f.mdp as HTMLInputElement).value });
      toast('Mot de passe changé, tu peux te connecter');
      history.replaceState(null, '', '/');
      fini();
    } catch (err) { erreurForm(el, err); }
  };
}

/* ------------------------------ Création de table ------------------------------ */

export type JeuCasino = 'poker' | 'blackjack' | 'roulette';
export interface OptsCreation { solo: boolean; nomParDefaut: string; onValider: (r: ReglagesSalle) => void; onValiderBJ: (r: ReglagesBJ) => void; onValiderRoulette: (r: ReglagesRoulette) => void; onRetour: () => void; avatarSolo?: AvatarId; onAvatarSolo?: (a: AvatarId) => void; jeu?: JeuCasino }

const CLE_JEU = 'aic-jeu';
function jeuMemorise(): JeuCasino { try { const j = localStorage.getItem(CLE_JEU); return j === 'blackjack' || j === 'roulette' ? j : 'poker'; } catch { return 'poker'; } }

/** Le sélecteur de jeu en haut de l'écran de création. */
function selecteurJeu(el: HTMLElement, racine: HTMLElement, opts: OptsCreation, jeu: JeuCasino) {
  const zone = $('[data-jeux]', el);
  zone.innerHTML = `<button type="button" class="tuile-jeu ${jeu === 'poker' ? 'on' : ''}" data-jeu="poker"><span class="icone-jeu">♠</span><span><b>Poker</b><small>Texas Hold'em entre potes</small></span></button>
    <button type="button" class="tuile-jeu ${jeu === 'blackjack' ? 'on' : ''}" data-jeu="blackjack"><span class="icone-jeu">21</span><span><b>Black Jack</b><small>Tous contre le croupier</small></span></button>
    <button type="button" class="tuile-jeu ${jeu === 'roulette' ? 'on' : ''}" data-jeu="roulette"><span class="icone-jeu">◎</span><span><b>Roulette</b><small>Faites vos jeux !</small></span></button>`;
  $$('[data-jeu]', zone).forEach((b) => b.onclick = () => {
    const j = b.dataset.jeu as JeuCasino;
    if (j === jeu) return;
    try { localStorage.setItem(CLE_JEU, j); } catch { /* rien */ }
    ecranCreation(racine, { ...opts, jeu: j });
  });
}

function ecranCreationBJ(racine: HTMLElement, opts: OptsCreation) {
  const r: ReglagesBJ = { ...REGLAGES_BJ_DEFAUT, nom: opts.nomParDefaut.replace(/^Table de/, 'Black Jack de').replace('Partie solo', 'Black Jack solo'), ...(opts.solo ? { tempsReflexion: 0, visibilite: 'privee' as const, places: 1 } : {}) };
  const choix = (cle: string, valeurs: [string | number, string][], courant: string | number) =>
    `<div class="choix" data-choix="${cle}">${valeurs.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(courant) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const el = html(`<div class="ecran ecran-creation"><div class="etroit" style="max-width:980px">
    <div class="ligne" style="margin-bottom:12px"><button class="btn btn-rond btn-fantome" data-retour>←</button><h1 style="font-size:26px">${opts.solo ? 'Partie solo' : 'Nouvelle table'}</h1></div>
    <div class="jeux" data-jeux></div>
    <form class="boite creation" data-form><div class="colonne">
      ${opts.solo ? '<label class="champ" style="margin-bottom:6px"><span>Ton personnage</span></label><div data-avatars style="margin-bottom:16px"></div>' : `
      <label class="champ"><span>Nom de la table</span><input type="text" name="nom" maxlength="30" value="${esc(r.nom)}"></label>
      <label class="champ"><span>Visibilité</span>${choix('visibilite', [['publique', 'Publique (dans la liste)'], ['privee', 'Privée (avec un code)']], r.visibilite)}</label>`}
      <div class="grille2">
        <label class="champ"><span>Jetons de départ</span><select name="tapisDepart">${[500, 1000, 2000, 5000].map((v) => `<option value="${v}" ${v === r.tapisDepart ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select></label>
        <label class="champ"><span>Mise minimum</span><select name="miseMin">${[5, 10, 25, 50, 100].map((v) => `<option value="${v}" ${v === r.miseMin ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${opts.solo ? '' : `<label class="champ"><span>Places</span><select name="places">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === r.places ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}
        <label class="champ"><span>Recaves</span><select name="recaves">${['interdites', 1, 2, 3, 5, 'illimitees'].map((v) => `<option value="${v}" ${String(v) === String(r.recaves) ? 'selected' : ''}>${v === 'interdites' ? 'Interdites' : v === 'illimitees' ? 'Illimitées' : `${v} par joueur`}</option>`).join('')}</select></label>
      </div></div><div class="colonne">
      <label class="champ"><span>Durée de la partie</span>${choix('manches', [[10, '10 manches'], [20, '20'], [30, '30'], [50, '50'], [0, 'Illimitée']], r.manches)}</label>
      <label class="champ"><span>Temps de réflexion</span>${choix('tempsReflexion', [[10, '10 s'], [20, '20 s'], [30, '30 s'], [0, 'Illimité']], r.tempsReflexion)}</label>
      <label class="champ"><span>Abandon (récupérer ½ mise)</span>${choix('abandon', [['1', 'Autorisé'], ['0', 'Interdit']], r.abandon ? '1' : '0')}</label>
      <p class="doux petit" style="margin:2px 0 0">Black Jack payé 3 contre 2 · le croupier s'arrête à 17 · 6 jeux de cartes.</p>
      </div>
      <button class="btn btn-or btn-plein valider" style="font-size:20px">${opts.solo ? 'Jouer !' : 'Créer la table'}</button>
    </form></div></div>`);
  racine.replaceChildren(el);
  selecteurJeu(el, racine, opts, 'blackjack');
  if (opts.solo) $('[data-avatars]', el).appendChild(choixAvatars(opts.avatarSolo ?? 'renard', (a) => opts.onAvatarSolo?.(a)));
  const valeurs: Record<string, string> = { visibilite: r.visibilite, manches: String(r.manches), tempsReflexion: String(r.tempsReflexion), abandon: r.abandon ? '1' : '0' };
  $$('[data-choix]', el).forEach((g) => g.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-v]') as HTMLElement | null;
    if (!b) return;
    $$('button', g).forEach((x) => x.classList.toggle('on', x === b));
    valeurs[g.dataset.choix!] = b.dataset.v!;
  }));
  $('[data-retour]', el).onclick = () => opts.onRetour();
  const f = $('[data-form]', el) as HTMLFormElement;
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)) as Record<string, string>;
    const miseMin = Number(d.miseMin);
    const rc = d.recaves;
    opts.onValiderBJ({
      nom: opts.solo ? 'Black Jack solo' : (d.nom || r.nom),
      visibilite: valeurs.visibilite as ReglagesBJ['visibilite'],
      tapisDepart: Number(d.tapisDepart), miseMin, miseMax: miseMin * 50,
      places: opts.solo ? 1 : Number(d.places),
      recaves: rc === 'interdites' || rc === 'illimitees' ? rc : Number(rc),
      manches: Number(valeurs.manches), tempsReflexion: Number(valeurs.tempsReflexion),
      filtreInsultes: true, abandon: valeurs.abandon === '1',
    });
  };
}

function ecranCreationRoulette(racine: HTMLElement, opts: OptsCreation) {
  const r: ReglagesRoulette = { ...REGLAGES_ROULETTE_DEFAUT, nom: opts.nomParDefaut.replace(/^Table de/, 'Roulette de'), ...(opts.solo ? { tempsMises: 0, visibilite: 'privee' as const, places: 1 } : {}) };
  const choix = (cle: string, valeurs: [string | number, string][], courant: string | number) =>
    `<div class="choix" data-choix="${cle}">${valeurs.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(courant) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const el = html(`<div class="ecran ecran-creation"><div class="etroit" style="max-width:980px">
    <div class="ligne" style="margin-bottom:12px"><button class="btn btn-rond btn-fantome" data-retour>←</button><h1 style="font-size:26px">${opts.solo ? 'Partie solo' : 'Nouvelle table'}</h1></div>
    <div class="jeux" data-jeux></div>
    <form class="boite creation" data-form><div class="colonne">
      ${opts.solo ? '<label class="champ" style="margin-bottom:6px"><span>Ton personnage</span></label><div data-avatars style="margin-bottom:16px"></div>' : `
      <label class="champ"><span>Nom de la table</span><input type="text" name="nom" maxlength="30" value="${esc(r.nom)}"></label>
      <label class="champ"><span>Visibilité</span>${choix('visibilite', [['publique', 'Publique (dans la liste)'], ['privee', 'Privée (avec un code)']], r.visibilite)}</label>`}
      <div class="grille2">
        <label class="champ"><span>Jetons de départ</span><select name="tapisDepart">${[500, 1000, 2000, 5000].map((v) => `<option value="${v}" ${v === r.tapisDepart ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select></label>
        <label class="champ"><span>Jeton minimum</span><select name="miseMin">${[1, 5, 10, 25].map((v) => `<option value="${v}" ${v === r.miseMin ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${opts.solo ? '' : `<label class="champ"><span>Places</span><select name="places">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === r.places ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}
        <label class="champ"><span>Recaves</span><select name="recaves">${['interdites', 1, 2, 3, 5, 'illimitees'].map((v) => `<option value="${v}" ${String(v) === String(r.recaves) ? 'selected' : ''}>${v === 'interdites' ? 'Interdites' : v === 'illimitees' ? 'Illimitées' : `${v} par joueur`}</option>`).join('')}</select></label>
      </div></div><div class="colonne">
      <label class="champ"><span>Durée de la partie</span>${choix('tours', [[10, '10 tours'], [20, '20'], [30, '30'], [50, '50'], [0, 'Illimitée']], r.tours)}</label>
      <label class="champ"><span>Temps pour miser</span>${choix('tempsMises', [[15, '15 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [0, 'Illimité']], r.tempsMises)}</label>
      <label class="champ"><span>La partage (½ rendu sur le zéro)</span>${choix('partage', [['1', 'Oui'], ['0', 'Non']], r.partage ? '1' : '0')}</label>
      <p class="doux petit" style="margin:2px 0 0">Roulette européenne à un zéro · le tour part dès que tout le monde est prêt.</p>
      </div>
      <button class="btn btn-or btn-plein valider" style="font-size:20px">${opts.solo ? 'Jouer !' : 'Créer la table'}</button>
    </form></div></div>`);
  racine.replaceChildren(el);
  selecteurJeu(el, racine, opts, 'roulette');
  if (opts.solo) $('[data-avatars]', el).appendChild(choixAvatars(opts.avatarSolo ?? 'renard', (a) => opts.onAvatarSolo?.(a)));
  const valeurs: Record<string, string> = { visibilite: r.visibilite, tours: String(r.tours), tempsMises: String(r.tempsMises), partage: r.partage ? '1' : '0' };
  $$('[data-choix]', el).forEach((g) => g.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-v]') as HTMLElement | null;
    if (!b) return;
    $$('button', g).forEach((x) => x.classList.toggle('on', x === b));
    valeurs[g.dataset.choix!] = b.dataset.v!;
  }));
  $('[data-retour]', el).onclick = () => opts.onRetour();
  const f = $('[data-form]', el) as HTMLFormElement;
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)) as Record<string, string>;
    const rc = d.recaves;
    opts.onValiderRoulette({
      nom: opts.solo ? 'Roulette solo' : (d.nom || r.nom),
      visibilite: valeurs.visibilite as ReglagesRoulette['visibilite'],
      tapisDepart: Number(d.tapisDepart), miseMin: Number(d.miseMin),
      places: opts.solo ? 1 : Number(d.places),
      recaves: rc === 'interdites' || rc === 'illimitees' ? rc : Number(rc),
      tours: Number(valeurs.tours), tempsMises: Number(valeurs.tempsMises),
      filtreInsultes: true, partage: valeurs.partage === '1',
    });
  };
}

export function ecranCreation(racine: HTMLElement, opts: OptsCreation) {
  const jeu = opts.jeu ?? jeuMemorise();
  if (jeu === 'blackjack') return ecranCreationBJ(racine, { ...opts, jeu });
  if (jeu === 'roulette') return ecranCreationRoulette(racine, { ...opts, jeu });
  const r: ReglagesSalle = {
    ...REGLAGES_DEFAUT, nom: opts.nomParDefaut,
    ...(opts.solo ? { bots: 3, tempsReflexion: 0, visibilite: 'privee', recaves: 2 } : {}),
  };
  const blindes = [[5, 10], [10, 20], [25, 50], [50, 100], [100, 200]];
  const choix = (cle: string, valeurs: [string | number, string][], courant: string | number) =>
    `<div class="choix" data-choix="${cle}">${valeurs.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(courant) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const el = html(`<div class="ecran ecran-creation"><div class="etroit" style="max-width:980px">
    <div class="ligne" style="margin-bottom:12px"><button class="btn btn-rond btn-fantome" data-retour>←</button><h1 style="font-size:26px">${opts.solo ? 'Partie solo' : 'Nouvelle table'}</h1></div>
    <div class="jeux" data-jeux></div>
    <form class="boite creation" data-form><div class="colonne">
      ${opts.solo ? '<label class="champ" style="margin-bottom:6px"><span>Ton personnage</span></label><div data-avatars style="margin-bottom:16px"></div>' : `
      <label class="champ"><span>Nom de la table</span><input type="text" name="nom" maxlength="30" value="${esc(r.nom)}"></label>
      <label class="champ"><span>Visibilité</span>${choix('visibilite', [['publique', 'Publique (dans la liste)'], ['privee', 'Privée (avec un code)']], r.visibilite)}</label>`}
      <div class="grille2">
        <label class="champ"><span>Tapis de départ</span><select name="tapisDepart">${[500, 1000, 2000, 5000, 10000].map((v) => `<option value="${v}" ${v === r.tapisDepart ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select></label>
        <label class="champ"><span>Blindes</span><select name="pb">${blindes.map(([a, b]) => `<option value="${a}" ${a === r.pb ? 'selected' : ''}>${a} / ${b}</option>`).join('')}</select></label>
        <label class="champ"><span>Places</span><select name="places">${[2, 3, 4, 5, 6].map((n) => `<option ${n === r.places ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="champ"><span>Recaves</span><select name="recaves">${['interdites', 1, 2, 3, 5, 'illimitees'].map((v) => `<option value="${v}" ${String(v) === String(r.recaves) ? 'selected' : ''}>${v === 'interdites' ? 'Interdites' : v === 'illimitees' ? 'Illimitées' : `${v} par joueur`}</option>`).join('')}</select></label>
      </div></div><div class="colonne">
      <label class="champ"><span>Bots</span>${choix('bots', [0, 1, 2, 3, 4, 5].map((n) => [n, n === 0 ? 'Aucun' : String(n)]), r.bots)}</label>
      <label class="champ" data-niveau-bloc><span>Niveau des bots</span>${choix('niveauBots', [['facile', 'Facile'], ['moyen', 'Moyen'], ['difficile', 'Difficile']], r.niveauBots)}</label>
      <label class="champ"><span>Fin de la partie</span>${choix('fin', [['dernier', 'Quand il reste un joueur'], ['60', 'Après 1 h'], ['120', 'Après 2 h'], ['jamais', 'Jamais']], 'dernier')}</label>
      <label class="champ"><span>Temps de réflexion</span>${choix('tempsReflexion', [[10, '10 s'], [20, '20 s'], [30, '30 s'], [0, 'Illimité']], r.tempsReflexion)}</label>
      </div>
      <button class="btn btn-or btn-plein valider" style="font-size:20px">${opts.solo ? 'Jouer !' : 'Créer la table'}</button>
    </form></div></div>`);
  racine.replaceChildren(el);
  selecteurJeu(el, racine, opts, 'poker');
  if (opts.solo) $('[data-avatars]', el).appendChild(choixAvatars(opts.avatarSolo ?? 'renard', (a) => opts.onAvatarSolo?.(a)));
  const valeurs: Record<string, string> = { visibilite: r.visibilite, bots: String(r.bots), niveauBots: r.niveauBots, fin: 'dernier', tempsReflexion: String(r.tempsReflexion) };
  $$('[data-choix]', el).forEach((g) => g.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-v]') as HTMLElement | null;
    if (!b) return;
    $$('button', g).forEach((x) => x.classList.toggle('on', x === b));
    valeurs[g.dataset.choix!] = b.dataset.v!;
    if (g.dataset.choix === 'bots') $('[data-niveau-bloc]', el).classList.toggle('cache', b.dataset.v === '0');
  }));
  $('[data-niveau-bloc]', el).classList.toggle('cache', r.bots === 0);
  $('[data-retour]', el).onclick = () => opts.onRetour();
  const f = $('[data-form]', el) as HTMLFormElement;
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)) as Record<string, string>;
    const pb = Number(d.pb);
    const rc = d.recaves;
    const fin = valeurs.fin === 'dernier' ? { type: 'dernier' as const } : valeurs.fin === 'jamais' ? { type: 'jamais' as const } : { type: 'duree' as const, minutes: Number(valeurs.fin) };
    const places = Number(d.places);
    opts.onValider({
      nom: opts.solo ? 'Partie solo' : (d.nom || r.nom),
      visibilite: valeurs.visibilite as ReglagesSalle['visibilite'],
      tapisDepart: Number(d.tapisDepart), pb, gb: pb * 2, places,
      recaves: rc === 'interdites' || rc === 'illimitees' ? rc : Number(rc),
      bots: Math.min(Number(valeurs.bots), places - 1),
      niveauBots: valeurs.niveauBots as ReglagesSalle['niveauBots'],
      fin, tempsReflexion: Number(valeurs.tempsReflexion), filtreInsultes: true,
    });
  };
}

/* ------------------------------ Joueurs et profils ------------------------------ */

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');

export async function ecranJoueurs(racine: HTMLElement, opts: { onRetour: () => void; onProfil: (pseudo: string) => void }) {
  const el = html(`<div class="ecran"><div class="centre">
    <div class="ligne" style="margin-bottom:16px"><button class="btn btn-rond btn-fantome" data-retour>←</button><h1 style="font-size:26px">Les joueurs du club</h1></div>
    <div data-liste><div class="doux">Chargement…</div></div></div></div>`);
  racine.replaceChildren(el);
  $('[data-retour]', el).onclick = () => opts.onRetour();
  try {
    const { joueurs } = await api<{ joueurs: { pseudo: string; avatar: AvatarId; cadre: string; mains: number; parties: number; partiesGagnees: number; bilanTapis: number; succes: number }[] }>('/api/joueurs');
    joueurs.sort((a, b) => b.bilanTapis - a.bilanTapis || b.mains - a.mains);
    $('[data-liste]', el).innerHTML = `<div class="liste-joueurs-club">${joueurs.map((j, i) => `
      <button class="carte-joueur" data-p="${esc(j.pseudo)}">${avatarSVG(j.avatar, 'content', 56, { cadre: j.cadre })}
        <span><b>${i < 3 && j.mains ? ['🥇', '🥈', '🥉'][i] + ' ' : ''}${esc(j.pseudo)}</b>
        <span class="doux petit">${fmt(j.mains)} mains · ${j.partiesGagnees}/${j.parties} parties gagnées</span><br>
        <span class="petit" style="font-weight:800;color:${j.bilanTapis >= 0 ? '#7EE2A4' : '#FFB1A8'}">${j.bilanTapis >= 0 ? '+' : ''}${j.bilanTapis.toLocaleString('fr-FR')} tapis</span>
        <span class="doux petit"> · ${j.succes} succès</span></span></button>`).join('')}</div>`;
    $$('[data-p]', el).forEach((b) => b.onclick = () => opts.onProfil(b.dataset.p!));
  } catch (e) { erreurForm(el, e); $('[data-liste]', el).textContent = e instanceof Error ? e.message : 'Erreur'; }
}

interface DefSucces { id: string; titre: string; description: string; icone: string; recompense?: { type: 'cadre' | 'dos'; id: string; nom: string } }

export async function ecranProfilJoueur(racine: HTMLElement, pseudo: string, moi: Utilisateur, opts: { onRetour: () => void; onMaj: (u: Utilisateur) => void; onDeconnexion: () => void }) {
  const soi = pseudo.toLowerCase() === moi.pseudo.toLowerCase();
  const el = html(`<div class="ecran"><div class="centre" style="max-width:900px">
    <div class="ligne" style="margin-bottom:16px"><button class="btn btn-rond btn-fantome" data-retour>←</button><h1 style="font-size:26px">${soi ? 'Mon profil' : 'Profil'}</h1></div>
    <div data-contenu><div class="doux">Chargement…</div></div></div></div>`);
  racine.replaceChildren(el);
  $('[data-retour]', el).onclick = () => opts.onRetour();
  let profil: { joueur: { pseudo: string; avatar: AvatarId; cadre: string; cree: number }; stats: Stats; succes: { id: string; date: number }[] };
  let defs: { succes: DefSucces[]; cadres: { id: string; nom: string }[]; dos: { id: string; nom: string }[] };
  let recomp: { cadres: string[]; dos: string[] } | null = null;
  try {
    [profil, defs, recomp] = await Promise.all([
      api(`/api/joueurs/${encodeURIComponent(pseudo)}`), api('/api/succes'), soi ? api('/api/moi/recompenses') : Promise.resolve(null),
    ]);
  } catch (e) { $('[data-contenu]', el).textContent = e instanceof Error ? e.message : 'Erreur'; return; }
  const s = profil.stats;
  const obtenus = new Map(profil.succes.map((x) => [x.id, x.date]));
  const j = profil.joueur;
  const stats: [string, string][] = [
    ['Mains jouées', fmt(s.mains)],
    ['Parties gagnées', `${s.partiesGagnees} / ${s.parties}`],
    ['Bilan', `${s.bilanTapis >= 0 ? '+' : ''}${s.bilanTapis.toLocaleString('fr-FR')} tapis`],
    ['Meilleure partie', `+${s.meilleurePartie.toLocaleString('fr-FR')} tapis`],
    ['Mains jouées volontairement', pct(s.vpip, s.mains)],
    ['Relances avant le flop', pct(s.pfr, s.mains)],
    ['Agressivité', s.passifs ? (s.agressions / s.passifs).toFixed(1) : s.agressions ? '∞' : '—'],
    ['Abattages gagnés', pct(s.abattagesGagnes, s.abattages)],
    ['Pots gagnés sans montrer', fmt(s.gainsSansAbattage)],
    ['Plus gros pot', fmt(s.plusGrosPot)],
    ['Meilleure main', s.meilleureTexte || '—'],
    ['Joueurs éliminés', fmt(s.elimines)],
  ];
  const contenu = $('[data-contenu]', el);
  contenu.innerHTML = `
    <div class="boite" style="margin-bottom:16px"><div class="ligne">
      <div data-grand>${avatarSVG(j.avatar, 'ravi', 96, { cadre: j.cadre })}</div>
      <div><h2 style="font-size:28px">${esc(j.pseudo)}</h2><div class="doux">Membre depuis le ${new Date(j.cree).toLocaleDateString('fr-FR')} · ${obtenus.size} / ${defs.succes.length} succès</div></div>
    </div></div>
    <h2 style="margin:18px 0 10px">Statistiques</h2>
    <div class="stats-grille">${stats.map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
    ${soi ? `<h2 style="margin:22px 0 10px">Cadre d'avatar</h2><div class="cosmetiques" data-cadres></div>
      <h2 style="margin:18px 0 10px">Dos de cartes</h2><div class="cosmetiques" data-dos></div>` : ''}
    <h2 style="margin:22px 0 10px">Succès</h2>
    <div class="succes-grille">${defs.succes.map((d) => {
      const date = obtenus.get(d.id);
      return `<div class="succes ${date ? '' : 'verrouille'}"><span class="icone">${d.icone}</span><span><b>${esc(d.titre)}</b><small>${esc(d.description)}</small>
        ${d.recompense ? `<small class="recomp">🎁 ${d.recompense.type === 'cadre' ? 'Cadre' : 'Dos'} « ${esc(d.recompense.nom)} »</small>` : ''}
        ${date ? `<small>Obtenu le ${new Date(date).toLocaleDateString('fr-FR')}</small>` : ''}</span></div>`;
    }).join('')}</div>
    ${soi ? '<div data-compte style="margin-top:26px"></div>' : ''}`;

  if (!soi || !recomp) return;
  const r = recomp;
  const cosm = (zone: string, liste: { id: string; nom: string }[], dispo: string[], courant: string, dessin: (id: string) => string, cle: 'cadre' | 'dos') => {
    const z = $(zone, contenu);
    z.innerHTML = liste.map((c) => `<button data-c="${c.id}" class="${c.id === courant ? 'on' : ''}" ${dispo.includes(c.id) ? '' : 'disabled title="À débloquer avec un succès"'}>${dessin(c.id)}${esc(c.nom)}${dispo.includes(c.id) ? '' : ' 🔒'}</button>`).join('');
    $$('[data-c]', z).forEach((b) => b.onclick = async () => {
      try {
        const res = await api('/api/moi', { [cle]: b.dataset.c }, 'PATCH');
        moi = res.utilisateur; opts.onMaj(moi);
        $$('[data-c]', z).forEach((x) => x.classList.toggle('on', x === b));
        if (cle === 'cadre') $('[data-grand]', contenu).innerHTML = avatarSVG(moi.avatar, 'ravi', 96, { cadre: moi.cadre });
      } catch (e) { toast(e instanceof Error ? e.message : 'Erreur', true); }
    });
  };
  cosm('[data-cadres]', defs.cadres, r.cadres, moi.cadre, (id) => avatarSVG(moi.avatar, 'neutre', 54, { cadre: id }), 'cadre');
  cosm('[data-dos]', defs.dos, r.dos, moi.dos, (id) => `<img src="${canvasCarte(null, false, 1, id).toDataURL()}" style="width:40px;height:56px;display:block">`, 'dos');
  ecranCompte($('[data-compte]', contenu), moi, opts);
}

/* ------------------------------ Compte ------------------------------ */

function ecranCompte(zone: HTMLElement, u: Utilisateur, opts: { onMaj: (u: Utilisateur) => void; onDeconnexion: () => void }) {
  const el = html(`<div>
    <h2 style="margin-bottom:10px">Mon compte</h2>
    <div class="boite" style="margin-bottom:16px">
      <label class="champ" style="margin-bottom:6px"><span>Mon personnage</span></label><div data-avatars></div>
    </div>
    <form class="boite" style="margin-bottom:16px" data-email>
      <label class="champ"><span>E-mail (pour récupérer le mot de passe)</span><input type="email" name="email" value="${esc(u.email ?? '')}"></label>
      <div class="erreur-form"></div><button class="btn btn-petit">Enregistrer l'e-mail</button>
    </form>
    <form class="boite" style="margin-bottom:16px" data-mdp>
      <div class="grille2"><label class="champ"><span>Mot de passe actuel</span><input type="password" name="ancien" autocomplete="current-password" required></label>
      <label class="champ"><span>Nouveau mot de passe</span><input type="password" name="nouveau" autocomplete="new-password" minlength="8" required></label></div>
      <div class="erreur-form"></div><button class="btn btn-petit">Changer le mot de passe</button>
    </form>
    <div class="ligne"><button class="btn" data-reglages>Réglages du jeu</button><button class="btn btn-corail" data-deco>Se déconnecter</button></div>
  </div>`);
  zone.replaceChildren(el);
  $('[data-avatars]', el).appendChild(choixAvatars(u.avatar, async (a) => {
    try { const r = await api('/api/moi', { avatar: a }, 'PATCH'); u = r.utilisateur; opts.onMaj(u); toast('Personnage changé'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Erreur', true); }
  }));
  const fe = $('[data-email]', el) as HTMLFormElement;
  fe.onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/moi', { email: (fe.email as HTMLInputElement).value || null }, 'PATCH'); opts.onMaj(r.utilisateur); toast('E-mail enregistré'); $('.erreur-form', fe).textContent = ''; }
    catch (err) { erreurForm(fe, err); }
  };
  const fm = $('[data-mdp]', el) as HTMLFormElement;
  fm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/moi/mdp', { ancien: (fm.ancien as HTMLInputElement).value, nouveau: (fm.nouveau as HTMLInputElement).value });
      toast('Mot de passe changé : reconnecte-toi');
      opts.onDeconnexion();
    } catch (err) { erreurForm(fm, err); }
  };
  $('[data-reglages]', el).onclick = () => ouvrirReglagesPerso((oui) => void api('/api/moi', { toujoursMontrer: oui }, 'PATCH').catch(() => {}));
  $('[data-deco]', el).onclick = () => opts.onDeconnexion();
}

export interface Banniere { icone: string; surtitre: string; titre: string; texte?: string; genre?: 'succes' | 'mission' | 'gain'; son?: 'grosGain' | 'gagne' | null; avant?: () => void }

/** Une seule file pour toutes les bannières : jamais deux à la fois, et jamais pendant un suspense. */
const fileBannieres: Banniere[] = [];
let banniereEnCours = false;
export function afficherBanniere(b: Banniere) {
  fileBannieres.push(b);
  if (!banniereEnCours) suivanteBanniere();
}

function suivanteBanniere() {
  if (!fileBannieres.length) { banniereEnCours = false; return; }
  banniereEnCours = true;
  // On attend que l'écran soit calme pendant un petit moment (le temps de voir son gain)
  let calme = 0;
  const attendre = () => {
    if (enSuspense()) calme = 0; else calme += 300;
    if (calme < 900) { setTimeout(attendre, 300); return; }
    const d = fileBannieres.shift()!;
    d.avant?.();
    const el = html(`<div class="annonce-succes ${d.genre ?? 'succes'}" role="status"><span class="icone">${d.icone}</span><div><small>${esc(d.surtitre)}</small><b>${d.titre}</b>${d.texte ? `<span>${d.texte}</span>` : ''}</div></div>`);
    document.body.appendChild(el);
    if (d.son !== null) jouerSon(d.son ?? 'grosGain');
    el.onclick = () => fermer();
    let ferme = false;
    const fermer = () => { if (ferme) return; ferme = true; el.classList.add('part'); setTimeout(() => { el.remove(); suivanteBanniere(); }, 400); };
    setTimeout(fermer, 3800);
  };
  attendre();
}

/** Bandeau doré quand un succès est débloqué. */
export function annoncerSucces(liste: DefSucces[]) {
  for (const d of liste) afficherBanniere({
    icone: d.icone, surtitre: 'Succès débloqué !', titre: esc(d.titre),
    texte: `${esc(d.description)}${d.recompense ? ` · 🎁 ${d.recompense.type === 'cadre' ? 'cadre' : 'dos de cartes'} « ${esc(d.recompense.nom)} »` : ''}`,
  });
}
