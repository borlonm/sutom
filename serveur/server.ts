import http from "http";
import { creerApp } from "./app";
import { ouvrirBdd } from "./bdd";
import { FUSEAU_PAR_DEFAUT } from "./dates";
import { chargerDictionnaire } from "./mots";
import { MotsDuJour, SourceLocale, SourceMot, SourceOfficielle } from "./motsDuJour";

// Configuration par variables d'environnement :
//   SUTOM_PORT          port d'écoute (4200)
//   SUTOM_BDD           fichier SQLite (data/sutom.db)
//   SUTOM_SOURCE_MOT    "officiel" (sutom.nocle.fr) ou "locale" (mot au hasard) ; officiel par défaut en production
//   SUTOM_FUSEAU        fuseau du jeu (Europe/Brussels)
//   SUTOM_COOKIE_SECURISE=1  cookie de session réservé au HTTPS (à activer derrière Tailscale Funnel)
const port = parseInt(String(process.env.SUTOM_PORT), 10) || 4200;
const cheminBdd = process.env.SUTOM_BDD ?? "data/sutom.db";
const nomSource = process.env.SUTOM_SOURCE_MOT ?? (process.env.NODE_ENV === "production" ? "officiel" : "locale");

const dictionnaire = chargerDictionnaire("data/motsNettoyes.txt");
const source: SourceMot = nomSource === "officiel" ? new SourceOfficielle() : new SourceLocale(dictionnaire);
const bdd = ouvrirBdd(cheminBdd);
const horloge = () => Date.now();

const app = creerApp({
  bdd,
  motsDuJour: new MotsDuJour(bdd, source, horloge),
  dictionnaire: new Set(dictionnaire),
  horloge,
  fuseau: process.env.SUTOM_FUSEAU ?? FUSEAU_PAR_DEFAUT,
  cookieSecurise: process.env.SUTOM_COOKIE_SECURISE === "1",
});

http.createServer(app).listen(port, () => {
  console.log(`Jeu démarré : http://localhost:${port} (mot du jour : source ${source.nom}, base ${cheminBdd})`);
});
