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
import NotesMaJPanel from "./notesMaJPanel";
import Api, { EtatPartieApi, ResultatEssaiApi } from "./api";
import Session from "./session";
import EspaceJoueur from "./espaceJoueur";
import { bouton, dateDepuisApi, el } from "./dom";

export default class Gestionnaire {
  private _grille: Grille | null = null;
  private _input: Input | null = null;
  private readonly _reglesPanel: ReglesPanel;
  private readonly _finDePartiePanel: FinDePartiePanel;
  private readonly _configurationPanel: ConfigurationPanel;
  private readonly _espaceJoueur: EspaceJoueur;
  private readonly _propositions: Array<string>;
  private readonly _resultats: Array<Array<LettreResultat>>;
  private readonly _panelManager: PanelManager;
  private readonly _themeManager: ThemeManager;
  private readonly _audioPanel: AudioPanel;
  private readonly _notesMaJPanel: NotesMaJPanel;

  // Le mot reste côté serveur : on ne connaît que sa longueur et sa première lettre
  private _etat: EtatPartieApi | null = null;
  // Essais illimités : la grille affiche au moins 6 lignes et s'agrandit au besoin
  private _nbLignesMinimum: number = 6;
  private _datePartieEnCours: Date = new Date();
  private _dateFinPartie: Date | undefined;
  private _tempsServeur: number | undefined;
  private _stats: SauvegardeStats = SauvegardeStats.Default;
  private _config: Configuration = Configuration.Default;

  public constructor() {
    this._config = Sauvegardeur.chargerConfig() ?? this._config;
    this._stats = Sauvegardeur.chargerSauvegardeStats() ?? SauvegardeStats.Default;

    this._propositions = new Array<string>();
    this._resultats = new Array<Array<LettreResultat>>();
    this._audioPanel = new AudioPanel(this._config);
    this._panelManager = new PanelManager();
    this._themeManager = new ThemeManager(this._config);
    this._reglesPanel = new ReglesPanel(this._panelManager);
    this._finDePartiePanel = new FinDePartiePanel(this._panelManager, this);
    this._configurationPanel = new ConfigurationPanel(this._panelManager, this._audioPanel, this._themeManager);
    this._notesMaJPanel = new NotesMaJPanel(this._panelManager);
    this._espaceJoueur = new EspaceJoueur(this._panelManager);

    Session.charger().then(() => {
      this.chargerPartie("aujourdhui");
      // Un lien d'invitation passe avant les règles
      if (!this._espaceJoueur.traiterInvitation()) this.afficherReglesSiNecessaire();
    });
  }

  public get espaceJoueur(): EspaceJoueur {
    return this._espaceJoueur;
  }

  // partieLocale : partie déjà chargée depuis le navigateur (cas de la veille, sans compte)
  private chargerPartie(quand: "aujourdhui" | "veille", partieLocale?: PartieEnCours): void {
    Api.requete<EtatPartieApi>("GET", `/parties/${quand}`).then(
      (etat) => {
        this._etat = etat;
        this._propositions.splice(0);
        this._resultats.splice(0);
        this._dateFinPartie = undefined;
        this._tempsServeur = undefined;
        this._finDePartiePanel.definirPartie(etat.numero, etat.date);

        if (Session.joueur) this.preparerPartieConnectee(etat);
        else this.preparerPartieAnonyme(etat, partieLocale);
      },
      (raison) => {
        const message = Api.messageErreur(raison);
        (document.getElementById("grille") as HTMLElement).innerText = message;
        NotificationMessage.ajouterNotification(message);
      }
    );
  }

  // --- Sans compte : comme avant, la partie est gardée dans le navigateur ---

  private preparerPartieAnonyme(etat: EtatPartieApi, partieLocale?: PartieEnCours): void {
    let partieEnCours = partieLocale ?? Sauvegardeur.chargerSauvegardePartieEnCours() ?? new PartieEnCours();
    const memeGrille =
      partieEnCours.datePartie !== undefined && Gestionnaire.dateIso(partieEnCours.datePartie) === etat.date;
    if (!memeGrille) partieEnCours = new PartieEnCours();

    this._datePartieEnCours = partieEnCours.datePartie ?? new Date();
    this._dateFinPartie = partieEnCours.dateFinPartie;
    this.creerGrille(etat);
    this.rejouerPropositions(partieEnCours.propositions ?? []);
  }

  private async rejouerPropositions(propositions: Array<string>): Promise<void> {
    for (const mot of propositions) {
      if (this._input) this._input.bloquer(ContexteBloquage.ValidationMot);
      try {
        const reponse = await this.envoyerEssai(mot);
        this.afficherEssai(mot, Api.versResultats(reponse.resultats), reponse.trouve, true);
      } catch {
        break; // Le mot du jour a changé (ou le serveur ne répond plus) : on repart de là
      }
    }
    if (this._input) this._input.debloquer(ContexteBloquage.ValidationMot);
  }

  // --- Avec un compte : le serveur chronomètre et garde la partie ---

  private preparerPartieConnectee(etat: EtatPartieApi): void {
    if (!etat.partie) {
      this.afficherBoutonCommencer(etat);
      return;
    }

    this._datePartieEnCours = new Date(etat.partie.debut);
    this._tempsServeur = etat.partie.temps ?? undefined;
    if (etat.partie.fin !== null) this._dateFinPartie = new Date(etat.partie.fin);
    this.creerGrille(etat);
    for (const essai of etat.partie.essais) {
      this.afficherEssai(essai.mot, Api.versResultats(essai.resultats), essai.mot === etat.mot, true);
    }
  }

  // La grille (et sa première lettre) n'apparaît qu'au clic : le chrono démarre à ce moment-là
  private afficherBoutonCommencer(etat: EtatPartieApi): void {
    const zoneGrille = document.getElementById("grille") as HTMLElement;
    zoneGrille.innerHTML = "";
    const boutonCommencer = bouton("Commencer", () => {
      boutonCommencer.disabled = true;
      Api.requete<EtatPartieApi>("POST", `/parties/${etat.date}/commencer`).then(
        (nouvelEtat) => {
          this._etat = nouvelEtat;
          this.preparerPartieConnectee(nouvelEtat);
        },
        (raison) => {
          boutonCommencer.disabled = false;
          NotificationMessage.ajouterNotification(Api.messageErreur(raison));
        }
      );
    }, "bouton bouton-commencer");

    zoneGrille.appendChild(
      el(
        "div",
        { class: "zone-commencer" },
        el("p", {}, etat.date === Gestionnaire.dateIso(new Date()) ? `Grille n°${etat.numero}` : `Grille d'hier (n°${etat.numero})`),
        el("p", { class: "zone-commencer-aide" }, "Le chrono démarre dès que vous cliquez."),
        boutonCommencer
      )
    );

    // Clavier affiché mais inactif tant que la partie n'a pas commencé
    this._input = new Input(this, this._config, etat.longueur, etat.premiereLettre);
    this._input.bloquer(ContexteBloquage.AttenteDebut);
    this._panelManager.setInput(this._input);
    this._configurationPanel.setInput(this._input);
  }

  private creerGrille(etat: EtatPartieApi): void {
    this._input = new Input(this, this._config, etat.longueur, etat.premiereLettre);
    this._panelManager.setInput(this._input);
    this._grille = new Grille(etat.longueur, this._nbLignesMinimum, etat.premiereLettre, this._audioPanel);
    this._configurationPanel.setInput(this._input);
  }

  // --- Essais ---

  public async verifierMot(mot: string): Promise<boolean> {
    if (!this._etat) return false;
    mot = Dictionnaire.nettoyerMot(mot);
    // Vérifications instantanées ; le dictionnaire et le résultat sont vérifiés par le serveur
    if (mot.length !== this._etat.longueur) {
      NotificationMessage.ajouterNotification("Le mot proposé est trop court.");
      return false;
    }
    if (mot.includes(".")) {
      NotificationMessage.ajouterNotification("Votre mot ne doit contenir que des lettres.");
      return false;
    }
    if (mot[0] !== this._etat.premiereLettre) {
      NotificationMessage.ajouterNotification("Le mot proposé doit commencer par la même lettre que le mot recherché.");
      return false;
    }

    let reponse: ResultatEssaiApi;
    try {
      reponse = await this.envoyerEssai(mot);
    } catch (raison) {
      NotificationMessage.ajouterNotification(Api.messageErreur(raison));
      return false;
    }

    if (reponse.temps !== undefined) this._tempsServeur = reponse.temps;
    this.afficherEssai(mot, Api.versResultats(reponse.resultats), reponse.trouve, false);
    if (!Session.joueur) this.sauvegarderPartieEnCours();
    return true;
  }

  private envoyerEssai(mot: string): Promise<ResultatEssaiApi> {
    return Api.requete<ResultatEssaiApi>("POST", `/parties/${(this._etat as EtatPartieApi).date}/essais`, { mot });
  }

  private afficherEssai(mot: string, resultats: Array<LettreResultat>, isBonneReponse: boolean, chargementPartie: boolean): void {
    this._propositions.push(mot);
    this._resultats.push(resultats);

    if (isBonneReponse) {
      if (!this._dateFinPartie) this._dateFinPartie = new Date();
      // Connecté : le temps du serveur fait foi ; sinon, temps mesuré par le navigateur
      const duree = this._tempsServeur ?? (this._dateFinPartie.getTime() - this._datePartieEnCours.getTime()) % 86400000;
      this._finDePartiePanel.genererResume(true, mot, this._resultats, duree);
      if (!chargementPartie) this.enregistrerPartieDansStats(duree);
    }

    if (this._grille) {
      this._grille.validerMot(mot, resultats, isBonneReponse, chargementPartie, () => {
        if (this._input) {
          this._input.updateClavier(resultats);
          if (isBonneReponse) {
            this._finDePartiePanel.afficher();
          } else {
            // La partie n'est pas finie, on débloque
            this._input.debloquer(ContexteBloquage.ValidationMot);
          }
        }
      });
    }
  }

  public actualiserAffichage(mot: string): void {
    if (this._grille) this._grille.actualiserAffichage(Dictionnaire.nettoyerMot(mot));
  }

  // --- Partie de la veille ---

  public partieVeilleATerminer(): Promise<boolean> {
    if (!Session.joueur) return Promise.resolve(Sauvegardeur.hasPartieVeilleNonTerminee());
    if (this._etat && this._etat.date !== Gestionnaire.dateIso(new Date())) return Promise.resolve(false);
    return Api.requete<EtatPartieApi>("GET", "/parties/veille").then(
      (veille) => !veille.partie || veille.partie.fin === null,
      () => false
    );
  }

  public jouerPartieVeille(): void {
    if (Session.joueur) {
      this.chargerPartie("veille");
      return;
    }
    // Comme sur le jeu d'origine : la partie du jour part dans l'emplacement « veille » le temps de finir celle d'hier
    this.chargerPartie("veille", Sauvegardeur.chargerPartieVeille());
  }

  // --- Sauvegardes locales ---

  private enregistrerPartieDansStats(duree: number): void {
    // On regarde si c'est le même jour que la dernière partie dans les stats.
    // Si c'est identique, on ne sauvegarde pas
    const datePartie = this._etat ? dateDepuisApi(this._etat.date) : this._datePartieEnCours;
    if (
      this._stats.dernierePartie &&
      this._stats.dernierePartie.getFullYear() === datePartie.getFullYear() &&
      this._stats.dernierePartie.getMonth() === datePartie.getMonth() &&
      this._stats.dernierePartie.getDate() === datePartie.getDate()
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
    this._stats.dernierePartie = datePartie;

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
    Sauvegardeur.sauvegarderPartieEnCours(InstanceConfiguration.idPartieParDefaut, this._datePartieEnCours, this._propositions, this._dateFinPartie);
  }

  private static dateIso(date: Date): string {
    return (
      date.getFullYear().toString() + "-" + (date.getMonth() + 1).toString().padStart(2, "0") + "-" + date.getDate().toString().padStart(2, "0")
    );
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
}
