/**
 * CDC Assistant – intent matching.
 *
 * Pure functions with no DOM, storage or network access, so the unit tests
 * import and exercise this exact module instead of a copy.
 *
 * Scoring: each trigger that appears as a substring of the (lower-cased)
 * query adds 1. An intent whose `modules` array includes the current module
 * gets +10. The highest score wins; on a tie the intent that appears first in
 * the knowledge base wins.
 */

export function normalize(s) {
  return (s || "").toLowerCase().trim();
}

/**
 * Returns the best matching intent, or null.
 * When a currentModule is provided, intents whose `modules` array
 * includes it are scored +10 (so context-relevant intents win ties).
 */
export function matchIntent(query, kb, currentModule) {
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
