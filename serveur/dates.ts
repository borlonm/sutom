// Dates de partie au format AAAA-MM-JJ, dans le fuseau du jeu (un mot va de minuit à minuit, heure locale)

export const FUSEAU_PAR_DEFAUT = "Europe/Brussels";

// Grille n°1 = 08/01/2022 (même origine que InstanceConfiguration.dateOrigine)
const ORIGINE_UTC = Date.UTC(2022, 0, 8);
const UN_JOUR = 24 * 3600 * 1000;

export function dateLocale(instant: number, fuseau: string): string {
  // Le format fr-CA donne directement AAAA-MM-JJ
  return new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}

export function estDateValide(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return versUtc(date) !== null && new Date(versUtc(date) as number).toISOString().slice(0, 10) === date;
}

export function decalerDate(date: string, jours: number): string {
  return new Date((versUtc(date) as number) + jours * UN_JOUR).toISOString().slice(0, 10);
}

export function numeroGrille(date: string): number {
  return Math.round(((versUtc(date) as number) - ORIGINE_UTC) / UN_JOUR) + 1;
}

function versUtc(date: string): number | null {
  const [annee, mois, jour] = date.split("-").map(Number);
  const instant = Date.UTC(annee, mois - 1, jour);
  return isNaN(instant) ? null : instant;
}
