import Configuration from "./entites/configuration";
import PartieEnCours from "./entites/partieEnCours";
import SauvegardePartie from "./entites/sauvegardePartie";
import SauvegardeStats from "./entites/sauvegardeStats";
import LienHelper from "./lienHelper";
import NotificationMessage from "./notificationMessage";

export default class Sauvegardeur {
  private static readonly _cleStats = "statistiques";
  private static readonly _clePartieEnCours = "partieEnCours";
  private static readonly _clePartieVeille = "partieVeille";
  private static readonly _cleConfiguration = "configuration";

  public static sauvegarderStats(stats: SauvegardeStats): void {
    localStorage.setItem(this._cleStats, JSON.stringify(stats));
  }

  public static chargerSauvegardeStats(): SauvegardeStats | undefined {
    const contenuLocation = LienHelper.extraireInformation("s");

    if (contenuLocation) {
      const donneesDepuisLien = Sauvegardeur.chargerInformationDepuisLien(contenuLocation);
      window.location.hash = "";
      if (donneesDepuisLien) {
        NotificationMessage.ajouterNotification("Statistiques chargés avec succès.");
        Sauvegardeur.sauvegarderStats(donneesDepuisLien);
        return donneesDepuisLien;
      }

      NotificationMessage.ajouterNotification("Impossible de charger les statistiques depuis le lien.");
    }

    const dataStats = localStorage.getItem(this._cleStats);
    if (!dataStats) return;

    let stats = JSON.parse(dataStats) as SauvegardeStats;
    if (stats.dernierePartie !== null) stats.dernierePartie = new Date(stats.dernierePartie);
    return stats;
  }

  public static sauvegarderPartieEnCours(idPartie: string, datePartie: Date, propositions: Array<string>, dateFinPartie?: Date): void {
    let partieEnCours: SauvegardePartie = {
      propositions: propositions,
      datePartie,
      dateFinPartie,
      idPartie,
    };
    localStorage.setItem(this._clePartieEnCours, JSON.stringify(partieEnCours));
  }

  public static restaurerDonneesDuJour(): void {
    const dataPartieEnCours = localStorage.getItem(this._clePartieEnCours);
    if (!dataPartieEnCours) return;
    // On regarde si par hasard, on n'a pas la partie du jour dans les infos de la veille
    const partieVeille = this.getInfoVeille();
    if (!partieVeille) return;
    const aujourdhui = new Date();

    if (
      aujourdhui.getDate() === partieVeille.datePartie.getDate() &&
      aujourdhui.getMonth() === partieVeille.datePartie.getMonth() &&
      aujourdhui.getFullYear() === partieVeille.datePartie.getFullYear()
    ) {
      // On inverse les deux
      const dataPartieVeille = localStorage.getItem(this._clePartieVeille);
      if (!dataPartieVeille) return;
      localStorage.setItem(this._clePartieEnCours, dataPartieVeille);
      localStorage.setItem(this._clePartieVeille, dataPartieEnCours);
    } else {
      return;
    }
  }

  public static chargerSauvegardePartieEnCours(): PartieEnCours | undefined {
    let aujourdhui = new Date();
    let partieEnCours: SauvegardePartie;
    let datePartieEnCours: Date;

    let dataPartieEnCours = localStorage.getItem(this._clePartieEnCours);
    if (!dataPartieEnCours) {
      // On regarde si par hasard, on n'a pas la partie du jour dans les infos de la veille
      const partieVeille = this.getInfoVeille();

      if (
        partieVeille &&
        aujourdhui.getDate() === partieVeille.datePartie.getDate() &&
        aujourdhui.getMonth() === partieVeille.datePartie.getMonth() &&
        aujourdhui.getFullYear() === partieVeille.datePartie.getFullYear()
      ) {
        partieEnCours = partieVeille;
        datePartieEnCours = partieVeille.datePartie;
        localStorage.removeItem(this._clePartieVeille);
      } else {
        return;
      }
    } else {
      partieEnCours = JSON.parse(dataPartieEnCours) as SauvegardePartie;
      datePartieEnCours = new Date(partieEnCours.datePartie);
      if (
        aujourdhui.getDate() !== datePartieEnCours.getDate() ||
        aujourdhui.getMonth() !== datePartieEnCours.getMonth() ||
        aujourdhui.getFullYear() !== datePartieEnCours.getFullYear()
      ) {
        // On regarde si par hasard, on n'a pas la partie du jour dans les infos de la veille
        const partieVeille = this.getInfoVeille();

        if (
          partieVeille &&
          aujourdhui.getDate() === partieVeille.datePartie.getDate() &&
          aujourdhui.getMonth() === partieVeille.datePartie.getMonth() &&
          aujourdhui.getFullYear() === partieVeille.datePartie.getFullYear()
        ) {
          partieEnCours = partieVeille;
          datePartieEnCours = partieVeille.datePartie;
          // Et on inverse les données
          localStorage.setItem(this._clePartieVeille, dataPartieEnCours);
        } else {
          localStorage.setItem(this._clePartieVeille, dataPartieEnCours);
          localStorage.removeItem(this._clePartieEnCours);
          return;
        }
      }
    }
    let dateFinPartie = partieEnCours.dateFinPartie === undefined ? undefined : new Date(partieEnCours.dateFinPartie);

    return {
      datePartie: datePartieEnCours,
      dateFinPartie: dateFinPartie,
      propositions: partieEnCours.propositions,
      idPartie: partieEnCours.idPartie,
    };
  }

  private static getInfoVeille(): SauvegardePartie | undefined {
    const dataPartieVeille = localStorage.getItem(this._clePartieVeille);
    if (!dataPartieVeille) return undefined;

    const veille = new Date();
    veille.setDate(veille.getDate() - 1);

    let partieVeille = JSON.parse(dataPartieVeille) as SauvegardePartie;
    if (partieVeille.datePartie) partieVeille.datePartie = new Date(partieVeille.datePartie);
    if (partieVeille.dateFinPartie) partieVeille.dateFinPartie = new Date(partieVeille.dateFinPartie);
    return partieVeille;
  }

  public static hasPartieVeilleNonTerminee(): boolean {
    const partieVeille = this.getInfoVeille();
    if (!partieVeille) return true;

    const aujourdhui = new Date();

    const veille = new Date();
    veille.setDate(veille.getDate() - 1);

    return (
      (aujourdhui.getDate() !== partieVeille.datePartie.getDate() && veille.getDate() !== partieVeille.datePartie.getDate()) ||
      (aujourdhui.getMonth() !== partieVeille.datePartie.getMonth() && veille.getMonth() !== partieVeille.datePartie.getMonth()) ||
      (aujourdhui.getFullYear() !== partieVeille.datePartie.getFullYear() && veille.getFullYear() !== partieVeille.datePartie.getFullYear()) ||
      !partieVeille.dateFinPartie
    );
  }

  public static chargerPartieVeille(): PartieEnCours {
    const veille = new Date();
    veille.setDate(veille.getDate() - 1);
    const partieVeille = this.getInfosPartieVeille(veille);
    let dateFinPartie = partieVeille.dateFinPartie === undefined ? undefined : new Date(partieVeille.dateFinPartie);

    // On va sauvegarder la partie en cours dans la veille pour ne pas la perde
    const partieEnCours = localStorage.getItem(this._clePartieEnCours);
    if (partieEnCours) {
      localStorage.setItem(this._clePartieVeille, partieEnCours);
      localStorage.removeItem(this._clePartieEnCours);
    }

    return {
      datePartie: new Date(partieVeille.datePartie),
      dateFinPartie: dateFinPartie,
      propositions: partieVeille.propositions,
      idPartie: partieVeille.idPartie,
    };
  }

  private static getInfosPartieVeille(veille: Date): SauvegardePartie {
    const dataPartieVeille = localStorage.getItem(this._clePartieVeille);
    if (!dataPartieVeille) {
      const dataPartie = new SauvegardePartie();
      dataPartie.datePartie = veille;
      return dataPartie;
    }

    return JSON.parse(dataPartieVeille) as SauvegardePartie;
  }

  public static sauvegarderConfig(config: Configuration): void {
    localStorage.setItem(this._cleConfiguration, JSON.stringify(config));
  }

  public static chargerConfig(): Configuration | null {
    let dataConfig = localStorage.getItem(this._cleConfiguration);
    if (!dataConfig) return null;

    // Les réglages absents de la sauvegarde (ex. ajoutés depuis) prennent leur valeur par défaut
    let config = { ...Configuration.Default, ...(JSON.parse(dataConfig) as Partial<Configuration>) };
    return config;
  }

  public static genererLien(): string {
    const stats = Sauvegardeur.chargerSauvegardeStats() ?? SauvegardeStats.Default;
    return [
      stats.repartition[1],
      stats.repartition[2],
      stats.repartition[3],
      stats.repartition[4],
      stats.repartition[5],
      stats.repartition[6],
      stats.repartition["-"],
      stats.lettresRepartitions.bienPlace,
      stats.lettresRepartitions.malPlace,
      stats.lettresRepartitions.nonTrouve,
      stats.dernierePartie ? stats.dernierePartie.toISOString() : "null",
    ].join(",");
  }

  private static chargerInformationDepuisLien(contenu: string): SauvegardeStats | null {
    const [
      UnCoupString,
      DeuxCoupsString,
      TroisCoupsString,
      QuatreCoupsString,
      CinqCoupsString,
      SixCoupsString,
      PerduString,
      LettresBienPlaceesString,
      LettresMalPlaceesString,
      LettresNonTrouveString,
      dernierePartie,
      TempsMoyenneString,
      TempsNbPartiesString,
    ] = contenu.split(",");

    const UnCoup = parseInt(UnCoupString);
    const DeuxCoups = parseInt(DeuxCoupsString);
    const TroisCoups = parseInt(TroisCoupsString);
    const QuatreCoups = parseInt(QuatreCoupsString);
    const CinqCoups = parseInt(CinqCoupsString);
    const SixCoups = parseInt(SixCoupsString);
    const Perdu = parseInt(PerduString);
    const LettresBienPlacees = parseInt(LettresBienPlaceesString);
    const LettresMalPlacees = parseInt(LettresMalPlaceesString);
    const LettresNonTrouve = parseInt(LettresNonTrouveString);

    let tempsPart: { moyenne: number; nbParties: number } | null = null;
    if (TempsMoyenneString !== undefined && TempsNbPartiesString !== undefined) {
      tempsPart = {
        moyenne: parseInt(TempsMoyenneString),
        nbParties: parseInt(TempsNbPartiesString),
      };
    }

    return {
      dernierePartie: dernierePartie === "null" ? null : new Date(dernierePartie),
      partiesJouees: UnCoup + DeuxCoups + TroisCoups + QuatreCoups + CinqCoups + SixCoups + Perdu,
      partiesGagnees: UnCoup + DeuxCoups + TroisCoups + QuatreCoups + CinqCoups + SixCoups,
      repartition: {
        1: UnCoup,
        2: DeuxCoups,
        3: TroisCoups,
        4: QuatreCoups,
        5: CinqCoups,
        6: SixCoups,
        "-": Perdu,
      },
      lettresRepartitions: {
        bienPlace: LettresBienPlacees,
        malPlace: LettresMalPlacees,
        nonTrouve: LettresNonTrouve,
      },
      temps: tempsPart,
    };
  }
}
