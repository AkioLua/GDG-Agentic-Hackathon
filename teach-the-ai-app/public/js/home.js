/* Page d'accueil : liste les sujets, gère la création de session. */
(async function () {
  const grid = document.getElementById('topic-grid');
  const customInput = document.getElementById('custom-topic-input');
  const customBtn = document.getElementById('custom-topic-btn');

  async function loadTopics() {
    const res = await fetch('/api/sessions/topics');
    const topics = await res.json();
    grid.innerHTML = topics.map((t) => `
      <article class="topic-card" data-id="${t.id}">
        <span class="emoji">${t.emoji}</span>
        <h3>${t.label}</h3>
        <p>${t.description}</p>
        <span class="arrow">→</span>
      </article>
    `).join('');
    grid.querySelectorAll('.topic-card').forEach((card) => {
      card.addEventListener('click', () => startSession(card.dataset.id));
    });
  }

  async function startSession(topicId) {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Impossible de créer la session');
      return;
    }
    const { session } = await res.json();
    window.location.href = `/chat.html?id=${session.id}`;
  }

  customBtn.addEventListener('click', () => {
    const value = customInput.value.trim().toLowerCase();
    if (!value) {
      customInput.focus();
      return;
    }
    // Les sujets personnalisés ne sont pas dans le catalogue : on tombe sur "http"
    // par défaut pour démontrer le flux. (Une vraie intégration LLM accepterait
    // tout sujet libre.)
    alert("Pour l'instant, choisis un sujet dans la liste. Le support des sujets libres arrive avec l'intégration LLM.");
  });

  loadTopics();
})();
