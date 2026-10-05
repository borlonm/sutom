import AudioPanel from "./audioPanel";
import LettreResultat from "./entites/lettreResultat";
import { LettreStatut } from "./entites/lettreStatut";

export default class Grille {
  private readonly _grille: HTMLElement;
  private readonly _propositions: Array<string>;
  private readonly _resultats: Array<Array<LettreResultat>>;
  private readonly _longueurMot: number;
  private readonly _nbLignesMinimum: number;
  private readonly _audioPanel: AudioPanel;

  private _indice: Array<string | undefined>;
  private _motActuel: number;

  public constructor(
    longueurMot: number,
    nbLignesMinimum: number,
    indice: string,
    audioPanel: AudioPanel
  ) {
    this._grille = document.getElementById("grille") as HTMLElement;
    this._audioPanel = audioPanel;

    this._longueurMot = longueurMot;
    this._nbLignesMinimum = nbLignesMinimum;
    this._indice = new Array<string | undefined>(longueurMot);
    this._indice[0] = indice;

    this._propositions = new Array<string>();
    this._resultats = new Array<Array<LettreResultat>>();
    this._motActuel = 0;
    this.afficherGrille();
  }

  private afficherGrille() {
    let table = document.createElement("table");
    table.setAttribute("aria-live", "polite");
    table.setAttribute("aria-label", "Grille de jeu");
    // Essais illimités : on ajoute une ligne dès que les lignes de départ sont remplies
    const nbLignes = Math.max(this._nbLignesMinimum, this._motActuel + 1);
    for (let nbMot = 0; nbMot < nbLignes; nbMot++) {
      let ligne = document.createElement("tr");
      let mot =
        this._propositions.length <= nbMot ? "" : this._propositions[nbMot];
      if (mot.length > 0) {
        ligne.setAttribute("role", "group");
        ligne.setAttribute("aria-label", `Mot ${nbMot + 1}, ${mot}`);
      }
      for (let nbLettre = 0; nbLettre < this._longueurMot; nbLettre++) {
        let cellule = document.createElement("td");
        let contenuCellule: string = "";
        if (
          nbMot < this._motActuel ||
          (nbMot === this._motActuel && mot.length !== 0)
        ) {
          if (mot.length <= nbLettre) {
            contenuCellule = ".";
            cellule.classList.add("cellule-lettre-pas-curseur");
          } else {
            contenuCellule = mot[nbLettre].toUpperCase();
            cellule.classList.remove("cellule-lettre-pas-curseur");
          }
        } else if (nbMot === this._motActuel) {
          let lettreIndice = this._indice[nbLettre];
          if (lettreIndice !== undefined) {
            contenuCellule = lettreIndice;
            cellule.classList.remove("cellule-lettre-pas-curseur");
          } else {
            contenuCellule = ".";
            cellule.classList.add("cellule-lettre-pas-curseur");
          }
        }
        if (
          this._resultats.length > nbMot &&
          this._resultats[nbMot][nbLettre]
        ) {
          let resultat = this._resultats[nbMot][nbLettre];
          let emoji: string = "🟦";
          switch (resultat.statut) {
            case LettreStatut.BienPlace:
              emoji = "🟥";
              cellule.classList.add("bien-place", "resultat");
              cellule.setAttribute(
                "aria-label",
                `Lettre ${resultat.lettre} bien placée`
              );
              break;
            case LettreStatut.MalPlace:
              emoji = "🟡";
              cellule.classList.add("mal-place", "resultat");
              cellule.setAttribute(
                "aria-label",
                `Lettre ${resultat.lettre} mal placée`
              );
              break;
            default:
              emoji = "🟦";
              cellule.classList.add("non-trouve", "resultat");
              cellule.setAttribute(
                "aria-label",
                `Lettre ${resultat.lettre} non présente`
              );
          }
          // console.log(resultat.lettre + " => " + emoji);
        }
        cellule.innerText = contenuCellule;
        ligne.appendChild(cellule);
      }

      table.appendChild(ligne);
    }
    this._grille.innerHTML = "";
    this._grille.appendChild(table);

    // La ligne en cours est toujours la dernière → on la garde visible quand la grille défile
    if (nbLignes > this._nbLignesMinimum) {
      this._grille.scrollTop = this._grille.scrollHeight;
    }
  }

  public actualiserAffichage(mot: string) {
    this.saisirMot(this._motActuel, mot);

    this.afficherGrille();
  }

  public validerMot(
    mot: string,
    resultats: Array<LettreResultat>,
    isBonneReponse: boolean,
    skipAnimation: boolean = false,
    endCallback?: () => void
  ): void {
    this.saisirMot(this._motActuel, mot);
    this.mettreAJourIndice(resultats);
    this._resultats.push(resultats);

    if (!skipAnimation) this.animerResultats(resultats, endCallback);

    if (isBonneReponse) {
      this.bloquerGrille();
    } else {
      this._motActuel++;
    }

    if (skipAnimation) {
      this.afficherGrille();
      if (endCallback) endCallback();
    }
  }

  private animerResultats(
    resultats: Array<LettreResultat>,
    endCallback?: () => void
  ): void {
    let table = this._grille.getElementsByTagName("table").item(0);
    if (table === null) {
      this.afficherGrille();
      if (endCallback) endCallback();
      return;
    }

    let ligne = table.getElementsByTagName("tr").item(this._motActuel);
    if (ligne === null) {
      this.afficherGrille();
      if (endCallback) endCallback();
      return;
    }

    let td = ligne.getElementsByTagName("td");
    this.animerLettre(td, resultats, 0, endCallback);
  }

  private animerLettre(
    td: HTMLCollectionOf<HTMLTableCellElement>,
    resultats: Array<LettreResultat>,
    numLettre: number,
    endCallback?: () => void
  ): void {
    if (numLettre >= td.length) {
      this.afficherGrille();
      if (endCallback) endCallback();
      return;
    }
    let cellule = td[numLettre];
    let resultat = resultats[numLettre];
    cellule.innerHTML = resultat.lettre;
    let callback = (() =>
      this.animerLettre(td, resultats, numLettre + 1, endCallback)).bind(this);
    switch (resultat.statut) {
      case LettreStatut.BienPlace:
        cellule.classList.add("bien-place", "resultat");
        cellule.setAttribute(
          "aria-label",
          `Lettre ${resultat.lettre} bien placée`
        );
        this._audioPanel.jouerSonLettreBienPlace(callback);
        break;
      case LettreStatut.MalPlace:
        cellule.classList.add("mal-place", "resultat");
        cellule.setAttribute(
          "aria-label",
          `Lettre ${resultat.lettre} mal placée`
        );
        this._audioPanel.jouerSonLettreMalPlace(callback);
        break;
      default:
        cellule.classList.add("non-trouve", "resultat");
        cellule.setAttribute(
          "aria-label",
          `Lettre ${resultat.lettre} non présente`
        );
        this._audioPanel.jouerSonLettreNonTrouve(callback);
    }
  }

  private mettreAJourIndice(resultats: Array<LettreResultat>): void {
    for (let i = 0; i < this._indice.length; i++) {
      if (!this._indice[i]) {
        this._indice[i] =
          resultats[i].statut === LettreStatut.BienPlace
            ? resultats[i].lettre
            : undefined;
      }
    }
  }

  private saisirMot(position: number, mot: string): void {
    if (this._propositions.length <= position) {
      this._propositions.push("");
    }
    this._propositions[position] = mot;
  }

  private bloquerGrille(): void {}
}
