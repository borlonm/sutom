# SUTOM

Jeu de lettres en ligne (et en français) basé sur Wordle. Le jeu se trouve à l'adresse https://sutom.nocle.fr

## Contributions

Tout d'abord, merci si vous contribuez :) Pour l'instant, le mieux, c'est de créer un ticket quand vous voyez un bug, ça me permettra de trier et de prioriser tout ce que je dois faire. Comme la base de code n'est pas aussi propre que je voudrais, merci de créer un ticket et d'attendre un retour de ma part ( @JonathanMM ) avant de vous lancer à corps perdu dans le code.

## Développement

### Avec npm

Pour pouvoir travailler en local, il faut commencer par installer ce qu'il faut à node :

```sh
npm i
```

Puis on génère les listes de mots (une seule fois, elles ne sont pas versionnées) :

```sh
node utils/nettoyage.js
```

Et on lance le serveur :

```sh
npm run start:dev
```

Les tests du serveur (API, chrono, groupes…) se lancent avec :

```sh
npm test
```

### Serveur et données

Le jeu (`ts/`) tourne dans le navigateur ; le serveur (`serveur/`) garde le mot du jour, les comptes, les groupes et les parties dans une base SQLite (`data/sutom.db`). Le mot du jour ne quitte jamais le serveur : le navigateur envoie chaque essai à l'API et reçoit le résultat lettre par lettre.

Variables d'environnement :

| Variable | Rôle | Par défaut |
|---|---|---|
| `SUTOM_PORT` | Port d'écoute | `4200` |
| `SUTOM_BDD` | Fichier SQLite | `data/sutom.db` |
| `SUTOM_SOURCE_MOT` | `officiel` (mot du jour de sutom.nocle.fr, avec l'accord de son auteur) ou `locale` (mot au hasard) | `officiel` si `NODE_ENV=production`, sinon `locale` |
| `SUTOM_FUSEAU` | Fuseau du jeu (un mot va de minuit à minuit) | `Europe/Brussels` |
| `SUTOM_COOKIE_SECURISE` | `1` pour réserver le cookie de session au HTTPS | désactivé |

En local, supprimer `data/sutom.db` repart d'une base vide (nouveau mot, aucun compte).

### Avec Docker

Un Dockerfile est disponible pour pouvoir démarrer le site en local sans `npm`.

```sh
docker build --build-arg MODE=development -t sutom .

docker run -it --rm -p 4200:4200 sutom npm run start:dev
```

### Accès au site

Une fois démarré, le site sera dispo sur http://localhost:4200 et le typescript va se recompiler tout seul à chaque modification de fichier.

## Déployer en production

### Avec npm

Pour déployer en production, on installe les dépendances :

```sh
npm install --production
node utils/nettoyage.js
```

Puis on lance le serveur (avec `NODE_ENV=production`, le mot du jour vient du site officiel) :

```sh
npm start
```

### Avec Docker

On lance Docker en production en créant l'image et en la lançant sans les options particulières pour le mode "development" :

```sh
docker build -t sutom .

docker run -it --rm -p 4200:4200 -v sutom-data:/app/data sutom
```

## Autres infos et remerciements

- Le dictionnaire utilisé est celui de [Grammalecte](https://grammalecte.net/dictionary.php?prj=fr). Merci à GaranceAmarante pour le script.
- Merci à Emmanuel pour m'avoir fourni des mots à trouver.
- Merci à tous les gens qui me remontent des bugs et qui me donnent des idées, ça m'aide beaucoup :)
- Merci à toutes les personnes qui jouent, c'est une belle récompense que vous me donnez.
