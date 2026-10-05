import express, { NextFunction, Request, Response } from "express";
import {
  COULEURS,
  creerSession,
  DUREE_SESSION_MS,
  hasherMotDePasse,
  Joueur,
  joueurDepuisSession,
  lireCookie,
  NOM_COOKIE_SESSION,
  supprimerSession,
  validerCouleur,
  validerMotDePasse,
  validerPseudo,
  verifierMotDePasse,
} from "./comptes";
import { Contexte, ErreurHttp, resoudreDate } from "./contexte";
import {
  creerGroupe,
  groupeDuMembre,
  groupesDuJoueur,
  historiqueDuGroupe,
  lireGroupeParCode,
  membresDuGroupe,
  profilJoueur,
  regenererCodeInvitation,
  rejoindreGroupe,
  resultatsDuJour,
  validerNomGroupe,
} from "./groupes";
import { MotIndisponible } from "./motsDuJour";
import { commencerPartie, etatPartie, motVisible, proposerMot } from "./parties";

type Route = (req: Request, res: Response) => Promise<unknown> | unknown;

// Express 4 ne rattrape pas les promesses rejetées : on centralise la gestion d'erreur ici
function route(traitement: Route) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => traitement(req, res))
      .then((corps) => {
        if (!res.headersSent) res.json(corps ?? { ok: true });
      })
      .catch(next);
  };
}

function joueurConnecte(res: Response): Joueur | undefined {
  return res.locals.joueur as Joueur | undefined;
}

function exigerJoueur(res: Response): Joueur {
  const joueur = joueurConnecte(res);
  if (!joueur) throw new ErreurHttp(401, "Connectez-vous pour continuer.");
  return joueur;
}

function idDepuis(parametre: string): number {
  const id = Number(parametre);
  if (!Number.isInteger(id) || id <= 0) throw new ErreurHttp(404, "Introuvable.");
  return id;
}

export function creerApp(ctx: Contexte): express.Express {
  const app = express();
  app.disable("x-powered-by");

  // Le mot du jour reste côté serveur : on ne sert jamais de fichier de mots
  app.use("/mots", (req, res) => res.status(404).end());
  app.use("/", express.static("public/"));
  app.use("/js", express.static("public/js/"));
  app.use("/ts", express.static("ts/"));
  app.use("/node_modules/requirejs/require.js", express.static("node_modules/requirejs/require.js"));

  const api = express.Router();
  api.use(express.json({ limit: "10kb" }));

  // Protection CSRF : toute requête qui modifie quelque chose doit être en JSON
  // (un formulaire d'un autre site ne peut pas envoyer ce type de contenu sans autorisation CORS)
  api.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && !req.is("application/json")) {
      return next(new ErreurHttp(415, "Les requêtes doivent être envoyées en JSON."));
    }
    next();
  });

  api.use((req, res, next) => {
    const jeton = lireCookie(req.headers.cookie, NOM_COOKIE_SESSION);
    if (jeton) res.locals.joueur = joueurDepuisSession(ctx.bdd, jeton, ctx.horloge());
    next();
  });

  const ouvrirSession = (res: Response, joueurId: number) => {
    res.cookie(NOM_COOKIE_SESSION, creerSession(ctx.bdd, joueurId, ctx.horloge()), {
      httpOnly: true,
      sameSite: "lax",
      secure: ctx.cookieSecurise,
      maxAge: DUREE_SESSION_MS,
      path: "/",
    });
  };

  api.get("/sante", route(() => ({ ok: true })));

  // --- Comptes ---

  api.get("/moi", route((req, res) => ({ joueur: joueurConnecte(res) ?? null })));

  api.post(
    "/comptes",
    route(async (req, res) => {
      const pseudo = validerPseudo(req.body.pseudo);
      if (!pseudo) throw new ErreurHttp(400, "Pseudo invalide : 2 à 20 caractères (lettres, chiffres, espace, - _ .).");
      const motDePasse = validerMotDePasse(req.body.motDePasse);
      if (!motDePasse) throw new ErreurHttp(400, "Le mot de passe doit faire au moins 8 caractères.");
      const couleur =
        req.body.couleur === undefined ? COULEURS[Math.floor(Math.random() * COULEURS.length)] : validerCouleur(req.body.couleur);
      if (!couleur) throw new ErreurHttp(400, "Couleur invalide.");

      const hash = await hasherMotDePasse(motDePasse);
      let joueurId: number;
      try {
        const resultat = ctx.bdd
          .prepare("INSERT INTO joueurs (pseudo, hash_mot_de_passe, couleur, cree_le) VALUES (?, ?, ?, ?)")
          .run(pseudo, hash, couleur, ctx.horloge());
        joueurId = Number(resultat.lastInsertRowid);
      } catch (erreur) {
        if ((erreur as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") throw new ErreurHttp(409, "Ce pseudo est déjà pris.");
        throw erreur;
      }

      ouvrirSession(res, joueurId);
      res.status(201);
      return { joueur: { id: joueurId, pseudo, couleur } };
    })
  );

  api.patch(
    "/moi",
    route((req, res) => {
      const joueur = exigerJoueur(res);
      const pseudo = req.body.pseudo === undefined ? joueur.pseudo : validerPseudo(req.body.pseudo);
      if (!pseudo) throw new ErreurHttp(400, "Pseudo invalide : 2 à 20 caractères (lettres, chiffres, espace, - _ .).");
      const couleur = req.body.couleur === undefined ? joueur.couleur : validerCouleur(req.body.couleur);
      if (!couleur) throw new ErreurHttp(400, "Couleur invalide.");

      try {
        ctx.bdd.prepare("UPDATE joueurs SET pseudo = ?, couleur = ? WHERE id = ?").run(pseudo, couleur, joueur.id);
      } catch (erreur) {
        if ((erreur as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") throw new ErreurHttp(409, "Ce pseudo est déjà pris.");
        throw erreur;
      }
      return { joueur: { id: joueur.id, pseudo, couleur } };
    })
  );

  api.post(
    "/session",
    route(async (req, res) => {
      const ligne =
        typeof req.body.pseudo === "string"
          ? (ctx.bdd
              .prepare("SELECT id, pseudo, couleur, hash_mot_de_passe AS hash FROM joueurs WHERE pseudo = ?")
              .get(req.body.pseudo.trim()) as (Joueur & { hash: string }) | undefined)
          : undefined;
      const motDePasseCorrect =
        ligne !== undefined && typeof req.body.motDePasse === "string" && (await verifierMotDePasse(req.body.motDePasse, ligne.hash));
      if (!ligne || !motDePasseCorrect) throw new ErreurHttp(401, "Pseudo ou mot de passe incorrect.");

      ouvrirSession(res, ligne.id);
      return { joueur: { id: ligne.id, pseudo: ligne.pseudo, couleur: ligne.couleur } };
    })
  );

  api.delete(
    "/session",
    route((req, res) => {
      const jeton = lireCookie(req.headers.cookie, NOM_COOKIE_SESSION);
      if (jeton) supprimerSession(ctx.bdd, jeton);
      res.clearCookie(NOM_COOKIE_SESSION, { path: "/" });
      return { ok: true };
    })
  );

  // --- Parties ---

  api.get(
    "/parties/:date",
    route((req, res) => etatPartie(ctx, joueurConnecte(res)?.id, resoudreDate(ctx, req.params.date)))
  );

  api.post(
    "/parties/:date/commencer",
    route((req, res) => commencerPartie(ctx, exigerJoueur(res).id, resoudreDate(ctx, req.params.date)))
  );

  api.post(
    "/parties/:date/essais",
    route((req, res) => proposerMot(ctx, joueurConnecte(res)?.id, resoudreDate(ctx, req.params.date), req.body.mot))
  );

  // --- Groupes ---

  const versGroupeApi = (groupe: { id: number; nom: string; adminId: number; codeInvitation: string }, joueurId: number) => ({
    id: groupe.id,
    nom: groupe.nom,
    adminId: groupe.adminId,
    estAdmin: groupe.adminId === joueurId,
    codeInvitation: groupe.codeInvitation,
  });

  api.get(
    "/groupes",
    route((req, res) => {
      const joueur = exigerJoueur(res);
      return { groupes: groupesDuJoueur(ctx, joueur.id).map((groupe) => versGroupeApi(groupe, joueur.id)) };
    })
  );

  api.post(
    "/groupes",
    route((req, res) => {
      const joueur = exigerJoueur(res);
      const nom = validerNomGroupe(req.body.nom);
      if (!nom) throw new ErreurHttp(400, "Le nom du groupe doit faire entre 1 et 40 caractères.");
      res.status(201);
      return { groupe: versGroupeApi(creerGroupe(ctx, nom, joueur.id), joueur.id) };
    })
  );

  api.get(
    "/groupes/:id",
    route((req, res) => {
      const joueur = exigerJoueur(res);
      const groupe = groupeDuMembre(ctx, idDepuis(req.params.id), joueur.id);
      return { groupe: { ...versGroupeApi(groupe, joueur.id), membres: membresDuGroupe(ctx, groupe.id) } };
    })
  );

  api.post(
    "/groupes/:id/invitation",
    route((req, res) => {
      const joueur = exigerJoueur(res);
      const groupe = groupeDuMembre(ctx, idDepuis(req.params.id), joueur.id);
      if (groupe.adminId !== joueur.id) throw new ErreurHttp(403, "Seul l'admin du groupe peut changer le lien d'invitation.");
      return { codeInvitation: regenererCodeInvitation(ctx, groupe.id) };
    })
  );

  // Aperçu d'une invitation (accessible sans compte, pour afficher le nom du groupe avant l'inscription)
  api.get(
    "/invitations/:code",
    route((req, res) => {
      const groupe = lireGroupeParCode(ctx, req.params.code);
      if (!groupe) throw new ErreurHttp(404, "Ce lien d'invitation n'est plus valable.");
      const joueur = joueurConnecte(res);
      return {
        groupe: { id: groupe.id, nom: groupe.nom, nbMembres: membresDuGroupe(ctx, groupe.id).length },
        dejaMembre: joueur !== undefined && membresDuGroupe(ctx, groupe.id).some((membre) => membre.id === joueur.id),
      };
    })
  );

  api.post(
    "/invitations/:code",
    route((req, res) => {
      const joueur = exigerJoueur(res);
      const groupe = lireGroupeParCode(ctx, req.params.code);
      if (!groupe) throw new ErreurHttp(404, "Ce lien d'invitation n'est plus valable.");
      rejoindreGroupe(ctx, groupe.id, joueur.id);
      return { groupe: versGroupeApi(groupe, joueur.id) };
    })
  );

  api.get(
    "/groupes/:id/resultats/:date",
    route(async (req, res) => {
      const joueur = exigerJoueur(res);
      const groupe = groupeDuMembre(ctx, idDepuis(req.params.id), joueur.id);
      const date = resoudreDate(ctx, req.params.date);
      // Pas de spoil : les résultats des autres restent masqués tant qu'on n'a pas trouvé le mot
      if (!motVisible(ctx, joueur.id, date)) throw new ErreurHttp(403, "Trouvez le mot pour voir les résultats du groupe.");
      return resultatsDuJour(ctx, groupe.id, date, await ctx.motsDuJour.getMot(date));
    })
  );

  api.get(
    "/groupes/:id/historique",
    route((req, res) => {
      const joueur = exigerJoueur(res);
      const groupe = groupeDuMembre(ctx, idDepuis(req.params.id), joueur.id);
      const tri = req.query.tri === "difficulte" ? "difficulte" : "date";
      const limite = Math.min(Math.max(Number(req.query.limite) || 30, 1), 500);
      return { historique: historiqueDuGroupe(ctx, groupe.id, joueur.id, tri, limite) };
    })
  );

  // --- Profils ---

  api.get(
    "/joueurs/:id",
    route((req, res) => ({ profil: profilJoueur(ctx, idDepuis(req.params.id), exigerJoueur(res).id) }))
  );

  api.use(() => {
    throw new ErreurHttp(404, "Route inconnue.");
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  api.use((erreur: unknown, req: Request, res: Response, next: NextFunction) => {
    if (erreur instanceof ErreurHttp) return res.status(erreur.statut).json({ erreur: erreur.message });
    if (erreur instanceof MotIndisponible) {
      console.error(erreur.message);
      return res.status(503).json({ erreur: "Le mot du jour n'est pas disponible pour le moment. Réessayez dans quelques minutes." });
    }
    if ((erreur as { type?: string }).type === "entity.parse.failed") return res.status(400).json({ erreur: "JSON invalide." });
    console.error(erreur);
    res.status(500).json({ erreur: "Erreur interne du serveur." });
  });

  app.use("/api", api);
  return app;
}
