import { describe, it, expect } from 'vitest';
import { SalleRoulette, REGLAGES_ROULETTE_DEFAUT, MessageRoulette, VueRoulette } from '../roulette/salleRoulette.js';
import type { Horloge } from '../salle.js';

class FausseHorloge implements Horloge {
  t = 0; private taches: { t: number; fn: () => void; id: number }[] = []; private n = 0;
  maintenant() { return this.t; }
  planifier(fn: () => void, ms: number) { const id = ++this.n; this.taches.push({ t: this.t + ms, fn, id }); return id; }
  annuler(h: unknown) { this.taches = this.taches.filter((x) => x.id !== h); }
  avancer(ms: number) {
    const fin = this.t + ms;
    for (;;) { this.taches.sort((a, b) => a.t - b.t); const x = this.taches[0]; if (!x || x.t > fin) break; this.taches.shift(); this.t = x.t; x.fn(); }
    this.t = fin;
  }
}

function creer(reglages = {}, tirages: number[] = []) {
  const horloge = new FausseHorloge();
  const boite = new Map<string, MessageRoulette[]>();
  let i = 0;
  const salle = new SalleRoulette({
    id: 'r', code: 'ROULE', hote: { id: 'thomas', nom: 'Thomas', avatar: 'renard' }, horloge,
    rng: (n) => (tirages.length ? tirages[i++ % tirages.length] : (i++ * 7) % n),
    reglages: { ...REGLAGES_ROULETTE_DEFAUT, nom: 'R', ...reglages },
    sortie: { envoyer: (id, m) => { if (!boite.has(id)) boite.set(id, []); boite.get(id)!.push(m); } },
  });
  const vue = (id: string): VueRoulette => (boite.get(id)!.filter((m) => m.type === 'majRoulette').at(-1) as any).etat;
  const erreurs = () => [...boite.values()].flat().filter((m) => m.type === 'erreur');
  return { salle, horloge, boite, vue, erreurs };
}

describe('Salle de roulette', () => {
  it('pose des jetons, tire le numéro et paie', () => {
    const { salle, horloge, vue, erreurs } = creer({ tempsMises: 20 }, [17]);
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.commande('thomas', { c: 'lancer' });
    salle.commande('thomas', { c: 'poser', mise: '17', montant: 10 });
    salle.commande('thomas', { c: 'poser', mise: 'rouge', montant: 50 });
    salle.commande('leo', { c: 'poser', mise: 'noir', montant: 100 });
    expect(vue('thomas').sieges[0]!.totalMise).toBe(60);
    expect(vue('thomas').sieges[0]!.tapis).toBe(940);
    salle.commande('thomas', { c: 'pret' });
    salle.commande('leo', { c: 'pret' });
    horloge.avancer(1000);
    expect(vue('thomas').phase).toBe('tirage');
    expect(vue('thomas').numero).toBe(17);
    // 17 est noir : Thomas gagne son plein (360) et perd le rouge ; Léo double sa mise
    expect(vue('thomas').sieges[0]!.tapis).toBe(940 + 360);
    expect(vue('leo').sieges[1]!.tapis).toBe(900 + 200);
    horloge.avancer(20_000);
    expect(vue('thomas').phase).toBe('mises');
    expect(vue('thomas').numeroTour).toBe(2);
    expect(vue('thomas').historique[0]).toBe(17);
    expect(erreurs()).toEqual([]);
  });

  it('refuse les mises invalides, trop chères ou après « rien ne va plus »', () => {
    const { salle, horloge, boite } = creer({ tempsMises: 15 }, [3]);
    salle.commande('thomas', { c: 'lancer' });
    salle.commande('thomas', { c: 'poser', mise: '1-5', montant: 10 });
    salle.commande('thomas', { c: 'poser', mise: '1', montant: 2 });
    salle.commande('thomas', { c: 'poser', mise: '1', montant: 5000 });
    salle.commande('thomas', { c: 'poser', mise: '1', montant: 10 });
    horloge.avancer(16_000);
    salle.commande('thomas', { c: 'poser', mise: '2', montant: 10 });
    const e = boite.get('thomas')!.filter((m) => m.type === 'erreur').map((m) => (m as any).texte);
    expect(e).toEqual(['Mise inconnue', 'Jeton minimum : 5', "Tu n'as pas assez de jetons", 'Rien ne va plus !']);
  });

  it('retirer, effacer, rejouer et doubler les mises', () => {
    const { salle, horloge, vue } = creer({ tempsMises: 0 }, [0]);
    salle.commande('thomas', { c: 'lancer' });
    salle.commande('thomas', { c: 'poser', mise: 'pair', montant: 20 });
    salle.commande('thomas', { c: 'poser', mise: 'd1', montant: 10 });
    salle.commande('thomas', { c: 'retirer', mise: 'd1' });
    expect(vue('thomas').sieges[0]!.mises).toEqual({ pair: 20 });
    salle.commande('thomas', { c: 'repeter', double: true });
    expect(vue('thomas').sieges[0]!.mises).toEqual({ pair: 40 });
    salle.commande('thomas', { c: 'pret' });
    horloge.avancer(10_000);
    // Zéro : la partage rend la moitié
    expect(vue('thomas').sieges[0]!.tapis).toBe(1000 - 40 + 20);
    horloge.avancer(10_000);
    expect(vue('thomas').phase).toBe('mises');
    salle.commande('thomas', { c: 'repeter' });
    expect(vue('thomas').sieges[0]!.mises).toEqual({ pair: 40 });
    salle.commande('thomas', { c: 'effacer' });
    expect(vue('thomas').sieges[0]!.tapis).toBe(980);
    // Temps illimité : on attend le joueur
    horloge.avancer(120_000);
    expect(vue('thomas').phase).toBe('mises');
  });

  it('joue jusqu\'au nombre de tours prévu, et la sauvegarde rend les mises en cours', () => {
    const { salle, horloge, vue } = creer({ tours: 5, tempsMises: 15 });
    salle.commande('thomas', { c: 'lancer' });
    for (let i = 0; i < 400 && salle.statut !== 'terminee'; i++) {
      const v = vue('thomas');
      if (v.phase === 'mises' && !v.sieges[0]!.totalMise) { salle.commande('thomas', { c: 'poser', mise: 'manque', montant: 10 }); salle.commande('thomas', { c: 'pret' }); }
      horloge.avancer(500);
    }
    expect(salle.statut).toBe('terminee');
    expect(vue('thomas').resultats!.tours).toBe(5);
    const s2 = creer({ tempsMises: 15 });
    s2.salle.commande('thomas', { c: 'lancer' });
    s2.salle.commande('thomas', { c: 'poser', mise: '7', montant: 100 });
    const sv = s2.salle.exporter();
    expect(sv.joueurs[0].tapis).toBe(1000);
  });
});
