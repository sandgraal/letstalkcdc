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
 * when the matched text is asserted without a negation, contrast or scoping
 * marker nearby.
 *
 * Everything here is a pure function of its inputs except `collectFiles` and
 * `lintTree`, which read the filesystem.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// ── Shared vocabulary ───────────────────────────────────────────────

const TS_WORDS =
  "ts_ms|updated_at|modified_at|event_time|created_at|op_ts|commit_ts|last_modified|\\w*timestamp";
/** A timestamp-like column reference, with an optional alias/path prefix. */
const TS_COL = `[\\w.:]*?(?:${TS_WORDS})`;

/**
 * Words that turn an apparent claim into teaching, a counter-example, a
 * caveat or a scoped statement. Matched on a sentence (prose) or on the code
 * block plus its neighbouring paragraphs (code).
 */
const CONTRAST =
  /\b(?:never|not|no|cannot|can't|don't|doesn't|isn't|aren't|won't|wouldn't|shouldn't|without|instead of|rather than|wrong|anti-?pattern|avoid|unsafe|bad|why|tie-?break|polling|unreliable|incorrect|mistake|bug|buggy|broken|fails?|failing|stale|skew|myth|caveat|only|misorder\w*|lose[sd]?|loses)\b|n't\b/i;

/** Extra markers that scope "exactly-once" to something narrower than a pipeline. */
const EOS_SCOPE =
  /\b(?:hop|per-hop|processing|effectively-once|claims?|claimed|vendors?|marketing|marketed|myths?|opt-?in|exactly\.once\.support|documents?|documented|documentation|docs|page|question|ask|asks|asking|answers?|option|choose|which|what|whether|within|inside|pub\/sub|pull[- ]subscriptions?|kafka streams|pulsar)\b/i;

// ── Rules ───────────────────────────────────────────────────────────

/** Prose patterns for R1 (timestamp decides which change wins). */
const R1_PROSE = [
  new RegExp(
    `\\b(?:latest|newest|most recent|highest|higher|largest|greatest|newer)[- ](?:event |record |commit |source )?(?:timestamps?|time|${TS_COL})\\b[^.]{0,25}\\bwins?\\b`,
    "i",
  ),
  new RegExp(
    `\\blast[- ]writer?[- ]wins\\b[^.]{0,40}\\b(?:timestamps?|${TS_COL}|clock)`,
    "i",
  ),
  new RegExp(
    `\\b(?:timestamps?|${TS_COL}|clock)\\b[^.]{0,40}\\blast[- ]writer?[- ]wins\\b`,
    "i",
  ),
  new RegExp(
    `\\border(?:s|ed|ing)?\\s+(?:\\w+\\s+)?by\\s+(?:the\\s+)?(?:event |record |commit |source |update |change )?(?:timestamps?|time\\b|${TS_COL}\\b)`,
    "i",
  ),
  new RegExp(
    `\\bsort(?:s|ed|ing)?\\s+(?:\\w+\\s+)?by\\s+(?:the\\s+)?(?:event |record |commit |source )?(?:timestamps?|${TS_COL}\\b)`,
    "i",
  ),
  new RegExp(
    `\\bcompar(?:e|es|ing)\\s+(?:the\\s+)?(?:\\w+\\s+)?(?:timestamps?|${TS_COL}\\b)`,
    "i",
  ),
  new RegExp(
    `\\b(?:keeps?|takes?|picks?|chooses?|applies|wins?)\\b[^.]{0,40}\\b(?:newest|latest|most recent|highest|largest)\\s+(?:event |record |commit )?(?:timestamps?|${TS_COL}\\b)`,
    "i",
  ),
  new RegExp(
    `\\b(?:newest|latest|highest|largest)\\s+${TS_COL}\\b[^.]{0,25}\\bwins?\\b`,
    "i",
  ),
];

/** Prose patterns for R2 (end-to-end exactly-once asserted). */
const R2_PROSE = [
  /\bend[- ]to[- ]end\s+exactly[- ]once\b/i,
  /\bexactly[- ]once\s+end[- ]to[- ]end\b/i,
  /\bguarantees?\s+exactly[- ]once\b/i,
  /\b(?:delivers?|provides?|achieves?|gives?|offers?|ensures?)\s+exactly[- ]once\b/i,
  /\bexactly[- ]once\s+delivery\b/i,
];

/**
 * R1 on a code block. Returns the matching source lines (as plain text) for
 * each construct that picks a winning row by a timestamp-like column.
 * Comment lines are removed before matching so a "-- never ORDER BY ts_ms"
 * comment is not itself a finding.
 */
function r1CodeMatches(code) {
  const hits = [];
  const stripped = code
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  const lineOf = (idx) => stripped.slice(0, idx).split("\n").length - 1;
  const push = (idx, why) => hits.push({ line: lineOf(idx), why });

  const tsIn = new RegExp(`(?:^|[^\\w])${TS_COL}\\b`, "i");

  // Window functions keyed on a timestamp.
  const win =
    /\b(?:ROW_NUMBER|RANK|DENSE_RANK|FIRST_VALUE|LAST_VALUE)\s*\([^)]*\)\s*OVER\s*\(((?:[^()]|\([^()]*\))*)\)/gi;
  for (const m of stripped.matchAll(win)) {
    const ob = /ORDER\s+BY\s+([\s\S]*)$/i.exec(m[1]);
    if (ob && tsIn.test(ob[1]))
      push(m.index, "window function ordered by a timestamp");
  }
  // QUALIFY on a timestamp.
  for (const m of stripped.matchAll(/\bQUALIFY\b[^;]*/gi)) {
    if (tsIn.test(m[0])) push(m.index, "QUALIFY keyed on a timestamp");
  }
  // DISTINCT ON (...) ... ORDER BY <timestamp>, and ORDER BY <timestamp> ... LIMIT 1.
  for (const m of stripped.matchAll(
    /\bORDER\s+BY\s+([^;]*?)(?=\bON\s+CONFLICT\b|\bLIMIT\b|;|\)|$)/gi,
  )) {
    if (!tsIn.test(m[1])) continue;
    const before = stripped.slice(Math.max(0, m.index - 600), m.index);
    const stmtStart = before.lastIndexOf(";");
    const stmtHead = before.slice(stmtStart + 1);
    const after = stripped.slice(
      m.index + m[0].length,
      m.index + m[0].length + 40,
    );
    if (/\bDISTINCT\s+ON\b/i.test(stmtHead))
      push(m.index, "DISTINCT ON ordered by a timestamp");
    else if (/^\s*LIMIT\s+1\b/i.test(after))
      push(m.index, "ORDER BY a timestamp LIMIT 1");
  }
  // Guard that compares two timestamp-like columns (t.ts_ms <= EXCLUDED.ts_ms).
  const guard = new RegExp(
    `${TS_COL}\\)?\\s*(?:<=|>=|<|>)\\s*[\\w.]*\\(?[\\w.:]*?(?:${TS_WORDS})\\b`,
    "gi",
  );
  for (const m of stripped.matchAll(guard)) {
    push(m.index, "guard compares two timestamps");
  }
  // GoldenGate-style max/min conflict resolution and MAX_BY on a timestamp.
  for (const m of stripped.matchAll(
    new RegExp(`\\b(?:USEMAX|USEMIN)\\s*\\(\\s*${TS_COL}\\s*\\)`, "gi"),
  )) {
    push(m.index, "conflict resolution by a timestamp");
  }
  for (const m of stripped.matchAll(
    new RegExp(
      `\\b(?:MAX_BY|ARG_MAX|ARRAY_AGG)\\s*\\([^)]*${TS_COL}[^)]*\\)`,
      "gi",
    ),
  )) {
    push(m.index, "winner picked by a timestamp aggregate");
  }
  return hits;
}

export const RULES = {
  R1: "timestamp-as-order: a timestamp decides which change wins",
  R2: "end-to-end exactly-once asserted",
};

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
  s.replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, (e) => {
    if (ENTITIES[e.toLowerCase()] !== undefined)
      return ENTITIES[e.toLowerCase()];
    const n = /^&#x([0-9a-f]+);$/i.exec(e)?.[1];
    if (n) return String.fromCodePoint(parseInt(n, 16));
    const d = /^&#(\d+);$/.exec(e)?.[1];
    return d ? String.fromCodePoint(Number(d)) : " ";
  });

/** Blank a region but keep newlines so line numbers survive. */
const blank = (s) => s.replace(/[^\n]/g, " ");

/** Block-level tags that end a paragraph for sentence purposes. */
const BLOCK_TAG =
  /^(?:p|li|ul|ol|dl|dt|dd|div|section|article|aside|header|footer|main|nav|details|summary|table|thead|tbody|tr|td|th|caption|figure|figcaption|blockquote|h[1-6]|br|hr|form|fieldset|legend|label|button|option|select)$/i;

/**
 * Sentinels mark text that is the title of an external citation (an
 * `<a href="https://...">` link). Rules ignore matches inside them: a link
 * titled "Debezium: exactly-once delivery" cites a page, it does not assert.
 */
const CITE_OPEN = "\uE001";
const CITE_CLOSE = "\uE002";

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

/**
 * Split an HTML/Nunjucks fragment into segments.
 *   { kind: "prose", text, line }  one per block-level element
 *   { kind: "code",  text, line }  one per <pre>
 * `baseLine` is the 1-based line of the fragment's first character.
 */
export function extractHtmlSegments(src, baseLine = 1) {
  // Nunjucks tags and comments: blank them so offsets are unchanged.
  let s = src
    .replace(/\{#[\s\S]*?#\}/g, blank)
    .replace(/\{%[\s\S]*?%\}/g, blank)
    .replace(/\{\{[\s\S]*?\}\}/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blank);
  const starts = lineStarts(s);
  const L = (off) => lineAt(starts, off) + baseLine - 1;
  const segments = [];
  let buf = "";
  let bufStart = -1;
  let citeDepth = 0;
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

  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
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
      const end = s.slice(pos).search(/<\/pre\s*>/i);
      const stop = end < 0 ? s.length : pos + end;
      const raw = s.slice(pos, stop).replace(/<[^>]+>/g, "");
      const text = decode(raw).replace(/^\n+/, "").replace(/\s+$/, "");
      const lead = s.slice(pos, stop).match(/^[\s]*/)[0];
      const startOff =
        pos + (lead.match(/^\s*(?:<[^>]+>\s*)*/)?.[0].length ?? 0);
      if (text) segments.push({ kind: "code", text, line: L(startOff) });
      pos =
        end < 0
          ? s.length
          : stop + s.slice(stop).match(/<\/pre\s*>/i)[0].length;
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
          citeDepth++;
        }
      } else if (anchorExternal.length) {
        if (anchorExternal.pop()) {
          buf += CITE_CLOSE;
          citeDepth--;
        }
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
  void citeDepth;
  return segments;
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
      .replace(/(^|[^\w])_(\S[^_]*?)_(?=[^\w]|$)/g, "$1$2")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
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

/**
 * JS/MJS/CJS data files: string literals are content, comments are not.
 * Each literal is run through the HTML extractor (template strings carry
 * markup). A multi-line literal that looks like SQL is kept as a code block.
 */
export function extractJsSegments(src) {
  const segments = [];
  const starts = lineStarts(src);
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
      if (out.trim().length >= 12) {
        if (/<[a-z][^>]*>/i.test(out)) {
          segments.push(
            ...extractHtmlSegments(out, line).map((x) => ({ ...x, group })),
          );
        } else if (
          out.includes("\n") &&
          /\b(?:SELECT|MERGE|INSERT|UPDATE|CREATE)\b/.test(out)
        ) {
          segments.push({ kind: "code", text: out.trim(), line, group });
        } else {
          segments.push({
            kind: "prose",
            text: out.replace(/\s+/g, " ").trim(),
            line,
            group,
          });
        }
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return segments;
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
  if (ext === ".mjs" || ext === ".cjs" || ext === ".js")
    return extractJsSegments(content);
  if (ext === ".yml" || ext === ".yaml") return extractYamlSegments(content);
  const fm = extractFrontMatter(content);
  return [...fm.segments, ...extractHtmlSegments(fm.body)];
}

// ── Sentences ───────────────────────────────────────────────────────

const ABBREV = /\b(e\.g|i\.e|vs|etc|approx|cf|v|no|fig|incl|al)\./gi;

/** Split prose into sentences. A sentence never spans two segments. */
export function splitSentences(text) {
  const guarded = text.replace(ABBREV, (a) => a.replace(".", "\uE004"));
  return guarded
    .split(/(?<=[.!?]["')\uE002]?)\s+(?=[A-Z0-9"'(\uE001`])/)
    .map((x) => x.replace(/\uE004/g, ".").trim())
    .filter(Boolean);
}

/** Text with external-citation titles blanked, for matching only. */
const forMatching = (s) =>
  s.replace(
    new RegExp(`${CITE_OPEN}[^${CITE_CLOSE}]*${CITE_CLOSE}`, "g"),
    (c) => " ".repeat(c.length),
  );
const forDisplay = (s) => s.replace(/[\uE001\uE002]/g, "");

// ── Linting ─────────────────────────────────────────────────────────

/**
 * Lint one file's content.
 * @returns {{file:string,line:number,rule:string,text:string}[]}
 */
export function lintContent(file, content) {
  const segments = extractSegments(file, content);
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
  const groupText = new Map();
  for (const seg of segments) {
    if (seg.group)
      groupText.set(
        seg.group,
        `${groupText.get(seg.group) ?? ""} ${forDisplay(seg.text)}`,
      );
  }

  segments.forEach((seg, idx) => {
    if (seg.kind === "prose") {
      const sentences = splitSentences(seg.text);
      sentences.forEach((sentence, si) => {
        const match = forMatching(sentence);
        const plain = forDisplay(sentence);
        // Contrast may sit in the previous or next sentence of the same block.
        const near = seg.group
          ? groupText.get(seg.group)
          : [sentences[si - 1], sentence, sentences[si + 1]]
              .filter(Boolean)
              .map(forDisplay)
              .join(" ");
        if (R1_PROSE.some((re) => re.test(match)) && !CONTRAST.test(near)) {
          add(seg.line, "R1", plain);
        }
        if (
          R2_PROSE.some((re) => re.test(match)) &&
          !CONTRAST.test(near) &&
          !EOS_SCOPE.test(near)
        ) {
          add(seg.line, "R2", plain);
        }
      });
    } else {
      const hits = r1CodeMatches(seg.text);
      if (!hits.length) return;
      // The block's own comments, and the paragraphs around it, may label it
      // as the wrong/broken/polling example.
      const around = [
        seg.text,
        segments[idx - 2]?.kind === "prose" ? segments[idx - 2].text : "",
        segments[idx - 1]?.kind === "prose" ? segments[idx - 1].text : "",
        segments[idx + 1]?.kind === "prose" ? segments[idx + 1].text : "",
      ]
        .map(forDisplay)
        .join("\n");
      if (CONTRAST.test(around)) return;
      if (seg.group && CONTRAST.test(groupText.get(seg.group) ?? "")) return;
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
const CONTENT_EXT = /\.(?:njk|md|yml)$|\.11tydata\.cjs$/;

/** Content files under `root`, as repo-relative posix paths, sorted. */
export function collectFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(full);
      } else if (CONTENT_EXT.test(name)) {
        out.push(full);
      } else if (
        path.relative(root, dir).split(path.sep).join("/") === "src/_data" &&
        name.endsWith(".mjs")
      ) {
        out.push(full);
      }
    }
  };
  walk(path.join(root, "src"));
  out.push(path.join(root, "README.md"));
  return out
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .sort();
}

/** Lint the real tree. Returns applyAllowlist's shape plus the file count. */
export function lintTree(root, allow = []) {
  const files = collectFiles(root);
  const all = files.flatMap((f) =>
    lintContent(f, readFileSync(path.join(root, f), "utf8")),
  );
  return { ...applyAllowlist(all, allow), fileCount: files.length };
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
