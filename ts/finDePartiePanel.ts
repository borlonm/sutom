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
import Api, { GroupeApi, ResultatsDuJourApi } from "./api";
import Session from "./session";
import ResultatsDisplayer from "./resultatsDisplayer";
import { el } from "./dom";

export default class FinDePartiePanel {
  private _numeroGrille: number = 0;
  private _dateGrille: string = "";
  private readonly _panelManager: PanelManager;
  private readonly _statsButton: HTMLElement;
  private readonly _gestionnaire: Gestionnaire;

  private _resumeTexte: string = "";
  private _resumeTexteLegacy: string = "";
  private _motATrouver: string = "";
  private _estVictoire: boolean = false;
  private _partieEstFinie: boolean = false;

  public constructor(panelManager: PanelManager, gestionnaire: Gestionnaire) {
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

  // Numéro et date (AAAA-MM-JJ) de la grille, donnés par le serveur
  public definirPartie(numeroGrille: number, dateGrille: string): void {
    this._numeroGrille = numeroGrille;
    this._dateGrille = dateGrille;
    this._partieEstFinie = false;
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
    this._motATrouver = motATrouver;
    this._estVictoire = estBonneReponse;
    this._partieEstFinie = true;

    let afficherChrono = (Sauvegardeur.chargerConfig() ?? Configuration.Default).afficherChrono;

    const entete =
      "#SUTOM #" +
      this._numeroGrille +
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

      // Remplis après coup : résultats des groupes et partie de la veille viennent du serveur quand on est connecté
      if (Session.joueur) contenu += '<div id="fin-de-partie-panel-groupes"></div>';
      contenu += '<div id="fin-de-partie-panel-partie-veille-area"></div>';
    }

    let stats = Sauvegardeur.chargerSauvegardeStats();
    if (stats) {
      contenu += StatistiquesDisplayer.genererHtmlStats(stats).outerHTML;
    }

    this._panelManager.setContenu(titre, contenu);
    this._panelManager.setClasses(["fin-de-partie-panel"]);
    if (this._partieEstFinie) this.attacherPartage();
    if (stats) this.attacherPartageStats(stats);

    this._panelManager.afficherPanel();

    if (this._partieEstFinie) {
      this.afficherPartieVeille();
      if (Session.joueur) this.afficherResultatsGroupes();
    }
  }

  private afficherPartieVeille(): void {
    this._gestionnaire.partieVeilleATerminer().then((aTerminer) => {
      const zone = document.getElementById("fin-de-partie-panel-partie-veille-area");
      if (!zone) return;
      if (!aTerminer) {
        if (!Session.joueur) Sauvegardeur.restaurerDonneesDuJour();
        return;
      }
      const label = document.createElement("div");
      label.innerText = "Il semblerait que vous n'avez pas terminé votre partie d'hier…";
      zone.appendChild(label);
      const resetButton = CopieHelper.creerBoutonAvecIcone("fin-de-partie-panel-reset-bouton", "#icone-restaure", "Terminer la partie");
      resetButton.addEventListener("click", (event) => {
        event.preventDefault();
        this._gestionnaire.jouerPartieVeille();
        this._panelManager.cacherPanel();
      });
      zone.appendChild(resetButton);
    });
  }

  // Résultats de chaque groupe pour cette grille (le serveur ne les donne qu'une fois le mot trouvé)
  private afficherResultatsGroupes(): void {
    const dateGrille = this._dateGrille;
    Api.requete<{ groupes: Array<GroupeApi> }>("GET", "/groupes")
      .then((reponse) =>
        Promise.all(
          reponse.groupes.map((groupe) =>
            Api.requete<ResultatsDuJourApi>("GET", `/groupes/${groupe.id}/resultats/${dateGrille}`).then((resultats) => ({ groupe, resultats }))
          )
        )
      )
      .then(
        (liste) => {
          const zone = document.getElementById("fin-de-partie-panel-groupes");
          if (!zone) return;
          if (liste.length === 0) {
            zone.appendChild(el("p", { class: "fin-de-partie-panel-phrase" }, "Créez ou rejoignez un groupe (icône compte) pour comparer vos temps."));
            return;
          }
          liste.forEach(({ groupe, resultats }, index) => {
            if (index === 0) zone.appendChild(ResultatsDisplayer.genererEntete(resultats));
            zone.appendChild(el("h3", {}, groupe.nom));
            zone.appendChild(ResultatsDisplayer.genererTableau(resultats, (id) => this._gestionnaire.espaceJoueur.afficherProfil(id)));
          });
        },
        () => {
          // Résultats indisponibles : le reste du panneau suffit
        }
      );
  }

  private attacherPartageStats(stats: SauvegardeStats): void {
    const resumeBouton = document.getElementById("fin-de-partie-panel-stats-bouton") as HTMLElement;

    let resumeTexte = StatistiquesDisplayer.genererResumeTexteStatistiques(stats);

    CopieHelper.attacheBoutonCopieLien(resumeBouton, resumeTexte + "\n\nhttps://sutom.nocle.fr", "Résumé copié dans le presse papier.");
  }
}
