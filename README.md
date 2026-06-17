# GDG Agentic Hackathon — Teach the AI

Application de démo dans `teach-the-ai-app/`.

Teach the AI aide un apprenant à maîtriser un sujet en l'enseignant à Léo, une
IA élève. Léo maintient un modèle de compréhension, choisit la prochaine
question pédagogique et produit un rapport final.

```bash
cd teach-the-ai-app
npm install
npm start
```

URL locale : `http://localhost:3000`.

Le microservice optionnel `teach-the-ai-app/langgraph-agent/` active la version
LangGraph/Ollama complète. Sans lui, l'app conserve un fallback agentique local
pour assurer une démo fonctionnelle.
