/**
 * Les amis : la liste (qui est en ligne, où il joue), les demandes, les cadeaux en Clubs
 * et les invitations à rejoindre une table.
 */
import { api, ErreurApi } from '../reseau';
import { fmt } from '../art/rendu';
import { avatarSVG } from '../art/avatars';
import { jouerSon } from '../vue/son';
import { $, $$, esc, html, toast, panneau } from './commun';
import type { TablePresence, MessageAmi } from '../../../serveur/amis';

interface Personne { pseudo: string; avatar: string; cadre: string }
interface Ami extends Personne { enLigne: boolean; table: TablePresence | null }
interface ListeAmis { amis: Ami[]; recues: Personne[]; envoyees: Personne[]; cadeaux: { offerts: number; reste: number; min: number } }

export interface ContexteAmis {
  rejoindreCode: (code: string) => void;
  majSolde: (solde: number) => void;
  badge: (n: number) => void;
  nettoyer: (f: () => void) => void;
}

const PC = '<i class="pc"></i>';
const NOMS_JEUX: Record<string, string> = { poker: 'Poker', blackjack: 'Black Jack', roulette: 'Roulette' };
const av = (p: Personne, taille = 46, humeur = 'content') => avatarSVG(p.avatar as never, humeur as never, taille, { cadre: p.cadre });
const erreur = (e: unknown) => toast(e instanceof ErreurApi ? e.message : 'Connexion impossible', true);

/** Ce que fait un ami en ce moment, en une ligne. */
function statut(a: Ami) {
  if (!a.enLigne) return 'Hors ligne';
  if (!a.table) return 'En ligne · dans le Club';
  return `${NOMS_JEUX[a.table.jeu] ?? a.table.jeu} · ${esc(a.table.nom)} (${a.table.joueurs}/${a.table.places})`;
}

export function vueAmis(c: HTMLElement, ctx: ContexteAmis) {
  c.innerHTML = `<div class="vue-amis">
    <h1 style="font-size:26px;margin-bottom:12px">Mes amis</h1>
    <form class="ajout-ami" data-ajout><input name="pseudo" placeholder="Pseudo d'un joueur du Club" autocomplete="off" autocapitalize="off" maxlength="24" required><button class="btn btn-or">Ajouter</button></form>
    <div data-recues></div>
    <div data-liste><span class="doux">Chargement…</span></div>
    <div data-envoyees></div>
  </div>`;
  let donnees: ListeAmis | null = null;
  const f = $('[data-ajout]', c) as HTMLFormElement;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const champ = f.pseudo as HTMLInputElement;
    try {
      const r = await api<{ statut: string; pseudo: string }>('/api/amis', { pseudo: champ.value.trim() });
      toast(r.statut === 'ok' ? `${r.pseudo} et toi êtes maintenant amis !` : `Demande envoyée à ${r.pseudo}`);
      champ.value = '';
      jouerSon('clic');
      void charger();
    } catch (err) { erreur(err); }
  };

  async function charger() {
    try { donnees = await api<ListeAmis>('/api/amis'); }
    catch { if (!donnees) $('[data-liste]', c).innerHTML = '<span class="doux">Liste indisponible</span>'; return; }
    if (!c.isConnected) return;
    afficher();
  }

  function afficher() {
    const d = donnees!;
    ctx.badge(d.recues.length);
    $('[data-recues]', c).innerHTML = d.recues.length ? `<h3 class="titre-rubrique">Demandes reçues</h3>${d.recues.map((p) => `
      <div class="ami demande">${av(p, 46, 'ravi')}<span class="txt"><b>${esc(p.pseudo)}</b><small>veut être ton ami</small></span>
        <button class="btn btn-petit btn-vert" data-accepter="${esc(p.pseudo)}">Accepter</button><button class="btn btn-petit btn-fantome" data-refuser="${esc(p.pseudo)}" aria-label="Refuser">✕</button></div>`).join('')}` : '';
    const enLigne = d.amis.filter((a) => a.enLigne).length;
    $('[data-liste]', c).innerHTML = d.amis.length
      ? `<h3 class="titre-rubrique">${d.amis.length} ami${d.amis.length > 1 ? 's' : ''} · ${enLigne} en ligne</h3>${d.amis.map((a) => `
      <div class="ami ${a.enLigne ? 'en-ligne' : ''}">
        <span class="av">${av(a, 46, a.enLigne ? 'content' : 'neutre')}<i></i></span>
        <span class="txt"><b>${esc(a.pseudo)}</b><small>${statut(a)}</small></span>
        ${a.table?.rejoignable ? `<button class="btn btn-petit btn-or" data-rejoindre="${esc(a.table.code)}">Rejoindre</button>` : ''}
        <button class="btn btn-petit btn-fantome" data-cadeau="${esc(a.pseudo)}" aria-label="Offrir des Clubs à ${esc(a.pseudo)}">🎁</button>
        <button class="btn btn-petit btn-fantome" data-plus="${esc(a.pseudo)}" aria-label="Plus d'options">⋯</button>
      </div>`).join('')}`
      : `<div class="vide-liste">Pas encore d'amis au Club.<br>Ajoute tes potes avec leur pseudo : tu verras quand ils jouent, tu pourras les rejoindre en un clic et leur offrir des Clubs.</div>`;
    $('[data-envoyees]', c).innerHTML = d.envoyees.length ? `<h3 class="titre-rubrique">En attente de réponse</h3>${d.envoyees.map((p) => `
      <div class="ami attente">${av(p, 40, 'neutre')}<span class="txt"><b>${esc(p.pseudo)}</b><small>demande envoyée</small></span>
        <button class="btn btn-petit btn-fantome" data-refuser="${esc(p.pseudo)}">Annuler</button></div>`).join('')}` : '';
    $$('[data-accepter]', c).forEach((b) => b.onclick = async () => {
      try { await api(`/api/amis/${encodeURIComponent(b.dataset.accepter!)}/accepter`, {}); jouerSon('gagne'); toast(`${b.dataset.accepter} et toi êtes maintenant amis !`); void charger(); } catch (e) { erreur(e); }
    });
    $$('[data-refuser]', c).forEach((b) => b.onclick = async () => {
      try { await api(`/api/amis/${encodeURIComponent(b.dataset.refuser!)}`, undefined, 'DELETE'); void charger(); } catch (e) { erreur(e); }
    });
    $$('[data-rejoindre]', c).forEach((b) => b.onclick = () => { jouerSon('jetons'); ctx.rejoindreCode(b.dataset.rejoindre!); });
    $$('[data-cadeau]', c).forEach((b) => b.onclick = () => offrir(b.dataset.cadeau!));
    $$('[data-plus]', c).forEach((b) => b.onclick = () => options(b.dataset.plus!));
  }

  function offrir(pseudo: string) {
    const d = donnees!;
    const montants = [100, 500, 1_000, 5_000].filter((m) => m <= d.cadeaux.reste);
    const p = panneau(`<h2>🎁 Offrir des Clubs à ${esc(pseudo)}</h2>
      <p class="doux petit" style="margin:0 0 12px">${d.cadeaux.reste ? `Tu peux encore offrir ${fmt(d.cadeaux.reste)} ${PC} aujourd'hui.` : `Plafond atteint pour aujourd'hui. Reviens demain !`}</p>
      <div class="montants-cadeau">${montants.map((m) => `<button class="btn" data-m="${m}">${fmt(m)} ${PC}</button>`).join('')}</div>`);
    $$('[data-m]', p.el).forEach((b) => b.onclick = async () => {
      try {
        const r = await api<{ etat: { solde: number } }>(`/api/amis/${encodeURIComponent(pseudo)}/cadeau`, { montant: Number(b.dataset.m) });
        p.fermer();
        ctx.majSolde(r.etat.solde);
        jouerSon('jetons');
        toast(`${fmt(Number(b.dataset.m))} Clubs offerts à ${pseudo} !`);
        void charger();
      } catch (e) { erreur(e); }
    });
  }

  function options(pseudo: string) {
    const p = panneau(`<h2>${esc(pseudo)}</h2><button class="btn btn-corail btn-plein" data-retirer>Retirer de mes amis</button>`);
    $('[data-retirer]', p.el).onclick = async () => {
      try { await api(`/api/amis/${encodeURIComponent(pseudo)}`, undefined, 'DELETE'); p.fermer(); toast(`${pseudo} n'est plus dans tes amis`); void charger(); } catch (e) { erreur(e); }
    };
  }

  void charger();
  const m = setInterval(() => void charger(), 8_000);
  ctx.nettoyer(() => clearInterval(m));
  return { recharger: () => void charger() };
}

/** Depuis une table : la liste des amis connectés, à inviter d'un clic. */
export async function ouvrirInvitation() {
  const p = panneau(`<h2>Inviter des amis</h2><p class="doux petit" style="margin:0 0 12px">Ils recevront une invitation pour te rejoindre à cette table.</p><div data-inv><span class="doux">Chargement…</span></div>`);
  try {
    const d = await api<ListeAmis>('/api/amis');
    const dispo = d.amis;
    $('[data-inv]', p.el).innerHTML = dispo.length ? dispo.map((a) => `<div class="ami ${a.enLigne ? 'en-ligne' : ''}"><span class="av">${av(a, 40)}<i></i></span><span class="txt"><b>${esc(a.pseudo)}</b><small>${statut(a)}</small></span>
      <button class="btn btn-petit ${a.enLigne ? 'btn-or' : ''}" data-inviter="${esc(a.pseudo)}">${a.enLigne ? 'Inviter' : 'Prévenir'}</button></div>`).join('')
      : `<div class="vide-liste">Tu n'as pas encore d'amis : ajoute-les dans l'onglet Amis du Club.<br>Tu peux aussi leur envoyer le code de la table.</div>`;
    $$('[data-inviter]', p.el).forEach((b) => b.onclick = async () => {
      try { await api(`/api/amis/${encodeURIComponent(b.dataset.inviter!)}/inviter`, {}); b.textContent = 'Invité ✓'; (b as HTMLButtonElement).disabled = true; jouerSon('clic'); }
      catch (e) { erreur(e); }
    });
  } catch (e) { $('[data-inv]', p.el).innerHTML = ''; erreur(e); }
}

/**
 * Choisir des amis à emmener (Casino, table privée) : ils reçoivent une invitation dès qu'on est assis.
 * Ceux qui ne sont pas connectés la trouvent dans leur cloche.
 */
export function choisirAmis(deja: string[], texte = 'Ils recevront une invitation dès que tu seras assis.'): Promise<string[] | null> {
  return new Promise((fini) => {
    let choix = new Set(deja.map((x) => x.toLowerCase()));
    let valide = false;
    const p = panneau(`<h2>Jouer avec des potes</h2><p class="doux petit" style="margin:0 0 12px">${texte}</p><div data-choix><span class="doux">Chargement…</span></div>
      <button class="btn btn-or btn-plein" data-ok style="margin-top:14px">C'est bon</button>`, { onFerme: () => { if (!valide) fini(null); } });
    $('[data-ok]', p.el).onclick = () => { valide = true; p.fermer(); fini(d ? d.amis.filter((a) => choix.has(a.pseudo.toLowerCase())).map((a) => a.pseudo) : []); };
    let d: ListeAmis | null = null;
    void api<ListeAmis>('/api/amis').then((r) => {
      d = r;
      const z = $('[data-choix]', p.el);
      if (!r.amis.length) { z.innerHTML = '<div class="vide-liste">Tu n\'as pas encore d\'amis : ajoute-les dans l\'onglet Amis du Club.</div>'; return; }
      z.innerHTML = `<div class="choix-amis">${r.amis.map((a) => `<label class="ami ${a.enLigne ? 'en-ligne' : ''}"><span class="av">${av(a, 40)}<i></i></span>
        <span class="txt"><b>${esc(a.pseudo)}</b><small>${statut(a)}</small></span><input type="checkbox" value="${esc(a.pseudo)}" ${choix.has(a.pseudo.toLowerCase()) ? 'checked' : ''}><span class="coche"></span></label>`).join('')}</div>`;
      $$('input', z).forEach((i) => (i as HTMLInputElement).onchange = () => {
        const v = (i as HTMLInputElement).value.toLowerCase();
        if ((i as HTMLInputElement).checked) { if (choix.size >= 5) { (i as HTMLInputElement).checked = false; toast('5 potes maximum', true); return; } choix.add(v); } else choix.delete(v);
        jouerSon('clic');
      });
    }).catch(erreur);
    choix = new Set(choix);
  });
}

/** Une invitation reçue : une carte en bas de l'écran, avec « Rejoindre ». */
export function carteInvitation(m: MessageAmi, rejoindre: (code: string) => void) {
  const t = m.table!;
  document.querySelector('.carte-invitation')?.remove();
  const el = html(`<div class="carte-invitation" role="dialog" aria-label="Invitation">
    ${av(m.de as Personne, 46, 'ravi')}
    <span class="txt"><small>Invitation</small><b>${esc(m.de.pseudo)} t'invite à sa table</b><span>${NOMS_JEUX[t.jeu] ?? t.jeu} · ${esc(t.nom)}${t.ville ? ' · en Clubs' : ''}</span></span>
    <span class="boutons"><button class="btn btn-petit btn-or" data-oui>Rejoindre</button><button class="btn btn-petit btn-fantome" data-non>Plus tard</button></span>
  </div>`);
  document.body.appendChild(el);
  jouerSon('gagne');
  const fermer = () => { el.classList.add('part'); setTimeout(() => el.remove(), 400); };
  $('[data-oui]', el).onclick = () => { fermer(); rejoindre(t.code); };
  $('[data-non]', el).onclick = fermer;
  setTimeout(fermer, 30_000);
}
