/**
 * CDC Playground – Inline Chat Assistant (Phase 2.3)
 *
 * Features:
 * - Inline chat panel (replaces prompt())
 * - Context-aware intent matching (boosts intents for current module)
 * - Chat history persistence (localStorage, last 20 messages)
 * - Heading-level citation links (url + anchor)
 * - Next-topic suggestions based on progress
 * - Improved feedback with inline confirmation
 */
import { databases, dbConfig, isAppwriteReady } from "./appwrite-config.js";
import { withBasePath } from "../assets/js/utils/path-prefix.js";

/* ── Constants ─────────────────────────────────────────────────────────── */
const HISTORY_KEY = "assistantHistory";
const FEEDBACK_KEY = "assistantFeedback";
const MAX_HISTORY = 20;

/* ── Knowledge base ────────────────────────────────────────────────────── */
let _kb = null;

async function loadKB() {
  if (_kb) return _kb;
  const res = await fetch(withBasePath("/data/assistant.json"));
  _kb = await res.json();
  return _kb;
}

/* ── Chat history ──────────────────────────────────────────────────────── */

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(entries.slice(-MAX_HISTORY)),
    );
  } catch {
    /* quota exceeded – silently ignore */
  }
}

function pushMessage(role, text, extra) {
  const history = readHistory();
  history.push({ role, text, ts: Date.now(), ...extra });
  writeHistory(history);
}

/* ── Feedback persistence ──────────────────────────────────────────────── */

function readLocalFeedback() {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalFeedback(entries) {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(entries));
  } catch {
    /* quota exceeded */
  }
}

function queueLocalFeedback(entry) {
  const queue = readLocalFeedback();
  queue.push(entry);
  writeLocalFeedback(queue);
}

async function syncPendingFeedback() {
  if (!databases || !dbConfig.databaseId || !dbConfig.collectionId) return;
  const pending = readLocalFeedback();
  if (!pending.length) return;

  const remaining = [];
  for (const entry of pending) {
    try {
      await databases.createDocument(
        dbConfig.databaseId,
        dbConfig.collectionId,
        "unique()",
        entry,
      );
    } catch {
      remaining.push(entry);
    }
  }
  writeLocalFeedback(remaining);
}

/* ── Intent matching (context-aware) ───────────────────────────────────── */

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

/**
 * Returns the best matching intent, or null.
 * When a currentModule is provided, intents whose `modules` array
 * includes it are scored +10 (so context-relevant intents win ties).
 */
function matchIntent(query, kb, currentModule) {
  if (!query) return null;
  const q = normalize(query);

  let bestIntent = null;
  let bestScore = -1;

  for (const intent of kb.intents) {
    let score = 0;

    // Check trigger words – each matching trigger adds 1
    for (const t of intent.triggers) {
      if (q.includes(normalize(t))) {
        score += 1;
      }
    }
    if (score === 0) continue;

    // Context boost: if intent is relevant to the current module
    if (
      currentModule &&
      Array.isArray(intent.modules) &&
      intent.modules.includes(currentModule)
    ) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }
  return bestIntent;
}

/* ── Next-topic suggestions ────────────────────────────────────────────── */

/**
 * Reads scorecard progress from localStorage and returns up to 2 module
 * suggestions that the user hasn't completed yet.
 */
function getNextTopicSuggestions(currentModule) {
  const modules = window.CDC_MODULES;
  if (!Array.isArray(modules)) return [];

  return modules
    .filter((m) => {
      if (m.state === "disabled") return false;
      if (m.key === currentModule) return false;
      // Check if completion < 100%
      try {
        const raw = localStorage.getItem(`progress_${m.key}`);
        if (!raw) return true; // never started → suggest it
        const data = JSON.parse(raw);
        return (data.pct || 0) < 100;
      } catch {
        return true;
      }
    })
    .slice(0, 2);
}

/* ── DOM helpers ───────────────────────────────────────────────────────── */

function esc(s) {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

/* ── Build chat panel HTML ─────────────────────────────────────────────── */

function buildPanelHTML() {
  return `
    <div class="assistant-header">
      <span class="assistant-title">CDC Assistant</span>
      <button class="assistant-close" aria-label="Close assistant" type="button">&times;</button>
    </div>
    <div class="assistant-messages" role="log" aria-live="polite"></div>
    <form class="assistant-input-row" autocomplete="off">
      <input
        type="text"
        class="assistant-input"
        placeholder="Ask about CDC…"
        aria-label="Ask the assistant"
        autocomplete="off"
      />
      <button class="assistant-send" type="submit" aria-label="Send">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </form>`;
}

/* ── Render a single message bubble ────────────────────────────────────── */

function renderMessageBubble(msg) {
  const div = document.createElement("div");
  div.className = `assistant-msg assistant-msg--${msg.role}`;

  if (msg.role === "user") {
    div.innerHTML = `<p>${esc(msg.text)}</p>`;
    return div;
  }

  // Bot message
  let html = `<p>${msg.text}</p>`;

  // Citation links
  if (msg.links && msg.links.length) {
    html += `<ul class="assistant-links">`;
    for (const l of msg.links) {
      const href = withBasePath(l.url) + (l.anchor || "");
      const title = l.preview ? ` title="${esc(l.preview)}"` : "";
      html += `<li><a href="${href}"${title}>${esc(l.label)}</a></li>`;
    }
    html += `</ul>`;
  }

  // Next-topic suggestions (only on latest bot message)
  if (msg.suggestions && msg.suggestions.length) {
    html += `<div class="assistant-suggestions">`;
    html += `<span class="assistant-suggestions__label">Continue learning:</span>`;
    for (const s of msg.suggestions) {
      html += `<a href="${withBasePath(s.href)}" class="assistant-suggestion-chip">${esc(s.title)}</a>`;
    }
    html += `</div>`;
  }

  // Feedback row (only on latest)
  if (msg.showFeedback) {
    html += `
      <div class="assistant-feedback" data-intent="${msg.intentId || ""}">
        <button class="assistant-fb-btn" data-helpful="true" type="button" aria-label="Helpful">👍</button>
        <button class="assistant-fb-btn" data-helpful="false" type="button" aria-label="Not helpful">👎</button>
      </div>`;
  }

  div.innerHTML = html;
  return div;
}

/* ── Main bootstrap ────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", async () => {
  const kb = await loadKB();

  // Sync any pending Appwrite feedback
  if (isAppwriteReady) {
    syncPendingFeedback();
  }

  const panel = document.getElementById("askPanel");
  const fab = document.getElementById("askBtn");
  if (!panel || !fab) return;

  // The current module slug (set by base.njk when seriesKey is defined)
  const currentModule = window.CDC_JOURNEY_SLUG || null;

  // Inject panel structure
  panel.innerHTML = buildPanelHTML();
  const messagesEl = panel.querySelector(".assistant-messages");
  const form = panel.querySelector(".assistant-input-row");
  const input = panel.querySelector(".assistant-input");
  const closeBtn = panel.querySelector(".assistant-close");

  // ── Render history on open ──
  function renderHistory() {
    messagesEl.innerHTML = "";
    const history = readHistory();
    for (const msg of history) {
      messagesEl.appendChild(renderMessageBubble(msg));
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Toggle panel ──
  function openPanel() {
    panel.hidden = false;
    panel.classList.add("assistant-open");
    fab.setAttribute("aria-expanded", "true");
    renderHistory();
    requestAnimationFrame(() => input.focus());
  }

  function closePanel() {
    panel.hidden = true;
    panel.classList.remove("assistant-open");
    fab.setAttribute("aria-expanded", "false");
  }

  fab.addEventListener("click", () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  closeBtn.addEventListener("click", closePanel);

  // Close on Escape
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  // ── Submit handler ──
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = "";

    // Save user message
    pushMessage("user", q);

    // Match intent
    const intent = matchIntent(q, kb, currentModule);

    // Build bot response
    const botMsg = {
      role: "bot",
      text: intent
        ? intent.answer
        : "Sorry, I couldn't find an answer for that. Try rephrasing or browse the <a href=\"" +
          withBasePath("/overview/") +
          '">series overview</a>.',
      intentId: intent ? intent.id : null,
      links: intent ? intent.links || [] : [],
      suggestions: getNextTopicSuggestions(currentModule),
      showFeedback: true,
    };

    pushMessage("bot", botMsg.text, {
      intentId: botMsg.intentId,
      links: botMsg.links,
      suggestions: botMsg.suggestions,
      showFeedback: true,
    });

    renderHistory();
  });

  // ── Citation click tracking ──
  messagesEl.addEventListener("click", (e) => {
    const citationLink = e.target.closest(".assistant-links a");
    const suggestionChip = e.target.closest(".assistant-suggestion-chip");

    if (
      window._educationTracer &&
      typeof window._educationTracer.trackInteraction === "function"
    ) {
      if (citationLink) {
        window._educationTracer.trackInteraction("citation-click", {
          href: citationLink.getAttribute("href") || "",
          label: citationLink.textContent || "",
          module: currentModule,
        });
      } else if (suggestionChip) {
        window._educationTracer.trackInteraction("suggestion-click", {
          href: suggestionChip.getAttribute("href") || "",
          title: suggestionChip.textContent || "",
          module: currentModule,
        });
      }
    }
  });

  // ── Feedback delegation ──
  messagesEl.addEventListener("click", async (e) => {
    const btn = e.target.closest(".assistant-fb-btn");
    if (!btn) return;

    const feedbackRow = btn.closest(".assistant-feedback");
    const intentId = feedbackRow?.dataset.intent || null;
    const helpful = btn.dataset.helpful === "true";

    // Find the preceding user message to get the question
    const history = readHistory();
    let question = "";
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user") {
        question = history[i].text;
        break;
      }
    }

    await saveFeedback(question, intentId, helpful);

    // Replace feedback row with confirmation
    feedbackRow.innerHTML = `<span class="assistant-fb-thanks">Thanks for the feedback!</span>`;
  });
});

/* ── Save feedback ─────────────────────────────────────────────────────── */

async function saveFeedback(question, intentId, helpful) {
  const entry = {
    question,
    intentId,
    helpful,
    ts: new Date().toISOString(),
  };

  if (!databases) {
    queueLocalFeedback(entry);
    return;
  }

  try {
    await databases.createDocument(
      dbConfig.databaseId,
      dbConfig.collectionId,
      "unique()",
      entry,
    );
    // Also try to flush any pending queue
    syncPendingFeedback();
  } catch {
    queueLocalFeedback(entry);
  }
}
