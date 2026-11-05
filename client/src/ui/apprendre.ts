/**
 * Apprendre à jouer : des leçons courtes et interactives pour le poker, le Black Jack et la roulette.
 * Chaque leçon alterne des explications illustrées et des mises en situation où l'on choisit,
 * avec la correction expliquée.
 */
import { jouerSon } from '../vue/son';
import { $, $$, esc, html } from './commun';

export type JeuLecon = 'poker' | 'blackjack' | 'roulette';

interface Etape {
  titre: string;
  visuel?: string;
  texte: string;
  /** Mise en situation : un seul bon choix, et l'explication affichée après la réponse. */
  question?: { choix: string[]; bon: number; bravo: string; rate: string };
}

/* ------------------------------ Petits visuels ------------------------------ */

const ROUGES = '♥♦';
/** Une carte : « A♠ », « 10♥ »… ; « ? » pour une carte cachée. */
const carte = (c: string, grand = false) => c === '?'
  ? `<span class="carte-lecon dos ${grand ? 'grand' : ''}"></span>`
  : `<span class="carte-lecon ${ROUGES.includes(c.slice(-1)) ? 'rouge' : ''} ${grand ? 'grand' : ''}"><b>${c.slice(0, -1)}</b><i>${c.slice(-1)}</i></span>`;
const main = (cartes: string, legende?: string, grand = false) => `<div class="main-lecon">${legende ? `<small>${legende}</small>` : ''}<div>${cartes.split(' ').map((c) => carte(c, grand)).join('')}</div></div>`;
const tapisVert = (contenu: string) => `<div class="tapis-lecon">${contenu}</div>`;
const jeton = (n: string, couleur = '#FF6B5B') => `<span class="jeton-lecon" style="--c:${couleur}">${n}</span>`;
const numero = (n: number) => `<span class="num-lecon ${n === 0 ? 'vert' : [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n) ? 'rouge' : 'noir'}">${n}</span>`;

/* ------------------------------ Les leçons ------------------------------ */

const LECONS: Record<JeuLecon, { nom: string; etapes: Etape[] }> = {
  poker: {
    nom: 'Poker',
    etapes: [
      {
        titre: 'Le but du jeu',
        visuel: tapisVert(main('K♠ 9♣ 9♦ 2♥ J♠', 'Les 5 cartes communes, au milieu') + main('9♥ 9♠', 'Tes 2 cartes, cachées')),
        texte: 'Chacun reçoit 2 cartes que lui seul voit. Au milieu, 5 cartes communes sont retournées petit à petit. Ta main, ce sont les 5 meilleures cartes parmi tes 2 et les 5 communes. Ici, tu as un carré de 9 !',
      },
      {
        titre: 'Le classement des mains',
        visuel: `<ol class="classement-mains">${[
          ['Quinte flush royale', 'A♠ K♠ Q♠ J♠ 10♠'], ['Quinte flush', '9♥ 8♥ 7♥ 6♥ 5♥'], ['Carré', 'Q♣ Q♦ Q♥ Q♠ 3♦'], ['Full', '8♠ 8♦ 8♥ 4♣ 4♠'],
          ['Couleur', 'A♦ J♦ 8♦ 5♦ 2♦'], ['Suite (quinte)', '10♣ 9♦ 8♠ 7♥ 6♣'], ['Brelan', '7♣ 7♦ 7♠ K♥ 2♣'], ['Deux paires', 'J♥ J♣ 4♦ 4♠ A♣'], ['Paire', '10♥ 10♠ K♣ 6♦ 3♥'], ['Carte haute', 'A♣ Q♦ 9♠ 6♥ 2♣'],
        ].map(([n, c]) => `<li><b>${n}</b><span>${c.split(' ').map((x) => carte(x)).join('')}</span></li>`).join('')}</ol>`,
        texte: 'De la plus forte à la plus faible. À égalité de combinaison, c\'est la carte la plus haute qui départage.',
      },
      {
        titre: 'À toi : laquelle gagne ?',
        visuel: tapisVert(main('A♦ J♦ 8♦ 5♦ 2♦', 'Main de Léo') + main('10♣ 9♦ 8♠ 7♥ 6♣', 'Main de Sam')),
        texte: 'Léo a 5 carreaux, Sam a 5 cartes qui se suivent. Qui gagne le pot ?',
        question: { choix: ['Léo (la couleur)', 'Sam (la suite)', 'Égalité'], bon: 0, bravo: 'Oui : la couleur bat la suite. C\'est plus rare d\'avoir 5 cartes de la même couleur.', rate: 'Raté : la couleur (5 cartes de la même couleur) bat la suite. Elle est plus rare.' },
      },
      {
        titre: 'Le déroulé d\'une main',
        visuel: `<div class="frise-lecon">${[['Blindes', 'les 2 joueurs après le bouton misent d\'office'], ['Préflop', 'on parle avec ses 2 cartes'], ['Flop', '3 cartes communes'], ['Turn', '1 carte de plus'], ['River', 'la dernière'], ['Abattage', 'on montre, la meilleure main gagne']].map(([a, b], i) => `<div><span>${i + 1}</span><b>${a}</b><small>${b}</small></div>`).join('')}</div>`,
        texte: 'Après chaque étape, un tour de paroles. Si tout le monde se couche sauf un joueur, il gagne sans montrer ses cartes : c\'est là qu\'on peut bluffer !',
      },
      {
        titre: 'Tes actions',
        visuel: `<div class="actions-lecon"><span class="b vert">Parole</span><span class="b vert">Suivre</span><span class="b or">Relancer</span><span class="b corail">Se coucher</span><span class="b prune">Tapis</span></div>`,
        texte: 'Parole : ne rien miser, si personne n\'a misé avant toi. Suivre : mettre autant que la mise en cours. Relancer : miser plus. Se coucher : abandonner la main (et ce que tu as déjà misé). Tapis : tout miser.',
      },
      {
        titre: 'À toi : que peux-tu faire gratuitement ?',
        visuel: tapisVert(main('7♣ 2♦', 'Tes cartes') + `<div class="info-lecon">Personne n'a misé avant toi sur ce tour.</div>`),
        texte: 'Ta main est faible, mais personne n\'a encore misé. Quelle action ne te coûte rien ?',
        question: { choix: ['Parole', 'Suivre', 'Se coucher'], bon: 0, bravo: 'Exact : « parole », c\'est passer son tour sans miser. Pas besoin de se coucher quand c\'est gratuit !', rate: 'Pas tout à fait : avec « parole », tu passes sans rien miser. Se coucher abandonnerait la main pour rien.' },
      },
      {
        titre: 'À toi : qu\'as-tu en main ?',
        visuel: tapisVert(main('Q♠ J♠ 2♦ 7♥ 10♠', 'Cartes communes') + main('A♠ K♠', 'Tes cartes')),
        texte: 'Regarde bien les piques…',
        question: { choix: ['Une couleur', 'Une quinte flush royale', 'Une suite'], bon: 1, bravo: 'Le jackpot ! A♠ K♠ Q♠ J♠ 10♠ : la meilleure main possible.', rate: 'Mieux que ça : A, K, Q, J et 10, tous à pique. C\'est une quinte flush royale, la meilleure main du jeu !' },
      },
      {
        titre: 'À toi : et là ?',
        visuel: tapisVert(main('9♣ 4♠ 4♥ K♦ 2♣', 'Cartes communes') + main('9♥ 9♦', 'Tes cartes')),
        texte: 'Tu as une paire de 9 en main.',
        question: { choix: ['Un brelan', 'Deux paires', 'Un full'], bon: 2, bravo: 'Bien vu : trois 9 et deux 4, c\'est un full (« 9 par les 4 »).', rate: 'Regarde les 4 du milieu : trois 9 + deux 4 = un full, bien plus fort qu\'un brelan.' },
      },
      {
        titre: 'Deux conseils pour bien débuter',
        texte: 'Ne joue pas toutes les mains : les paires et les grosses cartes (As, Roi, Dame) valent la peine, le reste se couche souvent. Et méfie-toi d\'une grosse relance d\'un joueur prudent : il a souvent du jeu. Tu es prêt !',
      },
    ],
  },
  blackjack: {
    nom: 'Black Jack',
    etapes: [
      {
        titre: 'Le but du jeu',
        visuel: tapisVert(main('10♥ ?', 'Le croupier') + main('K♠ 9♦', 'Toi : 19')),
        texte: 'Tu joues contre le croupier, pas contre les autres joueurs. Il faut s\'approcher le plus possible de 21 sans le dépasser. Au-delà de 21, tu as perdu.',
      },
      {
        titre: 'Ce que valent les cartes',
        visuel: `<div class="valeurs-lecon"><div>${carte('7♣')}<b>= 7</b></div><div>${carte('K♥')}${carte('Q♠')}${carte('J♦')}<b>= 10</b></div><div>${carte('A♠')}<b>= 1 ou 11</b></div></div>`,
        texte: 'Les cartes de 2 à 10 valent leur chiffre, les figures valent 10, et l\'As vaut 1 ou 11 (le plus avantageux pour toi). As + figure dès les 2 premières cartes, c\'est un Black Jack, payé 3 contre 2.',
      },
      {
        titre: 'À toi : combien vaut ta main ?',
        visuel: tapisVert(main('A♥ 7♣', 'Tes cartes', true)),
        texte: 'Tu as un As et un 7.',
        question: { choix: ['8', '18', '8 ou 18'], bon: 2, bravo: 'Oui : 8 ou 18. Le jeu l\'affiche « 8/18 ». Si tu tires une grosse carte, l\'As repasse à 1 et tu ne sautes pas.', rate: 'L\'As vaut 1 ou 11 : ta main vaut donc 8 ou 18 (affichée « 8/18 »).' },
      },
      {
        titre: 'Tes actions',
        visuel: `<div class="actions-lecon"><span class="b vert">Tirer</span><span class="b corail">Rester</span><span class="b or">Doubler</span><span class="b ciel">Séparer</span><span class="b prune">Abandon</span></div>`,
        texte: 'Tirer : une carte de plus. Rester : garder ta main. Doubler : doubler la mise et recevoir une seule carte. Séparer : avec une paire, faire deux mains. Abandon : récupérer la moitié de ta mise et passer.',
      },
      {
        titre: 'À toi : 16 contre un 10',
        visuel: tapisVert(main('10♦ ?', 'Le croupier') + main('10♣ 6♥', 'Toi : 16')),
        texte: 'Le croupier montre un 10. Il a de bonnes chances d\'avoir 20. Que fais-tu ?',
        question: { choix: ['Tirer', 'Rester'], bon: 0, bravo: 'Bien vu : en restant à 16, tu perds presque toujours contre un 10. Il vaut mieux tenter sa chance.', rate: 'Pas idéal : le croupier doit juste faire 17 ou plus, ce qui arrive très souvent avec un 10. Ici, tirer est le meilleur coup.' },
      },
      {
        titre: 'À toi : 11 contre un 6',
        visuel: tapisVert(main('6♠ ?', 'Le croupier') + main('7♦ 4♣', 'Toi : 11')),
        texte: 'Tu as 11, le croupier montre un 6 (une carte faible pour lui).',
        question: { choix: ['Tirer', 'Rester', 'Doubler'], bon: 2, bravo: 'Parfait ! Avec 11, beaucoup de cartes te donnent 20 ou 21, et le croupier risque de sauter avec son 6. C\'est le moment de doubler.', rate: 'C\'est le moment de doubler : avec 11, une figure te donne 21, et le croupier avec un 6 saute souvent.' },
      },
      {
        titre: 'À toi : une paire de 8',
        visuel: tapisVert(main('9♥ ?', 'Le croupier') + main('8♠ 8♦', 'Toi : 16')),
        texte: 'Deux 8 font 16, la pire main du jeu…',
        question: { choix: ['Rester', 'Séparer', 'Abandon'], bon: 1, bravo: 'Exactement : on sépare toujours les 8. Deux mains qui partent de 8 valent bien mieux qu\'un 16.', rate: 'La règle d\'or : on sépare toujours les As et les 8. Deux mains de 8, c\'est bien mieux qu\'un 16.' },
      },
      {
        titre: 'Le croupier, lui, n\'a pas le choix',
        texte: 'Une fois que tout le monde a joué, il retourne sa carte cachée et tire jusqu\'à 16, puis s\'arrête à 17 ou plus. S\'il dépasse 21, tous les joueurs encore en jeu gagnent. L\'assurance (proposée quand il montre un As) est un pari perdant à la longue : refuse-la. Et le bouton « Conseil » est là pendant la partie !',
      },
    ],
  },
  roulette: {
    nom: 'Roulette',
    etapes: [
      {
        titre: 'Le but du jeu',
        visuel: `<div class="roue-lecon">${[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27].map(numero).join('')}</div>`,
        texte: 'Le cylindre a 37 cases : de 1 à 36, rouges ou noires, plus le zéro, vert. Tu poses tes jetons sur le tapis pour deviner où la bille va s\'arrêter. Puis le croupier dit « Rien ne va plus » et lance la bille.',
      },
      {
        titre: 'Où poser ses jetons',
        visuel: `<div class="mini-tapis-lecon">${[3, 6, 9, 2, 5, 8, 1, 4, 7].map((n) => `<span class="${[1, 3, 5, 7, 9].includes(n) ? 'r' : 'n'}">${n}${n === 5 ? jeton('A') : n === 8 ? `<i class="cheval">${jeton('B', '#46C2F0')}</i>` : n === 4 ? `<i class="coin">${jeton('C', '#43B072')}</i>` : ''}</span>`).join('')}</div>
          <div class="legende-lecon"><span>${jeton('A')} Plein (au milieu d'un numéro) : 35 fois la mise</span><span>${jeton('B', '#46C2F0')} Cheval (sur la ligne entre deux) : 17 fois</span><span>${jeton('C', '#43B072')} Carré (au coin de quatre) : 8 fois</span></div>`,
        texte: 'Plus ta mise couvre de numéros, plus elle a de chances de gagner, mais moins elle rapporte. Il y a aussi les transversales (une rangée de 3), les sixains, les douzaines, les colonnes et les chances simples.',
      },
      {
        titre: 'À toi : le 17 sort !',
        visuel: tapisVert(`<div class="info-lecon">Tu avais mis ${jeton('10')} en plein sur le ${numero(17)}</div>`),
        texte: 'Un plein paie 35 fois la mise, et tu récupères aussi ta mise. Combien reçois-tu ?',
        question: { choix: ['35', '350', '360'], bon: 2, bravo: 'Bravo ! 35 × 10 = 350 de gain, plus tes 10 de départ : 360.', rate: 'Le gain, c\'est 35 × 10 = 350, et ta mise te revient aussi : 360 en tout.' },
      },
      {
        titre: 'Les chances simples',
        visuel: `<div class="actions-lecon"><span class="b rouge">Rouge</span><span class="b noir">Noir</span><span class="b">Pair</span><span class="b">Impair</span><span class="b">1 à 18</span><span class="b">19 à 36</span></div>`,
        texte: 'Presque une chance sur deux, payées 1 contre 1 : tu doubles ta mise. Le zéro n\'est ni rouge ni noir, ni pair ni impair : c\'est lui qui donne l\'avantage à la banque.',
      },
      {
        titre: 'À toi : le zéro sort…',
        visuel: tapisVert(`<div class="info-lecon">Tu avais ${jeton('20')} sur le Rouge. La bille tombe sur le ${numero(0)}.</div>`),
        texte: 'Avec « la partage » (activée par défaut au Club), que deviennent tes 20 ?',
        question: { choix: ['Tu perds tout', 'On te rend 10', 'On te rend 20'], bon: 1, bravo: 'Exact : la partage te rend la moitié de ta mise sur les chances simples quand le zéro sort.', rate: 'Grâce à la partage, tu ne perds que la moitié : on te rend 10.' },
      },
      {
        titre: 'Les boutons utiles',
        texte: '« Rejouer » remet tes mises du tour d\'avant, « Doubler » double tout ce qui est sur le tapis, « Annuler » retire ton dernier jeton. En bas de l\'écran, le nom de ta dernière mise et ce qu\'elle paie s\'affichent. Quand tu es prêt, appuie sur « Prêt ! ». Faites vos jeux !',
      },
    ],
  },
};

/* ------------------------------ La fenêtre ------------------------------ */

export function ouvrirApprendre(depart: JeuLecon = 'poker', onJouer?: (jeu: JeuLecon) => void) {
  const voile = html(`<div class="voile voile-lecon"><div class="lecon" role="dialog" aria-label="Apprendre à jouer">
    <div class="entete-lecon"><b>Apprendre à jouer</b><button class="btn btn-petit btn-fantome" data-fermer aria-label="Fermer">✕</button></div>
    <div class="segments">${(Object.keys(LECONS) as JeuLecon[]).map((j) => `<button data-jeu="${j}">${LECONS[j].nom}</button>`).join('')}</div>
    <div class="points-lecon" data-points></div>
    <div class="corps-lecon" data-corps></div>
    <div class="bas-lecon" data-bas></div>
  </div></div>`);
  document.body.appendChild(voile);
  const fermer = () => voile.remove();
  $('[data-fermer]', voile).onclick = fermer;
  voile.addEventListener('click', (e) => { if (e.target === voile) fermer(); });
  let jeu = depart, i = 0, repondu = false;

  const afficher = () => {
    const l = LECONS[jeu], e = l.etapes[i];
    repondu = false;
    $$('[data-jeu]', voile).forEach((b) => b.classList.toggle('on', b.dataset.jeu === jeu));
    $('[data-points]', voile).innerHTML = l.etapes.map((_, k) => `<i class="${k < i ? 'fait' : k === i ? 'ici' : ''}"></i>`).join('');
    $('[data-corps]', voile).innerHTML = `<h2>${esc(e.titre)}</h2>${e.visuel ? `<div class="visuel-lecon">${e.visuel}</div>` : ''}<p>${esc(e.texte)}</p>
      ${e.question ? `<div class="choix-lecon">${e.question.choix.map((c, k) => `<button class="btn" data-choix="${k}">${esc(c)}</button>`).join('')}</div><div data-correction></div>` : ''}`;
    const dernier = i === l.etapes.length - 1;
    $('[data-bas]', voile).innerHTML = `<button class="btn btn-fantome" data-prec ${i === 0 ? 'disabled' : ''}>Précédent</button>
      ${dernier ? `<button class="btn btn-or" data-fin>${onJouer ? `Jouer ${jeu === 'roulette' ? 'à la' : 'au'} ${l.nom} en solo` : 'C\'est parti !'}</button>` : `<button class="btn btn-or" data-suiv ${e.question ? 'disabled' : ''}>${e.question ? 'Réponds d\'abord' : 'Suivant'}</button>`}`;
    $$('[data-choix]', voile).forEach((b) => b.onclick = () => {
      if (repondu || !e.question) return;
      repondu = true;
      const k = Number(b.dataset.choix), bon = k === e.question.bon;
      $$('[data-choix]', voile).forEach((x) => {
        const n = Number(x.dataset.choix);
        x.classList.toggle('btn-vert', n === e.question!.bon);
        x.classList.toggle('btn-corail', n === k && !bon);
        (x as HTMLButtonElement).disabled = n !== k && n !== e.question!.bon;
      });
      $('[data-correction]', voile).innerHTML = `<div class="correction ${bon ? 'bien' : 'rate'}"><b>${bon ? 'Bien joué !' : 'Pas tout à fait…'}</b>${esc(bon ? e.question.bravo : e.question.rate)}</div>`;
      jouerSon(bon ? 'gagne' : 'parole');
      const s = $('[data-suiv]', voile) as HTMLButtonElement | null;
      if (s) { s.disabled = false; s.textContent = 'Suivant'; }
    });
    const p = $('[data-prec]', voile); if (p) p.onclick = () => { i--; afficher(); };
    const s = $('[data-suiv]', voile); if (s) s.onclick = () => { i++; jouerSon('clic'); afficher(); };
    const f = $('[data-fin]', voile); if (f) f.onclick = () => { fermer(); onJouer?.(jeu); };
    $('[data-corps]', voile).scrollTop = 0;
  };
  $$('[data-jeu]', voile).forEach((b) => b.onclick = () => { jeu = b.dataset.jeu as JeuLecon; i = 0; afficher(); });
  afficher();
}
