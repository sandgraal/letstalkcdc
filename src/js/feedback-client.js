/**
 * Assistant feedback client.
 *
 * Sends 👍/👎 votes to Supabase PostgREST with plain `fetch` and the
 * publishable key (public by design; the table only allows INSERT for
 * anon). No SDK, no CDN script, no secret.
 *
 * Votes are always written to a small localStorage queue first and removed
 * once the server has them, so a failed or offline send is retried later.
 * Every entry gets a client-generated UUID when it is first created and
 * reuses it on each retry; the server answers 409 for a duplicate id, which
 * we treat as "already delivered".
 *
 * Everything is injectable so it can be unit-tested without a browser.
 * Nothing here touches the DOM or the network at import time.
 */

export const FEEDBACK_KEY = "assistantFeedback";
export const MAX_QUEUE = 50;
export const MAX_ATTEMPTS = 8;
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_QUESTION_CHARS = 2000;
export const MAX_INTENT_CHARS = 200;
export const REQUEST_TIMEOUT_MS = 10000;

/** Single in-flight sync shared by every client in this page. */
let inFlight = null;

/* ── Helpers ───────────────────────────────────────────────────────────── */

function defaultUuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      data.set(k, String(v));
    },
  };
}

/** Truncate by code points (Postgres `char_length` counts characters). */
function truncate(value, max) {
  let text = String(value ?? "");
  if (typeof text.toWellFormed === "function") text = text.toWellFormed();
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("") : text;
}

/** Map a queued entry to the PostgREST row. */
export function toRow(entry) {
  const intent = entry.intentId
    ? truncate(entry.intentId, MAX_INTENT_CHARS)
    : null;
  return {
    id: entry.id,
    question: truncate(entry.question, MAX_QUESTION_CHARS),
    intent_id: intent || null,
    helpful: Boolean(entry.helpful),
    ts: entry.ts,
  };
}

/**
 * Classify an HTTP status.
 * - "delivered": stored now (2xx) or earlier (409 duplicate id)
 * - "retry": the server answered 408, 429 or 5xx; keep and count an attempt
 * - "config": 401/403 mean the key or policy is wrong, not the row; keep the
 *   entry, stop this sync, do not count an attempt
 * - "drop": any other 4xx; the row can never succeed
 * - "defer": anything unexpected (1xx, 3xx); keep, do not count an attempt
 * A network error or abort is not a status; `post` reports it as "offline".
 */
export function classifyStatus(status) {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 409) return "delivered";
  if (status === 401 || status === 403) return "config";
  if (status === 408 || status === 429) return "retry";
  if (status >= 400 && status < 500) return "drop";
  if (status >= 500 && status < 600) return "retry";
  return "defer";
}

/* ── Client ────────────────────────────────────────────────────────────── */

export function createFeedbackClient({
  url,
  key,
  fetchImpl,
  storage,
  now = () => Date.now(),
  uuid = defaultUuid,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const base = String(url || "").replace(/\/+$/, "");
  const apiKey = String(key || "");
  const isConfigured = Boolean(base && apiKey);
  const store = storage || defaultStorage() || memoryStorage();
  const send =
    fetchImpl ||
    ((...args) => {
      return globalThis.fetch(...args);
    });

  let dirty = false;

  function readQueue() {
    try {
      const raw = store.getItem(FEEDBACK_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((e) => e && typeof e === "object")
        : [];
    } catch {
      return [];
    }
  }

  /** Persist the queue. Returns false when storage refused the write. */
  function writeQueue(entries) {
    try {
      store.setItem(FEEDBACK_KEY, JSON.stringify(entries.slice(-MAX_QUEUE)));
      return true;
    } catch {
      /* quota exceeded or storage blocked – the vote is best-effort */
      return false;
    }
  }

  function isExpired(entry) {
    const created = Date.parse(entry.ts);
    return Number.isFinite(created) && now() - created > MAX_AGE_MS;
  }

  async function post(entry) {
    const options = {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(toRow(entry)),
    };
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      options.signal = AbortSignal.timeout(timeoutMs);
    }
    try {
      const res = await send(`${base}/rest/v1/assistant_feedback`, options);
      return classifyStatus(res.status);
    } catch {
      // Offline, DNS, CORS, blocked or timeout: we learned nothing about the
      // row, and the next entry would fail the same way.
      return "offline";
    }
  }

  /**
   * One pass over the queue. Resolves to "halt" when the server rejected our
   * credentials (401/403) or could not be reached at all, so the caller stops
   * instead of firing a request per queued entry. Nothing is counted then.
   */
  async function pass(tried) {
    // Prepare: give legacy entries an id, drop expired / exhausted ones.
    const raw = readQueue();
    const fresh = new Set();
    let queue = raw.map((e) => {
      if (e.id) return e;
      const id = uuid();
      fresh.add(id);
      return { ...e, id };
    });
    queue = queue.filter(
      (e) => !isExpired(e) && (e.attempts || 0) < MAX_ATTEMPTS,
    );

    // Only touch storage when something changed.
    const changed =
      fresh.size > 0 || queue.length !== raw.length || queue.length > MAX_QUEUE;
    // Never send an id that is not durably stored: if the write fails, skip
    // the entries that were just given one.
    const persisted = changed ? writeQueue(queue) : true;
    if (!isConfigured) return "done";

    for (const entry of queue) {
      if (!persisted && fresh.has(entry.id)) continue;
      if (tried.has(entry.id)) continue;
      tried.add(entry.id);
      const outcome = await post(entry);

      if (outcome === "config" || outcome === "offline") return "halt";
      if (outcome === "defer") continue;

      // Re-read so entries queued while we awaited are never overwritten.
      const current = readQueue();
      const next = [];
      for (const e of current) {
        if (e.id !== entry.id) {
          next.push(e);
        } else if (outcome === "retry") {
          const attempts = (e.attempts || 0) + 1;
          if (attempts < MAX_ATTEMPTS) next.push({ ...e, attempts });
        }
        // "delivered" and "drop" remove the entry.
      }
      writeQueue(next);
    }
    return "done";
  }

  /**
   * Try to deliver everything queued. Overlapping calls share one run, so an
   * entry is never in two requests at once. Never rejects.
   */
  function sync() {
    if (inFlight) return inFlight;
    const tried = new Set();
    inFlight = (async () => {
      try {
        do {
          dirty = false;
          if ((await pass(tried)) === "halt") break;
        } while (dirty);
      } catch {
        /* never let feedback break the page */
      }
      return queueSize();
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  /**
   * Queue a vote (always) and try to deliver it (when configured).
   * `entry`: { question, intentId, helpful, ts? }.
   */
  function submit(entry) {
    const queued = {
      id: uuid(),
      question: truncate(entry?.question, MAX_QUESTION_CHARS),
      intentId: entry?.intentId || null,
      helpful: Boolean(entry?.helpful),
      ts: entry?.ts || new Date(now()).toISOString(),
    };
    writeQueue([...readQueue(), queued]);
    dirty = true;
    return sync();
  }

  function queueSize() {
    return readQueue().length;
  }

  return { isConfigured, submit, sync, queueSize };
}
