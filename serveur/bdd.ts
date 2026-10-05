import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export type Bdd = Database.Database;

// Chaque entrée est une migration ; la version courante est stockée dans PRAGMA user_version.
// On ajoute toujours à la fin, on ne modifie jamais une migration déjà livrée.
const MIGRATIONS: Array<string> = [
  `
  CREATE TABLE joueurs (
    id INTEGER PRIMARY KEY,
    pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
    hash_mot_de_passe TEXT NOT NULL,
    couleur TEXT NOT NULL,
    cree_le INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    jeton TEXT PRIMARY KEY,
    joueur_id INTEGER NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
    expire_le INTEGER NOT NULL
  );

  CREATE TABLE groupes (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    code_invitation TEXT NOT NULL UNIQUE,
    admin_id INTEGER NOT NULL REFERENCES joueurs(id),
    cree_le INTEGER NOT NULL
  );

  CREATE TABLE membres (
    groupe_id INTEGER NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    joueur_id INTEGER NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
    rejoint_le INTEGER NOT NULL,
    PRIMARY KEY (groupe_id, joueur_id)
  );

  -- Mot du jour, gardé côté serveur uniquement (date = AAAA-MM-JJ dans le fuseau du jeu)
  CREATE TABLE mots_du_jour (
    date TEXT PRIMARY KEY,
    mot TEXT NOT NULL,
    source TEXT NOT NULL,
    recupere_le INTEGER NOT NULL
  );

  -- Données brutes uniquement : horodatages en millisecondes, les points se calculent à partir de là
  CREATE TABLE parties (
    id INTEGER PRIMARY KEY,
    joueur_id INTEGER NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    debut INTEGER NOT NULL,
    fin INTEGER,
    UNIQUE (joueur_id, date)
  );

  CREATE TABLE essais (
    partie_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    mot TEXT NOT NULL,
    horodatage INTEGER NOT NULL,
    PRIMARY KEY (partie_id, numero)
  );

  CREATE INDEX parties_date ON parties(date);
  `,
];

export function ouvrirBdd(chemin: string): Bdd {
  if (chemin !== ":memory:") fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const bdd = new Database(chemin);
  bdd.pragma("journal_mode = WAL");
  bdd.pragma("foreign_keys = ON");
  migrer(bdd);
  return bdd;
}

function migrer(bdd: Bdd): void {
  const versionActuelle = bdd.pragma("user_version", { simple: true }) as number;
  for (let version = versionActuelle; version < MIGRATIONS.length; version++) {
    bdd.transaction(() => {
      bdd.exec(MIGRATIONS[version]);
      bdd.pragma(`user_version = ${version + 1}`);
    })();
  }
}
