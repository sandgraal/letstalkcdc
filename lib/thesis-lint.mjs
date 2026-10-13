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
 *                          unsafe, naive, instead of, polling source ...) in
 *                          the claim's own clause (a label before a "but" does
 *                          not excuse a claim made after it), a negation that
 *                          scopes the claim ("never order by", "is not
 *                          achievable", "there is no end-to-end
 *                          exactly-once"; "... and you do not need to worry"
 *                          does not count), or, for exactly-once, a per-hop
 *                          scope (hop, processing, opt-in, exactly.once.support,
 *                          Kafka transactions ...) in the claim's own clause
 *                          and within eight words of it, or a quotation.
 *   prose, neighbours      the previous or next sentence of the same block,
 *                          or another field of the same data object / table,
 *                          excuses only if it is about THE SAME RULE'S topic
 *                          (R1: ordering / timestamps; R2: exactly-once /
 *                          delivery guarantees) AND carries a STRONG marker
 *                          tied to it. "We do not cover Oracle.", "Do not
 *                          skip the offsets table." and "Never order by
 *                          ts_ms." (beside an exactly-once claim) excuse
 *                          nothing.
 *   code                   the block's own comments, or the paragraph that
 *                          labels it (immediately before, or the caveat
 *                          immediately after). SQL keywords (NOT MATCHED, IS
 *                          NOT NULL) and weak words (not, no, only, fail,
 *                          claim) never excuse code.
 *
 * Matching is done on normalised text: Unicode hyphens, soft hyphens and
 * zero-width characters (literal, as entities, or as JS escapes) are folded,
 * and "exactly-\nonce" / "exactly -once" read as "exactly-once". Prose is
 * also read from title / alt / aria-label attributes, <meta content>,
 * JSON-LD blocks, and from plain-word lines inside code fences.
 *
 * Not implemented: rule R3 (a physical DELETE beating a late update). Telling
 * "DELETE wins over a late update" from "a tombstone is applied in log order"
 * needs the surrounding ordering argument, which a sentence-level lint cannot
 * read; any pattern simple enough to write here would either miss the claim or
 * fire on the lessons that teach the correct tombstone handling. R3 stays a
 * reviewer check (P17-52 decision).
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

/** "Never do this" / "don't copy this": a label for the code that follows. */
const DONT_DO_RE =
  /\b(?:never|don['’]t|do not|must not|should not|shouldn['’]t)\s+(?:do|use|copy|write|ship|run|rely|build|implement)\b/i;

/**
 * What each rule is about. A neighbouring sentence can only excuse a claim of
 * rule R if it talks about R's topic, so "We do not deliver on weekends." or
 * "Never order by ts_ms." excuse nothing about exactly-once, and "Do not skip
 * the offsets table." excuses nothing about ordering. Generic words (deliver,
 * wins, offsets, clock, anything_at, latest) are deliberately absent.
 */
const R1_TOPIC_SRC =
  "ts_?(?:ms|us|ns)|timestamps?|updated_?at|modified_?at|commit[\\s-]?(?:time|ts)|event[\\s-]?time|wall[\\s-]?clock|order(?:ing|ed)?|sort(?:ing|ed)?|log\\s+position|lsn|scn|gtid|last[\\s-]?writ\\w*[\\s-]?wins";
const R2_TOPIC_SRC =
  "exactly[\\s-]{0,4}once|exactly\\.once|delivery\\s+guarantees?|end[\\s-]{0,4}to[\\s-]{0,4}end|idempoten\\w*|at[\\s-]{0,4}least[\\s-]{0,4}once|de-?dup\\w*";
const TOPIC = {
  R1: new RegExp(`\\b(?:${R1_TOPIC_SRC})\\b`, "i"),
  R2: new RegExp(`\\b(?:${R2_TOPIC_SRC})\\b`, "i"),
};

/**
 * A negation that is TIED to the topic, not merely present: a negator, then
 * an action verb about the thesis (order, sort, use, rely, compare, assume,
 * guarantee ...), then the topic within the same clause ("Never order by
 * ts_ms"); or a negator at most one word before a core term ("no end-to-end
 * exactly-once"); or a core term followed by "is not" ("exactly-once end to
 * end is not achievable"). "Do not panic about ordering.", "Don't forget the
 * updated_at column." and "Debezium has no deduplication layer." are none of
 * these.
 */
const NEGATOR =
  "(?:never|cannot|can['’]t|don['’]t|do not|must not|mustn['’]t|should not|shouldn['’]t|won['’]t|will not|no longer)";
const ACTION =
  "(?:order|sort|rank|compare|use|rely|trust|key|decide|pick|choose|resolve|apply|merge|dedup|dedupe|deduplicate|keep|take|assume|expect|promise|claim|believe|guarantee|provide|offer|achieve|count|treat|base|build|design|ship|copy|write|say|tell)\\w*";
const tiedNegation = (topicSrc, coreSrc) => ({
  action: new RegExp(
    `\\b${NEGATOR}\\s+(?:(?:simply|just|ever|really|always|blindly)\\s+)?${ACTION}\\b[^.;:]{0,40}?\\b(?:${topicSrc})\\b`,
    "i",
  ),
  before: new RegExp(
    `\\b(?:no|not|never|none\\s+of|neither|nor)\\s+(?:[\\w'’-]+\\s+)?(?:${coreSrc})\\b`,
    "i",
  ),
  after: new RegExp(
    `\\b(?:${coreSrc})\\b[^.;:]{0,20}?\\b(?:(?:is|are|was|were)\\s+(?:not|never)|isn['’]t|aren['’]t)\\b`,
    "i",
  ),
});
const R1_CORE_SRC =
  "ts_?(?:ms|us|ns)|timestamps?|updated_?at|modified_?at|commit[\\s-]?(?:time|ts)|event[\\s-]?time|wall[\\s-]?clock|last[\\s-]?writ\\w*[\\s-]?wins";
const R2_CORE_SRC =
  "exactly[\\s-]{0,4}once|exactly\\.once|end[\\s-]{0,4}to[\\s-]{0,4}end|delivery\\s+guarantees?";
const TIED = {
  R1: tiedNegation(R1_TOPIC_SRC, R1_CORE_SRC),
  R2: tiedNegation(R2_TOPIC_SRC, R2_CORE_SRC),
};

/**
 * "That is wrong." / "This is an anti-pattern.": a next sentence that names
 * the previous claim as wrong without repeating its words. Only the sentence
 * right AFTER a claim can be read this way.
 */
const ANAPHORA_RE =
  /^(?:that|this|which|it)(?:\s+(?:is|was|would\s+be)|['’]s)\s+(?:\w+\s+){0,2}?(?:wrong|an?\s+myth|false|untrue|incorrect|misleading|an?\s+anti-?pattern|an?\s+mistake|an?\s+bug|an?\s+trap|an?\s+pitfall|an?\s+misconception|not\s+(?:true|safe|reliable|correct|enough|achievable|possible))\b|\b(?:that|this)\s+(?:bug|mistake|anti-?pattern|pitfall|trap|misconception)\b/i;

/** Does this text carry a STRONG marker AND talk about rule `rule`'s topic? */
const strongOnTopic = (t, rule) =>
  TOPIC[rule].test(t) &&
  (LABEL_RE.test(t) ||
    TIED[rule].action.test(t) ||
    TIED[rule].before.test(t) ||
    TIED[rule].after.test(t));
/** Text that labels the code next to it as the wrong / broken example. */
const labelsWrong = (t) => LABEL_RE.test(t) || DONT_DO_RE.test(t);

/**
 * Scoping that makes "exactly-once" a per-hop statement. It excuses a claim
 * only when it qualifies THAT claim (see eosScoped): in the claim's own
 * clause and within EOS_SCOPE_WORDS words of it. A scope word elsewhere in
 * the sentence ("Transactions are fine, but the pipeline is exactly-once")
 * excuses nothing.
 */
const EOS_SCOPE =
  /\b(?:hops?|alternatives?\s+to|(?:matches|mimics|emulates|simulates|resembles)\s+an?|requires?\s+cooperation|depends\s+on\s+the\s+(?:connector|sink|destination|system)|processing|observable\s+(?:effect|state)|with\s+respect\s+to|for\s+(?:source|sink)\s+connectors?|effectively[- ]once|exactly\.once\.support|opt-?in|transactions?|transactional|kafka streams|pub\/sub|pull[- ]subscriptions?|pulsar|marketing|marketed|(?:one|single) (?:link|stage|leg|system|topic|broker|boundary))\b/i;

const EOS_SCOPE_WORDS = 8;
/** Punctuation and words that end the clause a claim sits in. */
const EOS_CLAUSE_END =
  /[;:()\u2014\u2013,]|\s(?:-{1,2})\s|\b(?:but|however|yet|so|and|because|while|whereas|although|though)\b/gi;

/** Is the exactly-once claim `span` qualified by a scope word that is close to it, in its clause? */
function eosScoped(text, span) {
  let from = 0;
  let to = text.length;
  for (const b of text.matchAll(EOS_CLAUSE_END)) {
    if (b.index + b[0].length <= span.start) from = b.index + b[0].length;
    else if (b.index >= span.end) {
      to = b.index;
      break;
    }
  }
  const words = (t) => t.match(/\S+/g) ?? [];
  const left = words(text.slice(from, span.start)).slice(-EOS_SCOPE_WORDS);
  const right = words(text.slice(span.end, to)).slice(0, EOS_SCOPE_WORDS);
  const near = [...left, text.slice(span.start, span.end), ...right].join(" ");
  return EOS_SCOPE.test(near);
}

/** Excuses that survive a "you can skip dedup" style claim (negators do not). */
const STRICT_EXCUSE =
  /\b(?:myths?|wrong|false|untrue|incorrect|misleading|misconception|mistake|fallacy|not\s+(?:true|safe|enough))\b/i;

// ── Negation tied to the claim ──────────────────────────────────────

const NEG_WORD =
  /\b(?:not|never|cannot|no longer|none|neither|nothing|nobody|nor)\b|n['’]t\b/i;
const NO_EXIST = /\bno\s+(?:[\w-]+\s+){0,2}$/i;
/** Words that start a new clause: a negator before one of them is not about the claim. */
const CLAUSE_WORD =
  /\b(?:because|since|so|and|but|or|then|while|whereas|although|though|yet|however|if|when|unless|where)\b/gi;
/** Subjects and clause words that make a later "is not" a different statement. */
const NEW_CLAUSE = new Set([
  "and",
  "but",
  "so",
  "then",
  "or",
  "you",
  "we",
  "they",
  "i",
  "it",
  "he",
  "she",
  "because",
  "since",
  "while",
  "if",
  "when",
  "as",
  "yet",
  "though",
  "although",
  "whereas",
  "however",
]);
const AFTER_VERB = new Set([
  "is",
  "are",
  "was",
  "were",
  "can",
  "could",
  "will",
  "would",
  "does",
  "has",
  "have",
]);
const AFTER_CONTRACTION =
  /^(?:isn['’]t|aren['’]t|wasn['’]t|can['’]t|cannot|won['’]t|doesn['’]t|hasn['’]t)$/i;

/**
 * "Do not forget that ...", "never worry that ...": the negator is about an
 * attitude, the clause after it is still asserted.
 */
const NEUTRAL_NEG =
  /\b(?:(?:do|does|did|should|must|could|would|will|can)\s+not|never|cannot|no\s+longer|(?:don|doesn|didn|shouldn|mustn|couldn|wouldn|won|can)['’]t)\s+(?:ever\s+)?(?:forget|worry|panic|hesitate|fear|mind|doubt|neglect|overlook|bother)\b/gi;

/** A negator within eight words before `start`, in the same clause. */
function negatedBefore(text, start) {
  const before = text.slice(Math.max(0, start - 90), start);
  let cut = 0;
  for (const c of before.matchAll(CLAUSE_WORD)) cut = c.index + c[0].length;
  const tail = before.slice(cut);
  if (NO_EXIST.test(tail)) return true;
  const bw = (/(?:[\w'’-]+[ \t]+){0,8}$/.exec(tail)?.[0] ?? "").replace(
    NEUTRAL_NEG,
    " ",
  );
  return NEG_WORD.test(bw);
}

/**
 * A negation that scopes the CLAIM as its subject, after it: "end-to-end
 * exactly-once across independent systems is not achievable". Up to four
 * words may sit between the claim and "is/are/can ... not"; a subject or
 * clause word in between ("... wins and you do not need to worry") makes it
 * another statement, and so does any punctuation.
 */
function negatedAfter(text, end) {
  const after = text.slice(end, end + 120);
  const aw = /^(?:[ \t]+[\w'’-]+){0,6}/.exec(after)?.[0] ?? "";
  const words = aw.trim() ? aw.trim().split(/\s+/) : [];
  for (let k = 0; k < words.length && k <= 4; k++) {
    const w = words[k].toLowerCase();
    if (NEW_CLAUSE.has(w)) return false;
    if (AFTER_CONTRACTION.test(w)) return true;
    if (AFTER_VERB.has(w) && /^(?:not|never)$/i.test(words[k + 1] ?? ""))
      return true;
  }
  return false;
}

/**
 * True when a negation is tied to the matched claim: inside the matched span
 * ("decided by log position, never by that timestamp"), up to eight words
 * before it in the same clause ("Never order by ts_ms", "there is no
 * end-to-end exactly-once"), or the claim is the subject of a following
 * "is not" ("... is not achievable"). A negator in another clause or
 * sentence, or a "do not need to worry" after the claim, does not count.
 */
function negatedNear(text, start, end) {
  if (NEG_WORD.test(text.slice(start, end))) return true;
  return negatedBefore(text, start) || negatedAfter(text, end);
}

// ── Rules ───────────────────────────────────────────────────────────

const rx = (src) => new RegExp(src, "gi");

const KEEPV =
  "(?:keeps?|kept|takes?|taken|picks?|chooses?|chosen|applies|apply|applied|retains?|retained|selects?|selected|uses?|used|wins?)";
const TIMEREF = `(?:${TS_REF}|(?:wall[\\s-]?)?clocks?(?:[\\s-]time)?|time\\b)`;
const OLDER =
  "(?:older|earlier|lower|smaller|less|behind|stale|newer|later|greater|higher|larger)";
const ORDKEY =
  "(?:version|ordering|order|sequence|sequencing|sort|ranking|conflict[\\s-]resolution|winner|precedence)(?:\\s+(?:column|key|field|number|token|attribute))?";

/**
 * A log position named in the same sentence as primary / deciding: the only
 * thing that makes "use created_at to break ties" a legitimate statement.
 */
const POSITION_PRIMARY =
  /\b(?:log position|lsn|scn|gtid|binlog position|source position)\b[^.]{0,80}\b(?:primary|primarily|first|authoritative|decid\w+|decisive|main)\b|\b(?:primary|primarily|first|authoritative|decid\w+|decisive|main|before|then|after|ahead)\b[^.]{0,60}\b(?:log position|lsn|scn|gtid|binlog position|source position)\b/i;

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
  // "take the record whose updated_at is largest"
  rx(`\\bwhose\\s+${MOD}${TS_REF}\\s+(?:is|are)\\s+(?:the\\s+)?${BIG}`),
  // "last-write-wins ... timestamp" in both orders
  rx(
    `\\blast[\\s-]{0,3}writ(?:er|e)[\\s-]{0,3}wins\\b[^.]{0,40}\\b(?:${TS_REF}|clocks?)`,
  ),
  rx(
    `\\b(?:${TS_REF}|clocks?)[^.]{0,40}\\blast[\\s-]{0,3}writ(?:er|e)[\\s-]{0,3}wins\\b`,
  ),
  // "order(ed) by (the) (commit) timestamp"
  rx(
    `\\border(?:s|ed|ing)?\\s+(?:[\\w'-]+\\s+){0,2}by\\s+${DET}${MOD}(?:time\\b|${TS_REF})`,
  ),
  // "events are ordered by when they happened"
  rx(
    `\\b(?:order|sort|rank)(?:s|ed|ing)?\\s+(?:[\\w'-]+\\s+){0,3}?by\\s+(?:when|the\\s+time|what\\s+time)\\b`,
  ),
  // "applied in timestamp order", "replay events in wall-clock order"
  rx(
    `\\bin\\s+${DET}${MOD}(?:${TS_REF}|time|chronological|wall[\\s-]?clock|clock)\\s+order\\b`,
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
  // "the most recent change by clock time is kept", "keep the newest change by timestamp"
  rx(
    `\\b${BIG}\\s+(?:[\\w'-]+\\s+){0,2}?(?:by|according to|based on|using|via|in terms of)\\s+${DET}${MOD}${TIMEREF}[^.]{0,30}?\\b${KEEPV}\\b`,
  ),
  rx(
    `\\b${KEEPV}\\s+${DET}${BIG}\\s+(?:[\\w'-]+\\s+){0,2}?(?:by|according to|based on|using|via|in terms of)\\s+${DET}${MOD}${TIMEREF}`,
  ),
  // "wins by timestamp"
  rx(`\\bwins?\\s+by\\s+${DET}${MOD}${TS_REF}`),
  // "dedupe by timestamp and keep one row per key"
  rx(
    `\\bde-?dup\\w*\\s+(?:[\\w'-]+\\s+){0,3}?(?:by|on|using|with|based on|according to)\\s+${DET}${MOD}(?:${TS_REF}|time\\b)`,
  ),
  // "decide / resolve ... by the timestamp"
  rx(
    `\\b(?:decid\\w+|determin\\w+|resolv\\w+|pick\\w*|choos\\w+|select\\w*)\\b[^.]{0,50}\\b(?:by|using|with|based on|according to|via)\\s+${DET}${MOD}${TS_REF}`,
  ),
  // "use updated_at to decide which row wins"
  rx(
    `\\b${TS_REF}[^.]{0,30}\\bto\\s+(?:decide|determine|pick|choose|resolve)\\b`,
  ),
  // "a change is dropped if its timestamp is older than the stored row"
  rx(
    `\\b(?:dropped|discarded|ignored|skipped|rejected|overwritten|replaced|thrown away)\\b[^.]{0,30}?\\b(?:if|when|whenever|because|unless|once)\\b[^.]{0,30}?${TS_REF}[^.]{0,20}?\\b${OLDER}\\b`,
  ),
  rx(
    `\\b(?:if|when|whenever)\\b[^.]{0,30}?${TS_REF}\\s+(?:is\\s+)?${OLDER}\\b[^.]{0,50}?\\b(?:dropped|discarded|ignored|skipped|rejected|overwrit\\w+|replace\\w*|wins?|applied|kept)\\b`,
  ),
  // "use updated_at as the version column", "the timestamp as the ordering key"
  rx(
    `\\b(?:use|uses|using|used|treat|treats|make|set|pick|choose|take)\\s+${DET}${MOD}${TS_REF}\\s+as\\s+${DET}(?:\\w+\\s+)?${ORDKEY}\\b`,
  ),
  rx(
    `\\b${TS_REF}\\s+for\\s+(?:ordering|versioning|sequencing|conflict[\\s-]resolution)\\b`,
  ),
  // "set the ordering column to ts_ms", "the version column is updated_at"
  rx(
    `\\b(?:set|sets|setting|configure|configured|make|point)\\s+${DET}${ORDKEY}\\s+(?:to|as|on)\\s+${DET}${MOD}${TS_REF}`,
  ),
  rx(`\\b${ORDKEY}\\s+(?:is|are)\\s+${DET}${MOD}${TS_REF}`),
  // "use created_at to break ties" (a timestamp is not a legitimate primary key
  // for picking among change events; only a log position stated as primary excuses it)
  {
    tie: true,
    re: rx(
      `\\b(?:use|uses|using|used)\\s+${DET}${MOD}${TS_REF}\\s+(?:only\\s+|just\\s+)?(?:to\\s+break\\s+ties|as\\s+(?:a|the)\\s+tie-?break\\w*)`,
    ),
  },
];

const EOS = "exactly[\\s-]{0,4}once";
/** "no duplicate rows in the target" is an end-state claim, not a delivery claim. */
const END_STATE =
  "(?!\\s+(?:rows?|records?|entries|in\\s+the\\s+(?:end|target|sink|table|final)|per\\s+key))";
const E2E = "end[\\s-]{0,4}to[\\s-]{0,4}end";
/**
 * Prose patterns for R2 (end-to-end exactly-once asserted). `strict` ones
 * ignore negators inside the claim (the claim itself contains "no" / "never"):
 * only a label word, or a negator BEFORE the claim in the same clause, excuses
 * them.
 */
const R2_PROSE = [
  { re: rx(`\\b${E2E}[,;]?\\s+${EOS}\\b`) },
  { re: rx(`\\b${EOS}[,;]?\\s+${E2E}\\b`) },
  {
    re: rx(
      `\\b(?:guarantees?|guaranteed|delivers?|delivered|provides?|provided|achieves?|achieved|gives?|offers?|ensures?|ensured|gets?|getting|has|have|supports?|enables?|enabled|ships?|brings?)\\s+(?:you\\s+)?(?:true\\s+|real\\s+|full\\s+)?${EOS}\\b`,
    ),
  },
  { re: rx(`\\b${EOS}\\s+delivery\\b`) },
  // "CDC delivers every change exactly once"
  {
    re: rx(
      `\\b(?:delivers?|delivered|applies|applied|replicates?|replicated|synced|lands?|arrives?|appears?)\\s+(?:[\\w'’-]+\\s+){0,4}?${EOS}\\b(?!\\s+(?:processing|semantics\\s+(?:within|inside|between)|per\\b))`,
    ),
  },
  // "Our pipeline is exactly-once", "Debezium is an exactly-once system"
  {
    re: rx(
      `\\b(?:is|are|was|were|be|being|becomes?|remains?|stays?)\\s+(?:an?\\s+)?(?:(?:fully|truly|always|natively|inherently|really|actually|automatically|already|simply|just)\\s+)?${EOS}\\b(?!\\s+(?:processing|semantics?\\s+(?:within|inside|between)|per\\b))`,
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
  // "You do not need an idempotent sink", "the connector deduplicates for you"
  {
    strict: true,
    re: rx(
      `\\b(?:don['’]t|do\\s+not|doesn['’]t|does\\s+not|no\\s+longer|won['’]t)\\s+(?:really\\s+|even\\s+)?need\\s+(?:(?:an?|any|the)\\s+)?(?:\\w+\\s+)?idempoten\\w*`,
    ),
  },
  {
    strict: true,
    re: rx(
      `\\bno\\s+need\\s+(?:for|to)\\s+(?:(?:an?|any|the)\\s+)?(?:\\w+\\s+)?idempoten\\w*`,
    ),
  },
  {
    strict: true,
    re: rx(
      `\\b(?:de-?dup\\w*|removes?\\s+(?:the\\s+)?duplicates?|handles?\\s+(?:the\\s+)?(?:duplicates?|de-?dup\\w*))\\s+for\\s+you\\b`,
    ),
  },
  // "We guarantee no duplicates and no loss", "You will never see a duplicate"
  // (an end-state statement about the table, "no duplicate rows", is fine)
  {
    strict: true,
    re: rx(
      `\\b(?:guarantee\\w*|promis\\w+|ensur\\w+|giv\\w+|offer\\w*)\\s+(?:you\\s+)?(?:no|zero)\\s+(?:duplicat\\w+|dupes?)\\s*(?:,|and|or)\\s*(?:no|zero)\\s+(?:data\\s+)?(?:loss|lost|missing)`,
    ),
  },
  {
    strict: true,
    re: rx(
      `\\b(?:guarantee\\w*|promis\\w+)\\s+(?:you\\s+)?(?:no|zero)\\s+(?:duplicat\\w+|dupes?)\\b${END_STATE}`,
    ),
  },
  {
    strict: true,
    re: rx(
      `\\b(?:never|won['’]t|will\\s+not)\\s+(?:ever\\s+)?(?:see|get|receive|have|find|encounter|notice)\\s+(?:(?:a|an|any|the)\\s+)?(?:duplicat\\w+|dupes?|double[- ]?(?:deliver\\w+|processing))\\b${END_STATE}`,
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

/** A log-position column: when one sorts first, a timestamp after it is a tie-break. */
const LOG_POSITION_KEY =
  /^(?:[a-z0-9_]*_)?(?:lsn|scn|csn|gtid|seq|sequence|seqno|offset|position|pos|rba|binlog_?pos\w*)$/i;

/**
 * Does a timestamp-like column come FIRST among the sort keys of `list`
 * (a log position earlier in the list makes later timestamps tie-breaks)?
 * "ORDER BY ts_ms DESC, lsn DESC" picks by ts_ms; "ORDER BY lsn DESC, ts_ms
 * DESC" picks by lsn.
 */
function timestampSortsFirst(list) {
  let depth = 0;
  let from = 0;
  const keys = [];
  const text = list.slice(0, 600);
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      keys.push(text.slice(from, k));
      from = k + 1;
    }
  }
  keys.push(text.slice(from));
  for (const key of keys) {
    const words = key.match(/[A-Za-z_]\w{0,63}/g) ?? [];
    const name = words.find((w) => !/^(?:asc|desc|nulls|first|last)$/i.test(w));
    if (name && LOG_POSITION_KEY.test(name)) return false;
    if (hasTsRef(key)) return true;
  }
  return false;
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

/** The operand just left of a comparison operator at `i` (call arguments included). */
function operandBefore(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  const stop = Math.max(0, j - 80);
  const last = j;
  if (code[j] === ")") {
    let depth = 0;
    for (; j >= stop; j--) {
      if (code[j] === ")") depth++;
      else if (code[j] === "(" && --depth === 0) break;
    }
    j--;
  }
  while (j >= stop && OPERAND_CHAR.test(code[j])) j--;
  return code.slice(j + 1, last + 1);
}

/** The operand just right of a comparison operator ending at `i`. */
function operandAfter(code, i) {
  let j = i;
  while (j < code.length && /\s/.test(code[j])) j++;
  const nm = /^new\s+/.exec(code.slice(j, j + 8));
  if (nm) j += nm[0].length;
  const start = j;
  const stop = Math.min(code.length, j + 80);
  while (j < stop && OPERAND_CHAR.test(code[j])) j++;
  if (code[j] === "(") {
    const c = closingParen(code, j, 80);
    if (c > 0) j = c + 1;
  }
  return code.slice(start, j);
}

/** Top-level comma-separated arguments of the call that opens at `open`. */
function callArgs(code, open, max = 200) {
  const close = closingParen(code, open, max);
  if (close < 0) return [];
  const args = [];
  let depth = 0;
  let from = open + 1;
  for (let k = open + 1; k < close; k++) {
    const c = code[k];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      args.push(code.slice(from, k));
      from = k + 1;
    }
  }
  args.push(code.slice(from, close));
  return args;
}

/** What a loop body or callback does with each item: it applies it to the sink. */
const APPLYISH =
  /\b(?:apply|upsert|merge|replay|write|sink|process|handle|insert|commit|dispatch|emit|ingest|load)\w*/i;

const SORT_CALL =
  /\b(?:sort|sorted|toSorted|sort_values|sortBy|sort_by|orderBy|order_by)\s*\(/gi;
const PICK_TAIL =
  /^[\s\S]{0,120}?(?:\[\s*(?:0|-1|\w+\.length\s*-\s*1)\s*\]|\.(?:pop|shift|at|first|last|head|tail|iloc|drop_duplicates|dropDuplicates|limit|find|take)\b|\bkeep\s*=)/i;

/**
 * `events.sort(by ts).forEach(apply)`, `for (const e of events.sort(...)) apply(e)`,
 * `for e in sorted(events, key=ts): apply(e)`: a timestamp sort whose result is
 * walked to apply each change. A sort whose result is rendered picks no winner.
 */
function sortedThenApplied(code, at, close, tail) {
  const iter = /^\s*\.(?:forEach|for_each|each|map|reduce)\s*\(/.exec(tail);
  if (iter) {
    const open = close + 1 + iter[0].length - 1;
    const end = closingParen(code, open, 300);
    return APPLYISH.test(code.slice(open, end < 0 ? open + 200 : end + 1));
  }
  const head = code.slice(Math.max(0, at - 90), at);
  if (
    /\bfor\s*\([^)]{0,60}\bof\s+[\w.$]*$/.test(head) ||
    /\bfor\s+\w+(?:\s*,\s*\w+)?\s+in\s+(?:\w+\.)?$/.test(head)
  )
    return APPLYISH.test(code.slice(close + 1, close + 160));
  return false;
}

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
    if (ob && timestampSortsFirst(ob[1]))
      push(m.index, "window function ordered by a timestamp");
  }
  // Named windows: WINDOW w AS (PARTITION BY id ORDER BY ts_ms DESC) with a ranking function.
  for (const m of code.matchAll(/\bWINDOW\s+\w{1,64}\s+AS\s*\(/gi)) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(code, open, 600);
    const ob =
      close < 0
        ? null
        : /ORDER\s+BY\s+([\s\S]*)$/i.exec(code.slice(open + 1, close));
    if (
      ob &&
      timestampSortsFirst(ob[1]) &&
      /\b(?:ROW_NUMBER|RANK|DENSE_RANK|FIRST_VALUE|LAST_VALUE)\s*\(/i.test(code)
    )
      push(m.index, "named window ordered by a timestamp");
  }
  // QUALIFY on a timestamp.
  for (const m of code.matchAll(/\bQUALIFY\b[^;]{0,400}/gi)) {
    const ob = /ORDER\s+BY\s+([\s\S]*)$/i.exec(m[0]);
    if (ob ? timestampSortsFirst(ob[1]) : hasTsRef(m[0]))
      push(m.index, "QUALIFY keyed on a timestamp");
  }
  // DISTINCT ON / TOP 1 / LIMIT 1 ordered by a timestamp.
  for (const m of code.matchAll(
    /\bORDER\s+BY\s+([^;]{0,200}?)(?=\bON\s+CONFLICT\b|\bLIMIT\b|\bFETCH\b|;|\)|$)/gi,
  )) {
    if (!timestampSortsFirst(m[1])) continue;
    const before = code.slice(Math.max(0, m.index - 600), m.index);
    const stmtHead = before.slice(before.lastIndexOf(";") + 1);
    const after = code.slice(m.index + m[0].length, m.index + m[0].length + 40);
    if (/\bDISTINCT\s+ON\b/i.test(stmtHead))
      push(m.index, "DISTINCT ON ordered by a timestamp");
    else if (/\bTOP\s*\(?\s*1\b/i.test(stmtHead))
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
    const tail = code.slice(close + 1, close + 140);
    if (PICK_TAIL.test(tail))
      push(m.index, "sorted by a timestamp and the first/last item taken");
    else if (sortedThenApplied(code, m.index, close, tail))
      push(m.index, "sorted by a timestamp and then applied in that order");
  }
  // apply_changes-style configuration: sequence_by="ts_ms", order_by: updated_at,
  // version.field=ts_ms, hoodie precombine fields.
  for (const m of code.matchAll(
    /\b(?:sequence_?by|order_?by|ordering_?(?:field|key|column)|version_?(?:field|column|key)|version\.(?:field|column|key)|precombine[\w.]{0,24})\b["']?\s*[:=]\s*([^\n;]{0,80})/gi,
  )) {
    if (hasTsRef(m[1])) push(m.index, "ordering setting keyed on a timestamp");
  }
  // GREATEST(t.ts_ms, s.ts_ms), Math.max(a.updated_at, b.updated_at)
  for (const m of code.matchAll(
    /\b(?:GREATEST|LEAST|Math\.max|Math\.min|max|min)\s*\(/gi,
  )) {
    const args = callArgs(code, m.index + m[0].length - 1);
    if (args.filter(hasTsRef).length >= 2)
      push(m.index, "winner picked by the greater of two timestamps");
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
  "&shy;": "\u00ad",
  "&hyphen;": "-",
  "&dash;": "-",
  "&minus;": "-",
};
const decode = (s) =>
  s.replace(/&(?:#\d{1,8}|#x[0-9a-f]{1,6}|[a-z]{1,10});/gi, (e) => {
    if (ENTITIES[e.toLowerCase()] !== undefined)
      return ENTITIES[e.toLowerCase()];
    const n = /^&#x([0-9a-f]+);$/i.exec(e)?.[1];
    if (n) return safeChar(parseInt(n, 16));
    const d = /^&#(\d+);$/.exec(e)?.[1];
    return d ? safeChar(Number(d)) : " ";
  });

/**
 * Evasion-proofing for matching: invisible characters (soft hyphen, zero-width
 * space / joiners, word joiner, BOM) are removed and every Unicode hyphen or
 * minus (U+2010..U+2015, U+2212 and look-alikes) becomes "-", so
 * "exactly&#8209;once" and "exactly&shy;-once" read as "exactly-once".
 */
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\ufeff]/g;
const DASHES = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g;
export const normaliseText = (s) =>
  s.replace(INVISIBLE, "").replace(DASHES, "-");

/**
 * Resolve the escape that starts at `src[j] === "\\"` in a JS string literal.
 * Returns the text it stands for and the index after it.
 */
function readEscape(src, j) {
  const n = src[j + 1];
  if (n === "n") return ["\n", j + 2];
  if (n === "t") return [" ", j + 2];
  if (n === "u") {
    const br = /^\{([0-9a-f]{1,6})\}/i.exec(src.slice(j + 2, j + 10));
    if (br) return [safeChar(parseInt(br[1], 16)), j + 2 + br[0].length];
    const hx = /^[0-9a-f]{4}/i.exec(src.slice(j + 2, j + 6));
    if (hx) return [safeChar(parseInt(hx[0], 16)), j + 6];
  }
  if (n === "x") {
    const hx = /^[0-9a-f]{2}/i.exec(src.slice(j + 2, j + 4));
    if (hx) return [safeChar(parseInt(hx[0], 16)), j + 4];
  }
  return [n, j + 2];
}
const safeChar = (cp) => (cp <= 0x10ffff ? String.fromCodePoint(cp) : " ");

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
        const [v, next] = readEscape(text, j);
        value += v;
        j = next;
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
 * Bodies of `<script type="application/ld+json">` blocks: structured data that
 * search engines read (descriptions, FAQ answers). Other scripts are code.
 * @returns {{ body: string, offset: number }[]}
 */
function jsonLdBodies(s) {
  const out = [];
  const open = /<script\b([^>]{0,500})>/gi;
  let lower = null;
  let m;
  while ((m = open.exec(s))) {
    if (!/ld\+json/i.test(m[1])) continue;
    lower ??= s.toLowerCase();
    const start = m.index + m[0].length;
    const close = lower.indexOf("</script", start);
    if (close < 0) break;
    out.push({ body: s.slice(start, close), offset: start });
    open.lastIndex = close;
  }
  return out;
}

/** Attributes whose value is shown to or read by a user. */
const PROSE_ATTR =
  /(?<![\w-])(title|alt|aria-label|aria-description|content)\s*=\s*(?:"([^"]{0,2000})"|'([^']{0,2000})')/gi;

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
  const ldSegments = [];
  for (const { body, offset } of jsonLdBodies(s)) {
    const clean = blankDelimited(blankDelimited(body, "{%", "%}"), "{{", "}}");
    const lineBase = lineAt(lineStarts(s), offset) + baseLine - 1;
    ldSegments.push(
      ...extractJsSegments(clean).map((x, k) => ({
        ...x,
        line: x.line + lineBase - 1,
        group: `ld${offset}-${x.group ?? k}`,
      })),
    );
  }
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
  const attrs = [];

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
    if (!closing && m[3].length > 8) {
      // title="", alt="", aria-label="" and <meta content=""> are copy too.
      const attrsAt = m.index + 1 + m[2].length;
      for (const a of m[3].matchAll(PROSE_ATTR)) {
        if (a[1].toLowerCase() === "content" && name !== "meta") continue;
        const text = decode(a[2] ?? a[3] ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length >= 12)
          attrs.push({ kind: "prose", text, line: L(attrsAt + a.index) });
      }
    }
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
  // Attribute copy and JSON-LD go last, so they never sit between a paragraph
  // and the code block it labels.
  const tail = [...attrs, ...ldSegments];
  if (!extra.length) return [...segments, ...tail];
  return [...[...segments, ...extra].sort((a, b) => a.line - b.line), ...tail];
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
 * Quiz items: `options: [...]` with a `correct` index next to it (N is
 * 1-based, as in components/quiz.njk). Returns the offsets of the quote that
 * opens each wrong option (`distractors`) and of every option string
 * (`quizzes`), for which a sibling field must not excuse a claim.
 *
 * Wrong options are skipped ONLY when `correct` is a plain integer in
 * 1..options.length ("2", 2). Anything else ("0", "9", "99", "02", "two", a
 * missing `correct`) names no option, so every option is linted: a bad index
 * must never hide the options from the lint.
 */
function quizOptions(src) {
  const distractors = new Set();
  const quizzes = new Set();
  const re = /\boptions["']?\s*:\s*\[([^\]]{0,6000})\]/g;
  const value = String.raw`(?:"([^"\n]{0,20})"|'([^'\n]{0,20})'|([^\s,}]{1,20}))`;
  const afterRe = new RegExp(
    String.raw`^\s*,\s*["']?correct["']?\s*:\s*${value}`,
  );
  const beforeRe = new RegExp(
    String.raw`\bcorrect["']?\s*:\s*${value}\s*,\s*$`,
  );
  for (const m of src.matchAll(re)) {
    const end = m.index + m[0].length;
    const base = m.index + m[0].indexOf("[") + 1;
    const lits = stringLiterals(m[1]);
    const cm =
      afterRe.exec(src.slice(end, end + 80)) ??
      beforeRe.exec(src.slice(Math.max(0, m.index - 80), m.index));
    if (!cm) continue; // no `correct`: not a quiz item, every option is plain copy
    const raw = cm[1] ?? cm[2] ?? cm[3];
    const n = /^[1-9]\d{0,2}$/.test(raw) ? Number(raw) : 0;
    const valid = n >= 1 && n <= lits.length;
    lits.forEach((lit, k) => {
      const at = base + lit.index - 1;
      quizzes.add(at);
      if (valid && k + 1 !== n) distractors.add(at);
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
          const [v, next] = readEscape(src, j);
          out += v;
          j = next;
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

/** Spans of every claim pattern in `text`; each is { start, end, strict, tie }. */
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
        tie: !!p.tie,
      });
      if (++n >= 20) break;
    }
  }
  return spans;
}

/**
 * "exactly-once" inside quotation marks is mentioned, not asserted:
 * "a vendor page says its service delivers 'with exactly-once semantics'".
 */
const QUOTED_EOS = new RegExp(
  `(?<!\\w)['"“‘][^'"“”‘’]{0,40}\\b${EOS}\\b[^'"“”‘’]{0,40}['"”’]`,
  "gi",
);
const isQuoted = (text, span) => {
  for (const q of text.matchAll(QUOTED_EOS))
    if (span.start <= q.index + q[0].length && span.end >= q.index) return true;
  return false;
};

/** Coordinators that start a new, contrasting clause. */
const CONTRAST_WORD = /\b(?:but|however|yet|nevertheless)\b/gi;
const CONTRAST_START = /^(?:but|however|yet|nevertheless)\b/i;

/** Where the clause that holds a claim starting at `start` begins (after the last "but"). */
function clauseStart(text, start) {
  let from = 0;
  for (const c of text.slice(0, start).matchAll(CONTRAST_WORD)) from = c.index;
  return from;
}

/**
 * Is one claim span excused inside its own sentence? A label word excuses it
 * only from the claim's own clause on: "Some say it is wrong, but the newest
 * timestamp wins" asserts the claim after the "but". A negator must scope the
 * claim (see negatedNear).
 */
function excusedInSentence(match, span, rule) {
  if (span.strict)
    return STRICT_EXCUSE.test(match) || negatedBefore(match, span.start);
  if (span.tie)
    return (
      STRICT_EXCUSE.test(match) ||
      negatedNear(match, span.start, span.end) ||
      POSITION_PRIMARY.test(match)
    );
  const clause = match.slice(clauseStart(match, span.start));
  return (
    LABEL_RE.test(clause) ||
    PROSE_LABEL_RE.test(clause) ||
    negatedNear(match, span.start, span.end) ||
    (rule === "R2" && (eosScoped(match, span) || isQuoted(match, span)))
  );
}

/** Prose that does not look like code: four or more plain words, no code characters. */
const CODE_CHARS = /[{}();=<>[\]`$\\|@#]|=>|\/\/|--|::|https?:/;
const CODE_FIRST_WORD =
  /^(?:select|from|where|and|or|order|group|insert|update|delete|merge|when|then|else|end|set|values|on|join|left|right|inner|outer|cross|limit|having|with|create|alter|drop|case|union|using|into|partition|qualify|if|elif|for|while|def|class|return|import|const|let|var|function|print|echo|curl|docker|npm|git|sudo|cd|export)\b/i;

/**
 * Prose lines inside a code block ("Debezium gives you exactly-once end to
 * end." in a ``` fence): consecutive lines that are plain words with no code
 * characters and do not start with a SQL / shell / JS keyword. Comments and
 * code lines are left to the code rules.
 */
function fencedProse(seg) {
  const out = [];
  let run = [];
  let runLine = 0;
  const flush = () => {
    if (run.length)
      out.push({ kind: "prose", text: run.join(" "), line: runLine });
    run = [];
  };
  seg.text.split("\n").forEach((raw, i) => {
    const t = raw.trim();
    const words = t.split(/\s+/);
    const plain =
      t.length >= 20 &&
      t.length <= 400 &&
      words.length >= 4 &&
      !CODE_CHARS.test(t) &&
      !CODE_FIRST_WORD.test(t) &&
      words.filter((w) => /^[A-Za-z][A-Za-z'’,.:;!?-]*$/.test(w)).length >=
        words.length * 0.7;
    if (!plain) return flush();
    if (!run.length) runLine = seg.line + i;
    run.push(t);
  });
  flush();
  return out;
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
  const groupExcuses = (seg, rule) =>
    !!seg.group &&
    !quizGroups.has(seg.group) &&
    groups
      .get(seg.group)
      .some(
        (o) =>
          o !== seg &&
          !o.distractor &&
          o.kind === "prose" &&
          strongOnTopic(forMatching(o.text), rule),
      );

  const lintProse = (seg) => {
    const sentences = splitSentences(normaliseText(decode(seg.text)));
    sentences.forEach((sentence, si) => {
      const match = forMatching(sentence);
      const plain = forDisplay(sentence);
      const prev = sentences[si - 1];
      const next = sentences[si + 1];
      // The previous / next sentence of the same block excuses a claim only
      // if it carries a STRONG marker about the SAME rule's topic. A sentence
      // that opens with "But" is a turn away from the one before it, and
      // "That is wrong." only ever refers back to the sentence before it.
      const neighbourExcuse = (rule) =>
        groupExcuses(seg, rule) ||
        (prev &&
          !CONTRAST_START.test(sentence) &&
          strongOnTopic(forMatching(prev), rule)) ||
        (next &&
          (strongOnTopic(forMatching(next), rule) ||
            ANAPHORA_RE.test(forMatching(next))));
      // A question asserts nothing ("Can it be exactly-once?").
      const isQuestion = /\?["')]?$/.test(sentence.trim());
      for (const [rule, patterns] of [
        ["R1", R1_PROSE],
        ["R2", R2_PROSE],
      ]) {
        if (rule === "R2" && isQuestion) continue;
        const open = claimSpans(match, patterns).filter(
          (span) => !excusedInSentence(match, span, rule),
        );
        if (open.length && !neighbourExcuse(rule)) add(seg.line, rule, plain);
      }
    });
  };

  segments.forEach((seg, idx) => {
    if (seg.distractor) return;
    if (seg.kind === "prose") {
      lintProse(seg);
    } else {
      const { code, comments } = splitCode(seg.text);
      const hits = r1CodeMatches(code);
      if (!hits.length) return;
      // Only these may excuse code: its own comments, the paragraph that
      // labels it, the caveat right after it, or a sibling field of the same
      // data object. SQL keywords and weak words never do.
      const own = comments.join("\n");
      if (labelsWrong(own) || strongOnTopic(own, "R1")) return;
      const prose = (k) =>
        segments[k]?.kind === "prose" ? forMatching(segments[k].text) : "";
      const before1 = prose(idx - 1);
      const before2 = before1 ? prose(idx - 2) : "";
      for (const t of [before1, before2]) {
        if (t && (labelsWrong(t) || strongOnTopic(t, "R1"))) return;
      }
      if (strongOnTopic(prose(idx + 1), "R1")) return;
      if (groupExcuses(seg, "R1")) return;
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
  // Prose written inside a code block is still prose.
  for (const seg of segments)
    if (seg.kind === "code" && !seg.distractor)
      for (const p of fencedProse(seg)) lintProse(p);
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
