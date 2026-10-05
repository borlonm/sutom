import CopieHelper from "./copieHelper";
import Configuration from "./entites/configuration";
import LettreResultat from "./entites/lettreResultat";
import { LettreStatut } from "./entites/lettreStatut";
import SauvegardeStats from "./entites/sauvegardeStats";
import Gestionnaire from "./gestionnaire";
import InstanceConfiguration from "./instanceConfiguration";
import PanelManager from "./panelManager";
import Sauvegardeur from "./sauvegardeur";
import StatistiquesDisplayer from "./statistiquesDisplayer";
import TempsHelper from "./tempsHelper";

export default class FinDePartiePanel {
  private readonly _datePartie: Date;
  private readonly _panelManager: PanelManager;
  private readonly _statsButton: HTMLElement;
  private readonly _gestionnaire: Gestionnaire;

  private _resumeTexte: string = "";
  private _resumeTexteLegacy: string = "";
  private _motATrouver: string = "";
  private _estVictoire: boolean = false;
  private _partieEstFinie: boolean = false;

  public constructor(datePartie: Date, panelManager: PanelManager, gestionnaire: Gestionnaire) {
    this._datePartie = new Date(datePartie);
    this._datePartie.setHours(0, 0, 0);
    this._panelManager = panelManager;
    this._statsButton = document.getElementById("configuration-stats-bouton") as HTMLElement;
    this._gestionnaire = gestionnaire;

    this._statsButton.addEventListener(
      "click",
      (() => {
        this.afficher();
      }).bind(this)
    );
  }

  public genererResume(estBonneReponse: boolean, motATrouver: string, resultats: Array<Array<LettreResultat>>, dureeMs: number): void {
    let resultatsEmojis = resultats.map((mot) =>
      mot
        .map((resultat) => resultat.statut)
        .reduce((ligne, statut) => {
          switch (statut) {
            case LettreStatut.BienPlace:
              return ligne + "🟥";
            case LettreStatut.MalPlace:
              return ligne + "🟡";
            default:
              return ligne + "🟦";
          }
        }, "")
    );

    let resultatsEmojisLegacy = resultats.map((mot) =>
      mot
        .map((resultat) => resultat.statut)
        .reduce((ligne, statut) => {
          switch (statut) {
            case LettreStatut.BienPlace:
              return ligne + '<span class="emoji-carre-rouge">🟥</span>';
            case LettreStatut.MalPlace:
              return ligne + '<span class="emoji-cercle-jaune">🟡</span>';
            default:
              return ligne + '<span class="emoji-carre-bleu">🟦</span>';
          }
        }, "")
    );
    let dateGrille = this._datePartie.getTime();
    let origine = InstanceConfiguration.dateOrigine.getTime();
    this._motATrouver = motATrouver;
    this._estVictoire = estBonneReponse;
    this._partieEstFinie = true;

    let numeroGrille = Math.round((dateGrille - origine) / (24 * 3600 * 1000)) + 1;

    let afficherChrono = (Sauvegardeur.chargerConfig() ?? Configuration.Default).afficherChrono;

    const entete =
      "#SUTOM #" +
      numeroGrille +
      " " +
      (estBonneReponse ? resultats.length : "-") +
      "/∞" +
      (afficherChrono ? " " + TempsHelper.genererTempsHumain(dureeMs) : "") +
      "\n\n";
    this._resumeTexte = entete + resultatsEmojis.join("\n");
    this._resumeTexteLegacy = entete + resultatsEmojisLegacy.join("\n");
  }

  private attacherPartage(): void {
    const resumeBouton = document.getElementById("fin-de-partie-panel-resume-bouton") as HTMLElement;
    CopieHelper.attacheBoutonCopieLien(resumeBouton, this._resumeTexte + "\n\nhttps://sutom.nocle.fr", "Résumé copié dans le presse papier.");
  }

  public afficher(): void {
    let titre: string;
    let contenu: string = "";

    if (!this._partieEstFinie) {
      titre = "Statistiques";
      contenu += '<p class="fin-de-partie-panel-phrase">Vous n\'avez pas encore fini votre partie du jour.</p>';
    } else {
      if (this._estVictoire) {
        titre = "Félicitations";
        contenu += '<p class="fin-de-partie-panel-phrase">Bravo, tu as gagné. Reviens demain pour une nouvelle grille.</p>';
      } else {
        titre = "Perdu";
        contenu +=
          '<p class="fin-de-partie-panel-phrase"> \
          Le mot à trouver était : ' +
          this._motATrouver +
          "<br /> \
          Peut-être feras-tu mieux demain ? \
        </p>";
      }
      contenu += StatistiquesDisplayer.genererResumeTexte(this._resumeTexteLegacy).outerHTML;

      if (Sauvegardeur.hasPartieVeilleNonTerminee()) {
        const partieVeilleArea = document.createElement("div");
        partieVeilleArea.id = "fin-de-partie-panel-partie-veille-area";

        const partieVeilleLabel = document.createElement("div");
        partieVeilleLabel.innerText = "Il semblerait que vous n'avez pas terminé votre partie d'hier…";
        partieVeilleArea.appendChild(partieVeilleLabel);

        partieVeilleArea.appendChild(CopieHelper.creerBoutonAvecIcone("fin-de-partie-panel-reset-bouton", "#icone-restaure", "Terminer la partie"));

        contenu += partieVeilleArea.outerHTML;
      } else {
        Sauvegardeur.restaurerDonneesDuJour();
      }
    }

    let stats = Sauvegardeur.chargerSauvegardeStats();
    if (stats) {
      contenu += StatistiquesDisplayer.genererHtmlStats(stats).outerHTML;
    }

    this._panelManager.setContenu(titre, contenu);
    this._panelManager.setClasses(["fin-de-partie-panel"]);
    if (this._partieEstFinie) this.attacherPartage();
    if (stats) this.attacherPartageStats(stats);

    const resetButton = document.getElementById("fin-de-partie-panel-reset-bouton") as HTMLElement;
    if (resetButton) {
      const veille = new Date();
      veille.setDate(veille.getDate() - 1);
      resetButton.addEventListener(
        "click",
        (() => {
          this._gestionnaire.chargerPartieAncienne(veille, Sauvegardeur.chargerPartieVeille());
          this._panelManager.cacherPanel();
        }).bind(this)
      );
    }
    this._panelManager.afficherPanel();
  }

  private attacherPartageStats(stats: SauvegardeStats): void {
    const resumeBouton = document.getElementById("fin-de-partie-panel-stats-bouton") as HTMLElement;

    let resumeTexte = StatistiquesDisplayer.genererResumeTexteStatistiques(stats);

    CopieHelper.attacheBoutonCopieLien(resumeBouton, resumeTexte + "\n\nhttps://sutom.nocle.fr", "Résumé copié dans le presse papier.");
  }
}
