import TempsHelper from "./tempsHelper";

type Enfant = Node | string | number | null | undefined | false;

// Construit un élément sans passer par innerHTML : les pseudos et noms de groupe sont saisis par les joueurs
export function el<K extends keyof HTMLElementTagNameMap>(
  balise: K,
  attributs: { [nom: string]: string | undefined } = {},
  ...enfants: Array<Enfant>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(balise);
  for (const nom in attributs) {
    const valeur = attributs[nom];
    if (valeur !== undefined) element.setAttribute(nom, valeur);
  }
  for (const enfant of enfants) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    element.appendChild(typeof enfant === "string" || typeof enfant === "number" ? document.createTextNode(String(enfant)) : enfant);
  }
  return element;
}

export function bouton(texte: string, action: () => void, classe = "bouton"): HTMLButtonElement {
  const element = el("button", { type: "button", class: classe }, texte);
  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return element;
}

export function formaterTemps(millisecondes: number | null | undefined): string {
  return millisecondes === null || millisecondes === undefined ? "—" : TempsHelper.genererTempsHumain(millisecondes);
}

export function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split("-").map(Number);
  return new Date(annee, mois - 1, jour).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function dateDepuisApi(date: string): Date {
  const [annee, mois, jour] = date.split("-").map(Number);
  return new Date(annee, mois - 1, jour);
}

export function lienDefinition(mot: string): HTMLAnchorElement {
  return el(
    "a",
    { href: "https://fr.wiktionary.org/w/index.php?search=" + encodeURIComponent(mot.toLowerCase()), target: "_blank", rel: "noopener" },
    "définition"
  );
}

export function pastilleJoueur(joueur: { pseudo: string; couleur: string }): HTMLSpanElement {
  return el("span", { class: "pastille-joueur" }, el("span", { class: "pastille-couleur", style: `background-color: ${joueur.couleur}` }), joueur.pseudo);
}
