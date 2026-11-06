/**
 * /bienvenue : la page à envoyer aux potes. Ce qu'est le Club, et comment installer l'appli
 * sur iPhone et Android (avec le bon mode d'emploi en premier selon le téléphone).
 */
import { $, html, logoHTML } from './commun';

let invitationInstall: (Event & { prompt: () => Promise<void> }) | null = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); invitationInstall = e as typeof invitationInstall; });

export function ecranBienvenue(racine: HTMLElement, entrer: () => void) {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const installee = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

  const etapesIos = `<section class="install ${ios ? 'pour-toi' : ''}"><h3>📱 iPhone / iPad</h3><ol>
    <li>Ouvre ce lien dans <b>Safari</b> (pas depuis Instagram ou WhatsApp : touche « Ouvrir dans Safari »).</li>
    <li>Touche le bouton <b>Partager</b> <span class="ico-ios">⬆︎</span> en bas de l'écran.</li>
    <li>Fais défiler et choisis <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</li>
    <li>Ouvre All-In Club depuis la nouvelle icône : c'est là que les notifications marchent.</li></ol></section>`;
  const etapesAndroid = `<section class="install ${android ? 'pour-toi' : ''}"><h3>🤖 Android</h3><ol>
    <li>Ouvre ce lien dans <b>Chrome</b>.</li>
    <li>Touche <b>Installer</b> ci-dessous, ou le menu <b>⋮</b> puis <b>« Installer l'application »</b> (ou « Ajouter à l'écran d'accueil »).</li>
    <li>L'icône All-In Club apparaît avec tes autres applis.</li></ol>
    <button class="btn btn-or btn-plein" data-installer hidden>Installer l'appli</button></section>`;

  const el = html(`<div class="ecran bienvenue"><div class="etroit">
    <div class="bienvenue-logo">${logoHTML()}</div>
    <p class="accroche">Le casino cartoon entre potes. On mise des Clubs <i class="pc"></i>, de l'argent fictif : ça ne s'achète pas et ça ne se retire jamais. Juste pour la gloire du classement.</p>
    <div class="atouts">
      <div><span>🃏</span><b>Le Casino</b><small>Poker, Black Jack et roulette, du Bistrot jusqu'à Macao.</small></div>
      <div><span>🎟️</span><b>Le Kiosque</b><small>Tickets à gratter, Keno et Loto Flash en direct.</small></div>
      <div><span>🎡</span><b>La Grande Roue</b><small>Un tour offert chaque jour, et des missions.</small></div>
      <div><span>👥</span><b>Entre potes</b><small>Ta table à toi, pour le fun ou en vrais Clubs.</small></div>
    </div>
    <h2>Installer l'appli</h2>
    ${installee ? '<p class="doux">C\'est déjà fait : tu es dans l\'appli 🎉</p>' : `<p class="doux petit" style="margin-top:0">Pas besoin de store : le Club s'installe directement depuis le navigateur.</p>${ios ? etapesIos + etapesAndroid : etapesAndroid + etapesIos}`}
    <p class="doux petit">💡 Une fois installée, active les notifications dans ton profil : on te prévient quand c'est ton tour, quand un pote t'invite ou t'offre des Clubs.</p>
    <button class="btn btn-or btn-plein grand" data-entrer>Entrer dans le Club</button>
  </div></div>`);
  racine.replaceChildren(el);
  $('[data-entrer]', el).onclick = entrer;
  const b = el.querySelector('[data-installer]') as HTMLButtonElement | null;
  if (b && invitationInstall) {
    b.hidden = false;
    b.onclick = async () => { await invitationInstall?.prompt(); invitationInstall = null; b.hidden = true; };
  }
}
