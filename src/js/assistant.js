import { databases, dbConfig } from "./appwrite-config.js";
import { withBasePath } from "../assets/js/utils/path-prefix.js";

async function loadKB() {
  const res = await fetch(withBasePath('/data/assistant.json'));
  return res.json();
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
      <p>${intent ? intent.answer : 'Sorry, I couldn’t find that yet.'}</p>
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
  try {
    await databases.createDocument(
      dbConfig.databaseId,
      dbConfig.collectionId,
      "unique()",
      { question, intentId, helpful, ts: new Date().toISOString() }
    );
    alert("Gracias! Feedback enviado al servidor.");
  } catch (err) {
    console.warn("Appwrite feedback fallback:", err);
    const feedback = JSON.parse(localStorage.getItem("assistantFeedback") || "[]");
    feedback.push({ question, intentId, helpful, ts: new Date().toISOString() });
    localStorage.setItem("assistantFeedback", JSON.stringify(feedback));
    alert("Feedback guardado localmente (offline mode).");
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const kb = await loadKB();
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
