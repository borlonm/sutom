import assert from "assert/strict";
import { after, before, describe, it } from "node:test";
import { Client, demarrer, Environnement } from "./outils";

const UNE_MINUTE = 60 * 1000;

describe("API", () => {
  let env: Environnement;

  before(async () => {
    env = await demarrer();
  });

  after(async () => {
    await env.fermer();
  });

  describe("sécurité de base", () => {
    it("ne sert jamais de fichier de mots", async () => {
      const reponse = await env.client().get("/mots/abc.txt");
      assert.equal(reponse.statut, 404);
    });

    it("refuse les requêtes d'écriture qui ne sont pas en JSON (CSRF)", async () => {
      const reponse = await env.client().requete("POST", "/api/session", undefined, { "Content-Type": "application/x-www-form-urlencoded" });
      assert.equal(reponse.statut, 415);
    });

    it("répond en JSON sur une route inconnue", async () => {
      const reponse = await env.client().get("/api/inexistant");
      assert.equal(reponse.statut, 404);
      assert.equal(reponse.corps.erreur, "Route inconnue.");
    });
  });

  describe("comptes", () => {
    it("crée un compte, ouvre la session et la retrouve", async () => {
      const client = env.client();
      const creation = await client.post("/api/comptes", { pseudo: "Maxbo", motDePasse: "secret-solide", couleur: "#E91E63" });
      assert.equal(creation.statut, 201);
      assert.deepEqual(creation.corps.joueur, { id: creation.corps.joueur.id, pseudo: "Maxbo", couleur: "#e91e63" });

      const moi = await client.get("/api/moi");
      assert.equal(moi.corps.joueur.pseudo, "Maxbo");
    });

    it("refuse un pseudo déjà pris (sans tenir compte de la casse)", async () => {
      const reponse = await env.client().post("/api/comptes", { pseudo: "maxbo", motDePasse: "autre-secret" });
      assert.equal(reponse.statut, 409);
    });

    it("valide pseudo, mot de passe et couleur", async () => {
      const client = env.client();
      assert.equal((await client.post("/api/comptes", { pseudo: "x", motDePasse: "secret-solide" })).statut, 400);
      assert.equal((await client.post("/api/comptes", { pseudo: "Court", motDePasse: "1234567" })).statut, 400);
      assert.equal((await client.post("/api/comptes", { pseudo: "Couleur", motDePasse: "secret-solide", couleur: "rouge" })).statut, 400);
    });

    it("connecte, déconnecte et refuse un mauvais mot de passe", async () => {
      const client = env.client();
      await client.inscrire("Laplancha", "mot-de-passe-1");
      assert.equal((await client.requete("DELETE", "/api/session", {})).statut, 200);
      assert.equal((await client.get("/api/moi")).corps.joueur, null);

      assert.equal((await client.post("/api/session", { pseudo: "Laplancha", motDePasse: "faux-mot-de-passe" })).statut, 401);
      assert.equal((await client.post("/api/session", { pseudo: "Inconnu", motDePasse: "mot-de-passe-1" })).statut, 401);
      const connexion = await client.post("/api/session", { pseudo: "Laplancha", motDePasse: "mot-de-passe-1" });
      assert.equal(connexion.statut, 200);
      assert.equal((await client.get("/api/moi")).corps.joueur.pseudo, "Laplancha");
    });

    it("modifie pseudo et couleur", async () => {
      const client = env.client();
      await client.inscrire("Furt");
      const reponse = await client.requete("PATCH", "/api/moi", { pseudo: "Furtif", couleur: "#000000" });
      assert.equal(reponse.statut, 200);
      assert.equal((await client.get("/api/moi")).corps.joueur.pseudo, "Furtif");
      assert.equal((await client.requete("PATCH", "/api/moi", { pseudo: "Maxbo" })).statut, 409);
    });
  });

  describe("parties sans compte", () => {
    it("donne la longueur et la 1re lettre, jamais le mot", async () => {
      const reponse = await env.client().get("/api/parties/aujourdhui");
      assert.equal(reponse.statut, 200);
      assert.equal(reponse.corps.date, "2026-10-05");
      assert.equal(reponse.corps.numero, 1732);
      assert.equal(reponse.corps.longueur, 8);
      assert.equal(reponse.corps.premiereLettre, "C");
      assert.equal(reponse.corps.partie, null);
      assert.equal(JSON.stringify(reponse.corps).includes("CHATEAUX"), false);
    });

    it("vérifie les mots côté serveur sans rien enregistrer", async () => {
      const client = env.client();
      const faux = await client.post("/api/parties/aujourdhui/essais", { mot: "chapeaux" });
      assert.equal(faux.statut, 200);
      assert.equal(faux.corps.trouve, false);
      assert.equal(faux.corps.resultats.length, 8);

      const invalide = await client.post("/api/parties/aujourdhui/essais", { mot: "CXXXXXXX" });
      assert.equal(invalide.statut, 400);
      assert.equal(invalide.corps.erreur, "Ce mot n'est pas dans notre dictionnaire.");

      const bon = await client.post("/api/parties/aujourdhui/essais", { mot: "Châteaux" });
      assert.equal(bon.corps.trouve, true);
      assert.equal(bon.corps.temps, undefined);
    });
  });

  describe("chrono côté serveur", () => {
    let client: Client;

    before(async () => {
      client = env.client();
      await client.inscrire("Corbo");
    });

    it("refuse un essai avant d'avoir cliqué sur Commencer", async () => {
      const reponse = await client.post("/api/parties/aujourdhui/essais", { mot: "CHAPEAUX" });
      assert.equal(reponse.statut, 409);
    });

    it("chronomètre la partie du clic sur Commencer au bon mot, avec des essais illimités", async () => {
      const debut = env.maintenant;
      const commencer = await client.post("/api/parties/aujourdhui/commencer");
      assert.equal(commencer.corps.partie.debut, debut);
      assert.equal(commencer.corps.mot, undefined);

      for (let essai = 0; essai < 7; essai++) {
        env.avancer(5 * 1000);
        const reponse = await client.post("/api/parties/aujourdhui/essais", { mot: "CHAPEAUX" });
        assert.equal(reponse.corps.numero, essai + 1);
      }

      // Recharger / recliquer ne remet pas le chrono à zéro
      env.avancer(UNE_MINUTE);
      const relance = await client.post("/api/parties/aujourdhui/commencer");
      assert.equal(relance.corps.partie.debut, debut);
      assert.equal(relance.corps.partie.essais.length, 7);

      env.avancer(10 * 1000);
      const bon = await client.post("/api/parties/aujourdhui/essais", { mot: "CHATEAUX" });
      assert.equal(bon.corps.trouve, true);
      assert.equal(bon.corps.numero, 8);
      assert.equal(bon.corps.temps, 7 * 5000 + UNE_MINUTE + 10 * 1000);
    });

    it("reprend la partie avec les essais horodatés et révèle le mot une fois trouvé", async () => {
      const etat = await client.get("/api/parties/aujourdhui");
      assert.equal(etat.corps.mot, "CHATEAUX");
      assert.equal(etat.corps.partie.essais.length, 8);
      assert.equal(etat.corps.partie.temps, 7 * 5000 + UNE_MINUTE + 10 * 1000);
      assert.ok(etat.corps.partie.essais.every((essai: { horodatage: number }) => typeof essai.horodatage === "number"));
      assert.deepEqual(
        etat.corps.partie.essais[7].resultats.map((r: { statut: string }) => r.statut),
        Array(8).fill("bien-place")
      );
    });

    it("n'accepte plus d'essai une fois le mot trouvé", async () => {
      const reponse = await client.post("/api/parties/aujourdhui/essais", { mot: "CHAPEAUX" });
      assert.equal(reponse.statut, 409);
    });

    it("permet de terminer la grille de la veille, pas les plus anciennes ni les futures", async () => {
      const veille = await client.post("/api/parties/veille/commencer");
      assert.equal(veille.statut, 200);
      assert.equal(veille.corps.date, "2026-10-04");
      assert.equal(veille.corps.premiereLettre, "R");

      assert.equal((await client.post("/api/parties/2026-10-03/commencer")).statut, 403);
      assert.equal((await client.post("/api/parties/2026-10-03/essais", { mot: "CAMPAGNE" })).statut, 403);
      const ancienne = await client.get("/api/parties/2026-10-03");
      assert.equal(ancienne.corps.mot, "CAMPAGNE"); // plus jouable → mot visible
      assert.equal(ancienne.corps.jouable, false);

      assert.equal((await client.get("/api/parties/2026-10-06")).statut, 404);
      assert.equal((await client.post("/api/parties/2026-10-06/commencer")).statut, 404);
      assert.equal(env.appelsSource.includes("2026-10-06"), false); // le mot du lendemain n'est jamais demandé
    });
  });

  describe("groupes, résultats, historique et profils", () => {
    let admin: Client;
    let ami: Client;
    let intrus: Client;
    let groupeId: number;
    let code: string;
    let idAdmin: number;
    let idAmi: number;

    before(async () => {
      admin = env.client();
      ami = env.client();
      intrus = env.client();
      idAdmin = (await admin.inscrire("Dourti")).id;
      idAmi = (await ami.inscrire("Laplanche")).id;
      await intrus.inscrire("Intrus");
    });

    it("crée un groupe dont le créateur est admin et membre", async () => {
      const reponse = await admin.post("/api/groupes", { nom: "Les maîtres du Sutom" });
      assert.equal(reponse.statut, 201);
      assert.equal(reponse.corps.groupe.estAdmin, true);
      groupeId = reponse.corps.groupe.id;
      code = reponse.corps.groupe.codeInvitation;
      assert.match(code, /^[a-z2-9]{10}$/);
    });

    it("montre l'invitation sans compte et fait rejoindre le groupe", async () => {
      const apercu = await env.client().get(`/api/invitations/${code}`);
      assert.equal(apercu.corps.groupe.nom, "Les maîtres du Sutom");
      assert.equal(apercu.corps.groupe.nbMembres, 1);

      assert.equal((await env.client().post(`/api/invitations/${code}`)).statut, 401);
      const rejoindre = await ami.post(`/api/invitations/${code}`);
      assert.equal(rejoindre.statut, 200);
      assert.equal(rejoindre.corps.groupe.estAdmin, false);
      assert.equal((await ami.post(`/api/invitations/${code}`)).statut, 200); // rejoindre deux fois ne fait rien

      const groupe = await ami.get(`/api/groupes/${groupeId}`);
      assert.deepEqual(
        groupe.corps.groupe.membres.map((membre: { pseudo: string }) => membre.pseudo),
        ["Dourti", "Laplanche"]
      );
    });

    it("cache le groupe aux non-membres", async () => {
      assert.equal((await intrus.get(`/api/groupes/${groupeId}`)).statut, 404);
      assert.equal((await intrus.get(`/api/groupes/${groupeId}/historique`)).statut, 404);
      assert.equal((await intrus.get("/api/groupes")).corps.groupes.length, 0);
    });

    it("seul l'admin régénère le lien, et l'ancien lien ne marche plus", async () => {
      assert.equal((await ami.post(`/api/groupes/${groupeId}/invitation`)).statut, 403);
      const reponse = await admin.post(`/api/groupes/${groupeId}/invitation`);
      assert.notEqual(reponse.corps.codeInvitation, code);
      assert.equal((await intrus.post(`/api/invitations/${code}`)).statut, 404);
      code = reponse.corps.codeInvitation;
    });

    it("masque les résultats du jour tant qu'on n'a pas trouvé le mot", async () => {
      await admin.post("/api/parties/aujourdhui/commencer");
      const reponse = await admin.get(`/api/groupes/${groupeId}/resultats/aujourdhui`);
      assert.equal(reponse.statut, 403);
    });

    it("donne les résultats du jour une fois le mot trouvé, avec le gagnant", async () => {
      await ami.post("/api/parties/aujourdhui/commencer");
      env.avancer(30 * 1000);
      await ami.post("/api/parties/aujourdhui/essais", { mot: "CHAPEAUX" });
      env.avancer(15 * 1000);
      await ami.post("/api/parties/aujourdhui/essais", { mot: "CHATEAUX" }); // 45 s
      env.avancer(30 * 1000);
      await admin.post("/api/parties/aujourdhui/essais", { mot: "CHATEAUX" }); // 75 s

      const reponse = await admin.get(`/api/groupes/${groupeId}/resultats/aujourdhui`);
      assert.equal(reponse.statut, 200);
      assert.equal(reponse.corps.mot, "CHATEAUX");
      assert.equal(reponse.corps.numero, 1732);
      assert.deepEqual(reponse.corps.gagnants, [idAmi]);
      const parPseudo = Object.fromEntries(reponse.corps.joueurs.map((joueur: { pseudo: string }) => [joueur.pseudo, joueur]));
      assert.equal(parPseudo.Laplanche.temps, 45000);
      assert.equal(parPseudo.Laplanche.nbEssais, 2);
      assert.equal(parPseudo.Dourti.temps, 75000);
      assert.equal(reponse.corps.stats.tempsMin, 45000);
      assert.equal(reponse.corps.stats.tempsMoyen, 60000);
      assert.equal(reponse.corps.stats.tempsMax, 75000);
    });

    it("distingue en cours, non trouvé et pas joué", async () => {
      await admin.post("/api/parties/veille/commencer"); // commencée, pas trouvée, encore jouable
      const intrusDansLeGroupe = env.client();
      await intrusDansLeGroupe.inscrire("Retardataire");
      await intrusDansLeGroupe.post(`/api/invitations/${code}`);

      // On passe au surlendemain : la grille du 4 n'est plus jouable
      env.avancer(2 * 24 * 3600 * 1000);
      const reponse = await admin.get(`/api/groupes/${groupeId}/resultats/2026-10-04`);
      const statuts = Object.fromEntries(reponse.corps.joueurs.map((joueur: { pseudo: string; statut: string }) => [joueur.pseudo, joueur.statut]));
      assert.deepEqual(statuts, { Dourti: "non-trouve", Laplanche: "pas-joue", Retardataire: "pas-joue" });
      assert.equal(reponse.corps.stats.nbNonTrouves, 1);
      env.avancer(-2 * 24 * 3600 * 1000);
    });

    it("liste l'historique sans spoiler les grilles encore jouables", async () => {
      // Laplanche n'a pas joué la veille (encore jouable) : ce jour-là reste caché pour elle
      const pourAmi = await ami.get(`/api/groupes/${groupeId}/historique`);
      assert.deepEqual(
        pourAmi.corps.historique.map((jour: { date: string }) => jour.date),
        ["2026-10-05"]
      );

      // Deux jours plus tard, tout est visible ; tri par difficulté = temps moyen le plus long d'abord
      env.avancer(2 * 24 * 3600 * 1000);
      const parDate = await ami.get(`/api/groupes/${groupeId}/historique`);
      assert.deepEqual(
        parDate.corps.historique.map((jour: { date: string }) => jour.date),
        ["2026-10-05", "2026-10-04"]
      );
      assert.equal(parDate.corps.historique[1].mot, "RANGEMENT");
      const parDifficulte = await ami.get(`/api/groupes/${groupeId}/historique?tri=difficulte`);
      assert.equal(parDifficulte.corps.historique[0].date, "2026-10-05");
      env.avancer(-2 * 24 * 3600 * 1000);
    });

    it("donne le profil d'un membre avec ses stats et ses victoires", async () => {
      const reponse = await admin.get(`/api/joueurs/${idAmi}`);
      assert.equal(reponse.statut, 200);
      const profil = reponse.corps.profil;
      assert.equal(profil.pseudo, "Laplanche");
      assert.equal(profil.stats.nbTrouvees, 1);
      assert.equal(profil.stats.tempsMoyen, 45000);
      assert.equal(profil.stats.tempsMedian, 45000);
      assert.equal(profil.stats.meilleurTemps, 45000);
      assert.equal(profil.stats.nbEssaisMoyen, 2);
      assert.deepEqual(profil.victoires, [{ groupeId, nom: "Les maîtres du Sutom", nb: 1 }]);
      assert.equal(profil.historique[0].mot, "CHATEAUX");
    });

    it("garde privé le profil des joueurs hors de ses groupes", async () => {
      assert.equal((await intrus.get(`/api/joueurs/${idAdmin}`)).statut, 404);
    });

    it("cache sur un profil les parties du jour que le demandeur n'a pas encore trouvées", async () => {
      // L'ami n'a pas fini la veille : la partie en cours de l'admin ce jour-là n'apparaît pas pour lui
      const reponse = await ami.get(`/api/joueurs/${idAdmin}`);
      assert.deepEqual(
        reponse.corps.profil.historique.map((partie: { date: string }) => partie.date),
        ["2026-10-05"]
      );
      // Sur son propre profil, l'admin voit sa partie de la veille, sans le mot
      const propre = await admin.get(`/api/joueurs/${idAdmin}`);
      const veille = propre.corps.profil.historique.find((partie: { date: string }) => partie.date === "2026-10-04");
      assert.equal(veille.trouve, false);
      assert.equal(veille.mot, undefined);
    });
  });
});
