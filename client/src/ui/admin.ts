/**
 * Le mode admin (réservé au patron du Club) : joueurs et comptes de test, surveillance de l'argent,
 * réglage des récompenses (missions, Grande Roue, série de 7 jours).
 */
import { api, ErreurApi, passerAuCompte } from '../reseau';
import { fmt } from '../art/rendu';
import { avatarSVG } from '../art/avatars';
import { $, $$, esc, panneau, toast, confirmer } from './commun';

interface Joueur { id: number; pseudo: string; avatar: string; email: boolean; cree: number; test: boolean; solde: number; derniere: number | null; enLigne: boolean }
interface Reglages {
  missions: { cle: string; texte: string; recompense: number }[];
  roue: { label: string; clubs: number; tickets: number; poids: number; couleur: string }[];
  calendrier: { multiplicateur: number; tickets: number }[];
}
interface Surveillance { gains24h: { pseudo: string; net: number }[]; prives: { pseudo: string; mise: number; retour: number; net: number }[]; cadeaux: { de: string; a: string; total: number; fois: number }[] }

const erreur = (e: unknown) => toast(e instanceof ErreurApi ? e.message : 'Connexion impossible', true);
const date = (t: number | null) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');
const signe = (n: number) => `<b class="${n >= 0 ? 'plus' : 'moins'}">${n >= 0 ? '+' : ''}${fmt(n)}</b>`;

export function ouvrirAdmin(majSolde: () => void) {
  const p = panneau(`<div class="admin">
    <h2>🛠️ Mode admin</h2>
    <div class="onglets-admin"><button data-ong="joueurs" class="on">Joueurs</button><button data-ong="surveillance">Surveillance</button><button data-ong="recompenses">Récompenses</button></div>
    <div data-zone></div></div>`);
  p.el.classList.add('panneau-large');
  const zone = $('[data-zone]', p.el);
  const aller = (o: string) => {
    $$('[data-ong]', p.el).forEach((b) => b.classList.toggle('on', b.dataset.ong === o));
    zone.innerHTML = '<span class="doux">Chargement…</span>';
    if (o === 'joueurs') void joueurs();
    else if (o === 'surveillance') void surveillance();
    else void recompenses();
  };
  $$('[data-ong]', p.el).forEach((b) => b.onclick = () => aller(b.dataset.ong!));

  async function joueurs() {
    let d: { joueurs: Joueur[] };
    try { d = await api('/api/admin/joueurs'); } catch (e) { zone.innerHTML = ''; return erreur(e); }
    zone.innerHTML = `<div class="ligne" style="justify-content:space-between;margin-bottom:10px"><span class="doux petit">${d.joueurs.length} comptes · ${d.joueurs.filter((j) => j.enLigne).length} en ligne</span>
      <button class="btn btn-petit btn-ciel" data-nouveau-test>＋ Compte de test</button></div>
      <p class="doux petit" style="margin:0 0 10px">Un compte <b>test</b> ne perd jamais rien (rien ne lui est débité) et n'apparaît ni au classement ni dans les annonces. Passe le tien en test pour essayer sans risque.</p>
      <div class="admin-joueurs">${d.joueurs.map((j) => `<div class="admin-joueur ${j.test ? 'test' : ''}">
        <span class="av">${avatarSVG(j.avatar as never, 'content', 38)}${j.enLigne ? '<i></i>' : ''}</span>
        <span class="txt"><b>${esc(j.pseudo)}${j.test ? ' <span class="etiq-test">TEST</span>' : ''}</b><small>${fmt(j.solde)} ♣ · inscrit le ${date(j.cree)} · vu le ${date(j.derniere)}${j.email ? ' · e-mail ✓' : ''}</small></span>
        <span class="actions"><button class="btn btn-petit" data-clubs="${j.id}" data-p="${esc(j.pseudo)}">± Clubs</button><button class="btn btn-petit btn-fantome" data-test="${j.id}">${j.test ? 'Fin du test' : 'Mode test'}</button>${j.test ? `<button class="btn btn-petit btn-ciel" data-incarner="${j.id}">Jouer avec</button><button class="btn btn-petit btn-corail" data-suppr="${j.id}" data-p="${esc(j.pseudo)}">Supprimer</button>` : `<button class="btn btn-petit btn-fantome" data-mdp="${j.id}" data-p="${esc(j.pseudo)}">Mot de passe</button>`}</span>
      </div>`).join('')}</div>`;
    $('[data-nouveau-test]', zone).onclick = async () => {
      try { const r = await api<{ pseudo: string; mdp: string }>('/api/admin/test', {}); afficherIdentifiants(r.pseudo, r.mdp, 'Compte de test créé'); void joueurs(); } catch (e) { erreur(e); }
    };
    $$('[data-incarner]', zone).forEach((b) => b.onclick = async () => {
      try { const r = await api<{ jeton: string }>(`/api/admin/joueurs/${b.dataset.incarner}/incarner`, {}); passerAuCompte(r.jeton); } catch (e) { erreur(e); }
    });
    $$('[data-suppr]', zone).forEach((b) => b.onclick = async () => {
      if (!(await confirmer(`Supprimer le compte ${b.dataset.p} pour de bon ?`, 'Supprimer'))) return;
      try { await api(`/api/admin/joueurs/${b.dataset.suppr}`, undefined, 'DELETE'); toast('Compte supprimé'); void joueurs(); } catch (e) { erreur(e); }
    });
    $$('[data-test]', zone).forEach((b) => b.onclick = async () => { try { await api(`/api/admin/joueurs/${b.dataset.test}/test`, {}); void joueurs(); } catch (e) { erreur(e); } });
    $$('[data-mdp]', zone).forEach((b) => b.onclick = async () => {
      if (!(await confirmer(`Donner un mot de passe provisoire à ${b.dataset.p} ?`, 'Oui, le changer'))) return;
      try { const r = await api<{ pseudo: string; mdp: string }>(`/api/admin/joueurs/${b.dataset.mdp}/mdp`, {}); afficherIdentifiants(r.pseudo, r.mdp, 'Mot de passe provisoire'); } catch (e) { erreur(e); }
    });
    $$('[data-clubs]', zone).forEach((b) => b.onclick = () => {
      const q = panneau(`<h2>Clubs de ${esc(b.dataset.p!)}</h2><form><label class="champ"><span>Montant (négatif pour retirer)</span><input name="montant" type="number" step="1" required></label>
        <label class="champ"><span>Motif (visible dans son portefeuille)</span><input name="motif" maxlength="60" placeholder="Cadeau du Club"></label><button class="btn btn-or btn-plein">Valider</button></form>`);
      const f = $('form', q.el) as HTMLFormElement;
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { await api(`/api/admin/joueurs/${b.dataset.clubs}/clubs`, { montant: Number((f.montant as HTMLInputElement).value), motif: (f.motif as HTMLInputElement).value }); q.fermer(); toast('C\'est fait'); majSolde(); void joueurs(); }
        catch (err) { erreur(err); }
      };
    });
  }

  function afficherIdentifiants(pseudo: string, mdp: string, titre: string) {
    panneau(`<h2>${esc(titre)}</h2><p>Pseudo : <b>${esc(pseudo)}</b><br>Mot de passe : <b style="font-family:monospace;font-size:18px">${esc(mdp)}</b></p>
      <p class="doux petit">Note-le maintenant : il ne sera plus affiché. Il pourra être changé dans le profil.</p>`);
  }

  async function surveillance() {
    let d: Surveillance;
    try { d = await api('/api/admin/surveillance'); } catch (e) { zone.innerHTML = ''; return erreur(e); }
    const vide = '<span class="doux petit">Rien à signaler</span>';
    zone.innerHTML = `<p class="doux petit" style="margin-top:0">Ici on regarde, on n'empêche rien. Un joueur qui perd toujours contre le même ami en table privée, ou des cadeaux à sens unique, ça se voit ici.</p>
      <h3>Plus gros gains sur 24 h</h3><div class="admin-table">${d.gains24h.map((g) => `<div><span>${esc(g.pseudo)}</span>${signe(g.net)}</div>`).join('') || vide}</div>
      <h3>Tables privées en vrais Clubs (7 jours)</h3><div class="admin-table">${d.prives.map((g) => `<div><span>${esc(g.pseudo)}<small>misé ${fmt(g.mise)} · récupéré ${fmt(g.retour)}</small></span>${signe(g.net)}</div>`).join('') || vide}</div>
      <h3>Cadeaux entre amis (7 jours)</h3><div class="admin-table">${d.cadeaux.map((g) => `<div><span>${esc(g.de)} → ${esc(g.a)}<small>${g.fois} fois</small></span><b>${fmt(g.total)}</b></div>`).join('') || vide}</div>`;
  }

  async function recompenses() {
    let r: Reglages;
    try { r = await api('/api/admin/reglages'); } catch (e) { zone.innerHTML = ''; return erreur(e); }
    const totalPoids = () => r.roue.reduce((t, s) => t + s.poids, 0);
    zone.innerHTML = `<form data-reglages>
      <h3>Missions du jour</h3><div class="admin-grille">${r.missions.map((m, i) => `<label><span>${esc(m.texte)}</span><input type="number" min="0" step="50" name="m${i}" value="${m.recompense}"></label>`).join('')}</div>
      <h3>Grande Roue <small class="doux">(gain en Clubs · chance relative)</small></h3><div class="admin-grille roue">${r.roue.map((s, i) => `<label><span><i class="pastille" style="background:${s.couleur}"></i>Case ${i + 1}${s.label === 'JACKPOT' ? ' · JACKPOT' : s.tickets ? ' · ticket' : ''}</span>
        <input type="number" min="0" name="rc${i}" value="${s.clubs}" ${s.tickets && !s.clubs ? 'disabled' : ''}><input type="number" min="0" name="rp${i}" value="${s.poids}" title="Chance"><small data-pct="${i}"></small></label>`).join('')}</div>
      <h3>Série de 7 jours <small class="doux">(multiplicateur de la roue · tickets offerts)</small></h3><div class="admin-grille serie">${r.calendrier.map((j, i) => `<label><span>Jour ${i + 1}</span><input type="number" min="0.5" max="20" step="0.5" name="cm${i}" value="${j.multiplicateur}"><input type="number" min="0" max="10" name="ct${i}" value="${j.tickets}"></label>`).join('')}</div>
      <button class="btn btn-or btn-plein" style="margin-top:14px">Enregistrer</button></form>`;
    const f = $('[data-reglages]', zone) as HTMLFormElement;
    const val = (n: string) => Number((f.elements.namedItem(n) as HTMLInputElement).value);
    const majPct = () => { const tot = r.roue.reduce((t, _s, i) => t + val(`rp${i}`), 0) || 1; r.roue.forEach((_s, i) => { $(`[data-pct="${i}"]`, f).textContent = `${((val(`rp${i}`) / tot) * 100).toFixed(1)} %`; }); };
    f.oninput = majPct; majPct(); void totalPoids;
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/api/admin/reglages', {
          missions: r.missions.map((m, i) => ({ cle: m.cle, recompense: val(`m${i}`) })),
          roue: r.roue.map((s, i) => ({ clubs: s.tickets && !s.clubs ? 0 : val(`rc${i}`), tickets: s.tickets, poids: val(`rp${i}`) })),
          calendrier: r.calendrier.map((_j, i) => ({ multiplicateur: val(`cm${i}`), tickets: val(`ct${i}`) })),
        }, 'PUT');
        toast('Récompenses enregistrées');
        void recompenses();
      } catch (err) { erreur(err); }
    };
  }

  aller('joueurs');
}
