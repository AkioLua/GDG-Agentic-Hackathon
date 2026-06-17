/**
 * Stockage local des sessions sur disque (dossier /data).
 * Chaque session est sérialisée dans un fichier JSON nommé d'après son id.
 * Permet la persistance sans dépendre d'une base externe.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sessionPath(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

function saveSession(session) {
  ensureDir();
  fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
  return session;
}

function loadSession(id) {
  const p = sessionPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function listSessions() {
  ensureDir();
  return fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')));
}

function deleteSession(id) {
  const p = sessionPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { saveSession, loadSession, listSessions, deleteSession };
