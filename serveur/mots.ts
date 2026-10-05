import fs from "fs";

export enum StatutLettre {
  BienPlace = "bien-place",
  MalPlace = "mal-place",
  NonTrouve = "non-trouve",
}

export interface ResultatLettre {
  lettre: string;
  statut: StatutLettre;
}

export function nettoyerMot(mot: string): string {
  return mot
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// Liste des mots proposables, générée par `node utils/nettoyage.js` (data/motsNettoyes.txt)
export function chargerDictionnaire(chemin: string): Array<string> {
  if (!fs.existsSync(chemin)) {
    throw new Error(`Dictionnaire introuvable (${chemin}) → lancez d'abord : node utils/nettoyage.js`);
  }
  return fs
    .readFileSync(chemin, "utf8")
    .split("\n")
    .map((mot) => mot.trim())
    .filter((mot) => /^[A-Z]{6,10}$/.test(mot));
}

// Même algorithme que le jeu d'origine : les lettres bien placées sont comptées en premier,
// puis les lettres mal placées dans la limite des occurrences restantes.
export function analyserMot(motATrouver: string, mot: string): Array<ResultatLettre> {
  const composition: { [lettre: string]: number } = {};
  for (const lettre of motATrouver) composition[lettre] = (composition[lettre] ?? 0) + 1;

  for (let position = 0; position < motATrouver.length; position++) {
    if (motATrouver[position] === mot[position]) composition[mot[position]]--;
  }

  const resultats: Array<ResultatLettre> = [];
  for (let position = 0; position < motATrouver.length; position++) {
    const lettre = mot[position];
    let statut = StatutLettre.NonTrouve;
    if (motATrouver[position] === lettre) {
      statut = StatutLettre.BienPlace;
    } else if ((composition[lettre] ?? 0) > 0) {
      statut = StatutLettre.MalPlace;
      composition[lettre]--;
    }
    resultats.push({ lettre, statut });
  }
  return resultats;
}

// Renvoie le message d'erreur à afficher, ou null si le mot peut être proposé
export function verifierProposition(motATrouver: string, mot: string, dictionnaire: Set<string>): string | null {
  if (mot.length !== motATrouver.length) return "Le mot proposé est trop court.";
  if (!/^[A-Z]+$/.test(mot)) return "Votre mot ne doit contenir que des lettres.";
  if (mot[0] !== motATrouver[0]) return "Le mot proposé doit commencer par la même lettre que le mot recherché.";
  if (mot !== motATrouver && !dictionnaire.has(mot)) return "Ce mot n'est pas dans notre dictionnaire.";
  return null;
}
