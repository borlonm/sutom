import assert from "assert/strict";
import { describe, it } from "node:test";
import { dateLocale, decalerDate, estDateValide, numeroGrille } from "../dates";
import { analyserMot, nettoyerMot, StatutLettre, verifierProposition } from "../mots";
import { ouvrirBdd } from "../bdd";
import { MotIndisponible, MotsDuJour, SourceOfficielle } from "../motsDuJour";

const B = StatutLettre.BienPlace;
const M = StatutLettre.MalPlace;
const N = StatutLettre.NonTrouve;

describe("dates", () => {
  it("passe au jour suivant à minuit heure de Bruxelles, pas à minuit UTC", () => {
    assert.equal(dateLocale(Date.UTC(2026, 9, 4, 21, 59), "Europe/Brussels"), "2026-10-04"); // 23h59 heure d'été
    assert.equal(dateLocale(Date.UTC(2026, 9, 4, 22, 0), "Europe/Brussels"), "2026-10-05"); // minuit
    assert.equal(dateLocale(Date.UTC(2026, 11, 31, 23, 0), "Europe/Brussels"), "2027-01-01"); // heure d'hiver (UTC+1)
  });

  it("numérote les grilles comme le site officiel (#1698 le 01/09/2026)", () => {
    assert.equal(numeroGrille("2022-01-08"), 1);
    assert.equal(numeroGrille("2026-09-01"), 1698);
  });

  it("décale et valide les dates", () => {
    assert.equal(decalerDate("2026-03-01", -1), "2026-02-28");
    assert.equal(decalerDate("2026-12-31", 1), "2027-01-01");
    assert.equal(estDateValide("2026-02-30"), false);
    assert.equal(estDateValide("2026-10-05"), true);
    assert.equal(estDateValide("hier"), false);
  });
});

describe("mots", () => {
  it("nettoie accents, casse et espaces", () => {
    assert.equal(nettoyerMot(" château\n"), "CHATEAU");
  });

  it("analyse les lettres comme le jeu d'origine (lettres en double)", () => {
    assert.deepEqual(
      analyserMot("CHATEAUX", "CHAPEAUX").map((r) => r.statut),
      [B, B, B, N, B, B, B, B]
    );
    // Un seul E dans le mot : le premier E mal placé compte, le second non
    assert.deepEqual(
      analyserMot("CRAVATES", "CEEZZZZZ").map((r) => r.statut),
      [B, M, N, N, N, N, N, N]
    );
    // Le E bien placé passe avant le E mal placé situé plus tôt dans le mot
    assert.deepEqual(
      analyserMot("CLAVIERS", "CEZZZEZZ").map((r) => r.statut),
      [B, N, N, N, N, B, N, N]
    );
  });

  it("refuse les propositions invalides avec le même message que le jeu", () => {
    const dico = new Set(["CHATEAUX", "CHAPEAUX"]);
    assert.equal(verifierProposition("CHATEAUX", "CHAT", dico), "Le mot proposé est trop court.");
    assert.equal(verifierProposition("CHATEAUX", "BATEAUXX", dico), "Le mot proposé doit commencer par la même lettre que le mot recherché.");
    assert.equal(verifierProposition("CHATEAUX", "CHAT.AUX", dico), "Votre mot ne doit contenir que des lettres.");
    assert.equal(verifierProposition("CHATEAUX", "CXXXXXXX", dico), "Ce mot n'est pas dans notre dictionnaire.");
    assert.equal(verifierProposition("CHATEAUX", "CHAPEAUX", dico), null);
  });

  it("accepte toujours le mot à trouver, même absent du dictionnaire", () => {
    assert.equal(verifierProposition("CRAVATES", "CRAVATES", new Set()), null);
  });
});

describe("mot du jour", () => {
  it("lit le fichier du site officiel (Base64 de l'id de partie + date)", async () => {
    const urls: Array<string> = [];
    const source = new SourceOfficielle(async (url) => {
      urls.push(url);
      return { ok: true, text: async () => "Château\n" };
    });
    assert.equal(await source.recuperer("2026-10-05"), "CHATEAU");
    const attendu = Buffer.from("34ccc522-c264-4e51-b293-fd5bd60ef7aa-2026-10-05").toString("base64");
    assert.deepEqual(urls, [`https://sutom.nocle.fr/mots/${attendu}.txt`]);
  });

  it("signale un mot indisponible (fichier absent ou site injoignable)", async () => {
    await assert.rejects(new SourceOfficielle(async () => ({ ok: false, text: async () => "" })).recuperer("2026-10-05"), MotIndisponible);
    await assert.rejects(
      new SourceOfficielle(async () => {
        throw new Error("ECONNREFUSED");
      }).recuperer("2026-10-05"),
      MotIndisponible
    );
  });

  it("ne récupère le mot qu'une fois par date puis le garde en base", async () => {
    const bdd = ouvrirBdd(":memory:");
    let appels = 0;
    const mots = new MotsDuJour(bdd, { nom: "test", recuperer: async () => (appels++, "CHATEAUX") }, () => 0);
    assert.equal(await mots.getMot("2026-10-05"), "CHATEAUX");
    assert.equal(await mots.getMot("2026-10-05"), "CHATEAUX");
    assert.equal(appels, 1);
    bdd.close();
  });

  it("refuse un mot mal formé renvoyé par la source", async () => {
    const bdd = ouvrirBdd(":memory:");
    const mots = new MotsDuJour(bdd, { nom: "test", recuperer: async () => "<html>" }, () => 0);
    await assert.rejects(mots.getMot("2026-10-05"), MotIndisponible);
    bdd.close();
  });
});
