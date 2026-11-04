/**
 * Écrans hors table : connexion, inscription, mot de passe, hall des tables, création de table, profil.
 */
import type { ReglagesSalle } from '../../../moteur/salle';
import { REGLAGES_DEFAUT } from '../../../moteur/salle';
import type { AvatarId } from '../../../moteur/avatars';
import type { Utilisateur } from '../../../serveur/comptes';
import type { ResumeTable } from '../../../serveur/hall';
import { api, ErreurApi, enregistrerJeton } from '../reseau';
import { fmt } from '../art/rendu';
import { $, $$, esc, html, toast, panneau, avatar, choixAvatars, logoHTML, ouvrirReglagesPerso } from './commun';

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

/* ------------------------------ Hall ------------------------------ */

export interface ActionsHall {
  creer: () => void;
  rejoindreCode: (code: string) => void;
  rejoindre: (id: string) => void;
  regarder: (id: string) => void;
  solo: () => void;
  profil: () => void;
}

export class EcranHall {
  el: HTMLElement;
  constructor(racine: HTMLElement, private u: Utilisateur, private a: ActionsHall) {
    this.el = html(`<div class="ecran"><div class="centre">
      <div class="entete">${logoHTML('font-size:clamp(30px,6vw,44px)')}
        <button class="profil-mini" data-profil>${avatar(u.avatar, 'content', 42)}<span>${esc(u.pseudo)}</span></button></div>
      <div class="actions-hall">
        <button class="btn btn-or" data-a="creer">＋ Créer une table</button>
        <button class="btn btn-ciel" data-a="code">🔑 Rejoindre avec un code</button>
        <button class="btn" data-a="solo">🤖 Jouer en solo</button>
      </div>
      <div class="ligne" style="justify-content:space-between;margin-bottom:12px"><h2>Tables ouvertes</h2><span class="doux petit" data-enligne></span></div>
      <div data-tables><div class="vide-liste">Chargement…</div></div>
    </div></div>`);
    racine.replaceChildren(this.el);
    $('[data-profil]', this.el).onclick = () => a.profil();
    $('[data-a="creer"]', this.el).onclick = () => a.creer();
    $('[data-a="solo"]', this.el).onclick = () => a.solo();
    $('[data-a="code"]', this.el).onclick = () => {
      const p = panneau(`<h2>Rejoindre une table</h2><form><label class="champ"><span>Code de la table (5 lettres)</span>
        <input type="text" name="code" maxlength="5" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:6px;font-family:Fredoka;font-size:26px;text-align:center" required></label>
        <button class="btn btn-or btn-plein">Rejoindre</button></form>`);
      const f = $('form', p.el) as HTMLFormElement;
      ($('input', f) as HTMLInputElement).focus();
      f.onsubmit = (e) => { e.preventDefault(); a.rejoindreCode((f.code as HTMLInputElement).value.trim().toUpperCase()); p.fermer(); };
    };
  }

  majTables(tables: ResumeTable[], enLigne: number) {
    $('[data-enligne]', this.el).textContent = `${enLigne} joueur${enLigne > 1 ? 's' : ''} connecté${enLigne > 1 ? 's' : ''}`;
    const zone = $('[data-tables]', this.el);
    if (!tables.length) {
      zone.innerHTML = '<div class="vide-liste">Aucune table ouverte pour l\'instant.<br>Crée la tienne et envoie le code à tes potes !</div>';
      return;
    }
    zone.innerHTML = `<div class="tables">${tables.map((t) => {
      const pleine = t.joueurs >= t.places;
      const statut = t.statut === 'attente' ? 'En attente' : t.statut === 'en_jeu' ? 'En jeu' : t.statut === 'pause' ? 'En pause' : 'Terminée';
      return `<div class="carte-table">
        <div class="ligne" style="justify-content:space-between"><h3>${esc(t.nom)}</h3><span class="etiq ${t.statut}">${statut}</span></div>
        <div class="doux petit">Hôte : ${esc(t.hote)} · Blindes ${fmt(t.pb)}/${fmt(t.gb)} ${t.visibilite === 'privee' ? '<span class="etiq prive">Privée</span>' : ''}</div>
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

/* ------------------------------ Création de table ------------------------------ */

export function ecranCreation(racine: HTMLElement, opts: { solo: boolean; nomParDefaut: string; onValider: (r: ReglagesSalle) => void; onRetour: () => void; avatarSolo?: AvatarId; onAvatarSolo?: (a: AvatarId) => void }) {
  const r: ReglagesSalle = {
    ...REGLAGES_DEFAUT, nom: opts.nomParDefaut,
    ...(opts.solo ? { bots: 3, tempsReflexion: 0, visibilite: 'privee', recaves: 2 } : {}),
  };
  const blindes = [[5, 10], [10, 20], [25, 50], [50, 100], [100, 200]];
  const choix = (cle: string, valeurs: [string | number, string][], courant: string | number) =>
    `<div class="choix" data-choix="${cle}">${valeurs.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(courant) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const el = html(`<div class="ecran ecran-creation"><div class="etroit" style="max-width:980px">
    <div class="ligne" style="margin-bottom:12px"><button class="btn btn-rond btn-fantome" data-retour>←</button><h1 style="font-size:26px">${opts.solo ? 'Partie solo' : 'Nouvelle table'}</h1></div>
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

/* ------------------------------ Profil ------------------------------ */

export function ecranProfil(racine: HTMLElement, u: Utilisateur, opts: { onRetour: () => void; onMaj: (u: Utilisateur) => void; onDeconnexion: () => void }) {
  const el = html(`<div class="ecran"><div class="etroit" style="max-width:560px">
    <div class="ligne" style="margin-bottom:16px"><button class="btn btn-rond btn-fantome" data-retour>←</button><h1 style="font-size:26px">Mon profil</h1></div>
    <div class="boite" style="margin-bottom:16px">
      <div class="ligne" style="margin-bottom:14px">${avatar(u.avatar, 'ravi', 72).replace('<svg', '<svg data-grand')}<div><h2>${esc(u.pseudo)}</h2><div class="doux petit">Membre depuis le ${new Date(u.cree).toLocaleDateString('fr-FR')}</div></div></div>
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
  </div></div>`);
  racine.replaceChildren(el);
  $('[data-retour]', el).onclick = () => opts.onRetour();
  $('[data-avatars]', el).appendChild(choixAvatars(u.avatar, async (a) => {
    try { const r = await api('/api/moi', { avatar: a }, 'PATCH'); u = r.utilisateur; opts.onMaj(u); $('[data-grand]', el).outerHTML = avatar(a, 'ravi', 72).replace('<svg', '<svg data-grand'); }
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
