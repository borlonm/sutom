import Api, { Joueur } from "./api";

// Joueur connecté (ou null), partagé entre le jeu et les panneaux
export default class Session {
  private static _joueur: Joueur | null = null;

  public static get joueur(): Joueur | null {
    return Session._joueur;
  }

  public static charger(): Promise<Joueur | null> {
    return Api.requete<{ joueur: Joueur | null }>("GET", "/moi").then(
      (reponse) => {
        Session.definir(reponse.joueur);
        return reponse.joueur;
      },
      () => {
        Session.definir(null);
        return null;
      }
    );
  }

  public static definir(joueur: Joueur | null): void {
    Session._joueur = joueur;
    const icone = document.getElementById("configuration-compte-icone");
    if (icone) icone.style.fill = joueur ? joueur.couleur : "";
  }
}
