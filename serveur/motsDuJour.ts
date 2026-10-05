import InstanceConfiguration from "../ts/instanceConfiguration";
import { Bdd } from "./bdd";
import { nettoyerMot } from "./mots";

export class MotIndisponible extends Error {}

export interface SourceMot {
  readonly nom: string;
  recuperer(date: string): Promise<string>;
}

// Mot officiel de sutom.nocle.fr (accord de Jonathan, l'auteur de SUTOM).
// Le site officiel charge mots/<Base64("<idPartie>-AAAA-MM-JJ")>.txt (voir ts/dictionnaire.ts).
export class SourceOfficielle implements SourceMot {
  public readonly nom = "officiel";

  public constructor(
    private readonly telecharger: (url: string) => Promise<{ ok: boolean; text(): Promise<string> }> = fetch,
    private readonly adresse: string = "https://sutom.nocle.fr"
  ) {}

  public async recuperer(date: string): Promise<string> {
    const nomFichier = Buffer.from(InstanceConfiguration.idPartieParDefaut + "-" + date, "utf-8").toString("base64");
    let reponse;
    try {
      reponse = await this.telecharger(`${this.adresse}/mots/${nomFichier}.txt`);
    } catch (erreur) {
      throw new MotIndisponible(`Site officiel injoignable (${(erreur as Error).message})`);
    }
    if (!reponse.ok) throw new MotIndisponible(`Mot du ${date} absent du site officiel`);
    return nettoyerMot(await reponse.text());
  }
}

// Pour le développement local : un mot tiré au hasard dans le dictionnaire
export class SourceLocale implements SourceMot {
  public readonly nom = "locale";

  public constructor(private readonly dictionnaire: Array<string>, private readonly aleatoire: () => number = Math.random) {}

  public async recuperer(): Promise<string> {
    return this.dictionnaire[Math.floor(this.aleatoire() * this.dictionnaire.length)];
  }
}

// Le mot est récupéré une seule fois par date puis gardé en base : il ne quitte jamais le serveur.
export class MotsDuJour {
  public constructor(private readonly bdd: Bdd, private readonly source: SourceMot, private readonly horloge: () => number) {}

  public async getMot(date: string): Promise<string> {
    const existant = this.lire(date);
    if (existant) return existant;

    const mot = await this.source.recuperer(date);
    if (!/^[A-Z]{6,10}$/.test(mot)) throw new MotIndisponible(`Mot du ${date} invalide`);

    this.bdd
      .prepare("INSERT OR IGNORE INTO mots_du_jour (date, mot, source, recupere_le) VALUES (?, ?, ?, ?)")
      .run(date, mot, this.source.nom, this.horloge());
    return this.lire(date) as string;
  }

  public lire(date: string): string | undefined {
    const ligne = this.bdd.prepare("SELECT mot FROM mots_du_jour WHERE date = ?").get(date) as { mot: string } | undefined;
    return ligne?.mot;
  }
}
