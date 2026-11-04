import { describe, it, expect } from 'vitest';
import { SalleBJ, REGLAGES_BJ_DEFAUT, MessageBJ, VueBJ } from '../blackjack/salleBJ.js';
import { conseil } from '../blackjack/strategie.js';
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

function creer(reglages = {}) {
  const horloge = new FausseHorloge();
  const boite = new Map<string, MessageBJ[]>();
  let graine = 7;
  const salle = new SalleBJ({
    id: 'b', code: 'BJBJB', hote: { id: 'thomas', nom: 'Thomas', avatar: 'renard' }, horloge,
    rng: (n) => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine % n; },
    reglages: { ...REGLAGES_BJ_DEFAUT, nom: 'BJ', ...reglages },
    sortie: { envoyer: (id, m) => { if (!boite.has(id)) boite.set(id, []); boite.get(id)!.push(m); } },
  });
  const vue = (id: string): VueBJ => (boite.get(id)!.filter((m) => m.type === 'majBJ').at(-1) as any).etat;
  return { salle, horloge, boite, vue };
}

/** Joueur automatique : mise le minimum, refuse l'assurance, suit la stratégie de base. */
function jouerAuto(salle: SalleBJ, vue: (id: string) => VueBJ, id: string) {
  const v = vue(id);
  if (v.phase === 'mises' && v.monSiege !== null && !v.sieges[v.monSiege]!.pret && v.sieges[v.monSiege]!.tapis >= v.reglages.miseMin) salle.commande(id, { c: 'miser', montant: 20 });
  if (v.assuranceAMoi) salle.commande(id, { c: 'assurance', oui: false });
  if (v.legales && v.aParler) {
    const main = v.sieges[v.aParler.siege]!.mains[v.aParler.main];
    salle.commande(id, { c: 'decision', action: conseil(main.cartes, v.croupier.cartes[0]!, v.legales).action });
  }
}

describe('Salle de Black Jack', () => {
  it('deux joueurs jouent des manches jusqu\'à la limite, puis résultats', () => {
    const { salle, horloge, vue, boite } = creer({ manches: 8, tempsReflexion: 20 });
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.commande('thomas', { c: 'lancer' });
    for (let i = 0; i < 2000 && salle.statut !== 'terminee'; i++) {
      horloge.avancer(250);
      jouerAuto(salle, vue, 'thomas');
      jouerAuto(salle, vue, 'leo');
    }
    expect(salle.statut).toBe('terminee');
    const r = vue('thomas').resultats!;
    expect(r.manches).toBe(8);
    expect(r.classement).toHaveLength(2);
    for (const c of r.classement) expect(c.tapis).toBeGreaterThanOrEqual(0);
    // Aucune erreur envoyée aux joueurs
    expect([...boite.values()].flat().filter((m) => m.type === 'erreur')).toEqual([]);
  });

  it('mises : minimum, maximum, tapis ; temps écoulé = rester ; joueur qui ne mise pas regarde la manche', () => {
    const { salle, horloge, vue, boite } = creer({ tempsReflexion: 10, manches: 0 });
    salle.rejoindre({ id: 'leo', nom: 'Léo', avatar: 'ours' });
    salle.commande('thomas', { c: 'lancer' });
    horloge.avancer(500);
    salle.commande('thomas', { c: 'miser', montant: 5 });
    expect((boite.get('thomas')!.at(-1) as any).type).toBe('erreur');
    salle.commande('thomas', { c: 'miser', montant: 5000 });
    expect((boite.get('thomas')!.at(-1) as any).type).toBe('erreur');
    salle.commande('thomas', { c: 'miser', montant: 100 });
    // Léo ne mise pas : la donne part après 15 s
    horloge.avancer(16_000);
    const v = vue('thomas');
    expect(['jeu', 'assurance', 'resultats']).toContain(v.phase);
    expect(v.sieges[1]!.mains).toHaveLength(0);
    expect(v.sieges[0]!.tapis).toBe(900);
    // Thomas ne joue pas : au bout du temps, il reste automatiquement
    for (let i = 0; i < 40; i++) { horloge.avancer(1000); const w = vue('thomas'); if (w.assuranceAMoi) salle.commande('thomas', { c: 'assurance', oui: false }); }
    expect(vue('thomas').numeroManche).toBeGreaterThanOrEqual(2);
  });

  it('sauvegarde : une manche en cours est annulée et les mises rendues', () => {
    const { salle, horloge } = creer({ tempsReflexion: 0 });
    salle.commande('thomas', { c: 'lancer' });
    horloge.avancer(500);
    salle.commande('thomas', { c: 'miser', montant: 200 });
    horloge.avancer(3000);
    const s = salle.exporter();
    expect(s.joueurs[0].tapis).toBe(1000 - (salle.vue('thomas').phase === 'resultats' ? 1000 - salle.vue('thomas').sieges[0]!.tapis : 0));
    salle.arreter();
    const r = new SalleBJ({ id: s.id, code: s.code, hote: s.joueurs[0].membre, reglages: s.reglages, sauvegarde: s, sortie: { envoyer: () => {} } });
    expect(r.statut).toBe('pause');
  });
});
