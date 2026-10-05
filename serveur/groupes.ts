import crypto from "crypto";
import { Joueur } from "./comptes";
import { aujourdhui, Contexte, ErreurHttp, estJouable } from "./contexte";
import { numeroGrille } from "./dates";
import { motVisible } from "./parties";

export interface Groupe {
  id: number;
  nom: string;
  adminId: number;
  codeInvitation: string;
}

export type StatutJoueur = "trouve" | "en-cours" | "non-trouve" | "pas-joue";

export interface ResultatJoueur extends Joueur {
  statut: StatutJoueur;
  temps: number | null;
  nbEssais: number;
}

export interface ResultatsDuJour {
  date: string;
  numero: number;
  mot: string;
  joueurs: Array<ResultatJoueur>;
  gagnants: Array<number>;
  stats: {
    tempsMin: number | null;
    tempsMoyen: number | null;
    tempsMax: number | null;
    nbEssaisMoyen: number | null;
    nbTrouves: number;
    nbNonTrouves: number;
  };
}

const ALPHABET_CODE = "abcdefghjkmnpqrstuvwxyz23456789";

export function genererCodeInvitation(): string {
  const octets = crypto.randomBytes(10);
  return Array.from(octets, (octet) => ALPHABET_CODE[octet % ALPHABET_CODE.length]).join("");
}

export function validerNomGroupe(nom: unknown): string | null {
  if (typeof nom !== "string") return null;
  const nettoye = nom.trim();
  return nettoye.length >= 1 && nettoye.length <= 40 ? nettoye : null;
}

export function lireGroupe(ctx: Contexte, groupeId: number): Groupe | undefined {
  return ctx.bdd
    .prepare("SELECT id, nom, admin_id AS adminId, code_invitation AS codeInvitation FROM groupes WHERE id = ?")
    .get(groupeId) as Groupe | undefined;
}

export function lireGroupeParCode(ctx: Contexte, code: string): Groupe | undefined {
  return ctx.bdd
    .prepare("SELECT id, nom, admin_id AS adminId, code_invitation AS codeInvitation FROM groupes WHERE code_invitation = ?")
    .get(code) as Groupe | undefined;
}

export function estMembre(ctx: Contexte, groupeId: number, joueurId: number): boolean {
  return ctx.bdd.prepare("SELECT 1 FROM membres WHERE groupe_id = ? AND joueur_id = ?").get(groupeId, joueurId) !== undefined;
}

// Le groupe, à condition d'en être membre (sinon on fait comme s'il n'existait pas)
export function groupeDuMembre(ctx: Contexte, groupeId: number, joueurId: number): Groupe {
  const groupe = lireGroupe(ctx, groupeId);
  if (!groupe || !estMembre(ctx, groupeId, joueurId)) throw new ErreurHttp(404, "Groupe introuvable.");
  return groupe;
}

export function membresDuGroupe(ctx: Contexte, groupeId: number): Array<Joueur> {
  return ctx.bdd
    .prepare(
      `SELECT j.id, j.pseudo, j.couleur FROM membres m JOIN joueurs j ON j.id = m.joueur_id
       WHERE m.groupe_id = ? ORDER BY m.rejoint_le, j.id`
    )
    .all(groupeId) as Array<Joueur>;
}

export function groupesDuJoueur(ctx: Contexte, joueurId: number): Array<Groupe> {
  return ctx.bdd
    .prepare(
      `SELECT g.id, g.nom, g.admin_id AS adminId, g.code_invitation AS codeInvitation
       FROM membres m JOIN groupes g ON g.id = m.groupe_id
       WHERE m.joueur_id = ? ORDER BY m.rejoint_le, g.id`
    )
    .all(joueurId) as Array<Groupe>;
}

export function creerGroupe(ctx: Contexte, nom: string, adminId: number): Groupe {
  const maintenant = ctx.horloge();
  const creer = ctx.bdd.transaction(() => {
    const { lastInsertRowid } = ctx.bdd
      .prepare("INSERT INTO groupes (nom, code_invitation, admin_id, cree_le) VALUES (?, ?, ?, ?)")
      .run(nom, genererCodeInvitation(), adminId, maintenant);
    ctx.bdd.prepare("INSERT INTO membres (groupe_id, joueur_id, rejoint_le) VALUES (?, ?, ?)").run(lastInsertRowid, adminId, maintenant);
    return Number(lastInsertRowid);
  });
  return lireGroupe(ctx, creer()) as Groupe;
}

export function rejoindreGroupe(ctx: Contexte, groupeId: number, joueurId: number): void {
  ctx.bdd.prepare("INSERT OR IGNORE INTO membres (groupe_id, joueur_id, rejoint_le) VALUES (?, ?, ?)").run(groupeId, joueurId, ctx.horloge());
}

export function regenererCodeInvitation(ctx: Contexte, groupeId: number): string {
  const code = genererCodeInvitation();
  ctx.bdd.prepare("UPDATE groupes SET code_invitation = ? WHERE id = ?").run(code, groupeId);
  return code;
}

// Résultats d'une grille pour les membres du groupe (à n'appeler que si le mot est visible pour le demandeur)
export function resultatsDuJour(ctx: Contexte, groupeId: number, date: string, mot: string): ResultatsDuJour {
  const lignes = ctx.bdd
    .prepare(
      `SELECT j.id, j.pseudo, j.couleur, p.debut, p.fin,
              (SELECT COUNT(*) FROM essais e WHERE e.partie_id = p.id) AS nbEssais
       FROM membres m
       JOIN joueurs j ON j.id = m.joueur_id
       LEFT JOIN parties p ON p.joueur_id = j.id AND p.date = ?
       WHERE m.groupe_id = ?
       ORDER BY m.rejoint_le, j.id`
    )
    .all(date, groupeId) as Array<Joueur & { debut: number | null; fin: number | null; nbEssais: number }>;

  const jouable = estJouable(ctx, date);
  const joueurs: Array<ResultatJoueur> = lignes.map((ligne) => {
    let statut: StatutJoueur = "pas-joue";
    if (ligne.fin !== null) statut = "trouve";
    else if (ligne.debut !== null) statut = jouable ? "en-cours" : "non-trouve";
    return {
      id: ligne.id,
      pseudo: ligne.pseudo,
      couleur: ligne.couleur,
      statut,
      temps: ligne.fin !== null && ligne.debut !== null ? ligne.fin - ligne.debut : null,
      nbEssais: ligne.nbEssais,
    };
  });

  const trouves = joueurs.filter((joueur) => joueur.statut === "trouve");
  const temps = trouves.map((joueur) => joueur.temps as number);
  const tempsMin = temps.length > 0 ? Math.min(...temps) : null;

  return {
    date,
    numero: numeroGrille(date),
    mot,
    joueurs,
    gagnants: trouves.filter((joueur) => joueur.temps === tempsMin).map((joueur) => joueur.id),
    stats: {
      tempsMin,
      tempsMoyen: temps.length > 0 ? temps.reduce((somme, valeur) => somme + valeur, 0) / temps.length : null,
      tempsMax: temps.length > 0 ? Math.max(...temps) : null,
      nbEssaisMoyen: trouves.length > 0 ? trouves.reduce((somme, joueur) => somme + joueur.nbEssais, 0) / trouves.length : null,
      nbTrouves: trouves.length,
      nbNonTrouves: joueurs.filter((joueur) => joueur.statut === "non-trouve").length,
    },
  };
}

// Toutes les grilles jouées par au moins un membre, sauf celles dont le mot est encore caché pour le demandeur
export function historiqueDuGroupe(ctx: Contexte, groupeId: number, demandeurId: number, tri: "date" | "difficulte", limite: number): Array<ResultatsDuJour> {
  const dates = ctx.bdd
    .prepare(
      `SELECT DISTINCT p.date FROM parties p JOIN membres m ON m.joueur_id = p.joueur_id
       WHERE m.groupe_id = ? AND p.date <= ? ORDER BY p.date DESC`
    )
    .all(groupeId, aujourdhui(ctx)) as Array<{ date: string }>;

  const historique = dates
    .filter(({ date }) => motVisible(ctx, demandeurId, date))
    .map(({ date }) => resultatsDuJour(ctx, groupeId, date, ctx.motsDuJour.lire(date) as string));

  if (tri === "difficulte") {
    // Les plus durs d'abord : temps moyen le plus long, puis le plus de non trouvés
    historique.sort(
      (a, b) => (b.stats.tempsMoyen ?? -1) - (a.stats.tempsMoyen ?? -1) || b.stats.nbNonTrouves - a.stats.nbNonTrouves
    );
  }
  return historique.slice(0, limite);
}

export interface Profil extends Joueur {
  stats: {
    nbParties: number;
    nbTrouvees: number;
    tempsMoyen: number | null;
    tempsMedian: number | null;
    meilleurTemps: number | null;
    nbEssaisMoyen: number | null;
  };
  victoires: Array<{ groupeId: number; nom: string; nb: number }>;
  historique: Array<{ date: string; numero: number; mot?: string; trouve: boolean; temps: number | null; nbEssais: number }>;
}

export function profilJoueur(ctx: Contexte, cibleId: number, demandeurId: number): Profil {
  const joueur = ctx.bdd.prepare("SELECT id, pseudo, couleur FROM joueurs WHERE id = ?").get(cibleId) as Joueur | undefined;
  const groupesCommuns = groupesDuJoueur(ctx, cibleId).filter((groupe) => estMembre(ctx, groupe.id, demandeurId));
  // On ne voit que son propre profil et celui des membres de ses groupes
  if (!joueur || (cibleId !== demandeurId && groupesCommuns.length === 0)) throw new ErreurHttp(404, "Joueur introuvable.");

  const parties = ctx.bdd
    .prepare(
      `SELECT p.date, p.debut, p.fin, (SELECT COUNT(*) FROM essais e WHERE e.partie_id = p.id) AS nbEssais
       FROM parties p WHERE p.joueur_id = ? ORDER BY p.date DESC`
    )
    .all(cibleId) as Array<{ date: string; debut: number; fin: number | null; nbEssais: number }>;

  // Les parties dont le mot est encore caché pour le demandeur restent privées (sauf sur son propre profil)
  const visibles = parties.filter((partie) => cibleId === demandeurId || motVisible(ctx, demandeurId, partie.date));
  const trouvees = visibles.filter((partie) => partie.fin !== null);
  const temps = trouvees.map((partie) => (partie.fin as number) - partie.debut).sort((a, b) => a - b);

  const victoires = groupesCommuns.map((groupe) => {
    const meilleurs = ctx.bdd
      .prepare(
        `SELECT p.date, MIN(p.fin - p.debut) AS meilleur FROM parties p
         JOIN membres m ON m.joueur_id = p.joueur_id AND m.groupe_id = ?
         WHERE p.fin IS NOT NULL GROUP BY p.date`
      )
      .all(groupe.id) as Array<{ date: string; meilleur: number }>;
    const meilleurParDate = new Map(meilleurs.map((ligne) => [ligne.date, ligne.meilleur]));
    const nb = trouvees.filter(
      (partie) => motVisible(ctx, demandeurId, partie.date) && meilleurParDate.get(partie.date) === (partie.fin as number) - partie.debut
    ).length;
    return { groupeId: groupe.id, nom: groupe.nom, nb };
  });

  return {
    ...joueur,
    stats: {
      nbParties: visibles.length,
      nbTrouvees: trouvees.length,
      tempsMoyen: temps.length > 0 ? temps.reduce((somme, valeur) => somme + valeur, 0) / temps.length : null,
      tempsMedian: mediane(temps),
      meilleurTemps: temps.length > 0 ? temps[0] : null,
      nbEssaisMoyen: trouvees.length > 0 ? trouvees.reduce((somme, partie) => somme + partie.nbEssais, 0) / trouvees.length : null,
    },
    victoires,
    historique: visibles.map((partie) => ({
      date: partie.date,
      numero: numeroGrille(partie.date),
      mot: motVisible(ctx, demandeurId, partie.date) ? ctx.motsDuJour.lire(partie.date) : undefined,
      trouve: partie.fin !== null,
      temps: partie.fin !== null ? partie.fin - partie.debut : null,
      nbEssais: partie.nbEssais,
    })),
  };
}

function mediane(valeursTriees: Array<number>): number | null {
  if (valeursTriees.length === 0) return null;
  const milieu = Math.floor(valeursTriees.length / 2);
  return valeursTriees.length % 2 === 1 ? valeursTriees[milieu] : (valeursTriees[milieu - 1] + valeursTriees[milieu]) / 2;
}
