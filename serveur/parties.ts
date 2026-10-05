import { Contexte, ErreurHttp, estJouable } from "./contexte";
import { numeroGrille } from "./dates";
import { analyserMot, nettoyerMot, ResultatLettre, verifierProposition } from "./mots";

interface LignePartie {
  id: number;
  debut: number;
  fin: number | null;
}

interface LigneEssai {
  numero: number;
  mot: string;
  horodatage: number;
}

export interface EtatPartie {
  date: string;
  numero: number;
  longueur: number;
  premiereLettre: string;
  jouable: boolean;
  mot?: string;
  partie: {
    debut: number;
    fin: number | null;
    temps: number | null;
    essais: Array<{ mot: string; horodatage: number; resultats: Array<ResultatLettre> }>;
  } | null;
}

export function lirePartie(ctx: Contexte, joueurId: number, date: string): LignePartie | undefined {
  return ctx.bdd.prepare("SELECT id, debut, fin FROM parties WHERE joueur_id = ? AND date = ?").get(joueurId, date) as LignePartie | undefined;
}

// Le mot (et les résultats des autres) ne sont visibles qu'une fois trouvé,
// ou quand la grille ne peut plus être jouée (avant-hier et plus ancien).
export function motVisible(ctx: Contexte, joueurId: number | undefined, date: string): boolean {
  if (!estJouable(ctx, date)) return true;
  if (joueurId === undefined) return false;
  const partie = lirePartie(ctx, joueurId, date);
  return partie !== undefined && partie.fin !== null;
}

export async function etatPartie(ctx: Contexte, joueurId: number | undefined, date: string): Promise<EtatPartie> {
  const motATrouver = await ctx.motsDuJour.getMot(date);
  const etat: EtatPartie = {
    date,
    numero: numeroGrille(date),
    longueur: motATrouver.length,
    premiereLettre: motATrouver[0],
    jouable: estJouable(ctx, date),
    partie: null,
  };

  if (joueurId !== undefined) {
    const partie = lirePartie(ctx, joueurId, date);
    if (partie) {
      const essais = ctx.bdd
        .prepare("SELECT numero, mot, horodatage FROM essais WHERE partie_id = ? ORDER BY numero")
        .all(partie.id) as Array<LigneEssai>;
      etat.partie = {
        debut: partie.debut,
        fin: partie.fin,
        temps: partie.fin === null ? null : partie.fin - partie.debut,
        essais: essais.map((essai) => ({ mot: essai.mot, horodatage: essai.horodatage, resultats: analyserMot(motATrouver, essai.mot) })),
      };
    }
  }

  if (motVisible(ctx, joueurId, date)) etat.mot = motATrouver;
  return etat;
}

export async function commencerPartie(ctx: Contexte, joueurId: number, date: string): Promise<EtatPartie> {
  if (!estJouable(ctx, date)) throw new ErreurHttp(403, "Cette grille ne peut plus être jouée.");
  await ctx.motsDuJour.getMot(date); // On vérifie que le mot existe avant de lancer le chrono
  // Une seule partie par joueur et par jour : relancer ne remet pas le chrono à zéro
  ctx.bdd.prepare("INSERT OR IGNORE INTO parties (joueur_id, date, debut) VALUES (?, ?, ?)").run(joueurId, date, ctx.horloge());
  return etatPartie(ctx, joueurId, date);
}

export interface ResultatEssai {
  resultats: Array<ResultatLettre>;
  trouve: boolean;
  numero?: number;
  temps?: number;
}

export async function proposerMot(ctx: Contexte, joueurId: number | undefined, date: string, motBrut: unknown): Promise<ResultatEssai> {
  if (!estJouable(ctx, date)) throw new ErreurHttp(403, "Cette grille ne peut plus être jouée.");
  if (typeof motBrut !== "string") throw new ErreurHttp(400, "Mot manquant.");

  const motATrouver = await ctx.motsDuJour.getMot(date);
  const mot = nettoyerMot(motBrut);
  const erreur = verifierProposition(motATrouver, mot, ctx.dictionnaire);
  if (erreur) throw new ErreurHttp(400, erreur);

  const resultats = analyserMot(motATrouver, mot);
  const trouve = mot === motATrouver;

  // Sans compte : on vérifie le mot, mais rien n'est enregistré
  if (joueurId === undefined) return { resultats, trouve };

  const enregistrer = ctx.bdd.transaction(() => {
    const partie = lirePartie(ctx, joueurId, date);
    if (!partie) throw new ErreurHttp(409, "Cliquez sur « Commencer » pour lancer la partie.");
    if (partie.fin !== null) throw new ErreurHttp(409, "Vous avez déjà trouvé le mot de cette grille.");

    // Horodatage côté serveur : c'est lui qui fait foi pour le chrono
    const horodatage = ctx.horloge();
    const { nb } = ctx.bdd.prepare("SELECT COUNT(*) AS nb FROM essais WHERE partie_id = ?").get(partie.id) as { nb: number };
    ctx.bdd.prepare("INSERT INTO essais (partie_id, numero, mot, horodatage) VALUES (?, ?, ?, ?)").run(partie.id, nb + 1, mot, horodatage);
    if (trouve) ctx.bdd.prepare("UPDATE parties SET fin = ? WHERE id = ?").run(horodatage, partie.id);

    return { resultats, trouve, numero: nb + 1, temps: trouve ? horodatage - partie.debut : undefined };
  });
  return enregistrer();
}
