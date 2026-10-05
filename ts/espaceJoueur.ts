import Api, { EtatPartieApi, GroupeApi, Joueur, ProfilApi, ResultatsDuJourApi } from "./api";
import CopieHelper from "./copieHelper";
import { bouton, el, formaterDate, formaterTemps, lienDefinition, pastilleJoueur } from "./dom";
import NotificationMessage from "./notificationMessage";
import PanelManager from "./panelManager";
import ResultatsDisplayer from "./resultatsDisplayer";
import Session from "./session";

// Compte, groupes, historique et profils : tout ce qui demande d'être connecté
export default class EspaceJoueur {
  private readonly _panelManager: PanelManager;

  public constructor(panelManager: PanelManager) {
    this._panelManager = panelManager;
    const boutonCompte = document.getElementById("configuration-compte-bouton") as HTMLElement;
    boutonCompte.addEventListener("click", (event) => {
      event.preventDefault();
      this.afficherCompte();
    });
  }

  public afficherCompte(): void {
    if (Session.joueur) this.afficherMenu(Session.joueur);
    else this.afficherConnexion();
  }

  // --- Connexion / inscription ---

  private afficherConnexion(introduction?: string): void {
    const pseudo = el("input", { type: "text", id: "compte-pseudo", autocomplete: "username", maxlength: "20", required: "" });
    const motDePasse = el("input", { type: "password", id: "compte-mot-de-passe", autocomplete: "current-password", minlength: "8", required: "" });
    const erreur = el("p", { class: "formulaire-erreur", role: "alert" });

    const envoyer = (route: string) => {
      erreur.textContent = "";
      Api.requete<{ joueur: Joueur }>("POST", route, { pseudo: pseudo.value, motDePasse: motDePasse.value }).then(
        (reponse) => {
          Session.definir(reponse.joueur);
          // On recharge pour reprendre le jeu en mode connecté (le lien d'invitation éventuel est conservé)
          window.location.reload();
        },
        (raison) => (erreur.textContent = Api.messageErreur(raison))
      );
    };

    const formulaire = el(
      "form",
      { class: "formulaire" },
      introduction ? el("p", {}, introduction) : null,
      el("p", { class: "formulaire-aide" }, "Avec un compte, le chrono est vérifié par le serveur et vos parties sont enregistrées pour les classements de votre groupe."),
      el("label", { for: "compte-pseudo" }, "Pseudo"),
      pseudo,
      el("label", { for: "compte-mot-de-passe" }, "Mot de passe (8 caractères minimum)"),
      motDePasse,
      erreur,
      el(
        "div",
        { class: "formulaire-actions" },
        el("button", { type: "submit", class: "bouton" }, "Se connecter"),
        bouton("Créer un compte", () => {
          if (formulaire.reportValidity()) envoyer("/comptes");
        }, "bouton bouton-secondaire")
      )
    );
    formulaire.addEventListener("submit", (event) => {
      event.preventDefault();
      envoyer("/session");
    });

    this.afficherPanneau("Compte", formulaire);
    pseudo.focus();
  }

  private afficherMenu(joueur: Joueur): void {
    this.afficherPanneau(
      "Compte",
      el(
        "div",
        { class: "espace-joueur" },
        el("p", {}, "Connecté en tant que ", pastilleJoueur(joueur)),
        el(
          "div",
          { class: "formulaire-actions" },
          bouton("Mon profil", () => this.afficherProfil(joueur.id)),
          bouton("Mes groupes", () => this.afficherGroupes()),
          bouton(
            "Se déconnecter",
            () =>
              Api.requete("DELETE", "/session").then(
                () => window.location.reload(),
                (raison) => NotificationMessage.ajouterNotification(Api.messageErreur(raison))
              ),
            "bouton bouton-secondaire"
          )
        )
      )
    );
  }

  // --- Groupes ---

  public afficherGroupes(): void {
    this.chargement("Mes groupes");
    Api.requete<{ groupes: Array<GroupeApi> }>("GET", "/groupes")
      .then((reponse) => Promise.all(reponse.groupes.map((groupe) => Api.requete<{ groupe: GroupeApi }>("GET", `/groupes/${groupe.id}`))))
      .then(
        (details) => {
          const nom = el("input", { type: "text", id: "groupe-nom", maxlength: "40", required: "", placeholder: "Les maîtres du Sutom" });
          const erreur = el("p", { class: "formulaire-erreur", role: "alert" });
          const creation = el(
            "form",
            { class: "formulaire" },
            el("h3", {}, "Créer un groupe"),
            el("label", { for: "groupe-nom" }, "Nom du groupe"),
            nom,
            erreur,
            el("div", { class: "formulaire-actions" }, el("button", { type: "submit", class: "bouton" }, "Créer"))
          );
          creation.addEventListener("submit", (event) => {
            event.preventDefault();
            Api.requete("POST", "/groupes", { nom: nom.value }).then(
              () => this.afficherGroupes(),
              (raison) => (erreur.textContent = Api.messageErreur(raison))
            );
          });

          this.afficherPanneau(
            "Mes groupes",
            el(
              "div",
              { class: "espace-joueur" },
              this.retour("← Mon compte", () => this.afficherCompte()),
              details.length === 0 ? el("p", {}, "Vous ne faites partie d'aucun groupe : créez-en un, ou demandez un lien d'invitation.") : null,
              ...details.map((detail) => this.carteGroupe(detail.groupe)),
              creation
            )
          );
        },
        (raison) => this.erreur("Mes groupes", raison)
      );
  }

  private carteGroupe(groupe: GroupeApi): HTMLElement {
    const lien = EspaceJoueur.lienInvitation(groupe.codeInvitation);
    const boutonCopie = el("button", { type: "button", class: "bouton bouton-secondaire" }, "Copier");
    CopieHelper.attacheBoutonCopieLien(boutonCopie, lien, "Lien d'invitation copié.");

    return el(
      "section",
      { class: "carte-groupe" },
      el("h3", {}, groupe.nom, groupe.estAdmin ? el("span", { class: "badge" }, "admin") : null),
      el(
        "div",
        { class: "membres" },
        ...(groupe.membres ?? []).map((membre) => {
          const pastille = pastilleJoueur(membre);
          pastille.classList.add("pastille-cliquable");
          pastille.addEventListener("click", () => this.afficherProfil(membre.id));
          return pastille;
        })
      ),
      el("div", { class: "invitation" }, el("input", { type: "text", readonly: "", value: lien, "aria-label": "Lien d'invitation" }), boutonCopie),
      el(
        "div",
        { class: "formulaire-actions" },
        bouton("Résultats du jour", () => this.afficherResultatsDuJour(groupe)),
        bouton("Historique", () => this.afficherHistorique(groupe, "date")),
        groupe.estAdmin
          ? bouton(
              "Nouveau lien",
              () => {
                if (!window.confirm("L'ancien lien d'invitation ne marchera plus. Continuer ?")) return;
                Api.requete("POST", `/groupes/${groupe.id}/invitation`).then(
                  () => this.afficherGroupes(),
                  (raison) => NotificationMessage.ajouterNotification(Api.messageErreur(raison))
                );
              },
              "bouton bouton-secondaire"
            )
          : null
      )
    );
  }

  public static lienInvitation(code: string): string {
    return `${window.location.origin}${window.location.pathname}?rejoindre=${encodeURIComponent(code)}`;
  }

  public afficherResultatsDuJour(groupe: { id: number; nom: string }): void {
    this.chargement(groupe.nom);
    Api.requete<ResultatsDuJourApi>("GET", `/groupes/${groupe.id}/resultats/aujourdhui`).then(
      (resultats) =>
        this.afficherPanneau(
          groupe.nom,
          el(
            "div",
            { class: "espace-joueur" },
            this.retour("← Mes groupes", () => this.afficherGroupes()),
            el("h3", {}, "Résultats du jour"),
            ResultatsDisplayer.genererEntete(resultats),
            ResultatsDisplayer.genererTableau(resultats, (id) => this.afficherProfil(id))
          )
        ),
      (raison) => this.erreur(groupe.nom, raison, () => this.afficherGroupes())
    );
  }

  // --- Historique des mots ---

  private afficherHistorique(groupe: GroupeApi, tri: "date" | "difficulte"): void {
    this.chargement(groupe.nom);
    Api.requete<{ historique: Array<ResultatsDuJourApi> }>("GET", `/groupes/${groupe.id}/historique?tri=${tri}&limite=100`).then(
      (reponse) => {
        const choixTri = el(
          "div",
          { class: "choix-tri" },
          bouton("Par date", () => this.afficherHistorique(groupe, "date"), tri === "date" ? "bouton" : "bouton bouton-secondaire"),
          bouton("Les plus durs", () => this.afficherHistorique(groupe, "difficulte"), tri === "difficulte" ? "bouton" : "bouton bouton-secondaire")
        );

        const jours = reponse.historique.map((jour) => {
          const gagnants = jour.joueurs.filter((joueur) => jour.gagnants.indexOf(joueur.id) !== -1);
          const grilleZone = el("div", { class: "historique-grille" });
          const details = el(
            "details",
            { class: "historique-jour" },
            el(
              "summary",
              {},
              el("span", { class: "historique-date" }, formaterDate(jour.date)),
              " ",
              el("strong", {}, jour.mot),
              el(
                "span",
                { class: "historique-resume" },
                gagnants.length > 0 ? " · 👑 " : " · personne n'a trouvé",
                ...gagnants.map((gagnant) => pastilleJoueur(gagnant)),
                gagnants.length > 0 ? ` ${formaterTemps(jour.stats.tempsMin)}` : ""
              )
            ),
            ResultatsDisplayer.genererEntete(jour),
            ResultatsDisplayer.genererTableau(jour, (id) => this.afficherProfil(id)),
            bouton("Revoir ma grille", () => this.afficherMaGrille(jour.date, grilleZone), "bouton bouton-secondaire"),
            grilleZone
          );
          return details;
        });

        this.afficherPanneau(
          groupe.nom,
          el(
            "div",
            { class: "espace-joueur" },
            this.retour("← Mes groupes", () => this.afficherGroupes()),
            el("h3", {}, "Historique des mots"),
            choixTri,
            jours.length === 0 ? el("p", {}, "Aucune grille terminée pour le moment.") : null,
            ...jours
          )
        );
      },
      (raison) => this.erreur(groupe.nom, raison, () => this.afficherGroupes())
    );
  }

  private afficherMaGrille(date: string, zone: HTMLElement): void {
    Api.requete<EtatPartieApi>("GET", `/parties/${date}`).then(
      (etat) => {
        zone.innerHTML = "";
        if (!etat.partie || etat.partie.essais.length === 0) {
          zone.appendChild(el("p", {}, "Vous n'avez pas joué cette grille."));
          return;
        }
        const lignes = etat.partie.essais.map((essai) =>
          el("tr", {}, ...essai.resultats.map((resultat) => el("td", { class: `resultat ${resultat.statut}` }, resultat.lettre)))
        );
        zone.appendChild(el("div", { class: "grille mini-grille" }, el("table", {}, ...lignes)));
      },
      (raison) => NotificationMessage.ajouterNotification(Api.messageErreur(raison))
    );
  }

  // --- Profils ---

  public afficherProfil(joueurId: number): void {
    this.chargement("Profil");
    Api.requete<{ profil: ProfilApi }>("GET", `/joueurs/${joueurId}`).then(
      ({ profil }) => {
        const estMoi = Session.joueur !== null && Session.joueur.id === profil.id;
        const { stats } = profil;
        const caseStat = (valeur: string, libelle: string) =>
          el("div", { class: "stats-numerique-case" }, el("div", { class: "stats-numerique-case-valeur" }, valeur), el("div", { class: "stats-numerique-case-libelle" }, libelle));

        this.afficherPanneau(
          estMoi ? "Mon profil" : "Profil",
          el(
            "div",
            { class: "espace-joueur" },
            this.retour(estMoi ? "← Mon compte" : "← Mes groupes", () => (estMoi ? this.afficherCompte() : this.afficherGroupes())),
            el("h3", {}, pastilleJoueur(profil)),
            estMoi ? this.formulaireProfil(profil) : null,
            el(
              "div",
              { class: "stats-numeriques-area" },
              caseStat(String(stats.nbTrouvees), "Mots trouvés"),
              caseStat(formaterTemps(stats.tempsMoyen), "Temps moyen"),
              caseStat(formaterTemps(stats.tempsMedian), "Temps médian"),
              caseStat(formaterTemps(stats.meilleurTemps), "Meilleur temps"),
              caseStat(stats.nbEssaisMoyen === null ? "—" : stats.nbEssaisMoyen.toLocaleString("fr-FR", { maximumFractionDigits: 1 }), "Essais en moyenne")
            ),
            profil.victoires.length > 0 ? el("h3", {}, "Victoires") : null,
            profil.victoires.length > 0
              ? el("ul", { class: "liste-victoires" }, ...profil.victoires.map((victoire) => el("li", {}, `${victoire.nom} : ${victoire.nb} 👑`)))
              : null,
            el("h3", {}, "Historique"),
            profil.historique.length === 0
              ? el("p", {}, "Aucune partie pour le moment.")
              : el(
                  "div",
                  { class: "tableau-defilant" },
                  el(
                  "table",
                  { class: "resultats-tableau historique-perso" },
                  ...profil.historique.map((partie) =>
                    el(
                      "tr",
                      {},
                      el("td", {}, formaterDate(partie.date)),
                      el("td", {}, partie.mot ? el("span", {}, partie.mot, " (", lienDefinition(partie.mot), ")") : "—"),
                      el("td", {}, partie.trouve ? formaterTemps(partie.temps) : partie.mot ? "non trouvé" : "en cours"),
                      el("td", { class: "resultats-essais" }, `${partie.nbEssais} essai${partie.nbEssais > 1 ? "s" : ""}`)
                    )
                  )
                  )
                )
          )
        );
      },
      (raison) => this.erreur("Profil", raison, () => this.afficherCompte())
    );
  }

  private formulaireProfil(profil: ProfilApi): HTMLElement {
    const pseudo = el("input", { type: "text", id: "profil-pseudo", maxlength: "20", required: "", value: profil.pseudo });
    const couleur = el("input", { type: "color", id: "profil-couleur", value: profil.couleur });
    const erreur = el("p", { class: "formulaire-erreur", role: "alert" });
    const formulaire = el(
      "form",
      { class: "formulaire formulaire-ligne" },
      el("label", { for: "profil-pseudo" }, "Pseudo"),
      pseudo,
      el("label", { for: "profil-couleur" }, "Couleur"),
      couleur,
      el("button", { type: "submit", class: "bouton" }, "Enregistrer"),
      erreur
    );
    formulaire.addEventListener("submit", (event) => {
      event.preventDefault();
      Api.requete<{ joueur: Joueur }>("PATCH", "/moi", { pseudo: pseudo.value, couleur: couleur.value }).then(
        (reponse) => {
          Session.definir(reponse.joueur);
          this.afficherProfil(reponse.joueur.id);
        },
        (raison) => (erreur.textContent = Api.messageErreur(raison))
      );
    });
    return formulaire;
  }

  // --- Lien d'invitation (?rejoindre=<code>) ---

  // Renvoie vrai si un panneau d'invitation a été affiché
  public traiterInvitation(): boolean {
    const code = new URLSearchParams(window.location.search).get("rejoindre");
    if (!code) return false;

    Api.requete<{ groupe: { id: number; nom: string; nbMembres: number }; dejaMembre: boolean }>("GET", `/invitations/${encodeURIComponent(code)}`).then(
      ({ groupe, dejaMembre }) => {
        if (!Session.joueur) {
          this.afficherConnexion(`Connectez-vous ou créez un compte pour rejoindre « ${groupe.nom} ».`);
          return;
        }
        if (dejaMembre) {
          EspaceJoueur.oublierInvitation();
          NotificationMessage.ajouterNotification(`Vous faites déjà partie de « ${EspaceJoueur.echapper(groupe.nom)} ».`);
          return;
        }
        this.afficherPanneau(
          "Invitation",
          el(
            "div",
            { class: "espace-joueur" },
            el("p", {}, "Vous êtes invité à rejoindre ", el("strong", {}, groupe.nom), ` (${groupe.nbMembres} membre${groupe.nbMembres > 1 ? "s" : ""}).`),
            el(
              "div",
              { class: "formulaire-actions" },
              bouton("Rejoindre", () =>
                Api.requete("POST", `/invitations/${encodeURIComponent(code)}`).then(
                  () => {
                    EspaceJoueur.oublierInvitation();
                    this.afficherGroupes();
                  },
                  (raison) => NotificationMessage.ajouterNotification(Api.messageErreur(raison))
                )
              ),
              bouton(
                "Non merci",
                () => {
                  EspaceJoueur.oublierInvitation();
                  this._panelManager.cacherPanel();
                },
                "bouton bouton-secondaire"
              )
            )
          )
        );
      },
      (raison) => {
        EspaceJoueur.oublierInvitation();
        NotificationMessage.ajouterNotification(Api.messageErreur(raison));
      }
    );
    return true;
  }

  private static oublierInvitation(): void {
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  }

  // NotificationMessage passe par innerHTML : on échappe le nom du groupe
  private static echapper(texte: string): string {
    const div = document.createElement("div");
    div.textContent = texte;
    return div.innerHTML;
  }

  // --- Outils d'affichage ---

  private afficherPanneau(titre: string, contenu: HTMLElement): void {
    this._panelManager.setContenuHtmlElement(titre, contenu);
    this._panelManager.setClasses(["espace-joueur-panel"]);
    this._panelManager.afficherPanel();
  }

  private chargement(titre: string): void {
    this.afficherPanneau(titre, el("p", {}, "Chargement…"));
  }

  private erreur(titre: string, raison: unknown, retour?: () => void): void {
    this.afficherPanneau(
      titre,
      el("div", { class: "espace-joueur" }, retour ? this.retour("← Retour", retour) : null, el("p", { class: "formulaire-erreur" }, Api.messageErreur(raison)))
    );
  }

  private retour(texte: string, action: () => void): HTMLElement {
    return bouton(texte, action, "bouton-lien");
  }
}
