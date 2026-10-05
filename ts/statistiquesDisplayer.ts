import CopieHelper from "./copieHelper";
import SauvegardeStats from "./entites/sauvegardeStats";
import TempsHelper from "./tempsHelper";

export default class StatistiquesDisplayer {
  public static genererResumeTexte(texte: string): HTMLElement {
    const area = document.createElement("div");

    const titre = document.createElement("h3");
    titre.innerText = "Résumé de la partie";

    titre.appendChild(CopieHelper.creerBoutonPartage("fin-de-partie-panel-resume-bouton", "Partager"));
    area.appendChild(titre);

    const resumeArea = document.createElement("pre");
    resumeArea.id = "fin-de-partie-panel-resume";
    resumeArea.innerHTML = texte;
    area.appendChild(resumeArea);

    return area;
  }

  public static genererHtmlStats(stats: SauvegardeStats): HTMLElement {
    const statsArea = document.createElement("div");
    statsArea.className = "stats-area";

    const titre = document.createElement("h3");
    titre.innerText = "Statistiques";
    titre.appendChild(CopieHelper.creerBoutonPartage("fin-de-partie-panel-stats-bouton", "Partager"));
    statsArea.appendChild(titre);

    const statsParties = document.createElement("div");
    statsParties.className = "stats-parties";

    const max = this.getMax(stats.repartition);

    statsParties.appendChild(this.creerBar("1", stats.repartition[1], max));
    statsParties.appendChild(this.creerBar("2", stats.repartition[2], max));
    statsParties.appendChild(this.creerBar("3", stats.repartition[3], max));
    statsParties.appendChild(this.creerBar("4", stats.repartition[4], max));
    statsParties.appendChild(this.creerBar("5", stats.repartition[5], max));
    statsParties.appendChild(this.creerBar("6+", stats.repartition[6], max));
    statsParties.appendChild(this.creerBar("-", stats.repartition["-"], max));
    statsParties.appendChild(this.creerLigneValeur("Nombre total de parties jouées", this.intToString(stats.partiesJouees)));

    statsArea.appendChild(statsParties);

    const statsNumeriques = document.createElement("div");
    statsNumeriques.className = "stats-numeriques-area";

    statsNumeriques.appendChild(this.creerStatNumerique("Victoires", this.intToString(stats.partiesGagnees), this.intToString(stats.partiesJouees)));
    statsNumeriques.appendChild(this.creerStatNumerique("Moyenne coups", this.intToString(this.getMoyenne(stats.repartition))));
    statsNumeriques.appendChild(
      this.creerStatNumerique('Lettres <span class="emoji-carre-rouge">🟥</span>', this.intToString(stats.lettresRepartitions.bienPlace))
    );
    statsNumeriques.appendChild(
      this.creerStatNumerique('Lettres <span class="emoji-cercle-jaune">🟡</span>', this.intToString(stats.lettresRepartitions.malPlace))
    );
    statsNumeriques.appendChild(
      this.creerStatNumerique('Lettres <span class="emoji-carre-bleu">🟦</span>', this.intToString(stats.lettresRepartitions.nonTrouve))
    );
    if (stats.temps && stats.temps.nbParties > 0)
      statsNumeriques.appendChild(this.creerStatNumerique("Temps moyen", TempsHelper.genererTempsHumain(stats.temps.moyenne)));

    statsArea.appendChild(statsNumeriques);

    return statsArea;
  }

  private static creerLigneValeur(label: string, valeur: string): HTMLElement {
    const ligne = document.createElement("div");
    ligne.className = "stats-ligne";

    ligne.appendChild(this.creerDivLabel(label, true));
    ligne.appendChild(this.creerDivValeur(valeur));

    return ligne;
  }

  private static creerBar(label: string, valeur: number, max: number): HTMLElement {
    const ligne = document.createElement("div");
    ligne.className = "stats-ligne";

    ligne.appendChild(this.creerDivLabel(label));

    const barAreaDiv = document.createElement("div");
    barAreaDiv.className = "stats-bar-area";

    const barDiv = document.createElement("div");
    barDiv.className = "stats-bar";

    const longueurEnPourcent = Math.round((valeur / max) * 100);
    if (valeur === max) barDiv.classList.add("bar-max");

    barDiv.style.width = longueurEnPourcent === 0 ? "0px" : `calc(${longueurEnPourcent}% - 2px)`;
    barAreaDiv.appendChild(barDiv);
    ligne.appendChild(barAreaDiv);

    ligne.appendChild(this.creerDivValeur(this.intToString(valeur)));

    return ligne;
  }

  private static creerDivLabel(label: string, isDouble: boolean = false): HTMLElement {
    const labelDiv = document.createElement("div");
    labelDiv.classList.add("stats-label");
    if (isDouble) labelDiv.classList.add("stats-label-double");
    labelDiv.innerText = label;
    return labelDiv;
  }

  private static creerDivValeur(valeur: string): HTMLElement {
    const valeurDiv = document.createElement("div");
    valeurDiv.className = "stats-valeur";
    valeurDiv.innerText = valeur.toString();
    return valeurDiv;
  }

  private static creerStatNumerique(label: string, valeur: string, valeurSecondaire?: string): HTMLElement {
    const caseDiv = document.createElement("div");
    caseDiv.className = "stats-numerique-case";

    const valeurDiv = document.createElement("div");
    valeurDiv.className = "stats-numerique-case-valeur";
    valeurDiv.innerText = valeur;
    caseDiv.appendChild(valeurDiv);

    if (valeurSecondaire !== undefined) {
      const secondaireDiv = document.createElement("div");
      secondaireDiv.className = "stats-numerique-case-secondaire";
      secondaireDiv.innerText = valeurSecondaire;
      caseDiv.appendChild(secondaireDiv);
    }

    const labelDiv = document.createElement("div");
    labelDiv.className = "stats-numerique-case-label";
    labelDiv.innerHTML = label;
    caseDiv.appendChild(labelDiv);

    return caseDiv;
  }

  private static intToString(valeur: number): string {
    return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }

  private static getMax(repartition: { 1: number; 2: number; 3: number; 4: number; 5: number; 6: number; "-": number }): number {
    return Math.max(repartition[1], repartition[2], repartition[3], repartition[4], repartition[5], repartition[6], repartition["-"]);
  }

  private static getMoyenne(repartition: { 1: number; 2: number; 3: number; 4: number; 5: number; 6: number; "-": number }): number {
    return (
      (repartition[1] * 1 + repartition[2] * 2 + repartition[3] * 3 + repartition[4] * 4 + repartition[5] * 5 + repartition[6] * 6 + repartition["-"] * 6) /
      (repartition[1] + repartition[2] + repartition[3] + repartition[4] + repartition[5] + repartition[6] + repartition["-"])
    );
  }

  public static genererResumeTexteStatistiques(stats: SauvegardeStats): string {
    const max = this.getMax(stats.repartition);

    return `🟡 Statistiques de #SUTOM 🟡

1 - ${this.genererBarTexte(stats.repartition[1], max)} ${stats.repartition[1]}
2 - ${this.genererBarTexte(stats.repartition[2], max)} ${stats.repartition[2]}
3 - ${this.genererBarTexte(stats.repartition[3], max)} ${stats.repartition[3]}
4 - ${this.genererBarTexte(stats.repartition[4], max)} ${stats.repartition[4]}
5 - ${this.genererBarTexte(stats.repartition[5], max)} ${stats.repartition[5]}
6+ - ${this.genererBarTexte(stats.repartition[6], max)} ${stats.repartition[6]}
Perdu - ${this.genererBarTexte(stats.repartition["-"], max)} ${stats.repartition["-"]}

Moy. : ${this.getMoyenne(stats.repartition).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
${stats.lettresRepartitions.bienPlace}🟥- ${stats.lettresRepartitions.malPlace}🟡- ${stats.lettresRepartitions.nonTrouve}🟦`;
  }

  private static genererBarTexte(valeur: number, max: number): string {
    if (valeur === 0) return "";

    const caractere = valeur === max ? "🟥" : "🟦";
    const longueurEnNbChars = Math.round((valeur / max) * 8);

    return longueurEnNbChars === 0 ? caractere : caractere.repeat(longueurEnNbChars);
  }
}
