import Dictionnaire from "./dictionnaire";
import Grille from "./grille";
import Input, { ContexteBloquage } from "./input";
import LettreResultat from "./entites/lettreResultat";
import { LettreStatut } from "./entites/lettreStatut";
import FinDePartiePanel from "./finDePartiePanel";
import NotificationMessage from "./notificationMessage";
import SauvegardeStats from "./entites/sauvegardeStats";
import Sauvegardeur from "./sauvegardeur";
import Configuration from "./entites/configuration";
import PartieEnCours from "./entites/partieEnCours";
import PanelManager from "./panelManager";
import ReglesPanel from "./reglesPanel";
import ConfigurationPanel from "./configurationPanel";
import AudioPanel from "./audioPanel";
import ThemeManager from "./themeManager";
import InstanceConfiguration from "./instanceConfiguration";
import LienHelper from "./lienHelper";
import NotesMaJPanel from "./notesMaJPanel";

export default class Gestionnaire {
  private _grille: Grille | null = null;
  private _input: Input | null = null;
  private readonly _reglesPanel: ReglesPanel;
  private _finDePartiePanel: FinDePartiePanel;
  private readonly _configurationPanel: ConfigurationPanel;
  private readonly _propositions: Array<string>;
  private readonly _resultats: Array<Array<LettreResultat>>;
  private readonly _panelManager: PanelManager;
  private readonly _themeManager: ThemeManager;
  private readonly _audioPanel: AudioPanel;
  private readonly _notesMaJPanel: NotesMaJPanel;

  private _motATrouver: string = "";
  private _compositionMotATrouver: { [lettre: string]: number } = {};
  // Essais illimités : la grille affiche au moins 6 lignes et s'agrandit au besoin
  private _nbLignesMinimum: number = 6;
  private _datePartieEnCours: Date;
  private _idPartieEnCours: string;
  private _dateFinPartie: Date | undefined;
  private _stats: SauvegardeStats = SauvegardeStats.Default;
  private _config: Configuration = Configuration.Default;

  public constructor() {
    this._config = Sauvegardeur.chargerConfig() ?? this._config;

    let partieEnCours = this.chargerPartieEnCours();

    this._idPartieEnCours = this.getIdPartie(partieEnCours);

    if (this._idPartieEnCours !== partieEnCours.idPartie && partieEnCours.idPartie !== undefined) {
      partieEnCours = new PartieEnCours();
    }

    if (partieEnCours.datePartie) {
      this._datePartieEnCours = partieEnCours.datePartie;
    } else {
      this._datePartieEnCours = new Date();
    }

    if (partieEnCours.dateFinPartie) {
      this._dateFinPartie = partieEnCours.dateFinPartie;
    }

    this._propositions = new Array<string>();
    this._resultats = new Array<Array<LettreResultat>>();
    this._audioPanel = new AudioPanel(this._config);
    this._panelManager = new PanelManager();
    this._themeManager = new ThemeManager(this._config);
    this._reglesPanel = new ReglesPanel(this._panelManager);
    this._finDePartiePanel = new FinDePartiePanel(this._datePartieEnCours, this._panelManager, this);
    this._configurationPanel = new ConfigurationPanel(this._panelManager, this._audioPanel, this._themeManager);
    this._notesMaJPanel = new NotesMaJPanel(this._panelManager);

    this.choisirMot(this._idPartieEnCours, this._datePartieEnCours)
      .then(async (mot) => {
        this._motATrouver = mot;
        this._input = new Input(this, this._config, this._motATrouver.length, this._motATrouver[0]);
        this._panelManager.setInput(this._input);
        this._grille = new Grille(this._motATrouver.length, this._nbLignesMinimum, this._motATrouver[0], this._audioPanel);
        this._configurationPanel.setInput(this._input);
        this._compositionMotATrouver = this.decompose(this._motATrouver);
        await this.chargerPropositions(partieEnCours.propositions);
      })
      .catch((raison) => NotificationMessage.ajouterNotification("Aucun mot n'a été trouvé pour aujourd'hui"));

    this.afficherReglesSiNecessaire();
  }

  private getIdPartie(partieEnCours: PartieEnCours) {
    const infoDansLocation = LienHelper.extraireInformation("p");

    if (infoDansLocation !== null) return infoDansLocation;

    if (partieEnCours.idPartie !== undefined) return partieEnCours.idPartie;

    return InstanceConfiguration.idPartieParDefaut;
  }

  private chargerPartieEnCours(): PartieEnCours {
    this._stats = Sauvegardeur.chargerSauvegardeStats() ?? SauvegardeStats.Default;

    let sauvegardePartieEnCours = Sauvegardeur.chargerSauvegardePartieEnCours();
    if (sauvegardePartieEnCours) return sauvegardePartieEnCours;

    return new PartieEnCours();
  }

  private async chargerPropositions(propositions: Array<string> | undefined): Promise<void> {
    if (!propositions || propositions.length === 0) return;
    for (let mot of propositions) {
      if (this._input) this._input.bloquer(ContexteBloquage.ValidationMot);
      await this.verifierMot(mot, true);
    }
  }

  private enregistrerPartieDansStats(duree: number): void {
    // On regarde si c'est le même jour que la dernière partie dans les stats.
    // Si c'est identique, on ne sauvegarde pas
    if (
      this._stats.dernierePartie &&
      this._stats.dernierePartie.getFullYear() === this._datePartieEnCours.getFullYear() &&
      this._stats.dernierePartie.getMonth() === this._datePartieEnCours.getMonth() &&
      this._stats.dernierePartie.getDate() === this._datePartieEnCours.getDate()
    )
      return;

    this._stats.partiesJouees++;
    let estVictoire = this._resultats.some((resultat) => resultat.every((item) => item.statut === LettreStatut.BienPlace));
    if (estVictoire) {
      this._stats.partiesGagnees++;
      // Au-delà de 6 essais, la partie est comptée dans la colonne « 6+ »
      let nbEssais = Math.min(this._resultats.length, 6);
      if (nbEssais >= 1) {
        this._stats.repartition[nbEssais as 1 | 2 | 3 | 4 | 5 | 6]++;
      }
    } else {
      this._stats.repartition["-"]++;
    }
    this._stats.lettresRepartitions.bienPlace += this._resultats.reduce((accumulateur: number, mot: Array<LettreResultat>) => {
      accumulateur += mot.filter((item) => item.statut == LettreStatut.BienPlace).length;
      return accumulateur;
    }, 0);
    this._stats.lettresRepartitions.malPlace += this._resultats.reduce((accumulateur: number, mot: Array<LettreResultat>) => {
      accumulateur += mot.filter((item) => item.statut == LettreStatut.MalPlace).length;
      return accumulateur;
    }, 0);
    this._stats.lettresRepartitions.nonTrouve += this._resultats.reduce((accumulateur: number, mot: Array<LettreResultat>) => {
      accumulateur += mot.filter((item) => item.statut == LettreStatut.NonTrouve).length;
      return accumulateur;
    }, 0);
    this._stats.dernierePartie = this._datePartieEnCours;

    if (this._config.afficherChrono) {
      let statsTemps = this._stats.temps;
      if (!statsTemps || statsTemps === null) {
        statsTemps = { moyenne: duree, nbParties: 1 };
      } else {
        statsTemps = {
          moyenne: (statsTemps.nbParties * statsTemps.moyenne + duree) / (statsTemps.nbParties + 1),
          nbParties: statsTemps.nbParties + 1,
        };
      }

      this._stats.temps = statsTemps;
    }

    Sauvegardeur.sauvegarderStats(this._stats);
  }

  private sauvegarderPartieEnCours(): void {
    Sauvegardeur.sauvegarderPartieEnCours(this._idPartieEnCours, this._datePartieEnCours, this._propositions, this._dateFinPartie);
  }

  private async choisirMot(idPartie: string, datePartie: Date): Promise<string> {
    return Dictionnaire.getMot(idPartie, datePartie);
  }

  private decompose(mot: string): { [lettre: string]: number } {
    let composition: { [lettre: string]: number } = {};
    for (let position = 0; position < mot.length; position++) {
      let lettre = mot[position];
      if (composition[lettre]) composition[lettre]++;
      else composition[lettre] = 1;
    }
    return composition;
  }

  public async verifierMot(mot: string, chargementPartie: boolean = false): Promise<boolean> {
    mot = Dictionnaire.nettoyerMot(mot);
    //console.debug(mot + " => " + (Dictionnaire.estMotValide(mot) ? "Oui" : "non"));
    if (mot.length !== this._motATrouver.length) {
      NotificationMessage.ajouterNotification("Le mot proposé est trop court.");
      return false;
    }
    if (mot.includes(".")) {
      NotificationMessage.ajouterNotification("Votre mot ne doit contenir que des lettres.");
      return false;
    }

    if (mot[0] !== this._motATrouver[0]) {
      NotificationMessage.ajouterNotification("Le mot proposé doit commencer par la même lettre que le mot recherché.");
      return false;
    }
    if (!(await Dictionnaire.estMotValide(mot, this._motATrouver[0], this._motATrouver.length))) {
      NotificationMessage.ajouterNotification("Ce mot n'est pas dans notre dictionnaire.");
      return false;
    }
    if (!this._datePartieEnCours) this._datePartieEnCours = new Date();
    let resultats = this.analyserMot(mot);
    let isBonneReponse = resultats.every((item) => item.statut === LettreStatut.BienPlace);
    this._propositions.push(mot);
    this._resultats.push(resultats);

    if (isBonneReponse) {
      if (!this._dateFinPartie) this._dateFinPartie = new Date();
      let duree = (this._dateFinPartie.getTime() - this._datePartieEnCours.getTime()) % 86400000;
      this._finDePartiePanel.genererResume(isBonneReponse, this._motATrouver, this._resultats, duree);
      if (!chargementPartie) this.enregistrerPartieDansStats(duree);
    }

    if (this._grille) {
      this._grille.validerMot(mot, resultats, isBonneReponse, chargementPartie, () => {
        if (this._input) {
          this._input.updateClavier(resultats);
          if (isBonneReponse) {
            this._finDePartiePanel.afficher();
          } else {
            // La partie n'est pas fini, on débloque
            this._input.debloquer(ContexteBloquage.ValidationMot);
          }
        }
      });
    }

    this.sauvegarderPartieEnCours();

    return true;
  }

  public actualiserAffichage(mot: string): void {
    if (this._grille) this._grille.actualiserAffichage(Dictionnaire.nettoyerMot(mot));
  }

  private analyserMot(mot: string): Array<LettreResultat> {
    let resultats = new Array<LettreResultat>();
    mot = mot.toUpperCase();

    let composition = { ...this._compositionMotATrouver };

    for (let position = 0; position < this._motATrouver.length; position++) {
      let lettreATrouve = this._motATrouver[position];
      let lettreProposee = mot[position];

      if (lettreATrouve === lettreProposee) {
        composition[lettreProposee]--;
      }
    }

    for (let position = 0; position < this._motATrouver.length; position++) {
      let lettreATrouve = this._motATrouver[position];
      let lettreProposee = mot[position];

      let resultat = new LettreResultat();
      resultat.lettre = lettreProposee;

      if (lettreATrouve === lettreProposee) {
        resultat.statut = LettreStatut.BienPlace;
      } else if (this._motATrouver.includes(lettreProposee)) {
        if (composition[lettreProposee] > 0) {
          resultat.statut = LettreStatut.MalPlace;
          composition[lettreProposee]--;
        } else {
          resultat.statut = LettreStatut.NonTrouve;
        }
      } else {
        resultat.statut = LettreStatut.NonTrouve;
      }

      resultats.push(resultat);
    }

    return resultats;
  }

  private afficherReglesSiNecessaire(): void {
    if (this._config.afficherRegles !== undefined && !this._config.afficherRegles) {
      if (this._config.changelog === undefined || this._config.changelog < InstanceConfiguration.derniereMiseAJour) {
        this._notesMaJPanel.afficher(this._config.changelog ?? 0);
      }
      return;
    }

    this._reglesPanel.afficher();
  }

  public chargerPartieAncienne(datePartie: Date, etatPartie: PartieEnCours): void {
    let partieEnCours = etatPartie;

    this._idPartieEnCours = this.getIdPartie(partieEnCours);
    const veille = new Date();
    veille.setDate(veille.getDate() - 1);

    if (this._idPartieEnCours !== partieEnCours.idPartie && partieEnCours.idPartie !== undefined) {
      partieEnCours = new PartieEnCours();
    }

    if (
      partieEnCours.datePartie &&
      !(
        veille.getDate() === partieEnCours.datePartie.getDate() &&
        veille.getMonth() === partieEnCours.datePartie.getMonth() &&
        veille.getFullYear() === partieEnCours.datePartie.getFullYear()
      )
    ) {
      partieEnCours = new PartieEnCours();
    }

    if (partieEnCours.datePartie) {
      this._datePartieEnCours = partieEnCours.datePartie;
    } else {
      this._datePartieEnCours = datePartie;
    }
    this._dateFinPartie = undefined;

    this._propositions.splice(0);
    this._resultats.splice(0);
    this._finDePartiePanel = new FinDePartiePanel(this._datePartieEnCours, this._panelManager, this);

    this.choisirMot(this._idPartieEnCours, this._datePartieEnCours)
      .then(async (mot) => {
        this._motATrouver = mot;
        this._input = new Input(this, this._config, this._motATrouver.length, this._motATrouver[0]);
        this._panelManager.setInput(this._input);
        this._grille = new Grille(this._motATrouver.length, this._nbLignesMinimum, this._motATrouver[0], this._audioPanel);
        this._configurationPanel.setInput(this._input);
        this._compositionMotATrouver = this.decompose(this._motATrouver);
        await this.chargerPropositions(partieEnCours.propositions);
      })
      .catch((raison) => NotificationMessage.ajouterNotification("Aucun mot n'a été trouvé pour aujourd'hui"));
  }
}
