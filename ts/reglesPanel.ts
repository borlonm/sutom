import Configuration from "./entites/configuration";
import PanelManager from "./panelManager";
import Sauvegardeur from "./sauvegardeur";

export default class ReglesPanel {
  private readonly _panelManager: PanelManager;
  private readonly _rulesBouton: HTMLElement;

  public constructor(panelManager: PanelManager) {
    this._panelManager = panelManager;
    this._rulesBouton = document.getElementById("configuration-regles-bouton") as HTMLElement;

    this._rulesBouton.addEventListener(
      "click",
      (() => {
        this.afficher();
      }).bind(this)
    );
  }

  public afficher(): void {
    let titre = "Règles";
    let contenu =
      "<p>" +
      "Vous avez autant d'essais que vous voulez pour deviner le mot du jour, entre 6 et 10 lettres, commun à tous.<br />" +
      "Vous ne pouvez proposer que des mots commençant par la même lettre que le mot recherché, et qui se trouvent dans notre dictionnaire.<br />" +
      "Les noms propres ne sont pas acceptés.<br />" +
      "Le mot change chaque jour. Évitez donc les spoils et privilégiez le bouton de partage.<br />" +
      "</p>" +
      '<div class="grille">' +
      '<table role="presentation">' +
      "<caption>Exemple de proposition</caption>" +
      '<tr role="group" aria-label="Mot 1 sur 1">' +
      '<td class="resultat bien-place" aria-label="Lettre S bien placée">S</td>' +
      '<td class="resultat non-trouve" aria-label="Lettre A non présente">A</td>' +
      '<td class="resultat non-trouve" aria-label="Lettre L non présente">L</td>' +
      '<td class="resultat mal-place" aria-label="Lettre U mal placée">U</td>' +
      '<td class="resultat mal-place" aria-label="Lettre T mal placée">T</td>' +
      "</tr>" +
      "</table>" +
      "</div>" +
      "<p>" +
      "Les lettres entourées d'un carré rouge sont bien placées.<br />" +
      "Les lettres entourées d'un cercle jaune sont mal placées (mais présentes dans le mot).<br />" +
      "Les lettres qui restent sur fond bleu ne sont pas dans le mot.<br />" +
      "</div>" +
      "<p>" +
      "En cas de soucis, vous pouvez contacter " +
      '<a target="_blank" href="https://bsky.app/profile/jonathanmm.nocle.fr">@jonathanmm.nocle.fr</a> sur BlueSky, ' +
      '<a target="_blank" href="https://mastodon.social/@JonathanMM">@JonathanMM@mastodon.social</a> sur mastodon ' +
      'ou <a target="_blank" href="https://twitter.com/Jonamaths">@Jonamaths</a> sur twitter. − ' +
      '<a target="_blank" href="https://framagit.org/JonathanMM/sutom">Page du projet</a><br />' +
      'Basé sur l\'excellent <a target="_blank" href="https://www.nytimes.com/games/wordle/index.html">Wordle</a> et le regretté Motus.<br />' +
      "Merci à Emmanuel pour l'aide sur les mots à trouver, et à GaranceAmarante pour l'aide sur le dictionnaire.<br />" +
      'Les icônes proviennent de <a target="_blank" href="https://m3.material.io/styles/icons/overview">Material Design</a>' +
      "</p>";

    this._panelManager.setContenu(titre, contenu);
    this._panelManager.setClasses(["regles-panel"]);
    this._panelManager.setCallbackFermeture(() => {
      Sauvegardeur.sauvegarderConfig({
        ...(Sauvegardeur.chargerConfig() ?? Configuration.Default),
        afficherRegles: false,
      });
    });
    this._panelManager.afficherPanel();
  }
}
