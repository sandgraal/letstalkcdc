/**
 * Guard for /deletes-stay-deleted/ (content-gap plan M4).
 *
 * Reads the real page source, its data file, the series registration and the
 * assistant knowledge base. Three kinds of check:
 *   - structure: the sections a reader needs are there, one h1, front matter
 *     within the SEO limits, every internal link resolves;
 *   - wording: the page never teaches a timestamp as the ordering key,
 *     promises end-to-end exactly-once, offers a physical delete as the safe
 *     fix, or promises regulatory compliance;
 *   - behaviour: the SQL printed on the page is executed against SQLite (when
 *     this Node has `node:sqlite`) and must give the rows the page claims.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import series from "../../src/_data/series.mjs";
import glossary from "../../src/_data/glossary.mjs";
import { matchIntent } from "../../src/js/assistant-matcher.js";
import { parseAssistantYaml } from "../../lib/assistant-yaml.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const PAGE_DIR = "src/deletes-stay-deleted";
const source = read(`${PAGE_DIR}/index.njk`);
const data = require(path.join(ROOT, PAGE_DIR, "index.11tydata.cjs"));

const frontMatter = (() => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(source);
  expect(m, "front matter").toBeTruthy();
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_]+):\s*"?(.*?)"?\s*$/.exec(line);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
})();
const body = source.replace(/^---\n[\s\S]*?\n---\n/, "");

const ENTITIES = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&quot;": '"',
  "&nbsp;": " ",
};
const decode = (s) =>
  s.replace(/&[a-z]+;/g, (e) => (e in ENTITIES ? ENTITIES[e] : e));
/** Visible text: tags dropped, entities decoded, whitespace collapsed. */
const text = (html) =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
/** Everything a reader sees on the page, including the quiz data. */
const prose = text(body.replace(/\{\{[\s\S]*?\}\}/g, " "));
const quizProse = JSON.stringify(data.quizConfig);
const allText = `${prose} ${quizProse} ${data.heroConfig.description}`;

const codeBlocks = [
  ...body.matchAll(/<code class="language-sql">([\s\S]*?)<\/code>/g),
].map((m) => decode(m[1]));

describe("front matter and registration", () => {
  it("has a title of at most 50 characters and a description of at most 160", () => {
    expect(frontMatter.title.length).toBeGreaterThan(0);
    expect(frontMatter.title.length).toBeLessThanOrEqual(50);
    expect(frontMatter.description.length).toBeGreaterThanOrEqual(120);
    expect(frontMatter.description.length).toBeLessThanOrEqual(160);
    expect(frontMatter.canonicalPath).toBe("/deletes-stay-deleted/");
    expect(frontMatter.layout).toBe("base.njk");
  });

  it("dates the page 2026-10-09 in its data file", () => {
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
  });

  it("is registered once in series.mjs with a matching key and href", () => {
    const entries = series.filter((s) => s.key === data.seriesKey);
    expect(entries).toHaveLength(1);
    expect(entries[0].href).toBe("deletes-stay-deleted/");
    expect(entries[0].title).toBe(data.heroConfig.title);
    expect(entries[0].skillLevel).toBe(data.heroConfig.skillLevel);
  });

  it("has exactly one h1: the hero supplies it and the template adds none", () => {
    expect(body).not.toMatch(/<h1[\s>]/i);
    expect(body).toMatch(/ui\.hero\(heroConfig\)/);
    expect(data.heroConfig.title).toBe(frontMatter.title);
  });

  it("hero actions point at sections that exist", () => {
    for (const a of data.heroConfig.actions) {
      expect(a.href).toMatch(/^#/);
      expect(body, a.href).toContain(`id="${a.href.slice(1)}"`);
    }
  });
});

describe("required sections", () => {
  const SECTIONS = [
    "start",
    "three-deletes",
    "resurrection",
    "trace",
    "purge",
    "erasure",
    "monday",
    "limits",
    "resources",
  ];

  it.each(SECTIONS)("section #%s has a heading it is labelled by", (id) => {
    const re = new RegExp(
      `<section id="${id}" aria-labelledby="${id}-title">\\s*<h2 id="${id}-title">`,
    );
    expect(body).toMatch(re);
  });

  it("sections appear in teaching order", () => {
    const at = SECTIONS.map((id) => body.indexOf(`<section id="${id}"`));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("has the three kinds of delete, both trace tables and the restore rule", () => {
    expect(prose).toMatch(/Source DELETE event/);
    expect(prose).toMatch(/Kafka tombstone/);
    expect(prose).toMatch(/Sink delete marker/);
    expect(body).toContain('id="trace-stream"');
    expect(body).toContain('id="trace-sink"');
    expect(body).toContain('id="backups"');
    expect(prose).toMatch(/restore rule/i);
  });

  it("names the control and the documentation for each store in the trace", () => {
    for (const needle of [
      "delete.retention.ms",
      "tombstones.on.delete",
      "errors.deadletterqueue.topic.name",
      "delta.deletedFileRetentionDuration",
      "delta.logRetentionDuration",
      "VACUUM",
      "expireSnapshots",
      "history.expire.max-snapshot-age-ms",
      "upsert_stream_apply_watermark",
      "DATA_RETENTION_TIME_IN_DAYS",
      "Fail-safe",
      "pipelines.cdc.tombstoneGCThresholdInSeconds",
    ]) {
      expect(prose, needle).toContain(needle);
    }
  });

  it("has a what-to-do-Monday checklist of at least eight steps", () => {
    const section = body.slice(
      body.indexOf('<section id="monday"'),
      body.indexOf('<section id="limits"'),
    );
    expect(section.match(/<li>/g).length).toBeGreaterThanOrEqual(8);
  });

  it("says what was not tested", () => {
    const section = text(
      body.slice(
        body.indexOf('<section id="limits"'),
        body.indexOf("</section>", body.indexOf('<section id="limits"')),
      ),
    );
    expect(section).toMatch(/No vendor service was run/);
    expect(section).toMatch(/SQLite only/);
    expect(section).toMatch(/Check your version/);
  });
});

describe("GDPR section: states limits, quotes the official text, promises nothing", () => {
  const erasure = text(
    body.slice(
      body.indexOf('<section id="erasure"'),
      body.indexOf('<section id="monday"'),
    ),
  );

  it("says it is not legal advice and that a lawyer decides", () => {
    expect(prose).toMatch(/not legal advice/i);
    expect(erasure).toMatch(/lawyer/i);
    expect(erasure).toMatch(/data protection officer|lawyer/i);
  });

  it("cites Article 17, the 17(3) exceptions, 'without undue delay', Article 19 and 12(3)", () => {
    expect(erasure).toContain("Article 17(1)");
    expect(erasure).toContain("Article 17(3)");
    expect(erasure).toContain("without undue delay");
    expect(erasure).toContain("legal obligation");
    expect(erasure).toContain("legal claims");
    expect(erasure).toContain("Article 19");
    expect(erasure).toContain("disproportionate effort");
    expect(erasure).toContain("Article 12(3)");
    expect(erasure).toContain("within one month");
  });

  it("covers backups and retention copies as separate stores", () => {
    expect(erasure).toMatch(
      /Backups, replicas, exports and archives are separate stores/,
    );
    expect(erasure).toMatch(/does not remove anything from them/);
  });

  it("links the official EUR-Lex text, not an unofficial reproduction", () => {
    expect(body).toContain("https://eur-lex.europa.eu/eli/reg/2016/679/oj");
    expect(body).not.toMatch(/gdpr-info\.eu/i);
  });
});

describe("banned wording", () => {
  it("never teaches a timestamp or a Kafka offset as the ordering key", () => {
    expect(allText).not.toMatch(/\bby\s+ts_ms\b/i);
    expect(allText).not.toMatch(/\bts_ms\b/i);
    expect(allText).not.toMatch(
      /order(?:ed|ing)?\s+by\s+(?:the\s+)?(?:timestamp|op_ts|updated_at|offset)/i,
    );
    expect(allText).not.toMatch(/(?:latest|newest) timestamp wins/i);
    expect(prose).toMatch(/never by a timestamp or a Kafka offset/);
  });

  it("never claims end-to-end exactly-once is achievable", () => {
    expect(allText).not.toMatch(
      /exactly-once[^.]{0,40}\b(?:is|are|can be|will be)\s+(?:achievable|guaranteed|possible|delivered)/i,
    );
    expect(allText).not.toMatch(/\bguarantees?\s+exactly-once/i);
    expect(allText).not.toMatch(
      /\bexactly-once\s+delivery\s+to\s+the\s+(?:warehouse|sink)/i,
    );
    expect(prose).toMatch(
      /End-to-end exactly-once across independent systems is not achievable/,
    );
  });

  it("never offers a physical delete as the safe fix", () => {
    expect(allText).not.toMatch(
      /\b(?:simply|just)\s+(?:hard[- ])?delete\s+the\s+row/i,
    );
    expect(allText).not.toMatch(
      /\b(?:hard|physical)\s+delete\s+(?:is|as)\s+(?:the\s+)?(?:safe|fix|solution)/i,
    );
    expect(allText).not.toMatch(/\bsafe fix\b/i);
    // It says the opposite, and keeps the one allowed physical delete (the purge) labelled.
    expect(prose).toMatch(
      /Sink A removed the stored position along with the row/,
    );
    const deletes = codeBlocks.filter((b) => /\bDELETE\s+FROM\b/i.test(b));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatch(/Physical delete \(purge\)/);
    expect(deletes[0]).toMatch(
      /WHERE is_deleted AND source_lsn < :purge_below/,
    );
  });

  it("never promises compliance", () => {
    for (const re of [
      /\bGDPR[- ]compliant\b/i,
      /\bGDPR[- ]ready\b/i,
      /\b(?:guarantees?|ensures?|assures?|achieves?|provides?)\s+(?:GDPR\s+|full\s+|legal\s+|regulatory\s+)?compliance\b/i,
      /\b(?:makes?|keeps?)\s+you\s+(?:fully\s+)?compliant\b/i,
      /\bfully compliant\b/i,
      /\bsatisf(?:y|ies)\s+(?:the\s+)?(?:GDPR|Article 17|the regulation)\b/i,
      /\bcompliance is (?:guaranteed|assured|achieved)\b/i,
    ]) {
      expect(allText).not.toMatch(re);
    }
    expect(prose).toMatch(
      /Nothing here promises that following it satisfies any regulation/,
    );
  });

  it("does not use the banned filler or emojis", () => {
    expect(allText).not.toMatch(
      /\b(?:seamless(?:ly)?|robust|leverage|game-?changer)\b/i,
    );
    expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe("links", () => {
  const hrefs = [...body.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

  it("has no hardcoded site-absolute or http links; internal links use the url filter", () => {
    for (const h of hrefs) {
      expect(h, h).not.toMatch(/^\//);
      expect(h, h).not.toMatch(/^http:/);
    }
  });

  const internal = hrefs
    .map((h) => /^\{\{\s*'([^']+)'\s*\|\s*url\s*\}\}(.*)$/.exec(h))
    .filter(Boolean)
    .map((m) => {
      // '/glossary/#tombstone' | url  and  '/partitioning/' | url }}#recon
      const [p, inlineHash = ""] = m[1].split("#");
      const hash = inlineHash || (m[2] ? m[2].replace(/^#/, "") : "");
      return { path: p, hash };
    });

  it("links to the pages the plan names", () => {
    const paths = new Set(internal.map((l) => l.path));
    for (const want of [
      "/security/",
      "/event-envelope/",
      "/materialization/",
      "/merge-cookbook/",
      "/partitioning/",
      "/dlq-triage/",
      "/use-cases/",
      "/exactly-once/",
      "/glossary/",
    ]) {
      expect(paths.has(want), want).toBe(true);
    }
  });

  it("resolves every internal link and anchor", () => {
    expect(internal.length).toBeGreaterThan(15);
    for (const { path: p, hash } of internal) {
      // The playground is a separate published artifact (playground/), not a
      // page under src/. Its deep links (?try=<id>) are covered by its own tests.
      if (p === "/playground/") {
        expect(existsSync(path.join(ROOT, "playground", "index.html"))).toBe(
          true,
        );
        continue;
      }
      const dir = path.join(ROOT, "src", p.replace(/^\/|\/$/g, ""));
      const file = path.join(dir, "index.njk");
      expect(existsSync(file), `${p} -> ${file}`).toBe(true);
      if (!hash) continue;
      if (p === "/glossary/") {
        expect(
          glossary.some((g) => g.slug === hash),
          `glossary slug ${hash}`,
        ).toBe(true);
      } else {
        expect(readFileSync(file, "utf8"), `${p}#${hash}`).toContain(
          `id="${hash}"`,
        );
      }
    }
  });

  it("resolves every in-page anchor", () => {
    for (const h of hrefs.filter((x) => x.startsWith("#"))) {
      expect(body, h).toContain(`id="${h.slice(1)}"`);
    }
  });

  it("keeps external links to https, inside Further resources, with rel=noopener", () => {
    const resourcesAt = body.indexOf('<section id="resources"');
    const externals = [...body.matchAll(/<a href="(https:[^"]+)"([^>]*)>/g)];
    expect(externals.length).toBeGreaterThanOrEqual(20);
    for (const m of externals) {
      expect(m.index, m[1]).toBeGreaterThan(resourcesAt);
      expect(m[2], m[1]).toContain('rel="noopener"');
    }
  });

  it("links the vendor documentation for each trace-table control", () => {
    for (const host of [
      "kafka.apache.org/43/configuration/topic-configs/",
      "kafka.apache.org/43/design/design/",
      "debezium.io/documentation/reference/stable/connectors/postgresql.html",
      "debezium.io/documentation/reference/stable/connectors/jdbc.html",
      "docs.delta.io/delta-batch/",
      "docs.delta.io/delta-utility/",
      "iceberg.apache.org/docs/latest/maintenance/",
      "iceberg.apache.org/spec/",
      "docs.cloud.google.com/bigquery/docs/change-data-capture",
      "docs.cloud.google.com/bigquery/docs/time-travel",
      "docs.snowflake.com/en/user-guide/data-time-travel",
      "docs.snowflake.com/en/user-guide/data-failsafe",
    ]) {
      expect(body, host).toContain(`https://${host}`);
    }
  });
});

describe("inbound links and the assistant", () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n);
      return statSync(f).isDirectory() ? walk(f) : [f];
    });

  it("is linked from at least three other lessons", () => {
    const linkers = walk(path.join(ROOT, "src"))
      .filter((f) => f.endsWith(".njk") && !f.includes("deletes-stay-deleted"))
      .filter((f) => readFileSync(f, "utf8").includes("/deletes-stay-deleted/"))
      .map((f) => path.relative(ROOT, f));
    expect(linkers.length).toBeGreaterThanOrEqual(3);
    for (const want of [
      "src/security/index.njk",
      "src/materialization/index.njk",
    ]) {
      expect(linkers).toContain(want);
    }
  });

  const kb = parseAssistantYaml(read("src/data/assistant.yml"));
  const id = (q) => matchIntent(q, kb, null)?.id ?? null;

  it("has at least two intents for this module, each with 5+ triggers, whose links resolve here", () => {
    const mine = kb.intents.filter((i) =>
      i.links.some((l) => l.url === "/deletes-stay-deleted/"),
    );
    expect(mine.map((i) => i.id).sort()).toEqual([
      "delete_resurrection",
      "erasure_stores",
      "tombstone_retention",
    ]);
    for (const intent of mine) {
      expect(intent.triggers.length, intent.id).toBeGreaterThanOrEqual(5);
      for (const l of intent.links.filter(
        (x) => x.url === "/deletes-stay-deleted/",
      )) {
        expect(l.anchor, intent.id).toBeTruthy();
        expect(body, `${intent.id} ${l.anchor}`).toContain(
          `id="${l.anchor.slice(1)}"`,
        );
      }
    }
  });

  it.each([
    ["why did my deleted row come back after a replay", "delete_resurrection"],
    ["when can I purge a delete marker", "delete_resurrection"],
    ["a late update after a delete resurrects the row", "delete_resurrection"],
    ["what does delete.retention.ms do", "tombstone_retention"],
    ["does a tombstone delete the row in the warehouse", "tombstone_retention"],
    ["the consumer missed the tombstone", "tombstone_retention"],
    [
      "right to be forgotten with delta vacuum and time travel retention",
      "erasure_stores",
    ],
    [
      "how long does delta time travel retention keep deleted data",
      "erasure_stores",
    ],
    ["do I need to expire snapshots for gdpr delete", "erasure_stores"],
  ])("%j reaches %s", (query, expected) => {
    expect(id(query)).toBe(expected);
  });

  it.each([
    ["what is a tombstone", "event_envelope"],
    ["gdpr right to erasure", "security_pii"],
    ["how do I upsert into the target table", "materialization"],
    ["mongodb retention", "non_relational"],
  ])("does not take over %j (still %s)", (query, expected) => {
    expect(id(query)).toBe(expected);
  });

  it("no longer teaches 'apply deletes as tombstones' in the older intents", () => {
    const yml = read("src/data/assistant.yml");
    expect(yml).not.toMatch(/Apply deletes as tombstones/);
    expect(yml).not.toMatch(/Soft deletes are stored as explicit tombstones/);
  });
});

describe("quiz", () => {
  const q = data.quizConfig;

  it("has 4 well-formed questions with an explanation each", () => {
    expect(q.questions).toHaveLength(4);
    for (const item of q.questions) {
      expect(item.options.length).toBeGreaterThanOrEqual(4);
      const n = Number(item.correct);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(item.options.length);
      expect(item.explanation.length).toBeGreaterThan(60);
    }
  });

  it("does not always put the right answer in the same place", () => {
    expect(new Set(q.questions.map((x) => x.correct)).size).toBeGreaterThan(1);
  });
});

/**
 * Execute the SQL printed on the page. `node:sqlite` is available without a
 * flag from Node 22.13, which is the floor in package.json "engines", so this
 * block always runs.
 */
const sqlite = require("node:sqlite");

describe("the SQL on the page, executed against SQLite", () => {
  const schemaBlock = codeBlocks.find((b) => /CREATE TABLE customers/.test(b));
  const purgeBlock = codeBlocks.find((b) =>
    /Physical delete \(purge\)/.test(b),
  );

  const create = () => {
    const db = new sqlite.DatabaseSync(":memory:");
    const ddl = schemaBlock.match(/CREATE TABLE customers \([\s\S]*?\);/)[0];
    const view = schemaBlock.match(
      /CREATE VIEW customers_current AS[\s\S]*?;/,
    )[0];
    db.exec(ddl);
    db.exec(view);
    const upsert = schemaBlock.match(/INSERT INTO customers[\s\S]*?;/)[0];
    expect(upsert).toContain("VALUES (7, 'b@example.com', FALSE, 140)");
    const apply = (email, deleted, lsn) =>
      db.exec(
        upsert.replace(
          "VALUES (7, 'b@example.com', FALSE, 140)",
          `VALUES (7, ${email === null ? "NULL" : `'${email}'`}, ${deleted ? "TRUE" : "FALSE"}, ${lsn})`,
        ),
      );
    const row = () => db.prepare("SELECT * FROM customers WHERE id = 7").get();
    const visible = () => db.prepare("SELECT * FROM customers_current").all();
    return { db, apply, row, visible };
  };

  const normalise = (r) =>
    r && {
      id: Number(r.id),
      email: r.email,
      is_deleted: Number(r.is_deleted),
      source_lsn: Number(r.source_lsn),
    };

  it("sink A (physical delete) brings the row back with the old email", () => {
    const { db, apply, row } = create();
    apply("a@example.com", false, 100);
    apply("b@example.com", false, 140);
    db.exec("DELETE FROM customers WHERE id = 7"); // sink A's handling of op = 'd'
    expect(row()).toBeUndefined();
    apply("b@example.com", false, 140); // the late, older update
    expect(normalise(row())).toEqual({
      id: 7,
      email: "b@example.com",
      is_deleted: 0,
      source_lsn: 140,
    });
  });

  it("sink B (marker with position) keeps the key deleted through the late update and a repeated delete", () => {
    const { apply, row, visible } = create();
    apply("a@example.com", false, 100);
    expect(normalise(row())).toEqual({
      id: 7,
      email: "a@example.com",
      is_deleted: 0,
      source_lsn: 100,
    });
    apply("b@example.com", false, 140);
    expect(normalise(row())).toEqual({
      id: 7,
      email: "b@example.com",
      is_deleted: 0,
      source_lsn: 140,
    });
    apply(null, true, 180);
    expect(normalise(row())).toEqual({
      id: 7,
      email: null,
      is_deleted: 1,
      source_lsn: 180,
    });
    expect(visible()).toEqual([]);
    apply("b@example.com", false, 140);
    expect(normalise(row())).toEqual({
      id: 7,
      email: null,
      is_deleted: 1,
      source_lsn: 180,
    });
    apply(null, true, 180);
    expect(normalise(row())).toEqual({
      id: 7,
      email: null,
      is_deleted: 1,
      source_lsn: 180,
    });
    expect(visible()).toEqual([]);
  });

  it("a delete that arrives first inserts a marker, and the older insert and update are then skipped", () => {
    const { apply, row, visible } = create();
    apply(null, true, 180);
    expect(normalise(row())).toEqual({
      id: 7,
      email: null,
      is_deleted: 1,
      source_lsn: 180,
    });
    apply("a@example.com", false, 100);
    apply("b@example.com", false, 140);
    expect(normalise(row())).toEqual({
      id: 7,
      email: null,
      is_deleted: 1,
      source_lsn: 180,
    });
    expect(visible()).toEqual([]);
  });

  it("a newer insert after the delete revives the key", () => {
    const { apply, row, visible } = create();
    apply(null, true, 180);
    apply("c@example.com", false, 200);
    expect(normalise(row())).toEqual({
      id: 7,
      email: "c@example.com",
      is_deleted: 0,
      source_lsn: 200,
    });
    expect(visible()).toHaveLength(1);
  });

  it("the purge removes only markers strictly below the bound", () => {
    const { db, apply, row } = create();
    apply(null, true, 180);
    const purge = (bound) =>
      db.exec(
        purgeBlock
          .replaceAll(":purge_below", String(bound))
          .replace(/--.*$/gm, ""),
      );
    purge(180); // a marker AT the bound stays
    expect(row()).toBeDefined();
    purge(181);
    expect(row()).toBeUndefined();
    // live rows are never purged
    apply("c@example.com", false, 300);
    purge(10_000);
    expect(row()).toBeDefined();
  });
});
