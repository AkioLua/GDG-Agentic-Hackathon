/**
 * Service "IA élève" — proxy synchrone vers le microservice Python LangGraph.
 *
 * L'interface publique reste IDENTIQUE à la version d'origine (mêmes
 * fonctions exportées, mêmes signatures, mêmes formes de retour) pour que
 * `api/sessions.js` n'ait absolument RIEN à changer. En interne, on délègue
 * la logique pédagogique au microservice Python via HTTP synchrone (curl),
 * et on enveloppe tout dans un fallback local agentique en cas d'indisponibilité.
 *
 * Variable d'environnement : LANGGRAPH_SERVICE_URL (ex: http://localhost:8000)
 */
const { execFileSync } = require('child_process');

const SERVICE_URL = process.env.LANGGRAPH_SERVICE_URL || 'http://localhost:8000';
const HTTP_TIMEOUT_MS = Number(process.env.LANGGRAPH_TIMEOUT_MS || 4000);

// ---------------------------------------------------------------------------
// Utilitaires texte (conservés pour `detectConceptsCovered`)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mapping topic.id -> student_model initial pour le microservice Python
// ---------------------------------------------------------------------------

/**
 * Slug ASCII court à partir d'un libellé français.
 * (utilisé comme fallback pour les sujets sans template explicite)
 */
function toSlug(label) {
  return normalize(label).trim().replace(/\s+/g, '_').slice(0, 32) || 'node';
}

/** Templates explicites pour les sujets clés (commençant par la récursivité). */
const NODE_TEMPLATES = {
  recursion: [
    { node: 'base_case',     label: "condition d'arrêt" },
    { node: 'recursive_call',label: "appel à soi-même" },
    { node: 'shrink',        label: "le problème rétrécit vers le cas de base" },
    { node: 'call_stack',    label: "où s'empilent les appels" },
    { node: 'combine',       label: "comment les résultats remontent" },
    { node: 'termination',   label: "garantie que ça s'arrête" },
    { node: 'vs_loop',       label: "différence avec une boucle" }
  ]
};

const NODE_KEYWORDS = {
  base_case: ['cas de base', 'condition arret', 'condition stop', 'fin recursion'],
  recursive_call: ['appel recursif', 's appelle elle meme', 'appelle elle meme', 'appel a soi meme'],
  shrink: ['plus petit', 'sous probleme', 'reduit', 'decremente', 'n moins 1'],
  call_stack: ['pile appels', 'pile d appels', 'stack', 'memoire', 'empile'],
  combine: ['remonte', 'combine', 'retourne', 'resultat precedent'],
  termination: ['terminaison', 's arrete', 'infini', 'boucle infinie'],
  vs_loop: ['boucle', 'iteration', 'iteratif']
};

/** Construit un student_model initial pour un sujet donné. */
function buildInitialStudentModel(topic) {
  const template = NODE_TEMPLATES[topic.id];
  if (template) {
    return template.map((n) => ({ ...n, status: 'not_addressed', note: '' }));
  }
  // Fallback générique : dériver des concepts listés dans topics.js
  return topic.concepts.map((c) => ({
    node: toSlug(c),
    label: c,
    status: 'not_addressed',
    note: ''
  }));
}

function getNodeText(node) {
  const keywords = NODE_KEYWORDS[node.node] || [];
  return normalize(`${node.label || ''} ${node.node || ''} ${keywords.join(' ')}`);
}

function scoreNodeFromText(node, normalizedText) {
  const terms = getNodeText(node).split(/\s+/).filter((term) => term.length >= 4);
  return terms.filter((term) => normalizedText.includes(term)).length;
}

function updateModelLocally(topic, session, lastUserMessage) {
  const normalized = normalize(lastUserMessage.content);
  const previousTarget = session.lastTargetedNode;

  session.studentModel = session.studentModel.map((node) => {
    const score = scoreNodeFromText(node, normalized);
    const wasTargeted = previousTarget && node.node === previousTarget;
    const hasMechanism = /(car|parce|donc|permet|evite|assure|garantit|fonctionne|appelle|retourne|jusqu|quand|si)/.test(normalized);
    const hasExample = /(exemple|factorielle|fibonacci|imagine|comme|par exemple|\d+)/.test(normalized);

    if (score === 0 && !wasTargeted) return node;

    if (score > 0 && (hasMechanism || hasExample || lastUserMessage.content.length > 140)) {
      return {
        ...node,
        status: 'clear',
        note: `Le tuteur a expliqué « ${node.label} » avec ${hasExample ? 'un exemple' : 'un mécanisme'}.`
      };
    }

    if (score > 0 || wasTargeted) {
      return {
        ...node,
        status: 'vague',
        note: `« ${node.label} » est mentionné, mais Léo attend encore le mécanisme ou un exemple.`
      };
    }

    return node;
  });

  if (lastUserMessage.content.trim().length < 35) {
    session.overallConfusion = (session.overallConfusion || 0) + 8;
  } else {
    session.overallConfusion = Math.max(0, (session.overallConfusion || 0) - 2);
  }
}

function chooseLocalMove(session) {
  const model = session.studentModel || [];
  const vague = model.find((n) => n.status === 'vague' || n.status === 'contradicted');
  if (vague) return { move: 'deepen', targetedNode: vague };

  const missing = model.find((n) => n.status === 'not_addressed' || n.status === 'avoided');
  if (missing) return { move: 'pivot', targetedNode: missing };

  const turnCount = session.messages.filter((m) => m.role === 'user').length;
  if (turnCount >= 2 && model.length > 0) {
    return { move: 'trap', targetedNode: model[turnCount % model.length] };
  }

  return { move: 'conclude', targetedNode: model[0] || { node: '', label: 'le sujet' } };
}

function localReaction(topic, move, targetedNode) {
  const label = targetedNode.label || targetedNode.node || topic.label;
  if (move === 'pivot') {
    return `Attends, il me manque encore « ${label} ». Ça joue quel rôle exactement dans ${topic.label} ?`;
  }
  if (move === 'trap') {
    return `Donc si je reformule, « ${label} » est juste un détail optionnel et on peut l'ignorer, c'est bien ça ?`;
  }
  if (move === 'conclude') {
    return `Ok, je crois que je tiens l'idée générale de ${topic.label}. Tu peux me donner un dernier exemple rapide pour vérifier que je ne récite pas sans comprendre ?`;
  }
  return `Attends, tu as parlé de « ${label} », mais concrètement il se passe quoi étape par étape ?`;
}

function buildLocalReply(topic, session, lastUserMessage) {
  updateModelLocally(topic, session, lastUserMessage);
  const decision = chooseLocalMove(session);
  session.lastMove = decision.move;
  session.lastTargetedNode = decision.targetedNode.node;
  session.agentMode = 'fallback-local';
  session.confusionCount = lastUserMessage.content.trim().length < 35
    ? (session.confusionCount || 0) + 1
    : (session.confusionCount || 0);

  return {
    type: MOVE_TO_TYPE[decision.move] || 'clarify',
    content: localReaction(topic, decision.move, decision.targetedNode)
  };
}

function buildAgentSnapshot(session) {
  const model = Array.isArray(session.studentModel) ? session.studentModel : [];
  return {
    mode: session.agentMode || 'langgraph',
    move: session.lastMove || 'initial',
    targetedNode: session.lastTargetedNode || '',
    overallConfusion: session.overallConfusion || 0,
    studentModel: model
  };
}

// ---------------------------------------------------------------------------
// Client HTTP synchrone vers le microservice Python (via curl)
// ---------------------------------------------------------------------------

/**
 * Effectue un POST JSON synchrone et renvoie l'objet parsé.
 * On utilise `curl` via execFileSync pour éviter toute dépendance npm
 * supplémentaire et préserver la nature synchrone des callers existants.
 */
function postJsonSync(path, payload) {
  const url = `${SERVICE_URL}${path}`;
  const body = JSON.stringify(payload);
  const args = [
    '-sS',
    '--fail',
    '--max-time', String(Math.ceil(HTTP_TIMEOUT_MS / 1000)),
    '-H', 'Content-Type: application/json',
    '-X', 'POST',
    '--data-binary', '@-',
    url
  ];
  const stdout = execFileSync('curl', args, {
    input: body,
    timeout: HTTP_TIMEOUT_MS + 2000,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

// ---------------------------------------------------------------------------
// Mapping move -> type (pour rester compatible avec le front existant)
// ---------------------------------------------------------------------------
const MOVE_TO_TYPE = {
  pivot: 'probe',
  deepen: 'clarify',
  trap: 'example',     // une reformulation fausse "à la manière d'un exemple"
  conclude: 'followup'
};

// ---------------------------------------------------------------------------
// Estimation de compréhension (locale, alimentée par les signaux du graphe)
// ---------------------------------------------------------------------------

/** Estime un niveau de compréhension (0-100) à partir de la session. */
function estimateComprehension(topic, session) {
  // Base : couverture textuelle (conservée pour rétro-compatibilité)
  const covered = session.conceptsCovered.length;
  const total = topic.concepts.length || 1;
  const coverageScore = (covered / total) * 60;

  // Bonus issu du student_model du graphe (si présent)
  let modelBonus = 0;
  const model = Array.isArray(session.studentModel) ? session.studentModel : [];
  if (model.length > 0) {
    const clearCount = model.filter((n) => n.status === 'clear').length;
    const vagueCount = model.filter((n) => n.status === 'vague').length;
    const contradicted = model.filter((n) => n.status === 'contradicted').length;
    modelBonus = (clearCount / model.length) * 30 - (vagueCount * 2) - (contradicted * 5);
  }

  // Bonus longueur/exemples (signal "qualité d'explication")
  const userMessages = session.messages.filter((m) => m.role === 'user');
  const avgLen = userMessages.length
    ? userMessages.reduce((acc, m) => acc + m.content.length, 0) / userMessages.length
    : 0;
  const lengthBonus = Math.min(10, avgLen / 40);
  const hasExample = userMessages.some((m) => /exemple|par exemple|imagine|comme/i.test(m.content));
  const exampleBonus = hasExample ? 5 : 0;

  // Pénalité globale (confusion locale + confusion remontée par le graphe)
  const confusionPenalty = (session.confusionCount || 0) * 4
    + Math.min(20, (session.overallConfusion || 0) / 4);

  const raw = coverageScore + modelBonus + lengthBonus + exampleBonus - confusionPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Choisit le prochain message de l'IA élève en fonction du contexte.
 * Délègue au microservice Python via /invoke. Fallback gracieux si KO.
 */
function buildStudentReply(topic, session, lastUserMessage) {
  // Initialiser le student_model si on entre dans la session
  if (!Array.isArray(session.studentModel) || session.studentModel.length === 0) {
    session.studentModel = buildInitialStudentModel(topic);
  }

  // Préparer la charge utile attendue par le microservice
  const payload = {
    concept: topic.label,
    history: session.messages.map((m) => ({ role: m.role, content: m.content })),
    student_model: session.studentModel,
    last_user_message: lastUserMessage.content
  };

  try {
    const data = postJsonSync('/invoke', payload);

    // Mettre à jour les champs additionnels de la session (sans casser l'existant)
    if (Array.isArray(data.student_model) && data.student_model.length > 0) {
      session.studentModel = data.student_model;
    }
    session.overallConfusion = typeof data.overall_confusion === 'number'
      ? data.overall_confusion
      : (session.overallConfusion || 0);
    session.lastMove = data.move;
    session.lastTargetedNode = data.targeted_node;
    session.agentMode = 'langgraph';

    const move = data.move || 'deepen';
    const type = MOVE_TO_TYPE[move] || 'clarify';

    return {
      type,
      content: data.reaction || '…'
    };
  } catch (err) {
    return buildLocalReply(topic, session, lastUserMessage);
  }
}

function ensureStudentModel(topic, session) {
  if (!Array.isArray(session.studentModel) || session.studentModel.length === 0) {
    session.studentModel = buildInitialStudentModel(topic);
  }
}

/**
 * Génère le rapport final synthétisant la session.
 * Délègue au microservice Python via /report ; produit malgré tout un rapport
 * dans la forme attendue par le front si le service est KO.
 */
function buildFinalReport(topic, session) {
  // Initialisation défensive
  ensureStudentModel(topic, session);

  let verdict = null;
  try {
    const payload = {
      concept: topic.label,
      history: session.messages.map((m) => ({ role: m.role, content: m.content })),
      student_model: session.studentModel
    };
    const data = postJsonSync('/report', payload);
    verdict = data && data.verdict ? data.verdict : null;
  } catch (err) {
    verdict = null; // on retombe sur le fallback ci-dessous
  }

  // --- Construction du rapport au format attendu par api/sessions.js ---
  const covered = session.conceptsCovered;
  const missing = topic.concepts.filter((c) => !covered.includes(c));
  const userMessages = session.messages.filter((m) => m.role === 'user');
  const hasExamples = userMessages.some((m) => /exemple|imagine|comme/i.test(m.content));
  const score = estimateComprehension(topic, session);

  // Maîtrise : on combine les concepts détectés localement + nœuds "clear" du graphe
  const modelClears = (session.studentModel || [])
    .filter((n) => n.status === 'clear')
    .map((n) => ({ concept: n.label, note: n.note || `Concept « ${n.label} » bien expliqué.` }));
  const masteredFromCovered = covered.map((c) => ({
    concept: c,
    note: `Vous avez explicitement abordé « ${c} » dans vos explications.`
  }));
  const mastered = [...masteredFromCovered, ...modelClears];

  // Incertitudes : on s'appuie d'abord sur le verdict du graphe s'il existe
  const uncertainties = [];
  if (verdict && Array.isArray(verdict.gaps) && verdict.gaps.length > 0) {
    for (const g of verdict.gaps) {
      uncertainties.push(g.why || `Le point « ${g.node} » n'a pas été clarifié.`);
    }
  } else {
    if (userMessages.filter((m) => m.content.length < 40).length > 1) {
      uncertainties.push("Plusieurs explications étaient très courtes — un signe que la maîtrise reste superficielle.");
    }
    if (!hasExamples) {
      uncertainties.push("Aucun exemple concret n'a été donné : difficile de vérifier la compréhension opérationnelle.");
    }
    if ((session.confusionCount || 0) > 0) {
      uncertainties.push(`Léo a manifesté de la confusion à ${session.confusionCount} reprise(s).`);
    }
  }

  // Mal-expliqués : nœuds "vague" / "contradicted" remontés par le graphe, sinon manquants
  const misexplained = [];
  for (const n of (session.studentModel || [])) {
    if (n.status === 'vague' || n.status === 'contradicted') {
      misexplained.push({
        concept: n.label,
        note: n.note || `La notion « ${n.label} » est restée floue (${n.status}).`
      });
    }
  }
  if (misexplained.length === 0) {
    for (const c of missing.slice(0, 3)) {
      misexplained.push({
        concept: c,
        note: `La notion « ${c} » n'a pas été abordée ou pas suffisamment développée.`
      });
    }
  }

  // Recommandations
  const recommendations = [];
  if (missing.length > 0) {
    recommendations.push(`Reprendre les notions manquantes : ${missing.join(', ')}.`);
  }
  if (!hasExamples) {
    recommendations.push("S'entraîner à formuler au moins un exemple concret par concept.");
  }
  if ((session.confusionCount || 0) > 0) {
    recommendations.push("Reformuler avec un vocabulaire plus simple les passages qui ont déclenché la confusion.");
  }
  if (verdict && verdict.summary) {
    recommendations.push(`Synthèse de Léo : ${verdict.summary}`);
  }
  if (recommendations.length === 0) {
    recommendations.push("Très bonne couverture. Pour aller plus loin, essayer d'enseigner le sujet à quelqu'un sans préparation.");
  }

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
    },
    agent: buildAgentSnapshot(session)
  };
}

module.exports = {
  buildStudentReply,
  buildFinalReport,
  estimateComprehension,
  detectConceptsCovered,
  buildInitialStudentModel,
  buildAgentSnapshot,
  ensureStudentModel
};
