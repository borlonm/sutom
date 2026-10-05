import { Bdd } from "./bdd";
import { decalerDate, dateLocale, estDateValide } from "./dates";
import { MotsDuJour } from "./motsDuJour";

export interface Contexte {
  bdd: Bdd;
  motsDuJour: MotsDuJour;
  dictionnaire: Set<string>;
  horloge: () => number;
  fuseau: string;
  cookieSecurise: boolean;
}

export class ErreurHttp extends Error {
  public constructor(public readonly statut: number, message: string) {
    super(message);
  }
}

export function aujourdhui(ctx: Contexte): string {
  return dateLocale(ctx.horloge(), ctx.fuseau);
}

// "aujourdhui", "veille" ou AAAA-MM-JJ ; jamais une date future (le mot du lendemain est déjà en ligne la veille)
export function resoudreDate(ctx: Contexte, parametre: string): string {
  const jour = aujourdhui(ctx);
  let date = parametre;
  if (parametre === "aujourdhui") date = jour;
  else if (parametre === "veille") date = decalerDate(jour, -1);
  else if (!estDateValide(parametre)) throw new ErreurHttp(400, "Date invalide.");

  if (date > jour) throw new ErreurHttp(404, "Pas encore de grille pour cette date.");
  return date;
}

// On peut jouer la grille du jour et terminer celle de la veille (comme sur le site officiel)
export function estJouable(ctx: Contexte, date: string): boolean {
  const jour = aujourdhui(ctx);
  return date === jour || date === decalerDate(jour, -1);
}
