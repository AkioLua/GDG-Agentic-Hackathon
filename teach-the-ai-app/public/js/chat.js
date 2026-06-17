/* Page de chat : conversation avec l'IA élève + panneau latéral. */
(function () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('id');
  if (!sessionId) {
    window.location.href = '/';
    return;
  }

  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const titleEl = document.getElementById('chat-title');
  const pillEl = document.getElementById('topic-pill');
  const subjectName = document.getElementById('subject-name');
  const subjectDesc = document.getElementById('subject-desc');
  const progressFill = document.getElementById('progress-fill');
  const progressValue = document.getElementById('progress-value');
  const conceptsCoveredEl = document.getElementById('concepts-covered');
  const conceptsRemainingEl = document.getElementById('concepts-remaining');
  const endBtn = document.getElementById('end-session-btn');

  let topic = null;

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = `msg ${msg.role}`;
    div.innerHTML = `<div class="role">${msg.role === 'user' ? 'Toi (prof)' : "IA élève"}</div>${escapeHtml(msg.content)}`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderChips(container, items, cls) {
    if (!items || items.length === 0) {
      container.innerHTML = '<span class="empty">—</span>';
      return;
    }
    container.innerHTML = items.map((c) => `<span class="chip ${cls}">${c}</span>`).join('');
  }

  function updateProgress(percent) {
    progressFill.style.width = `${percent}%`;
    progressValue.textContent = `${percent}%`;
  }

  function setTyping(on) {
    let el = document.getElementById('typing-indicator');
    if (on) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'typing-indicator';
        el.className = 'msg assistant typing';
        el.textContent = "L'IA élève réfléchit…";
        messagesEl.appendChild(el);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } else if (el) {
      el.remove();
    }
  }

  async function loadSession() {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) { window.location.href = '/'; return; }
    const { session, topic: t } = await res.json();
    topic = t;
    titleEl.textContent = `Session — ${topic.label}`;
    pillEl.textContent = topic.label;
    subjectName.textContent = topic.label;
    subjectDesc.textContent = topic.description;

    messagesEl.innerHTML = '';
    session.messages.forEach(renderMessage);

    renderChips(conceptsCoveredEl, session.conceptsCovered, 'done');
    const remaining = topic.concepts.filter((c) => !session.conceptsCovered.includes(c));
    renderChips(conceptsRemainingEl, remaining, 'todo');
    updateProgress(session.comprehension || 0);
  }

  async function sendMessage(content) {
    renderMessage({ role: 'user', content });
    setTyping(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      setTyping(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Erreur d'envoi");
        return;
      }
      const data = await res.json();
      renderMessage(data.assistantMessage);
      renderChips(conceptsCoveredEl, data.conceptsCovered, 'done');
      renderChips(conceptsRemainingEl, data.conceptsRemaining, 'todo');
      updateProgress(data.comprehension);
    } catch (e) {
      setTyping(false);
      alert("Erreur réseau");
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    sendMessage(content);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  endBtn.addEventListener('click', () => {
    window.location.href = `/report.html?id=${sessionId}`;
  });

  loadSession();
})();
