/**
 * Serveur Express principal pour l'application Teach the AI.
 * - Sert les fichiers statiques de /public
 * - Expose les routes API REST définies dans /api
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const sessionsRouter = require('./api/sessions');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globaux
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

// Fichiers statiques (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Routes API
app.use('/api/sessions', sessionsRouter);

// Endpoint de santé pour Scalingo
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Fallback - SPA-like : renvoie toujours index.html pour les routes inconnues non-API
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[teach-the-ai] Serveur démarré sur le port ${PORT}`);
});
