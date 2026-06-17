/* Page de rapport final : récupère et affiche la synthèse de la session. */
(async function () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('id');
  if (!sessionId) { window.location.href = '/'; return; }

  const titleEl = document.getElementById('report-title');
  const subtitleEl = document.getElementById('report-subtitle');
  const grid = document.getElementById('report-grid');

  function listOrEmpty(items, renderer) {
    if (!items || items.length === 0) return '<p class="empty">Rien à signaler ici.</p>';
    return `<ul>${items.map(renderer).join('')}</ul>`;
  }

  const res = await fetch(`/api/sessions/${sessionId}/report`);
  if (!res.ok) {
    grid.innerHTML = '<p class="empty">Impossible de générer le rapport.</p>';
    return;
  }
  const r = await res.json();
  const agent = r.agent || {};
  const model = agent.studentModel || [];
  const clearCount = model.filter((n) => n.status === 'clear').length;
  const target = model.find((n) => n.node === agent.targetedNode);

  titleEl.textContent = `Rapport — ${r.topic}`;
  subtitleEl.textContent = `${r.stats.userMessages} explication(s) analysée(s), ${r.stats.conceptsCovered}/${r.stats.totalConcepts} concepts couverts.`;

  grid.innerHTML = `
    <article class="report-card score">
      <h3>Score d'enseignement</h3>
      <div class="score-value">${r.score}</div>
      <div class="score-label">sur 100 — estimation de la maîtrise</div>
    </article>

    <article class="report-card">
      <h3>Points bien maîtrisés</h3>
      ${listOrEmpty(r.mastered, (m) => `<li><strong>${m.concept}</strong> — ${m.note}</li>`)}
    </article>

    <article class="report-card">
      <h3>Zones d'incertitude détectées</h3>
      ${listOrEmpty(r.uncertainties, (u) => `<li>${u}</li>`)}
    </article>

    <article class="report-card">
      <h3>Trace de l'agent</h3>
      <ul>
        <li><strong>Mode</strong> — ${agent.mode || 'ready'}</li>
        <li><strong>Dernière décision</strong> — ${agent.move || 'initial'}</li>
        <li><strong>Cible pédagogique</strong> — ${target ? target.label : (agent.targetedNode || '—')}</li>
        <li><strong>Modèle clair</strong> — ${clearCount}/${model.length || 0} nœud(s)</li>
      </ul>
    </article>

    <article class="report-card">
      <h3>Notions mal expliquées</h3>
      ${listOrEmpty(r.misexplained, (m) => `<li><strong>${m.concept}</strong> — ${m.note}</li>`)}
    </article>

    <article class="report-card" style="grid-column: 1 / -1;">
      <h3>Recommandations pour approfondir</h3>
      ${listOrEmpty(r.recommendations, (rec) => `<li>${rec}</li>`)}
    </article>
  `;
})();
