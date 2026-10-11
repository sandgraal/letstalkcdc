/**
 * Thesis lint (P17-7): fail the build when a page re-introduces a claim that
 * contradicts the site's accuracy thesis.
 *
 *   1. Delivery is at-least-once.
 *   2. Correctness lives in an idempotent sink keyed on the primary key and
 *      ordered by source log position (LSN, SCN, GTID), never by a timestamp.
 *   3. End-to-end exactly-once across independent systems is never claimed;
 *      exactly-once is a per-hop question.
 *
 * Teaching text legitimately says "never order by ts_ms" and "there is no
 * end-to-end exactly-once", so this is not a grep. Content is split into
 * prose sentences and code blocks (with line numbers), and a rule only fires
 * when the matched text is asserted without a real excuse. What counts as an
 * excuse is deliberately narrow, because a lint that passes a violation is
 * worse than no lint:
 *
 *   prose, same sentence   a LABEL word (wrong, broken, anti-pattern, avoid,
 *                          unsafe, naive, instead of, tie-break, polling
 *                          source ...), a negation tied to the claim
 *                          ("never order by", "is not achievable", "there is
 *                          no end-to-end exactly-once"), or, for exactly-once,
 *                          a per-hop scope (hop, processing, opt-in,
 *                          exactly.once.support, Kafka transactions ...).
 *   prose, neighbours      the previous or next sentence of the same block,
 *                          or another field of the same data object / table,
 *                          excuses only if it carries a STRONG marker AND
 *                          talks about the topic (ordering, timestamps,
 *                          exactly-once ...). "We do not cover Oracle." and
 *                          "Only three settings matter." excuse nothing.
 *   code                   the block's own comments, or the paragraph that
 *                          labels it (immediately before, or the caveat
 *                          immediately after). SQL keywords (NOT MATCHED, IS
 *                          NOT NULL) and weak words (not, no, only, fail,
 *                          claim) never excuse code.
 *
 * Scope (what `lintTree` reads; nothing else, in particular not docs/, which
 * records history and quotes violations, and not generated bundles):
 *
 *   src/**\/*.{njk,md,yml,json} and src/**\/*.11tydata.cjs   (not assets,
 *       static, css, js subtrees), including `{% set x = "..." %}` and macro
 *       call string arguments
 *   src/_data/*.mjs                         data files, string literals only
 *   src/js/*.js                             assistant UI strings, string
 *                                           literals only (comments skipped)
 *   README.md
 *   playground/**\/*.md                      (not node_modules, assets, dot dirs)
 *   playground/web/** and playground/src/** .ts/.tsx, string literals and
 *       JSX text only (not stories, tests, type declarations)
 *   playground/assets/*.js                  hand-written copy modules (not
 *                                           assets/generated)
 *   playground/scenarios/**\/scenario.json  scenario descriptions
 *   playground/index.html
 *
 * Everything here is a pure function of its inputs except `collectFiles` and
 * `lintTree`, which read the filesystem. All patterns are bounded or linear:
 * a separator-free 200 KB token must lint in well under a second.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// ── Shared vocabulary ───────────────────────────────────────────────

/** Source of the timestamp-like column names (matched case-insensitively). */
const TS_WORD_SRC =
  "ts_?(?:ms|us|ns)|updated_?at|modified_?at|created_?at|event_?time|event_?ts|commit_?ts|commit_?time|op_?ts|last_?modified|timestamp";
/** A timestamp-like column reference with an optional alias prefix. Bounded. */
const TS_COL = `\\b(?:\\w{1,24}[.:]){0,2}\\w{0,24}?(?:${TS_WORD_SRC})`;
/** A timestamp reference as a whole word (allows a plural "timestamps"). */
const TS_REF = `${TS_COL}s?\\b`;
const DET = "(?:(?:the|their|its|each|every|that|this|a|an|your|our)\\s+){0,2}";
const MOD =
  "(?:(?:event|record|commit|source|update|updated|change|modification|write|row|message|database|wall[- ]?clock|client|system)\\s+){0,2}";
const BIG =
  "(?:latest|newest|most recent|highest|higher|largest|larger|greatest|greater|newer|later)";
const WINS =
  "(?:wins?|prevails?|takes? precedence|overwrites?|overrides?|is (?:applied|kept|used|chosen|the winner)|are (?:applied|kept))";

/**
 * Words that mark text as teaching, a counter-example or a caveat. Matched
 * anywhere in the sentence (prose) or in a comment / label (code).
 */
const LABEL_RE =
  /\b(?:wrong(?:ly)?|broken|anti-?patterns?|avoid|unsafe|naive(?:ly)?|bad|buggy|bugs?|incorrect(?:ly)?|misleading|myths?|misconceptions?|mistakes?|pitfalls?|traps?|fallacy|false|untrue|unreliable|instead of|rather than|tie-?breaks?|break(?:s|ing)?\s+ties|misorder\w*|what not to do|why this fails|not\s+(?:a\s+)?(?:true|safe|reliable|correct|valid|enough|sufficient|achievable|possible|a good idea)|polling\s+(?:sources?|connectors?|queries|loops?|fallbacks?|cases?|pattern|only)|(?:has|have|with|without)\s+no\s+(?:log position|lsn|change log|log))\b/i;

/**
 * Extra same-sentence labels for PROSE only (never for code): a "Caveat:"
 * lead-in, and the test-design idiom "a sink ordered by a timestamp passes
 * both ... that is not good news".
 */
const PROSE_LABEL_RE =
  /\bcaveats?\s*:|\bnot\s+good\s+news\b|\bpass(?:es)?\s+(?:both|the\s+tests?|every\s+test|all\s+(?:of\s+)?(?:the\s+)?(?:checks|tests))\b|\b(?:will|would|still|can|could)\s+pass(?!\s+through)\b/i;

/** Negators that, on their own sentence, excuse nothing unless tied to a claim. */
const NEG_ANY =
  /\b(?:never|cannot|can't|don't|do not|must not|should not|shouldn't|mustn't|won't|no longer)\b/i;

/** "Never do this" / "don't copy this": a label for the code that follows. */
const DONT_DO_RE =
  /\b(?:never|don['’]t|do not|must not|should not|shouldn['’]t)\s+(?:do|use|copy|write|ship|run|rely|build|implement)\b/i;

/** What the thesis is about. A neighbour excuses only if it mentions one of these. */
const TOPIC_RE =
  /\b(?:order(?:ing|ed|s)?|sort(?:ing|ed)?|timestamps?|ts_ms|updated_at|\w+_at|event[- ]time|commit[- ]time|wall[- ]clock|clocks?|last[- ]writ\w+[- ]wins|exactly[- ]once|at[- ]least[- ]once|log position|lsn|scn|gtid|offsets?|dedup\w*|idempoten\w*|wins?|newest|latest|deliver\w*)\b/i;

/** "... exposes that bug": a neighbour that names the previous claim as one. */
const ANAPHORA_RE =
  /\b(?:that|this)\s+(?:bug|mistake|anti-?pattern|pitfall|trap|misconception)\b/i;

/** STRONG marker that is also about the topic. */
const strongOnTopic = (t) =>
  (LABEL_RE.test(t) || NEG_ANY.test(t)) && TOPIC_RE.test(t);
/** Text that labels the code next to it as the wrong / broken example. */
const labelsWrong = (t) => LABEL_RE.test(t) || DONT_DO_RE.test(t);

/** Same-sentence scoping that makes "exactly-once" a per-hop statement. */
const EOS_SCOPE =
  /\b(?:hops?|alternatives?\s+to|(?:matches|mimics|emulates|simulates|resembles)\s+an?|requires?\s+cooperation|depends\s+on\s+the\s+(?:connector|sink|destination|system)|processing|effectively[- ]once|exactly\.once\.support|opt-?in|transactions?|transactional|kafka streams|pub\/sub|pull[- ]subscriptions?|pulsar|marketing|marketed|(?:one|single) (?:link|stage|leg|system|topic|broker|boundary))\b/i;

/** Excuses that survive a "you can skip dedup" style claim (negators do not). */
const STRICT_EXCUSE =
  /\b(?:myths?|wrong|false|untrue|incorrect|misleading|misconception|mistake|fallacy|not\s+(?:true|safe|enough))\b/i;

// ── Negation tied to the claim ──────────────────────────────────────

const NEG_WORD =
  /\b(?:not|never|cannot|no longer|none|neither|nothing|nobody|nor)\b|n['’]t\b/i;
const NO_EXIST =
  /(?:\bthere(?:['’]s|\s+(?:is|are))|\bis|\bare|\bhas|\bhave|\bexists?)\s+no\s+(?:[\w-]+\s+){0,2}$/i;

/**
 * True when a negation sits right next to the matched claim: up to six words
 * before it, or up to eight after it, with no punctuation in between.
 * "Never order by ts_ms", "... is not achievable", "there is no end-to-end
 * exactly-once". A negator in another clause or sentence does not count.
 */
function negatedNear(text, start, end) {
  // "decided by log position, never by that timestamp": the negator sits
  // inside the matched span, directly before the offending reference.
  if (NEG_WORD.test(text.slice(start, end))) return true;
  const before = text.slice(Math.max(0, start - 90), start);
  const bw = /(?:[\w'’-]+[ \t]+){0,6}$/.exec(before)?.[0] ?? "";
  if (NEG_WORD.test(bw) || NO_EXIST.test(before)) return true;
  const after = text.slice(end, end + 120);
  const aw = /^(?:[ \t]+[\w'’-]+){0,8}/.exec(after)?.[0] ?? "";
  return NEG_WORD.test(aw);
}

// ── Rules ───────────────────────────────────────────────────────────

const rx = (src) => new RegExp(src, "gi");

/** Prose patterns for R1 (a timestamp decides which change wins). */
const R1_PROSE = [
  // "the latest timestamp wins", "newest updated_at wins"
  rx(`\\b${BIG}[- ]${MOD}(?:time\\b|${TS_REF})[^.]{0,25}\\b${WINS}`),
  // "the event with the higher ts_ms is applied / wins / is kept"
  rx(
    `\\b(?:event|record|row|change|message|version|update|write)s?\\s+with\\s+${DET}${BIG}\\s+${MOD}${TS_REF}[^.]{0,40}?\\b(?:applied|applies|wins?|won|kept|keeps|retained|used|chosen|selected|survives?|preferred|accepted|taken|overwrites?)\\b`,
  ),
  // "whichever change has the latest updated_at"
  rx(`\\bwhichever\\b[^.]{0,40}\\b${BIG}\\s+${MOD}${TS_REF}`),
  // "last-write-wins ... timestamp" in both orders
  rx(`\\blast[- ]writ(?:er|e)[- ]wins\\b[^.]{0,40}\\b(?:${TS_REF}|clocks?)`),
  rx(`\\b(?:${TS_REF}|clocks?)[^.]{0,40}\\blast[- ]writ(?:er|e)[- ]wins\\b`),
  // "order(ed) by (the) (commit) timestamp"
  rx(
    `\\border(?:s|ed|ing)?\\s+(?:[\\w'-]+\\s+){0,2}by\\s+${DET}${MOD}(?:time\\b|${TS_REF})`,
  ),
  // "sort events by their commit timestamp"
  rx(
    `\\bsort(?:s|ed|ing)?\\s+(?:[\\w'-]+\\s+){0,5}by\\s+${DET}${MOD}${TS_REF}`,
  ),
  // "compare ts_ms on both rows"
  rx(`\\bcompar(?:e|es|ing)\\s+${DET}${MOD}(?:\\w+\\s+)?${TS_REF}`),
  // "keeps the row with the newest updated_at"
  rx(
    `\\b(?:keeps?|takes?|picks?|chooses?|applies|apply|retains?|selects?|wins?)\\b[^.]{0,40}\\b(?:newest|latest|most recent|highest|largest|greatest)\\s+${MOD}${TS_REF}`,
  ),
  // "wins by timestamp"
  rx(`\\bwins?\\s+by\\s+${DET}${MOD}${TS_REF}`),
  // "decide / resolve ... by the timestamp"
  rx(
    `\\b(?:decid\\w+|determin\\w+|resolv\\w+|pick\\w*|choos\\w+|select\\w*)\\b[^.]{0,50}\\b(?:by|using|with|based on|according to|via)\\s+${DET}${MOD}${TS_REF}`,
  ),
  // "use updated_at to decide which row wins"
  rx(
    `\\b${TS_REF}[^.]{0,30}\\bto\\s+(?:decide|determine|pick|choose|resolve)\\b`,
  ),
];

const EOS = "exactly[- ]once";
/** Prose patterns for R2 (end-to-end exactly-once asserted). `strict` ones ignore negators. */
const R2_PROSE = [
  { re: rx(`\\bend[- ]to[- ]end\\s+${EOS}\\b`) },
  { re: rx(`\\b${EOS}\\s+end[- ]to[- ]end\\b`) },
  {
    re: rx(
      `\\b(?:guarantees?|guaranteed|delivers?|delivered|provides?|provided|achieves?|achieved|gives?|offers?|ensures?|ensured|gets?|getting|has|have|supports?|enables?|enabled|ships?|brings?)\\s+(?:you\\s+)?(?:true\\s+|real\\s+|full\\s+)?${EOS}\\b`,
    ),
  },
  { re: rx(`\\b${EOS}\\s+delivery\\b`) },
  // "Our pipeline is exactly-once", "The connector is exactly-once from A to B"
  {
    re: rx(
      `\\b(?:is|are|was|were|be|being|becomes?|remains?|stays?)\\s+(?:(?:fully|truly|always|natively|inherently|really|actually|automatically|already|simply|just)\\s+)?${EOS}\\b(?!\\s+(?:processing|semantics?\\s+(?:within|inside|between)|per\\b))`,
    ),
  },
  {
    re: rx(
      `\\b${EOS}\\s+(?:pipelines?|replication|sync(?:hronization)?|cdc|capture|streaming)\\b`,
    ),
  },
  {
    re: rx(
      `\\b${EOS}\\b[^.]{0,30}\\b(?:is|are)\\s+(?:guaranteed|ensured|provided|achieved|supported|enabled|built[- ]in|automatic|the default|on by default)`,
    ),
  },
  // exactly-once offered as the reason to drop dedup / idempotency
  {
    strict: true,
    re: rx(
      `\\b${EOS}\\b[^.]{0,60}\\b(?:skip|drop|remove|no need|don['’]t need|do not need|doesn['’]t need|without)\\b[^.]{0,25}\\b(?:de-?dup\\w*|idempoten\\w*)`,
    ),
  },
  {
    strict: true,
    re: rx(
      `\\b(?:skip|drop|remove|no need for|don['’]t need|do not need|doesn['’]t need|without)\\b[^.]{0,25}\\b(?:de-?dup\\w*|idempoten\\w*)\\b[^.]{0,60}\\b${EOS}`,
    ),
  },
];

export const RULES = {
  R1: "timestamp-as-order: a timestamp decides which change wins",
  R2: "end-to-end exactly-once asserted",
};

// ── Code analysis ───────────────────────────────────────────────────

const TS_SUFFIX =
  /(?:ts_?(?:ms|us|ns)|updated_?at|modified_?at|created_?at|event_?time|event_?ts|commit_?ts|commit_?time|last_?modified|timestamp)$/;
/** "now" style values are watermarks, not column references. */
const TS_EXEMPT = new Set([
  "current_timestamp",
  "localtimestamp",
  "systimestamp",
  "sys_timestamp",
]);

function isTsName(name) {
  if (name.length > 64) return false;
  const n = name.toLowerCase();
  if (TS_EXEMPT.has(n)) return false;
  return n === "ts" || /(?:^|_)op_?ts$/.test(n) || TS_SUFFIX.test(n);
}

/** Does this snippet reference a timestamp-like column anywhere? */
function hasTsRef(snippet) {
  const pieces = snippet.slice(0, 2000).match(/[A-Za-z_]\w{0,63}/g);
  return !!pieces && pieces.some(isTsName);
}

/**
 * Split code into the code proper and its comments. Comment markers inside
 * string literals are ignored. Comment characters are blanked in `code` (same
 * offsets, newlines kept) so SQL/JS analysis never sees them.
 */
export function splitCode(text) {
  const code = [];
  const comments = [];
  const n = text.length;
  let i = 0;
  let quote = null;
  const lineStart = (k) => {
    let j = k - 1;
    while (j >= 0 && (text[j] === " " || text[j] === "\t")) j--;
    return j < 0 || text[j] === "\n";
  };
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      if (c === "\\" && quote !== "'" && i + 1 < n) {
        code.push(c, next);
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      else if (c === "\n" && quote !== "`") quote = null;
      code.push(c);
      i++;
      continue;
    }
    let end = -1;
    if (c === "-" && next === "-") {
      const after = text[i + 2];
      if (after === undefined || /\s/.test(after) || lineStart(i))
        end = text.indexOf("\n", i);
    } else if (c === "/" && next === "/" && text[i - 1] !== ":") {
      end = text.indexOf("\n", i);
    } else if (c === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
      end = text.indexOf("\n", i);
    } else if (c === "/" && next === "*") {
      const e = text.indexOf("*/", i + 2);
      const stop = e < 0 ? n : e + 2;
      comments.push(text.slice(i, stop));
      code.push(text.slice(i, stop).replace(/[^\n]/g, " "));
      i = stop;
      continue;
    }
    if (end !== -1 || (c === "-" && next === "-" && false)) {
      const stop = end < 0 ? n : end;
      comments.push(text.slice(i, stop));
      code.push(" ".repeat(stop - i));
      i = stop;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") quote = c;
    code.push(c);
    i++;
  }
  return { code: code.join(""), comments };
}

/** Index of the `)` that closes the `(` at `open`, or -1 (looks at most `max` chars). */
function closingParen(s, open, max = 400) {
  let depth = 0;
  const stop = Math.min(s.length, open + max);
  for (let k = open; k < stop; k++) {
    if (s[k] === "(") depth++;
    else if (s[k] === ")" && --depth === 0) return k;
  }
  return -1;
}

const OPERAND_CHAR = /[\w.[\]'"$:]/;

/** The operand just left of a comparison operator at `i`. */
function operandBefore(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  const stop = Math.max(0, j - 80);
  if (code[j] === ")") {
    let depth = 0;
    for (; j >= stop; j--) {
      if (code[j] === ")") depth++;
      else if (code[j] === "(" && --depth === 0) break;
    }
    j--;
  }
  const endIdx = j;
  while (j >= stop && OPERAND_CHAR.test(code[j])) j--;
  return code.slice(j + 1, endIdx + 1);
}

/** The operand just right of a comparison operator ending at `i`. */
function operandAfter(code, i) {
  let j = i;
  while (j < code.length && /\s/.test(code[j])) j++;
  const start = j;
  const stop = Math.min(code.length, j + 80);
  while (j < stop && OPERAND_CHAR.test(code[j])) j++;
  if (code[j] === "(") {
    const c = closingParen(code, j, 80);
    if (c > 0) j = c + 1;
  }
  return code.slice(start, j);
}

const SORT_CALL =
  /\b(?:sort|sorted|toSorted|sort_values|sortBy|sort_by|orderBy|order_by)\s*\(/gi;
const PICK_TAIL =
  /^[\s\S]{0,120}?(?:\[\s*(?:0|-1|\w+\.length\s*-\s*1)\s*\]|\.(?:pop|shift|at|first|last|head|tail|iloc|drop_duplicates|dropDuplicates|limit|find|take)\b|\bkeep\s*=)/i;

/**
 * R1 on a code block (comments already removed). Returns { line, why } for
 * each construct that picks a winning row/event by a timestamp-like column,
 * in SQL, JS/TS or Python. A display sort or a polling watermark against a
 * literal picks no winner and is not reported.
 */
function r1CodeMatches(code) {
  const hits = [];
  const starts = lineStarts(code);
  const push = (idx, why) => hits.push({ line: lineAt(starts, idx) - 1, why });

  // Window functions keyed on a timestamp.
  for (const m of code.matchAll(
    /\b(?:ROW_NUMBER|RANK|DENSE_RANK|FIRST_VALUE|LAST_VALUE)\s*\([^)]{0,200}\)\s*OVER\s*\(((?:[^()]|\([^()]{0,200}\)){0,2000})\)/gi,
  )) {
    const ob = /ORDER\s+BY\s+([\s\S]*)$/i.exec(m[1]);
    if (ob && hasTsRef(ob[1]))
      push(m.index, "window function ordered by a timestamp");
  }
  // QUALIFY on a timestamp.
  for (const m of code.matchAll(/\bQUALIFY\b[^;]{0,400}/gi)) {
    if (hasTsRef(m[0])) push(m.index, "QUALIFY keyed on a timestamp");
  }
  // DISTINCT ON / TOP 1 / LIMIT 1 ordered by a timestamp.
  for (const m of code.matchAll(
    /\bORDER\s+BY\s+([^;]{0,200}?)(?=\bON\s+CONFLICT\b|\bLIMIT\b|\bFETCH\b|;|\)|$)/gi,
  )) {
    if (!hasTsRef(m[1])) continue;
    const before = code.slice(Math.max(0, m.index - 600), m.index);
    const stmtHead = before.slice(before.lastIndexOf(";") + 1);
    const after = code.slice(m.index + m[0].length, m.index + m[0].length + 40);
    if (/\bDISTINCT\s+ON\b/i.test(stmtHead))
      push(m.index, "DISTINCT ON ordered by a timestamp");
    else if (/\bTOP\s+1\b/i.test(stmtHead))
      push(m.index, "TOP 1 ordered by a timestamp");
    else if (/^\s*(?:LIMIT\s+1\b|FETCH\s+FIRST\s+1\s+ROWS?\b)/i.test(after))
      push(m.index, "ORDER BY a timestamp LIMIT 1");
  }
  // A guard that compares two timestamp-like operands, in any language:
  //   t.ts_ms <= s.ts_ms,  incoming.updatedAt > current.updatedAt,
  //   event['ts_ms'] >= row['ts_ms'],  WHERE t.updated_at < EXCLUDED.updated_at
  for (const m of code.matchAll(/[<>]=?/g)) {
    const i = m.index;
    const op = m[0];
    const prev = code[i - 1];
    const next = code[i + op.length];
    if (op[0] === ">" && (prev === "=" || prev === "-" || prev === ">"))
      continue; // => -> >>
    if (op[0] === ">" && next === ">") continue;
    if (op[0] === "<" && (prev === "<" || next === "<" || next === ">"))
      continue; // << <>
    if (
      hasTsRef(operandBefore(code, i)) &&
      hasTsRef(operandAfter(code, i + op.length))
    )
      push(i, "guard compares two timestamps");
  }
  // GoldenGate-style max/min conflict resolution.
  for (const m of code.matchAll(/\b(?:USEMAX|USEMIN)\s*\(([^)]{0,80})\)/gi)) {
    if (hasTsRef(m[1])) push(m.index, "conflict resolution by a timestamp");
  }
  // MAX_BY / ARG_MAX / ARRAY_AGG ordered by a timestamp.
  for (const m of code.matchAll(
    /\b(?:MAX_BY|MIN_BY|ARG_MAX|ARG_MIN|ARRAY_AGG|ARGMAX|argMax|maxBy|minBy|idxmax|idxmin)\s*\(([^)]{0,200})\)/gi,
  )) {
    if (hasTsRef(m[1])) push(m.index, "winner picked by a timestamp aggregate");
  }
  // WHERE ts = (SELECT MAX(ts) ...): the row holding the latest timestamp.
  for (const m of code.matchAll(
    /=\s*\(\s*SELECT\s+(?:MAX|MIN)\s*\(([^)]{0,80})\)/gi,
  )) {
    if (hasTsRef(m[1])) push(m.index, "row selected by MAX of a timestamp");
  }
  // MAX(ts) ... GROUP BY key, joined back to pick the winning row.
  let off = 0;
  for (const stmt of code.split(";")) {
    const mm = /\b(?:MAX|MIN)\s*\(([^)]{0,80})\)/i.exec(stmt);
    if (
      mm &&
      hasTsRef(mm[1]) &&
      /\bGROUP\s+BY\b/i.test(stmt) &&
      /\bJOIN\b|\bIN\s*\(\s*SELECT\b|\)\s+IN\s*\(/i.test(stmt)
    )
      push(
        off + mm.index,
        "MAX of a timestamp per key joined back to pick a row",
      );
    off += stmt.length + 1;
  }
  // max(events, key=lambda e: e["ts_ms"])
  for (const m of code.matchAll(/\b(?:max|min)\s*\(/g)) {
    const slice = code.slice(m.index, m.index + 200);
    if (/\bkey\s*=/.test(slice) && hasTsRef(slice))
      push(m.index, "winner picked by max/min on a timestamp key");
  }
  // events.sort((a, b) => b.ts_ms - a.ts_ms)[0], sorted(..., key=ts)[-1]
  for (const m of code.matchAll(SORT_CALL)) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(code, open);
    if (close < 0 || !hasTsRef(code.slice(open, close))) continue;
    if (PICK_TAIL.test(code.slice(close + 1, close + 140)))
      push(m.index, "sorted by a timestamp and the first/last item taken");
  }
  return hits;
}

// ── Text extraction ─────────────────────────────────────────────────

const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "-",
  "&ndash;": "-",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&hellip;": "...",
  "&rarr;": "->",
  "&larr;": "<-",
  "&times;": "x",
  "&middot;": ".",
};
const decode = (s) =>
  s.replace(/&(?:#\d{1,8}|#x[0-9a-f]{1,6}|[a-z]{1,10});/gi, (e) => {
    if (ENTITIES[e.toLowerCase()] !== undefined)
      return ENTITIES[e.toLowerCase()];
    const n = /^&#x([0-9a-f]+);$/i.exec(e)?.[1];
    if (n) return String.fromCodePoint(parseInt(n, 16));
    const d = /^&#(\d+);$/.exec(e)?.[1];
    return d ? String.fromCodePoint(Number(d)) : " ";
  });

/** Blank a region but keep newlines so line numbers survive. */
const blank = (s) => s.replace(/[^\n]/g, " ");

/** Blank every `open ... close` region, linear even when `close` is missing. */
function blankDelimited(s, open, close) {
  let out = "";
  let pos = 0;
  for (;;) {
    const a = s.indexOf(open, pos);
    if (a < 0) break;
    const b = s.indexOf(close, a + open.length);
    if (b < 0) break;
    out += s.slice(pos, a) + blank(s.slice(a, b + close.length));
    pos = b + close.length;
  }
  return out + s.slice(pos);
}

/** Blank `<script>` and `<style>` bodies. */
function blankRawText(s) {
  let out = "";
  let pos = 0;
  const open = /<(script|style)\b/gi;
  let m;
  while ((m = open.exec(s))) {
    if (m.index < pos) continue;
    const close = new RegExp(`</${m[1]}\\s*>`, "gi");
    close.lastIndex = m.index;
    const c = close.exec(s);
    if (!c) break;
    const end = c.index + c[0].length;
    out += s.slice(pos, m.index) + blank(s.slice(m.index, end));
    pos = end;
    open.lastIndex = end;
  }
  return out + s.slice(pos);
}

/** Block-level tags that end a paragraph for sentence purposes. */
const BLOCK_TAG =
  /^(?:p|li|ul|ol|dl|dt|dd|div|section|article|aside|header|footer|main|nav|details|summary|table|thead|tbody|tr|td|th|caption|figure|figcaption|blockquote|h[1-6]|br|hr|form|fieldset|legend|label|button|option|select)$/i;

/**
 * Sentinels mark text that is the title of an external citation (an
 * `<a href="https://...">` link). Rules ignore matches inside them: a link
 * titled "Debezium: exactly-once delivery" cites a page, it does not assert.
 */
const CITE_OPEN = "";
const CITE_CLOSE = "";

function lineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return starts;
}
function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** String literals in a snippet: `{ value, index }`, escapes resolved. Linear. */
function stringLiterals(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const q = text[i];
    if (q !== '"' && q !== "'" && q !== "`") {
      i++;
      continue;
    }
    let j = i + 1;
    let value = "";
    while (j < text.length && text[j] !== q) {
      if (text[j] === "\\" && j + 1 < text.length) {
        const n = text[j + 1];
        value += n === "n" ? "\n" : n === "t" ? " " : n;
        j += 2;
        continue;
      }
      value += text[j];
      j++;
    }
    if (j >= text.length) break;
    out.push({ value, index: i + 1 });
    i = j + 1;
  }
  return out;
}

/**
 * Strings written inside Nunjucks tags and expressions, e.g.
 * `{% set note = "..." %}` or `{{ callout("...") }}`. The tags themselves are
 * blanked from the page; the copy they carry is content and must be linted.
 */
function templateStrings(s, baseLine) {
  const starts = lineStarts(s);
  const out = [];
  for (const [open, close] of [
    ["{%", "%}"],
    ["{{", "}}"],
  ]) {
    let pos = 0;
    for (;;) {
      const a = s.indexOf(open, pos);
      if (a < 0) break;
      const b = s.indexOf(close, a + 2);
      if (b < 0) break;
      const group = `tpl${a}`;
      for (const lit of stringLiterals(s.slice(a + 2, b))) {
        if (lit.value.trim().length < 12) continue;
        const line = lineAt(starts, a + 2 + lit.index) + baseLine - 1;
        if (/<[a-z][^>]{0,200}>/i.test(lit.value)) {
          out.push(
            ...extractHtmlSegments(lit.value, line).map((x) => ({
              ...x,
              group,
            })),
          );
        } else {
          out.push({
            kind: "prose",
            text: lit.value.replace(/\s+/g, " ").trim(),
            line,
            group,
          });
        }
      }
      pos = b + close.length;
    }
  }
  return out;
}

/**
 * Split an HTML/Nunjucks fragment into segments.
 *   { kind: "prose", text, line }  one per block-level element
 *   { kind: "code",  text, line }  one per <pre>
 * `baseLine` is the 1-based line of the fragment's first character.
 */
export function extractHtmlSegments(src, baseLine = 1) {
  // Comments and script/style bodies are not content. Offsets are unchanged.
  let s = blankDelimited(src, "{#", "#}");
  s = blankDelimited(s, "<!--", "-->");
  s = blankRawText(s);
  const extra = templateStrings(s, baseLine);
  s = blankDelimited(s, "{%", "%}");
  s = blankDelimited(s, "{{", "}}");
  const starts = lineStarts(s);
  const L = (off) => lineAt(starts, off) + baseLine - 1;
  const segments = [];
  let buf = "";
  let bufStart = -1;
  let anchorExternal = [];
  let tableDepth = 0;
  let tableId = 0;

  const flush = () => {
    const text = decode(buf)
      .replace(/[ \t\r\n]+/g, " ")
      .trim();
    if (text && bufStart >= 0) {
      const firstNonSpace = buf.search(/\S/);
      segments.push({
        kind: "prose",
        text,
        line: L(bufStart + Math.max(0, firstNonSpace)),
        ...(tableDepth ? { group: `table${tableId}` } : {}),
      });
    }
    buf = "";
    bufStart = -1;
  };

  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]{0,4000})>/g;
  const preClose = /<\/pre\s*>/gi;
  let pos = 0;
  let m;
  const addText = (from, to) => {
    const t = s.slice(from, to);
    if (!t.trim()) {
      if (buf) buf += t;
      return;
    }
    if (bufStart < 0) bufStart = from;
    buf += t;
  };
  while ((m = tagRe.exec(s))) {
    addText(pos, m.index);
    pos = m.index + m[0].length;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (name === "pre" && !closing) {
      flush();
      preClose.lastIndex = pos;
      const c = preClose.exec(s);
      const stop = c ? c.index : s.length;
      const raw = s.slice(pos, stop).replace(/<[^>]{1,2000}>/g, "");
      const text = decode(raw).replace(/^\n+/, "").replace(/\s+$/, "");
      const lead = s.slice(pos, stop).match(/^\s*/)[0];
      const startOff =
        pos + (lead.match(/^\s*(?:<[^>]{1,2000}>\s*)*/)?.[0].length ?? 0);
      if (text) segments.push({ kind: "code", text, line: L(startOff) });
      pos = c ? stop + c[0].length : s.length;
      tagRe.lastIndex = pos;
      continue;
    }
    if (name === "a") {
      if (!closing) {
        const external = /href\s*=\s*["']https?:/i.test(m[3]);
        anchorExternal.push(external);
        if (external) {
          if (bufStart < 0) bufStart = m.index;
          buf += CITE_OPEN;
        }
      } else if (anchorExternal.length) {
        if (anchorExternal.pop()) buf += CITE_CLOSE;
      }
      continue;
    }
    if (name === "table") {
      flush();
      if (closing) tableDepth = Math.max(0, tableDepth - 1);
      else {
        if (!tableDepth) tableId++;
        tableDepth++;
      }
      continue;
    }
    if (BLOCK_TAG.test(name)) flush();
  }
  addText(pos, s.length);
  flush();
  if (!extra.length) return segments;
  return [...segments, ...extra].sort((a, b) => a.line - b.line);
}

/** Markdown: fenced code and paragraphs. */
export function extractMarkdownSegments(src, baseLine = 1) {
  const segments = [];
  const lines = src.split("\n");
  let para = [];
  let paraLine = 0;
  let fence = null;
  let codeLines = [];
  let codeLine = 0;
  const flushPara = () => {
    const text = para
      .join(" ")
      .replace(/`/g, "")
      .replace(/\*\*|__/g, "")
      .replace(/(^|[^\w])_(\S[^_]{0,300}?)_(?=[^\w]|$)/g, "$1$2")
      .replace(/\[([^\]]{1,300})\]\([^)]{0,500}\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (text) segments.push({ kind: "prose", text, line: paraLine });
    para = [];
  };
  lines.forEach((raw, i) => {
    const ln = i + baseLine;
    const fenceM = /^\s*(```|~~~)/.exec(raw);
    if (fenceM) {
      if (fence) {
        const text = codeLines.join("\n").trim();
        if (text) segments.push({ kind: "code", text, line: codeLine });
        fence = null;
        codeLines = [];
      } else {
        flushPara();
        fence = fenceM[1];
        codeLine = ln + 1;
      }
      return;
    }
    if (fence) {
      codeLines.push(raw);
      return;
    }
    if (!raw.trim() || /^\s*#{1,6}\s/.test(raw) || /^\s*[-*]\s/.test(raw)) {
      flushPara();
      const item = raw.replace(/^\s*(?:#{1,6}|[-*])\s+/, "");
      if (raw.trim() && item) {
        para = [item];
        paraLine = ln;
      }
      return;
    }
    if (!para.length) paraLine = ln;
    para.push(raw.trim());
  });
  flushPara();
  return segments;
}

/** JSX text between tags (`<p>Text</p>`): content a user reads. */
function extractJsxText(src) {
  const segments = [];
  const starts = lineStarts(src);
  const re =
    /(<\/?[A-Za-z][\w.:-]*(?:\s[^<>]{0,400})?>)([^<>{}]{12,2000})(?=<)/g;
  let blanked = "";
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    const textStart = m.index + m[1].length;
    const raw = m[2];
    const text = decode(raw).replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{3}/.test(text)) {
      segments.push({
        kind: "prose",
        text,
        line: lineAt(starts, textStart + Math.max(0, raw.search(/\S/))),
      });
    }
    blanked += src.slice(last, textStart) + blank(raw);
    last = textStart + raw.length;
  }
  return { segments, source: blanked + src.slice(last) };
}

/**
 * Quiz items: `options: [...], correct: "N"` (N is 1-based, as in
 * components/quiz.njk). Returns the offsets of the quote that opens each wrong
 * option (`distractors`) and of every string of the quiz object, for which a
 * sibling field must not excuse a claim (`quizzes`).
 */
function quizOptions(src) {
  const distractors = new Set();
  const quizzes = new Set();
  const re =
    /\boptions\s*:\s*\[([^\]]{0,6000})\]\s*,\s*correct\s*:\s*["']?(\d{1,2})["']?/g;
  for (const m of src.matchAll(re)) {
    const base = m.index + m[0].indexOf("[") + 1;
    stringLiterals(m[1]).forEach((lit, k) => {
      const at = base + lit.index - 1;
      quizzes.add(at);
      if (k + 1 !== Number(m[2])) distractors.add(at);
    });
  }
  return { distractors, quizzes };
}

/**
 * JS/TS/JSON data and copy: string literals are content, comments are not.
 * Each literal is run through the HTML extractor (template strings carry
 * markup). A multi-line literal that looks like SQL is kept as a code block.
 * JSX text (tsx) is read too. Everything outside a literal is ignored.
 */
export function extractJsSegments(input, { jsx = false } = {}) {
  let src = input;
  const segments = [];
  if (jsx) {
    const j = extractJsxText(src);
    segments.push(...j.segments);
    src = j.source;
  }
  const starts = lineStarts(src);
  const { distractors, quizzes } = quizOptions(src);
  const braces = [0];
  let nextGroup = 1;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (c === "{") braces.push(nextGroup++);
    else if (c === "}" && braces.length > 1) braces.pop();
    if (two === "//") {
      i = src.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (two === "/*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? src.length : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const n = src[j + 1];
          out += n === "n" ? "\n" : n === "t" ? " " : n;
          j += 2;
          continue;
        }
        if (c === "`" && src[j] === "$" && src[j + 1] === "{") {
          let depth = 1;
          j += 2;
          while (j < src.length && depth) {
            if (src[j] === "{") depth++;
            else if (src[j] === "}") depth--;
            j++;
          }
          out += "X";
          continue;
        }
        if (c !== "`" && src[j] === "\n") break;
        out += src[j];
        j++;
      }
      const line = lineAt(starts, i);
      const group = `obj${braces[braces.length - 1]}`;
      const flags = {
        ...(distractors.has(i) ? { distractor: true } : {}),
        ...(quizzes.has(i) ? { quiz: true } : {}),
      };
      if (out.trim().length >= 12) {
        if (/<[a-z][^>]{0,200}>/i.test(out)) {
          segments.push(
            ...extractHtmlSegments(out, line).map((x) => ({
              ...x,
              group,
              ...flags,
            })),
          );
        } else if (
          out.includes("\n") &&
          /\b(?:SELECT|MERGE|INSERT|UPDATE|CREATE)\b/.test(out)
        ) {
          segments.push({
            kind: "code",
            text: out.trim(),
            line,
            group,
            ...flags,
          });
        } else {
          segments.push({
            kind: "prose",
            text: out.replace(/\s+/g, " ").trim(),
            line,
            group,
            ...flags,
          });
        }
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return jsx ? segments.sort((a, b) => a.line - b.line) : segments;
}

/**
 * assistant.yml and similar: `key: value` lines, folded/literal block
 * scalars, ``` fences. Deliberately line-based (see lib/assistant-yaml.mjs
 * for why the repo avoids a general YAML parser).
 */
export function extractYamlSegments(src) {
  const segments = [];
  const lines = src.split("\n");
  let para = [];
  let paraLine = 0;
  let fence = false;
  let codeLines = [];
  let codeLine = 0;
  const flush = () => {
    const text = para.join(" ").replace(/\s+/g, " ").trim();
    if (text) segments.push({ kind: "prose", text, line: paraLine });
    para = [];
  };
  lines.forEach((raw, i) => {
    const ln = i + 1;
    if (/^\s*#/.test(raw)) return;
    if (/^\s*```/.test(raw)) {
      if (fence) {
        const text = codeLines.join("\n").trim();
        if (text) segments.push({ kind: "code", text, line: codeLine });
        fence = false;
        codeLines = [];
      } else {
        flush();
        fence = true;
        codeLine = ln + 1;
      }
      return;
    }
    if (fence) {
      codeLines.push(raw.replace(/^\s{0,8}/, ""));
      return;
    }
    const kv = /^\s*(?:-\s+)?([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
    if (kv) {
      flush();
      const val = kv[2]
        .replace(/^[>|][+-]?\s*$/, "")
        .replace(/^["']|["']$/g, "");
      if (val) {
        para = [val];
        paraLine = ln;
      }
      return;
    }
    if (!raw.trim()) {
      flush();
      return;
    }
    if (!para.length) paraLine = ln;
    para.push(raw.trim().replace(/^-\s+/, ""));
  });
  flush();
  return segments;
}

/** Front matter (`---` ... `---`) of a template: one prose segment per value. */
function extractFrontMatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { segments: [], body: src, bodyOffsetLines: 0 };
  const segments = [];
  m[1].split("\n").forEach((raw, i) => {
    const kv = /^\s*[A-Za-z_][\w-]*:\s*["']?(.*?)["']?\s*$/.exec(raw);
    if (kv && kv[1].length > 12)
      segments.push({ kind: "prose", text: kv[1], line: i + 2 });
  });
  const consumed = m[0].split("\n").length - 1;
  // Blank the front matter so body line numbers stay absolute.
  const body = "\n".repeat(consumed) + src.slice(m[0].length);
  return { segments, body };
}

/** Choose an extractor by file name. */
export function extractSegments(file, content) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".md") return extractMarkdownSegments(content);
  if (ext === ".tsx" || ext === ".jsx")
    return extractJsSegments(content, { jsx: true });
  if (
    ext === ".mjs" ||
    ext === ".cjs" ||
    ext === ".js" ||
    ext === ".ts" ||
    ext === ".json"
  )
    return extractJsSegments(content);
  if (ext === ".yml" || ext === ".yaml") return extractYamlSegments(content);
  const fm = extractFrontMatter(content);
  return [...fm.segments, ...extractHtmlSegments(fm.body)];
}

// ── Sentences ───────────────────────────────────────────────────────

const ABBREV = /\b(e\.g|i\.e|vs|etc|approx|cf|v|no|fig|incl|al)\./gi;

/** Split prose into sentences. A sentence never spans two segments. */
export function splitSentences(text) {
  const guarded = text.replace(ABBREV, (a) => a.replace(".", ""));
  return guarded
    .split(/(?<=[.!?]["')]?)\s+(?=[A-Z0-9"'(`])/)
    .map((x) => x.replace(//g, ".").trim())
    .filter(Boolean);
}

/** Text with external-citation titles blanked, for matching only. */
const forMatching = (s) =>
  s.replace(
    new RegExp(`${CITE_OPEN}[^${CITE_CLOSE}]*${CITE_CLOSE}`, "g"),
    (c) => " ".repeat(c.length),
  );
const forDisplay = (s) => s.replace(/[]/g, "");

/** No whitespace-free token longer than this is analysed (ReDoS guard). */
const MAX_TOKEN = 500;
const capTokens = (s) =>
  s.replace(/\S+/g, (t) => (t.length > MAX_TOKEN ? t.slice(0, MAX_TOKEN) : t));

// ── Linting ─────────────────────────────────────────────────────────

/** Spans of every claim pattern in `text`; each is { start, end, strict }. */
function claimSpans(text, patterns) {
  const spans = [];
  for (const p of patterns) {
    const re = p.re ?? p;
    let n = 0;
    for (const m of text.matchAll(re)) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        strict: !!p.strict,
      });
      if (++n >= 20) break;
    }
  }
  return spans;
}

/**
 * Lint one file's content.
 * @returns {{file:string,line:number,rule:string,text:string}[]}
 */
export function lintContent(file, content) {
  const segments = extractSegments(file, capTokens(content));
  const findings = [];
  const add = (line, rule, text) =>
    findings.push({
      file,
      line,
      rule,
      text: forDisplay(text).replace(/\s+/g, " ").trim().slice(0, 240),
    });

  // Segments that share a group (a data-file object such as a quiz item, or
  // one table) are read together: the contrast may sit in a sibling field.
  const groups = new Map();
  for (const seg of segments) {
    if (!seg.group) continue;
    if (!groups.has(seg.group)) groups.set(seg.group, []);
    groups.get(seg.group).push(seg);
  }
  // A quiz object (`options` + `correct`) names its own wrong answers, so
  // those are skipped; the question and the correct answer are linted, and
  // are never excused by a sibling field (the explanation could say anything).
  const quizGroups = new Set(
    segments.filter((x) => x.quiz && x.group).map((x) => x.group),
  );
  const groupExcuses = (seg) =>
    !!seg.group &&
    !quizGroups.has(seg.group) &&
    groups
      .get(seg.group)
      .some(
        (o) => o !== seg && !o.distractor && strongOnTopic(forMatching(o.text)),
      );

  segments.forEach((seg, idx) => {
    if (seg.distractor) return;
    if (seg.kind === "prose") {
      const sentences = splitSentences(seg.text);
      const siblingExcuse = groupExcuses(seg);
      sentences.forEach((sentence, si) => {
        const match = forMatching(sentence);
        const plain = forDisplay(sentence);
        const neighbourExcuse =
          siblingExcuse ||
          [sentences[si - 1], sentences[si + 1]]
            .filter(Boolean)
            .some((n) => strongOnTopic(forMatching(n)) || ANAPHORA_RE.test(n));
        if (neighbourExcuse) return;
        // A question asserts nothing ("Can it be exactly-once?").
        const isQuestion = /\?["')]?$/.test(sentence.trim());
        const label = LABEL_RE.test(match) || PROSE_LABEL_RE.test(match);
        const open = (spans, { scoped, strictLabel }) =>
          spans.some(
            (s) =>
              !(
                (s.strict
                  ? STRICT_EXCUSE.test(match)
                  : strictLabel
                    ? label
                    : label) ||
                negatedNear(match, s.start, s.end) ||
                (scoped && EOS_SCOPE.test(match))
              ),
          );
        if (open(claimSpans(match, R1_PROSE), { scoped: false }))
          add(seg.line, "R1", plain);
        if (!isQuestion && open(claimSpans(match, R2_PROSE), { scoped: true }))
          add(seg.line, "R2", plain);
      });
    } else {
      const { code, comments } = splitCode(seg.text);
      const hits = r1CodeMatches(code);
      if (!hits.length) return;
      // Only these may excuse code: its own comments, the paragraph that
      // labels it, the caveat right after it, or a sibling field of the same
      // data object. SQL keywords and weak words never do.
      const own = comments.join("\n");
      if (labelsWrong(own) || strongOnTopic(own)) return;
      const prose = (k) =>
        segments[k]?.kind === "prose" ? forMatching(segments[k].text) : "";
      const before1 = prose(idx - 1);
      const before2 = before1 ? prose(idx - 2) : "";
      for (const t of [before1, before2]) {
        if (t && (labelsWrong(t) || strongOnTopic(t))) return;
      }
      if (strongOnTopic(prose(idx + 1))) return;
      if (groupExcuses(seg)) return;
      const lines = seg.text.split("\n");
      const seen = new Set();
      for (const h of hits) {
        if (seen.has(h.line)) continue; // one finding per source line
        seen.add(h.line);
        add(
          seg.line + h.line,
          "R1",
          `${h.why}: ${lines[h.line]?.trim() ?? ""}`,
        );
      }
    }
  });
  return findings;
}

// ── Allowlist ───────────────────────────────────────────────────────

const OWNERS = new Set(["needs-editor-review", "accepted"]);
const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Apply an allowlist to findings.
 * @returns {{findings, allowed, stale, invalid}}
 *   findings  un-allowlisted findings (these fail the lint)
 *   allowed   findings suppressed by an entry
 *   stale     entries that matched nothing (these also fail the lint)
 *   invalid   entries with a missing field or unknown owner
 */
export function applyAllowlist(findings, allow = []) {
  const invalid = allow.filter(
    (e) =>
      !e ||
      typeof e.file !== "string" ||
      typeof e.textIncludes !== "string" ||
      !e.textIncludes.trim() ||
      typeof e.reason !== "string" ||
      !e.reason.trim() ||
      !OWNERS.has(e.owner),
  );
  const valid = allow.filter((e) => !invalid.includes(e));
  const used = new Set();
  const kept = [];
  const allowed = [];
  for (const f of findings) {
    const entry = valid.find(
      (e) => e.file === f.file && norm(f.text).includes(norm(e.textIncludes)),
    );
    if (entry) {
      used.add(entry);
      allowed.push({ ...f, entry });
    } else kept.push(f);
  }
  const stale = valid.filter((e) => !used.has(e));
  return { findings: kept, allowed, stale, invalid };
}

// ── Filesystem ──────────────────────────────────────────────────────

const SKIP_DIRS = new Set(["node_modules", "assets", "static", "js", "css"]);
const CONTENT_EXT = /\.(?:njk|md|yml|json)$|\.11tydata\.cjs$/;

const posix = (root, f) => path.relative(root, f).split(path.sep).join("/");

/** Recursive file walk; `skipDir(name, fullPath)` prunes directories. */
function walkFiles(dir, skipDir, accept, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!skipDir(name, full)) walkFiles(full, skipDir, accept, out);
    } else if (accept(name, full)) out.push(full);
  }
  return out;
}

const PG_SKIP = new Set([
  "node_modules",
  "assets",
  "generated",
  "dist",
  "reports",
  "coverage",
  "test",
  "tests",
  "__tests__",
  "stories",
]);
const PG_TEST_FILE = /\.(?:test|spec|stories)\.[tj]sx?$|\.d\.ts$/;

/**
 * Files under `root` that the lint reads, as repo-relative posix paths,
 * sorted. See the header comment for the exact scope.
 */
export function collectFiles(root) {
  const out = [];
  // src: templates, markdown, yaml, JSON data, Eleventy data files.
  out.push(
    ...walkFiles(
      path.join(root, "src"),
      (name) => SKIP_DIRS.has(name),
      (name, full) =>
        CONTENT_EXT.test(name) ||
        (posix(root, path.dirname(full)) === "src/_data" &&
          name.endsWith(".mjs")),
    ),
  );
  // src/js: assistant UI strings (top level only).
  out.push(
    ...walkFiles(
      path.join(root, "src/js"),
      () => true,
      (name) => name.endsWith(".js"),
    ),
  );
  out.push(path.join(root, "README.md"));
  // playground: markdown, user-visible copy, scenario descriptions.
  const pg = path.join(root, "playground");
  const inDir = (full, d) => posix(root, full).startsWith(`playground/${d}/`);
  out.push(
    ...walkFiles(
      pg,
      (name) => PG_SKIP.has(name) || name.startsWith("."),
      (name, full) =>
        (name.endsWith(".md") && !inDir(full, "assets")) ||
        ((inDir(full, "web") || inDir(full, "src")) &&
          /\.tsx?$/.test(name) &&
          !PG_TEST_FILE.test(name)) ||
        (inDir(full, "scenarios") && name === "scenario.json"),
    ),
  );
  // playground/assets/*.js: hand-written copy modules, not assets/generated.
  out.push(
    ...walkFiles(
      path.join(pg, "assets"),
      () => true,
      (name) => name.endsWith(".js"),
    ),
  );
  out.push(path.join(pg, "index.html"));
  return [...new Set(out.map((f) => posix(root, f)))].sort();
}

/** Which part of the scope a file belongs to (for the CLI summary). */
export function scopeOf(file) {
  if (file === "README.md") return "README";
  if (file.startsWith("src/js/")) return "src/js";
  if (file.startsWith("src/_data/")) return "src/_data";
  if (file.startsWith("src/") && file.endsWith(".json")) return "src json";
  if (file.startsWith("src/")) return "src content";
  if (file.endsWith(".md")) return "playground md";
  if (file.startsWith("playground/web/") || file.startsWith("playground/src/"))
    return "playground web";
  if (file.startsWith("playground/scenarios/")) return "playground scenarios";
  return "playground assets";
}

/** Lint the real tree. Returns applyAllowlist's shape plus file counts. */
export function lintTree(root, allow = []) {
  const files = collectFiles(root).filter((f) => {
    try {
      statSync(path.join(root, f));
      return true;
    } catch {
      return false;
    }
  });
  const all = files.flatMap((f) =>
    lintContent(f, readFileSync(path.join(root, f), "utf8")),
  );
  const scope = {};
  for (const f of files) scope[scopeOf(f)] = (scope[scopeOf(f)] ?? 0) + 1;
  return { ...applyAllowlist(all, allow), fileCount: files.length, scope };
}

export function loadAllowlist(root) {
  return JSON.parse(
    readFileSync(path.join(root, "lib/thesis-lint.allow.json"), "utf8"),
  );
}

/** Human-readable report; empty string when everything is clean. */
export function formatReport({ findings, stale, invalid }) {
  const out = [];
  for (const f of findings)
    out.push(`${f.file}:${f.line}  ${f.rule}  ${f.text}`);
  for (const e of stale)
    out.push(
      `lib/thesis-lint.allow.json  STALE  no finding matches ${e.file} / "${e.textIncludes}" - delete the entry`,
    );
  for (const e of invalid)
    out.push(
      `lib/thesis-lint.allow.json  INVALID  ${JSON.stringify(e)} (needs file, textIncludes, reason, owner: needs-editor-review | accepted)`,
    );
  return out.join("\n");
}
