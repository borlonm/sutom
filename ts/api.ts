import LettreResultat from "./entites/lettreResultat";
import { LettreStatut } from "./entites/lettreStatut";

export interface Joueur {
  id: number;
  pseudo: string;
  couleur: string;
}

export interface ResultatLettreApi {
  lettre: string;
  statut: "bien-place" | "mal-place" | "non-trouve";
}

export interface EtatPartieApi {
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
    essais: Array<{ mot: string; horodatage: number; resultats: Array<ResultatLettreApi> }>;
  } | null;
}

export interface ResultatEssaiApi {
  resultats: Array<ResultatLettreApi>;
  trouve: boolean;
  numero?: number;
  temps?: number;
}

export interface GroupeApi {
  id: number;
  nom: string;
  adminId: number;
  estAdmin: boolean;
  codeInvitation: string;
  membres?: Array<Joueur>;
}

export type StatutJoueurApi = "trouve" | "en-cours" | "non-trouve" | "pas-joue";

export interface ResultatsDuJourApi {
  date: string;
  numero: number;
  mot: string;
  joueurs: Array<Joueur & { statut: StatutJoueurApi; temps: number | null; nbEssais: number }>;
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

export interface ProfilApi extends Joueur {
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

export interface ErreurApi {
  statut: number;
  message: string;
}

export default class Api {
  public static requete<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
    return fetch("/api" + chemin, {
      method: methode,
      credentials: "same-origin",
      // Le serveur exige du JSON pour toute requête qui modifie quelque chose (protection CSRF)
      headers: methode !== "GET" ? { "Content-Type": "application/json" } : {},
      body: methode !== "GET" ? JSON.stringify(corps ?? {}) : undefined,
    }).then(
      (reponse) =>
        reponse
          .json()
          .catch(() => null)
          .then((json) => {
            if (!reponse.ok) {
              const erreur: ErreurApi = { statut: reponse.status, message: (json && json.erreur) || "Erreur inattendue du serveur." };
              throw erreur;
            }
            return json as T;
          }),
      () => {
        const erreur: ErreurApi = { statut: 0, message: "Impossible de joindre le serveur." };
        throw erreur;
      }
    );
  }

  public static estErreurApi(erreur: unknown): erreur is ErreurApi {
    return typeof erreur === "object" && erreur !== null && "statut" in erreur && "message" in erreur;
  }

  public static messageErreur(erreur: unknown): string {
    return Api.estErreurApi(erreur) ? erreur.message : "Erreur inattendue.";
  }

  public static versResultats(resultats: Array<ResultatLettreApi>): Array<LettreResultat> {
    return resultats.map((resultat) => ({
      lettre: resultat.lettre,
      statut:
        resultat.statut === "bien-place" ? LettreStatut.BienPlace : resultat.statut === "mal-place" ? LettreStatut.MalPlace : LettreStatut.NonTrouve,
    }));
  }
}
