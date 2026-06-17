# Teach the AI

Plateforme d'apprentissage par l'enseignement : l'utilisateur explique un concept à une IA qui joue le rôle d'un élève curieux. Plus la pédagogie est claire, plus l'élève « comprend ». Un rapport final met en évidence les zones bien maîtrisées et les lacunes.

## Stack
- Node.js 20.x
- Express 4
- Frontend statique (HTML/CSS/JS vanilla)
- Stockage local des sessions dans `/data`

## Installation locale
```bash
npm install
npm start
```
Le serveur écoute sur `http://localhost:3000`.

## Architecture
```
teach-the-ai-app/
├── server.js           # Serveur Express
├── api/                # Routes REST
│   └── sessions.js
├── services/           # Logique métier
│   ├── aiStudent.js    # Heuristique "IA élève"
│   ├── sessionStore.js # Persistance disque
│   └── topics.js       # Catalogue des sujets
├── data/               # Sessions persistées (JSON)
├── public/             # Frontend
│   ├── index.html
│   ├── chat.html
│   ├── report.html
│   ├── css/styles.css
│   └── js/{home,chat,report}.js
├── Procfile            # web: node server.js
└── package.json
```

## API REST
| Méthode | Endpoint                          | Description                        |
|---------|-----------------------------------|------------------------------------|
| GET     | `/api/sessions/topics`            | Liste des sujets disponibles       |
| POST    | `/api/sessions`                   | Crée une session (body: `topicId`) |
| GET     | `/api/sessions/:id`               | Détails d'une session              |
| POST    | `/api/sessions/:id/messages`      | Envoie un message utilisateur      |
| GET     | `/api/sessions/:id/report`        | Génère le rapport final            |

## Déploiement Scalingo
L'application est conforme aux conventions Scalingo :
- `Procfile` à la racine
- `engines.node` dans `package.json`
- Variable `PORT` lue depuis l'environnement

```bash
scalingo create teach-the-ai
git push scalingo main
```

## Notes
L'IA élève fonctionne sans clé API externe (heuristique locale). L'intégration d'un LLM est possible en remplaçant `services/aiStudent.js`.
