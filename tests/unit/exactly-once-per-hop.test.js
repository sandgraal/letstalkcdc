/**
 * Guard (P15-29): /exactly-once/ scopes the exactly-once claim per hop.
 *
 * Debezium 3.3+ documents an opt-in Kafka Connect exactly-once mode for source
 * connectors, with caveats; Kafka transactions do not reach external sinks.
 * So the page must not say exactly-once is flatly impossible / never possible,
 * must carry the per-hop table, and must keep the hedge Debezium's own page
 * carries. Reads the real page sources, not copies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import errata from "../../src/_data/errata.mjs";
import { parseAssistantYaml } from "../../lib/assistant-yaml.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const require = createRequire(import.meta.url);

const pageSrc = read("src/exactly-once/index.njk");
const pageData = require(
  path.join(ROOT, "src/exactly-once/index.11tydata.cjs"),
);
const errataPage = read("src/errata/index.njk");

/** Collapse whitespace so prose assertions survive prettier reflowing. */
const flat = (s) => s.replace(/\s+/g, " ");
const text = (html) =>
  flat(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&rsquo;|&#8217;/g, "'")
      .replace(/&amp;/g, "&"),
  ).trim();

/** All prose the reader can see on the page: body, hero, quiz. */
const visibleProse = text(
  [
    pageSrc,
    pageData.heroConfig.description,
    ...pageData.quizConfig.questions.flatMap((q) => [
      q.question,
      ...q.options,
      q.explanation,
    ]),
  ].join("\n"),
);

// Debezium's page lists KAFKA-17754 as open; that attribution is allowed, but
// no other phrasing may call it open (JIRA: Resolved/Fixed 2026-08-12).
const claimsOpen = (t) =>
  t.replace(/lists KAFKA-17734, KAFKA-17754 and KAFKA-17582 as open/g, "");
const KAFKA_17754_OPEN = /KAFKA-17754[^;,.]{0,40}\bopen\b/;

const sentences = (s) => s.split(/(?<=[.!?])\s+/);

describe("/exactly-once/ does not say exactly-once is flatly impossible", () => {
  const ABSOLUTE =
    /\b(impossible|never possible|not achievable|not possible|can(?:'|no)t be (?:achieved|exactly)|never (?:achievable|exactly))\b/i;
  // A flat-denial sentence must name the scope it is denying.
  const SCOPED =
    /(independent|heterogeneous|external sink|out of kafka|beyond kafka|as one guarantee)/i;

  it("scopes every 'impossible / not achievable' sentence to independent systems or an external sink", () => {
    const flagged = sentences(visibleProse).filter((s) => ABSOLUTE.test(s));
    for (const s of flagged) {
      expect(s, `unscoped denial: ${s}`).toMatch(SCOPED);
    }
  });

  it("never uses the old unqualified phrasings", () => {
    expect(visibleProse).not.toMatch(/end-to-end EOS is impossible/i);
    expect(visibleProse).not.toMatch(/EOS is impossible/i);
    expect(visibleProse).not.toMatch(/sometimes impossible/i);
    expect(visibleProse).not.toMatch(
      /exactly-once[^.]{0,40}is never possible/i,
    );
  });

  it("no longer says source connectors are flatly at-least-once into Kafka", () => {
    expect(pageSrc).not.toMatch(/ALO into Kafka\./);
  });
});

describe("/exactly-once/ per-hop table", () => {
  const section = pageSrc.slice(pageSrc.indexOf('id="per-hop"'));
  const table = section.slice(
    section.indexOf("<table>"),
    section.indexOf("</table>"),
  );
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const body = rows.slice(1);

  it("keeps the existing anchors and adds #per-hop", () => {
    for (const id of [
      "per-hop",
      "at-least-once",
      "demo",
      "idempotency",
      "outbox",
    ]) {
      expect(pageSrc, id).toContain(`id="${id}"`);
    }
  });

  it("has hop / can it be exactly-once / how / caveat columns", () => {
    const head = text(rows[0]);
    expect(head).toBe("Hop Can it be exactly-once? How Caveat");
  });

  it("answers for each hop, and says no to the external sink and to end to end", () => {
    expect(body).toHaveLength(4);
    for (const r of body) {
      expect([...r.matchAll(/<t[dh][ >]/g)]).toHaveLength(4);
    }
    const [source, kafka, sink, e2e] = body.map(text);
    expect(source).toMatch(/^Source database . Kafka/);
    expect(source).toMatch(/Only if you opt in/);
    expect(kafka).toMatch(/Yes, inside Kafka/);
    expect(sink).toMatch(/^Kafka . an external sink/);
    expect(sink).toMatch(/No, not as delivery/);
    expect(sink).toMatch(/primary key/);
    expect(sink).toMatch(/log position/);
    expect(sink).toMatch(/delete markers/);
    expect(e2e).toMatch(/^End to end, across independent systems No /);
  });

  it("states the opt-in requirements", () => {
    const hop1 = text(body[0]);
    expect(hop1).toContain("KIP-618");
    expect(hop1).toContain("KIP-98");
    expect(hop1).toContain("3.3.0");
    expect(hop1).toContain("exactly.once.source.support=enabled");
    expect(hop1).toContain("exactly.once.support=required");
    expect(hop1).toContain("transaction.boundary=poll");
    expect(hop1).toContain("distributed mode");
    for (const db of [
      "MariaDB",
      "MongoDB",
      "MySQL",
      "Oracle",
      "PostgreSQL",
      "SQL Server",
    ]) {
      expect(hop1, db).toContain(db);
    }
  });

  it("keeps Debezium's own hedge next to the opt-in", () => {
    const hop1 = text(body[0]);
    expect(hop1).toMatch(/Off by default/);
    expect(hop1).toMatch(/at-least-once/);
    expect(hop1).toMatch(
      /no internal deduplication layer|has no internal deduplication/,
    );
    expect(hop1).toMatch(/unclear whether the implementation is fully correct/);
    expect(hop1).toMatch(/Jepsen/);
    for (const k of ["KAFKA-17734", "KAFKA-17754", "KAFKA-17582"]) {
      expect(hop1, k).toContain(k);
    }
  });

  it("does not call KAFKA-17754 open: it is resolved in JIRA (as of 2026-10-09)", () => {
    const hop1 = text(body[0]);
    expect(hop1).toMatch(
      /lists KAFKA-17734, KAFKA-17754 and KAFKA-17582 as open/,
    );
    expect(hop1).toMatch(
      /KAFKA-17754 .{0,80}is marked resolved in Apache JIRA/,
    );
    expect(hop1).toMatch(/the other two remain open/);
    expect(claimsOpen(hop1)).not.toMatch(KAFKA_17754_OPEN);
    expect(text(pageSrc)).not.toMatch(
      /KAFKA-17734, KAFKA-17754 and KAFKA-17582 are (still )?open/,
    );
  });

  it("Kafka to Kafka names the switches and the consumer isolation level", () => {
    const k = text(body[1]);
    expect(k).toMatch(/Yes, inside Kafka, when enabled/);
    expect(k).toContain("processing.guarantee=exactly_once_v2");
    expect(k).toContain("sendOffsetsToTransaction");
    expect(k).toContain("isolation.level=read_committed");
    expect(k).toContain("read_uncommitted");
  });

  it("says Kafka transactions stop at Kafka, and idempotent sinks are still required", () => {
    const sink = text(body[2]);
    expect(sink).toMatch(/Kafka's transaction does not reach into the sink/);
    expect(sink).toMatch(/required even if the first hop is exactly-once/);
  });

  it("does not contradict itself on offsets-in-the-sink-transaction", () => {
    const sink = text(body[2]);
    expect(sink).toMatch(/offsets in the sink's own transaction/);
    expect(sink).toMatch(
      /If you commit offsets separately from the sink write, a crash between the two replays the event/,
    );
    expect(sink).toMatch(/closes that window for this hop/);
    // The old unconditional wording is gone.
    expect(sink).not.toMatch(
      /A crash between the sink write and the offset commit replays/,
    );
  });

  it("keeps at-least-once as the default stance", () => {
    expect(text(pageSrc)).toMatch(/ALO stays the default stance/);
  });
});

describe("exactly-once per-hop errata and neighbours", () => {
  const entry = errata.find((e) => e.id === "exactly-once-per-hop-2026-10-09");

  it("records a dated errata entry shown on /exactly-once/ but not on /errata/", () => {
    expect(entry).toBeTruthy();
    expect(entry.dateModified).toBe("2026-10-09");
    expect(entry.urls).toContain("/exactly-once/");
    expect(entry.urls).not.toContain("/errata/");
    expect(entry.body).not.toMatch(/href="\//);
    const body = flat(entry.body);
    expect(body).toMatch(/3\.3/);
    expect(body).toMatch(/opt-in/);
    expect(body).toMatch(/at-least-once/);
    expect(body).toMatch(/unclear whether the implementation is fully correct/);
    expect(body).toMatch(
      /KAFKA-17754 .{0,80}is marked resolved in Apache JIRA/,
    );
    expect(claimsOpen(body)).not.toMatch(KAFKA_17754_OPEN);
  });

  it("bumps dateModified on the pages it changed", () => {
    for (const dir of ["exactly-once", "errata"]) {
      const data = require(path.join(ROOT, `src/${dir}/index.11tydata.cjs`));
      expect(data.dateModified >= "2026-10-09", dir).toBe(true);
    }
  });

  it("/errata/ no longer calls source connectors at-least-once without the opt-in", () => {
    const panel = flat(errataPage);
    expect(panel).not.toMatch(
      /Source connectors are at.least.once<\/strong> in practice/,
    );
    expect(panel).toMatch(/at.least.once<\/strong> by default/);
    expect(panel).toContain("{{ '/exactly-once/' | url }}#per-hop");
  });

  it("the assistant's exactly-once answer is per hop", () => {
    const kb = parseAssistantYaml(
      readFileSync(path.join(ROOT, "src/data/assistant.yml"), "utf8"),
    );
    const intent = kb.intents.find((i) => i.id === "exactly_once");
    expect(intent.answer).toMatch(/opt-in/);
    expect(intent.answer).toMatch(/3\.3/);
    expect(intent.answer).toMatch(/idempotent sinks/);
    expect(intent.links.some((l) => l.anchor === "#per-hop")).toBe(true);
  });
});
