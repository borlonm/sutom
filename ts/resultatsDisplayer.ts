import { ResultatsDuJourApi } from "./api";
import { el, formaterTemps, lienDefinition, pastilleJoueur } from "./dom";

const LIBELLES_STATUT = {
  "en-cours": "en cours",
  "non-trouve": "non trouvé",
  "pas-joue": "pas joué",
};

export default class ResultatsDisplayer {
  // Le tableau du jour du Google Sheet : temps du vert (le plus rapide) au rouge (le plus lent), gagnant en avant
  public static genererTableau(resultats: ResultatsDuJourApi, onClicJoueur?: (joueurId: number) => void): HTMLElement {
    const { tempsMin, tempsMax } = resultats.stats;

    const lignes = resultats.joueurs
      .slice()
      .sort((a, b) => (a.temps ?? Infinity) - (b.temps ?? Infinity))
      .map((joueur) => {
        const estGagnant = resultats.gagnants.indexOf(joueur.id) !== -1;
        const pseudo = pastilleJoueur(joueur);
        if (onClicJoueur) {
          pseudo.classList.add("pastille-cliquable");
          pseudo.addEventListener("click", () => onClicJoueur(joueur.id));
        }

        const celluleTemps =
          joueur.statut === "trouve"
            ? el("td", { class: "resultats-temps", style: `background-color: ${ResultatsDisplayer.couleurTemps(joueur.temps as number, tempsMin, tempsMax)}` }, formaterTemps(joueur.temps))
            : el("td", { class: `resultats-temps resultats-${joueur.statut}` }, LIBELLES_STATUT[joueur.statut]);

        return el(
          "tr",
          { class: estGagnant ? "resultats-gagnant" : undefined },
          el("td", {}, pseudo, estGagnant ? el("span", { class: "resultats-couronne", title: "Gagnant du jour" }, " 👑") : null),
          celluleTemps,
          el("td", { class: "resultats-essais" }, joueur.nbEssais > 0 ? `${joueur.nbEssais} essai${joueur.nbEssais > 1 ? "s" : ""}` : "")
        );
      });

    return el(
      "div",
      { class: "resultats-jour" },
      el("table", { class: "resultats-tableau" }, ...lignes),
      ResultatsDisplayer.genererStats(resultats)
    );
  }

  public static genererEntete(resultats: ResultatsDuJourApi): HTMLElement {
    return el("div", { class: "resultats-entete" }, `#${resultats.numero} · `, el("strong", {}, resultats.mot), " (", lienDefinition(resultats.mot), ")");
  }

  private static genererStats(resultats: ResultatsDuJourApi): HTMLElement {
    const { stats } = resultats;
    if (stats.nbTrouves === 0) return el("p", { class: "resultats-stats" }, "Personne n'a encore trouvé ce mot.");
    return el(
      "p",
      { class: "resultats-stats" },
      `Plus rapide ${formaterTemps(stats.tempsMin)} · moyenne ${formaterTemps(stats.tempsMoyen)} · plus lent ${formaterTemps(stats.tempsMax)}`,
      el("br"),
      `${(stats.nbEssaisMoyen ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} essais en moyenne`,
      stats.nbNonTrouves > 0 ? ` · ${stats.nbNonTrouves} non trouvé${stats.nbNonTrouves > 1 ? "s" : ""}` : ""
    );
  }

  // Dégradé vert (120°) → rouge (0°) selon la position du temps entre le plus rapide et le plus lent
  public static couleurTemps(temps: number, tempsMin: number | null, tempsMax: number | null): string {
    if (tempsMin === null || tempsMax === null || tempsMax === tempsMin) return "hsl(120, 60%, 32%)";
    const position = (temps - tempsMin) / (tempsMax - tempsMin);
    return `hsl(${Math.round(120 * (1 - position))}, 60%, 32%)`;
  }
}
