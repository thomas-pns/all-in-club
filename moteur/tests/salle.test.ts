import { describe, it, expect } from 'vitest';
import { Salle, Horloge, MessageSalle, REGLAGES_DEFAUT, ReglagesSalle, Membre, VueSalle } from '../salle.js';

/** Horloge simulée : on fait avancer le temps à la main. */
class FausseHorloge implements Horloge {
  t = 0;
  private taches: { t: number; fn: () => void; id: number }[] = [];
  private n = 0;
  maintenant() { return this.t; }
  planifier(fn: () => void, ms: number) { const id = ++this.n; this.taches.push({ t: this.t + ms, fn, id }); return id; }
  annuler(h: unknown) { this.taches = this.taches.filter((x) => x.id !== h); }
  /** Avance jusqu'à ce qu'il n'y ait plus rien à faire, ou `max` ms. */
  avancer(max: number, arret?: () => boolean) {
    const fin = this.t + max;
    while (this.taches.length) {
      if (arret?.()) return;
      this.taches.sort((a, b) => a.t - b.t);
      const x = this.taches[0];
      if (x.t > fin) break;
      this.taches.shift();
      this.t = x.t;
      x.fn();
    }
    this.t = Math.max(this.t, fin);
  }
}

function graine(s: number) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function creer(reglages: Partial<ReglagesSalle> = {}, seed = 1) {
  const horloge = new FausseHorloge();
  const boite = new Map<string, MessageSalle[]>();
  const hote: Membre = { id: 'thomas', nom: 'Thomas', avatar: 'renard' };
  const salle = new Salle({
    id: 's1', code: 'ABCDE', hote, horloge, alea: graine(seed),
    reglages: { ...REGLAGES_DEFAUT, nom: 'Test', ...reglages },
    sortie: { envoyer: (id, msg) => { if (!boite.has(id)) boite.set(id, []); boite.get(id)!.push(msg); } },
  });
  const derniereVue = (id: string): VueSalle => {
    const l = boite.get(id)!.filter((m) => m.type === 'maj');
    return (l[l.length - 1] as Extract<MessageSalle, { type: 'maj' }>).etat;
  };
  return { salle, horloge, boite, derniereVue };
}

/** Un « joueur automatique » humain : suit ou parle dès que c'est son tour. */
function brancherJoueurSimple(salle: Salle, boite: Map<string, MessageSalle[]>, id: string) {
  let lu = 0;
  return () => {
    const l = boite.get(id) ?? [];
    for (; lu < l.length; lu++) {
      const m = l[lu];
      if (m.type === 'maj' && m.etat.legales) {
        salle.commande(id, { c: 'action', action: { type: m.etat.legales.peutParler ? 'parole' : 'suivre' } });
      }
    }
  };
}

describe('Salle', () => {
  it("seul l'hôte lance la partie, il faut au moins 2 joueurs", () => {
    const { salle, boite } = creer();
    salle.commande('thomas', { c: 'lancer' });
    expect(boite.get('thomas')!.some((m) => m.type === 'erreur')).toBe(true);
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.commande('leo', { c: 'lancer' });
    expect(boite.get('leo')!.at(-1)).toMatchObject({ type: 'erreur' });
    salle.commande('thomas', { c: 'lancer' });
    expect(salle.statut).toBe('en_jeu');
  });

  it('une partie hôte + bots se déroule seule et conserve les jetons', () => {
    const { salle, horloge, boite } = creer({ bots: 3, tempsReflexion: 20, recaves: 'illimitees' });
    salle.commande('thomas', { c: 'lancer' });
    const joue = brancherJoueurSimple(salle, boite, 'thomas');
    for (let i = 0; i < 400; i++) { horloge.avancer(500); joue(); }
    expect(salle.table.numeroMain).toBeGreaterThan(5);
    const recu = salle.table.joueurs.reduce((s, p) => s + p.recue, 0);
    expect(salle.table.totalJetons()).toBe(recu);
  });

  it("aucune carte cachée d'un autre joueur n'est envoyée avant l'abattage", () => {
    const { salle, horloge, boite } = creer({ bots: 2, tempsReflexion: 10, recaves: 'illimitees' }, 7);
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.commande('thomas', { c: 'lancer' });
    const j1 = brancherJoueurSimple(salle, boite, 'thomas');
    const j2 = brancherJoueurSimple(salle, boite, 'leo');
    for (let i = 0; i < 600; i++) { horloge.avancer(300); j1(); j2(); }
    expect(salle.table.numeroMain).toBeGreaterThan(5);
    for (const id of ['thomas', 'leo']) {
      for (const m of boite.get(id)!) {
        if (m.type !== 'maj') continue;
        // Les seules cartes privées reçues sont les siennes
        const mesCartes = m.evenements.filter((e) => e.t === 'mesCartes');
        expect(mesCartes.length).toBeLessThanOrEqual(1);
        for (const e of m.evenements) {
          if (e.t === 'donne') expect(Object.keys(e)).toEqual(['t', 'ordre']);
        }
        for (const s of m.etat.sieges) {
          if (!s || s.id === id || !s.cartes) continue;
          // Cartes d'un autre visibles : seulement si la main est finie et qu'il les a montrées
          expect(m.etat.mainEnCours).toBe(false);
          expect(s.main).not.toBeNull();
        }
        if (m.etat.legales) expect(m.etat.sieges[m.etat.monSiege!]!.id).toBe(id);
      }
    }
  });

  it("temps écoulé : banque de temps, puis action par défaut ; deux fois de suite → absent", () => {
    const { salle, horloge, derniereVue } = creer({ bots: 1, tempsReflexion: 10 });
    salle.commande('thomas', { c: 'lancer' });
    // Thomas ne joue jamais
    let tours = 0;
    for (let i = 0; i < 400 && !salle.table.joueur('thomas')!.absent; i++) {
      horloge.avancer(1000);
      if (derniereVue('thomas').banqueMs !== null) tours++;
    }
    expect(salle.table.joueur('thomas')!.absent).toBe(true);
    expect(tours).toBeGreaterThan(0); // la banque a bien été utilisée
    expect(derniereVue('thomas').maBanque).toBe(0);
  });

  it('fin automatique quand il ne reste qu\'un joueur avec des jetons, puis Rejouer', () => {
    const { salle, horloge, boite, derniereVue } = creer({ bots: 1, recaves: 'interdites', tempsReflexion: 0 }, 3);
    salle.commande('thomas', { c: 'lancer' });
    // Thomas fait tapis à chaque fois
    for (let i = 0; i < 2000 && salle.statut !== 'terminee'; i++) {
      horloge.avancer(400);
      const v = derniereVue('thomas');
      if (v.legales) salle.commande('thomas', { c: 'action', action: { type: 'tapis' } });
    }
    expect(salle.statut).toBe('terminee');
    const r = derniereVue('thomas').resultats!;
    expect(r.classement).toHaveLength(2);
    expect(r.classement[0].bilan).toBe(1000);
    expect(r.classement[1].bilan).toBe(-1000);
    expect(r.distinctions.map((d) => d.titre)).toContain('Le requin');
    void boite;
    salle.commande('thomas', { c: 'rejouer' });
    expect(salle.statut).toBe('en_jeu');
    expect(salle.table.joueurs.map((p) => p.tapis)).toEqual([1000, 1000]);
  });

  it("l'hôte qui part passe la main au joueur arrivé ensuite", () => {
    const { salle } = creer();
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.rejoindre({ id: 'zoe', nom: 'Zoé', avatar: 'chat' });
    salle.partir('thomas');
    expect(salle.hote).toBe('leo');
  });

  it('une table pleine fait des spectateurs, qui peuvent s\'asseoir quand une place se libère', () => {
    const { salle, derniereVue } = creer({ places: 2 });
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.rejoindre({ id: 'zoe', nom: 'Zoé', avatar: 'chat' });
    expect(derniereVue('zoe').monSiege).toBeNull();
    expect(derniereVue('zoe').spectateurs.map((s) => s.id)).toEqual(['zoe']);
    salle.partir('leo');
    salle.commande('zoe', { c: 'asseoir' });
    expect(derniereVue('zoe').monSiege).not.toBeNull();
  });

  it("l'hôte peut exclure, ajouter et retirer des bots, offrir une recave", () => {
    const { salle, boite } = creer({ recaves: 'interdites' });
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.commande('thomas', { c: 'ajouterBot', niveau: 'difficile' });
    expect(salle.table.joueurs.filter((p) => p.bot)).toHaveLength(1);
    const bot = salle.table.joueurs.find((p) => p.bot)!;
    salle.commande('thomas', { c: 'retirerBot', id: bot.id });
    expect(salle.table.joueurs.filter((p) => p.bot)).toHaveLength(0);
    salle.table.joueur('leo')!.tapis = 0;
    salle.commande('leo', { c: 'recave' });
    expect(boite.get('leo')!.at(-1)).toMatchObject({ type: 'erreur' });
    salle.commande('thomas', { c: 'accorderRecave', id: 'leo' });
    expect(salle.table.joueur('leo')!.tapis).toBe(1000);
    salle.commande('thomas', { c: 'exclure', id: 'leo' });
    expect(boite.get('leo')!.some((m) => m.type === 'exclu')).toBe(true);
    expect(salle.table.joueur('leo')).toBeUndefined();
  });

  it('reconnexion : le joueur retrouve sa place et ses jetons', () => {
    const { salle, horloge, derniereVue } = creer({ bots: 2, tempsReflexion: 0 });
    salle.commande('thomas', { c: 'lancer' });
    horloge.avancer(3000);
    const avant = salle.table.joueur('thomas')!.siege;
    salle.connexion('thomas', false);
    salle.connexion('thomas', true);
    expect(derniereVue('thomas').monSiege).toBe(avant);
  });
});

describe('Salle : chat, émotes, historique, sauvegarde', () => {
  it('chat filtré, anti-spam, émotes, historique des mains', () => {
    const { salle, horloge, boite } = creer({ bots: 1, tempsReflexion: 0 });
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.commande('thomas', { c: 'chat', texte: 'salut espèce de connard' });
    const recu = boite.get('leo')!.filter((m) => m.type === 'chat');
    expect(recu).toHaveLength(1);
    expect((recu[0] as any).message.texte).toBe('salut espèce de c★★★★★★');
    salle.commande('thomas', { c: 'chat', texte: 'encore' }); // trop vite
    expect(boite.get('thomas')!.at(-1)).toMatchObject({ type: 'erreur' });
    salle.commande('leo', { c: 'emote', id: 'requin' });
    expect(boite.get('thomas')!.some((m) => m.type === 'emote' && m.id === 'requin')).toBe(true);
    salle.commande('thomas', { c: 'lancer' });
    for (let i = 0; i < 200 && salle.table.numeroMain < 3; i++) {
      horloge.avancer(500);
      for (const id of ['thomas', 'leo']) {
        const l = boite.get(id)!.filter((m) => m.type === 'maj');
        const e = (l.at(-1) as any)?.etat;
        if (e?.legales) salle.commande(id, { c: 'action', action: { type: e.legales.peutParler ? 'parole' : 'suivre' } });
      }
    }
    salle.commande('leo', { c: 'historique' });
    const h = boite.get('leo')!.find((m) => m.type === 'historique') as any;
    expect(h.mains.length).toBeGreaterThanOrEqual(2);
    for (const main of h.mains) for (const j of main.joueurs) {
      const montre = main.evenements.some((e: any) => e.t === 'abattage' && e.siege === j.siege);
      if (j.id !== 'leo' && !montre) expect(j.cartes).toBeNull();
    }
  });

  it('sauvegarde et restauration : mêmes tapis, partie en pause, joueurs déconnectés', () => {
    const { salle, horloge } = creer({ bots: 2, tempsReflexion: 0, recaves: 'illimitees' });
    salle.commande('thomas', { c: 'lancer' });
    for (let i = 0; i < 40; i++) {
      horloge.avancer(500);
      const m = salle.table.main;
      if (m && m.phase !== 'terminee' && m.aParler !== null && salle.table.sieges[m.aParler]!.id === 'thomas') salle.commande('thomas', { c: 'action', action: { type: 'coucher' } });
    }
    const s = JSON.parse(JSON.stringify(salle.exporter()));
    const total = s.joueurs.reduce((a: number, j: any) => a + j.tapis, 0) + 0;
    salle.arreter();
    const boite2: any[] = [];
    const r = new Salle({ id: s.id, code: s.code, hote: s.joueurs[0].membre, reglages: s.reglages, sauvegarde: s, sortie: { envoyer: (_i, m) => boite2.push(m) } });
    expect(r.statut).toBe('pause');
    expect(r.table.joueurs).toHaveLength(3);
    expect(r.table.joueurs.reduce((a, p) => a + p.tapis, 0)).toBe(total);
    expect(total).toBe(3000);
    expect(r.hote).toBe('thomas');
    r.connexion('thomas', true);
    r.commande('thomas', { c: 'reprendre' });
    expect(r.statut).toBe('en_jeu');
    r.arreter();
  });
});
