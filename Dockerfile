FROM node:22-alpine

ARG MODE=production

ENV NODE_ENV=$MODE

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .
# Listes de mots (navigateur et serveur) puis compilation du jeu et du serveur
RUN node utils/nettoyage.js && npm run build

EXPOSE 4200

# La base SQLite est dans /app/data : à monter en volume pour la garder entre deux déploiements
CMD ["npm", "run", "start:prod"]
