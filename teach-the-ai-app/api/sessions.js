/**
 * Routes API REST pour la gestion des sessions d'apprentissage.
 *
 *  POST   /api/sessions               -> crée une nouvelle session
 *  GET    /api/sessions/topics        -> liste les sujets disponibles
 *  GET    /api/sessions/:id           -> récupère une session + historique
 *  POST   /api/sessions/:id/messages  -> envoie un message utilisateur
 *  GET    /api/sessions/:id/report    -> génère le rapport final
 */
const express = require('express');
const { customAlphabet } = require('nanoid');

const topics = require('../services/topics');
const store = require('../services/sessionStore');
const ai = require('../services/aiStudent');

const router = express.Router();
const newId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

/** Retourne la liste publique des sujets disponibles. */
router.get('/topics', (_req, res) => {
  res.json(topics.map(({ id, label, emoji, description }) => ({ id, label, emoji, description })));
});

/** Crée une nouvelle session pour un sujet donné. */
router.post('/', (req, res) => {
  const { topicId } = req.body || {};
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) {
    return res.status(400).json({ error: 'Sujet inconnu' });
  }

  const session = {
    id: newId(),
    topicId: topic.id,
    createdAt: new Date().toISOString(),
    messages: [
      {
        role: 'assistant',
        type: 'greeting',
        content: `Salut ! Je suis ton élève du jour. J'aimerais vraiment comprendre « ${topic.label} ». Tu peux commencer par m'expliquer ça avec tes mots ?`,
        timestamp: new Date().toISOString()
      }
    ],
    studentModel: ai.buildInitialStudentModel(topic),
    agentMode: 'ready',
    lastMove: 'initial',
    lastTargetedNode: '',
    overallConfusion: 0,
    conceptsCovered: [],
    confusionCount: 0,
    finished: false
  };

  store.saveSession(session);
  res.status(201).json({ session, topic });
});

/** Renvoie une session existante avec son sujet. */
router.get('/:id', (req, res) => {
  const session = store.loadSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  const topic = topics.find((t) => t.id === session.topicId);
  ai.ensureStudentModel(topic, session);
  store.saveSession(session);
  res.json({ session, topic });
});

/** Ajoute un message utilisateur et obtient la réponse de l'IA élève. */
router.post('/:id/messages', (req, res) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Contenu manquant' });
  }
  const session = store.loadSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  const topic = topics.find((t) => t.id === session.topicId);
  ai.ensureStudentModel(topic, session);

  const userMessage = {
    role: 'user',
    content: content.trim(),
    timestamp: new Date().toISOString()
  };
  session.messages.push(userMessage);

  // Mettre à jour les concepts couverts à partir de ce nouveau message
  const newlyCovered = ai.detectConceptsCovered(topic, content, session.conceptsCovered);
  session.conceptsCovered.push(...newlyCovered);

  // Générer la réponse de l'IA élève
  const reply = ai.buildStudentReply(topic, session, userMessage);
  const assistantMessage = {
    role: 'assistant',
    type: reply.type,
    content: reply.content,
    timestamp: new Date().toISOString()
  };
  session.messages.push(assistantMessage);

  const comprehension = ai.estimateComprehension(topic, session);
  session.comprehension = comprehension;

  store.saveSession(session);

  res.json({
    assistantMessage,
    comprehension,
    agent: ai.buildAgentSnapshot(session),
    conceptsCovered: session.conceptsCovered,
    conceptsRemaining: topic.concepts.filter((c) => !session.conceptsCovered.includes(c))
  });
});

/** Génère et retourne le rapport final de la session. */
router.get('/:id/report', (req, res) => {
  const session = store.loadSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  const topic = topics.find((t) => t.id === session.topicId);

  const report = ai.buildFinalReport(topic, session);
  session.finished = true;
  session.report = report;
  store.saveSession(session);

  res.json(report);
});

module.exports = router;
