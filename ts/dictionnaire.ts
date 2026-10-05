// Le mot du jour et le dictionnaire sont côté serveur (voir serveur/mots.ts) : le navigateur ne fait que nettoyer la saisie
export default class Dictionnaire {
  public static nettoyerMot(mot: string): string {
    return mot
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase();
  }
}
