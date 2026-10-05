import { AddressInfo } from "net";
import { creerApp } from "../app";
import { ouvrirBdd } from "../bdd";
import { MotIndisponible, MotsDuJour, SourceMot } from "../motsDuJour";

// 5 octobre 2026, 12h00 à Bruxelles (UTC+2)
export const MIDI_5_OCTOBRE = Date.UTC(2026, 9, 5, 10, 0, 0);

export const MOTS_PAR_DATE: { [date: string]: string } = {
  "2026-10-01": "CUISINES",
  "2026-10-02": "CHAPEAUX",
  "2026-10-03": "CAMPAGNE",
  "2026-10-04": "RANGEMENT",
  "2026-10-05": "CHATEAUX",
  "2026-10-06": "CLAVIERS",
};

export const DICTIONNAIRE = ["CHATEAUX", "CHAPEAUX", "CAMPAGNE", "CUISINES", "CLAVIERS", "CONCERTS", "RANGEMENT", "RACONTERA"];

export interface Reponse {
  statut: number;
  corps: any;
}

export class Client {
  private cookie: string | undefined;

  public constructor(private readonly url: string) {}

  public async requete(methode: string, chemin: string, corps?: unknown, entetes: { [nom: string]: string } = {}): Promise<Reponse> {
    const reponse = await fetch(this.url + chemin, {
      method: methode,
      headers: {
        ...(corps !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...entetes,
      },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
    const setCookie = reponse.headers.get("set-cookie");
    if (setCookie) {
      const [paire] = setCookie.split(";");
      this.cookie = paire.endsWith("=") ? undefined : paire;
    }
    const texte = await reponse.text();
    let json: unknown = texte;
    try {
      json = JSON.parse(texte);
    } catch {
      // réponse non JSON (fichier statique, 404 vide…)
    }
    return { statut: reponse.status, corps: json };
  }

  public get(chemin: string) {
    return this.requete("GET", chemin);
  }

  public post(chemin: string, corps: unknown = {}) {
    return this.requete("POST", chemin, corps);
  }

  public async inscrire(pseudo: string, motDePasse = "motdepasse-test") {
    const reponse = await this.post("/api/comptes", { pseudo, motDePasse });
    if (reponse.statut !== 201) throw new Error(`Inscription impossible : ${JSON.stringify(reponse.corps)}`);
    return reponse.corps.joueur as { id: number; pseudo: string; couleur: string };
  }
}

export interface Environnement {
  url: string;
  maintenant: number;
  appelsSource: Array<string>;
  client(): Client;
  avancer(millisecondes: number): void;
  fermer(): Promise<void>;
}

export async function demarrer(): Promise<Environnement> {
  const bdd = ouvrirBdd(":memory:");
  const appelsSource: Array<string> = [];
  const source: SourceMot = {
    nom: "test",
    recuperer: async (date: string) => {
      appelsSource.push(date);
      if (!MOTS_PAR_DATE[date]) throw new MotIndisponible(`pas de mot pour ${date}`);
      return MOTS_PAR_DATE[date];
    },
  };

  const env = { maintenant: MIDI_5_OCTOBRE } as Environnement;
  const horloge = () => env.maintenant;
  const app = creerApp({
    bdd,
    motsDuJour: new MotsDuJour(bdd, source, horloge),
    dictionnaire: new Set(DICTIONNAIRE),
    horloge,
    fuseau: "Europe/Brussels",
    cookieSecurise: false,
  });

  const serveur = app.listen(0);
  await new Promise((resolve) => serveur.once("listening", resolve));
  const url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;

  env.url = url;
  env.appelsSource = appelsSource;
  env.client = () => new Client(url);
  env.avancer = (millisecondes: number) => {
    env.maintenant += millisecondes;
  };
  env.fermer = async () => {
    await new Promise((resolve) => serveur.close(resolve));
    bdd.close();
  };
  return env;
}
