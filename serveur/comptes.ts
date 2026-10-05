import crypto from "crypto";
import { promisify } from "util";
import { Bdd } from "./bdd";

const scrypt = promisify(crypto.scrypt) as (motDePasse: string, sel: Buffer, longueur: number) => Promise<Buffer>;

export const NOM_COOKIE_SESSION = "sutom_session";
export const DUREE_SESSION_MS = 365 * 24 * 3600 * 1000;

// Palette par défaut, une couleur par joueur comme dans le Google Sheet
export const COULEURS = ["#e91e63", "#00bcd4", "#4caf50", "#ff9800", "#9c27b0", "#3f51b5", "#795548", "#607d8b"];

export interface Joueur {
  id: number;
  pseudo: string;
  couleur: string;
}

export async function hasherMotDePasse(motDePasse: string): Promise<string> {
  const sel = crypto.randomBytes(16);
  const hash = await scrypt(motDePasse, sel, 64);
  return `scrypt$${sel.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifierMotDePasse(motDePasse: string, stocke: string): Promise<boolean> {
  const [algo, selHex, hashHex] = stocke.split("$");
  if (algo !== "scrypt" || !selHex || !hashHex) return false;
  const attendu = Buffer.from(hashHex, "hex");
  const calcule = await scrypt(motDePasse, Buffer.from(selHex, "hex"), attendu.length);
  return crypto.timingSafeEqual(attendu, calcule);
}

export function validerPseudo(pseudo: unknown): string | null {
  if (typeof pseudo !== "string") return null;
  const nettoye = pseudo.trim();
  return /^[\p{L}\p{N} _.-]{2,20}$/u.test(nettoye) ? nettoye : null;
}

export function validerMotDePasse(motDePasse: unknown): string | null {
  return typeof motDePasse === "string" && motDePasse.length >= 8 && motDePasse.length <= 200 ? motDePasse : null;
}

export function validerCouleur(couleur: unknown): string | null {
  return typeof couleur === "string" && /^#[0-9a-fA-F]{6}$/.test(couleur) ? couleur.toLowerCase() : null;
}

export function creerSession(bdd: Bdd, joueurId: number, maintenant: number): string {
  const jeton = crypto.randomBytes(32).toString("hex");
  bdd.prepare("INSERT INTO sessions (jeton, joueur_id, expire_le) VALUES (?, ?, ?)").run(jeton, joueurId, maintenant + DUREE_SESSION_MS);
  return jeton;
}

export function supprimerSession(bdd: Bdd, jeton: string): void {
  bdd.prepare("DELETE FROM sessions WHERE jeton = ?").run(jeton);
}

export function joueurDepuisSession(bdd: Bdd, jeton: string, maintenant: number): Joueur | undefined {
  const ligne = bdd
    .prepare(
      `SELECT j.id, j.pseudo, j.couleur, s.expire_le AS expireLe
       FROM sessions s JOIN joueurs j ON j.id = s.joueur_id
       WHERE s.jeton = ?`
    )
    .get(jeton) as (Joueur & { expireLe: number }) | undefined;
  if (!ligne) return undefined;
  if (ligne.expireLe < maintenant) {
    supprimerSession(bdd, jeton);
    return undefined;
  }
  // Session glissante : chaque visite repousse l'expiration
  bdd.prepare("UPDATE sessions SET expire_le = ? WHERE jeton = ?").run(maintenant + DUREE_SESSION_MS, jeton);
  return { id: ligne.id, pseudo: ligne.pseudo, couleur: ligne.couleur };
}

export function lireCookie(entete: string | undefined, nom: string): string | undefined {
  if (!entete) return undefined;
  for (const morceau of entete.split(";")) {
    const [cle, ...valeur] = morceau.trim().split("=");
    if (cle === nom) return decodeURIComponent(valeur.join("="));
  }
  return undefined;
}
