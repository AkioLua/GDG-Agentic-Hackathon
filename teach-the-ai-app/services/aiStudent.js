/**
 * Service "IA élève".
 *
 * Implémente une heuristique légère (sans dépendance externe) qui simule un
 * élève curieux : il pose des questions de clarification, demande des
 * exemples, reformule, et signale ce qu'il n'a pas compris.
 *
 * Si la variable d'environnement OPENAI_API_KEY est définie, on pourrait
 * brancher un vrai LLM ; ici on garde une logique 100% locale pour rester
 * déployable sans configuration.
 */
const topics = require('./topics');

/** Normalise un texte pour comparaison de mots-clés. */
function normalize(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s']/g, ' ');
}

/** Met à jour la liste des concepts couverts à partir du dernier message. */
function detectConceptsCovered(topic, userText, alreadyCovered) {
  const normalized = normalize(userText);
  const newlyCovered = [];
  for (const concept of topic.concepts) {
    const key = normalize(concept);
    if (normalized.includes(key) && !alreadyCovered.includes(concept)) {
      newlyCovered.push(concept);
    }
  }
  return newlyCovered;
}

/** Estime un niveau de compréhension (0-100) à partir de la session. */
function estimateComprehension(topic, session) {
  const covered = session.conceptsCovered.length;
  const total = topic.concepts.length;
  const coverageScore = (covered / total) * 70;

  // Bonus : qualité des explications (longueur moyenne, présence d'exemples)
  const userMessages = session.messages.filter((m) => m.role === 'user');
  const avgLen = userMessages.length
    ? userMessages.reduce((acc, m) => acc + m.content.length, 0) / userMessages.length
    : 0;
  const lengthBonus = Math.min(15, avgLen / 30);

  const hasExample = userMessages.some((m) => /exemple|par exemple|imagine|comme/i.test(m.content));
  const exampleBonus = hasExample ? 10 : 0;

  const turnPenalty = session.confusionCount * 5;

  const score = Math.max(0, Math.min(100, Math.round(coverageScore + lengthBonus + exampleBonus - turnPenalty)));
  return score;
}

/** Choisit le prochain message de l'IA élève en fonction du contexte. */
function buildStudentReply(topic, session, lastUserMessage) {
  const text = lastUserMessage.content.trim();
  const normalizedText = normalize(text);
  const remaining = topic.concepts.filter((c) => !session.conceptsCovered.includes(c));

  // Cas 1 : message très court -> demande de développer
  if (text.length < 25) {
    session.confusionCount += 1;
    return {
      type: 'clarify',
      content: "Hmm, je n'ai pas vraiment saisi. Tu peux développer un peu plus ? Quelques phrases me suffiraient pour visualiser ce que tu décris."
    };
  }

  // Cas 2 : l'utilisateur a couvert un nouveau concept -> rebondir dessus
  const newlyCovered = detectConceptsCovered(topic, text, session.conceptsCovered);
  if (newlyCovered.length > 0) {
    const focus = newlyCovered[0];
    return {
      type: 'followup',
      content: `D'accord, je note la notion de « ${focus} ». Tu peux me dire pourquoi c'est important ici, et comment ça s'articule avec ce qu'on a déjà vu ?`,
      newlyCovered
    };
  }

  // Cas 3 : un concept clé n'est pas encore couvert -> poser une question dessus
  if (remaining.length > 0 && session.messages.length % 3 === 0) {
    const target = remaining[0];
    return {
      type: 'probe',
      content: `Et est-ce qu'on devrait parler de « ${target} » ? J'ai l'impression que c'est un morceau qui me manque pour vraiment comprendre.`
    };
  }

  // Cas 4 : alterner entre demande d'exemple et question de clarification
  const turn = session.messages.filter((m) => m.role === 'assistant').length;
  if (turn % 2 === 0) {
    const q = topic.clarifyingQuestions[turn % topic.clarifyingQuestions.length];
    return { type: 'clarify', content: q };
  } else {
    const q = topic.exampleRequests[turn % topic.exampleRequests.length];
    return { type: 'example', content: q };
  }
}

/** Génère le rapport final synthétisant la session. */
function buildFinalReport(topic, session) {
  const covered = session.conceptsCovered;
  const missing = topic.concepts.filter((c) => !covered.includes(c));

  const userMessages = session.messages.filter((m) => m.role === 'user');
  const hasExamples = userMessages.some((m) => /exemple|imagine|comme/i.test(m.content));
  const shortAnswers = userMessages.filter((m) => m.content.length < 40).length;

  const mastered = covered.map((c) => ({
    concept: c,
    note: `Vous avez explicitement abordé « ${c} » dans vos explications.`
  }));

  const uncertainties = [];
  if (shortAnswers > 1) {
    uncertainties.push("Plusieurs explications étaient très courtes — un signe que la maîtrise reste superficielle.");
  }
  if (!hasExamples) {
    uncertainties.push("Aucun exemple concret n'a été donné : difficile de vérifier la compréhension opérationnelle.");
  }
  if (session.confusionCount > 0) {
    uncertainties.push(`L'IA élève a manifesté de la confusion à ${session.confusionCount} reprise(s).`);
  }

  const misexplained = missing.slice(0, 3).map((c) => ({
    concept: c,
    note: `La notion « ${c} » n'a pas été abordée ou pas suffisamment développée.`
  }));

  const recommendations = [];
  if (missing.length > 0) {
    recommendations.push(`Reprendre les notions manquantes : ${missing.join(', ')}.`);
  }
  if (!hasExamples) {
    recommendations.push("S'entraîner à formuler au moins un exemple concret par concept.");
  }
  if (session.confusionCount > 0) {
    recommendations.push("Reformuler avec un vocabulaire plus simple les passages qui ont déclenché la confusion.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Très bonne couverture. Pour aller plus loin, essayer d'enseigner le sujet à quelqu'un sans préparation.");
  }

  const score = estimateComprehension(topic, session);

  return {
    topic: topic.label,
    score,
    mastered,
    uncertainties,
    misexplained,
    recommendations,
    stats: {
      totalMessages: session.messages.length,
      userMessages: userMessages.length,
      conceptsCovered: covered.length,
      totalConcepts: topic.concepts.length
    }
  };
}

module.exports = {
  buildStudentReply,
  buildFinalReport,
  estimateComprehension,
  detectConceptsCovered
};
