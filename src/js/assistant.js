import { databases, dbConfig, isAppwriteReady } from "./appwrite-config.js";
import { withBasePath } from "../assets/js/utils/path-prefix.js";

async function loadKB() {
  const res = await fetch(withBasePath('/data/assistant.json'));
  return res.json();
}

const STORAGE_KEY = "assistantFeedback";

function readLocalFeedback() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to read assistant feedback queue:", error);
    return [];
  }
}

function writeLocalFeedback(entries) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Failed to persist assistant feedback queue:", error);
  }
}

function queueLocalFeedback(entry) {
  const queue = readLocalFeedback();
  queue.push(entry);
  writeLocalFeedback(queue);
}

async function syncPendingFeedback() {
  if (!databases || !dbConfig.databaseId || !dbConfig.collectionId) {
    return;
  }

  const pending = readLocalFeedback();
  if (!pending.length) {
    return;
  }

  const remaining = [];
  for (const entry of pending) {
    try {
      await databases.createDocument(
        dbConfig.databaseId,
        dbConfig.collectionId,
        "unique()",
        entry
      );
    } catch (error) {
      console.warn("Assistant feedback sync failed for entry, keeping locally:", error);
      remaining.push(entry);
    }
  }

  writeLocalFeedback(remaining);

  if (!remaining.length) {
    console.info("Assistant feedback queue synced with Appwrite.");
  }
}

function normalize(s) { return (s || "").toLowerCase(); }

function matchIntent(q, kb) {
  if (!q) return null;
  const Q = normalize(q);
  let best = null;
  for (const intent of kb.intents) {
    if (intent.triggers.some(t => Q.includes(normalize(t)))) {
      best = intent;
      break;
    }
  }
  return best;
}

function renderAnswer(intent, q) {
  const panel = document.getElementById('askPanel');
  panel.innerHTML = `
    <div class="assistant-card">
      <h3>${intent ? intent.id.replaceAll('_',' ') : 'No match'}</h3>
      <p>${intent ? intent.answer : 'Sorry, I couldn't find that yet.'}</p>
      ${
        intent?.links
          ? `<ul>${intent.links.map(l => `<li><a href="${l.url}">${l.label}</a></li>`).join('')}</ul>`
          : ''
      }
      <div class="feedback">
        <button id="yesBtn">👍</button>
        <button id="noBtn">👎</button>
      </div>
    </div>`;
  panel.hidden = false;
  document.getElementById('yesBtn').onclick = () =>
    saveFeedback(q, intent?.id, true);
  document.getElementById('noBtn').onclick = () =>
    saveFeedback(q, intent?.id, false);
}

async function saveFeedback(question, intentId, helpful) {
  // If Appwrite SDK didn't load, fall back to local storage immediately
  if (!databases) {
    console.warn("Appwrite SDK not available, using local storage");
    queueLocalFeedback({ question, intentId, helpful, ts: new Date().toISOString() });
    alert("Feedback guardado localmente (offline mode).");
    return;
  }

  try {
    await databases.createDocument(
      dbConfig.databaseId,
      dbConfig.collectionId,
      "unique()",
      { question, intentId, helpful, ts: new Date().toISOString() }
    );
    alert("Gracias! Feedback enviado al servidor.");
    await syncPendingFeedback();
  } catch (err) {
    console.warn("Appwrite feedback fallback:", err);
    queueLocalFeedback({ question, intentId, helpful, ts: new Date().toISOString() });
    alert("Feedback guardado localmente (offline mode).");
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const kb = await loadKB();
  if (isAppwriteReady) {
    await syncPendingFeedback();
  }
  const btn = document.getElementById('askBtn');
  btn.addEventListener('click', () => {
    const q = prompt('Ask the Playground about CDC, Matillion, or agents:');
    if (!q || !q.trim()) {
      return;
    }
    const match = matchIntent(q, kb);
    renderAnswer(match, q);
  });
});
