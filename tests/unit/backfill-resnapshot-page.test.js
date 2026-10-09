/**
 * Guard for /backfill-resnapshot/ (content-gap plan batch 2, cluster F).
 *
 * Reads the real page source, its data file, the series registration and the
 * assistant knowledge base. Three kinds of check:
 *   - structure: the sections a reader needs are there, one h1, front matter
 *     within the SEO limits, every internal link resolves;
 *   - wording: the page never teaches a timestamp as the ordering key,
 *     promises end-to-end exactly-once, or promises a risk-free backfill;
 *   - behaviour: the SQL printed on the page is executed against SQLite
 *     (`node:sqlite`, no flag needed on the Node floor in package.json) and
 *     must give the rows the page claims. The straddling-transaction stamp
 *     and the payload checksum query are also run on PGlite (a
 *     PostgreSQL-compatible engine), because they use PostgreSQL syntax.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

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

const PAGE_DIR = "src/backfill-resnapshot";
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
  decode(html.replace(/<wbr>/g, "").replace(/<[^>]+>/g, " "))
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
    expect(frontMatter.canonicalPath).toBe("/backfill-resnapshot/");
    expect(frontMatter.layout).toBe("base.njk");
  });

  it("dates the page 2026-10-09 in its data file", () => {
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
  });

  it("is registered once in series.mjs with a matching key and href", () => {
    const entries = series.filter((s) => s.key === data.seriesKey);
    expect(entries).toHaveLength(1);
    expect(entries[0].href).toBe("backfill-resnapshot/");
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
    "question",
    "when",
    "choices",
    "modes",
    "incremental",
    "replay",
    "sql-reload",
    "rule",
    "ghosts",
    "idempotent",
    "cost",
    "verify",
    "runbook",
    "limits",
    "resources",
  ];

  it.each(SECTIONS)("section #%s has a heading it is labelled by", (id) => {
    const re = new RegExp(
      `<section id="${id}" aria-labelledby="${id}-title">\\s*<h2 id="${id}-title">`,
    );
    expect(body).toMatch(re);
  });

  it("sections appear in teaching order, with the quiz before the limits", () => {
    const at = SECTIONS.map((id) => body.indexOf(`<section id="${id}"`));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(body.indexOf("quizMacro.quiz(quizConfig)")).toBeGreaterThan(
      body.indexOf('<section id="runbook"'),
    );
    expect(body.indexOf("quizMacro.quiz(quizConfig)")).toBeLessThan(
      body.indexOf('<section id="limits"'),
    );
  });

  it("names the Debezium controls the choices depend on", () => {
    for (const needle of [
      "snapshot.mode",
      "initial_only",
      "always",
      "when_needed",
      "no_data",
      "recovery",
      "schema_only",
      "execute-snapshot",
      "data-collections",
      "additional-conditions",
      "incremental.snapshot.chunk.size",
      "incremental.snapshot.watermarking.strategy",
      "signal.data.collection",
      "pause-snapshot",
      "resume-snapshot",
      "stop-snapshot",
      "snapshot.fetch.size",
      "snapshot.max.threads",
      "--reset-offsets",
      "--to-earliest",
      "/connectors/{name}/offsets",
      "delete.retention.ms",
      "retention.ms",
    ]) {
      expect(prose, needle).toContain(needle);
    }
  });

  it("states the numbers it quotes from the documentation", () => {
    expect(prose).toMatch(/1024 rows/);
    expect(prose).toMatch(/10240 rows per batch/);
    expect(prose).toMatch(/retention\.ms<?\/?c?o?d?e?>? defaults to 7 days/);
    expect(prose).toMatch(/delete\.retention\.ms\S* \(default 1 day\)/);
  });

  it("has a runbook of at least ten steps", () => {
    const section = body.slice(
      body.indexOf('<section id="runbook"'),
      body.indexOf("quizMacro.quiz(quizConfig)"),
    );
    expect(section.match(/<li>/g).length).toBeGreaterThanOrEqual(10);
  });

  it("says what was not tested and what to check per version", () => {
    const start = body.indexOf('<section id="limits"');
    const section = text(body.slice(start, body.indexOf("</section>", start)));
    expect(section).toMatch(
      /No Debezium, Kafka, Kafka Connect or database service was run/,
    );
    expect(section).toMatch(/SQLite only/);
    expect(section).toMatch(/Check your version/);
  });
});

describe("banned wording", () => {
  it("never teaches a timestamp or a Kafka offset as the ordering key", () => {
    expect(allText).not.toMatch(/\bts_ms\b/i);
    expect(allText).not.toMatch(
      /order(?:ed|ing)?\s+by\s+(?:the\s+)?(?:timestamp|op_ts|updated_at|offset)/i,
    );
    expect(allText).not.toMatch(/(?:latest|newest) timestamp wins/i);
    expect(prose).toMatch(/never by a timestamp/);
  });

  it("never claims end-to-end exactly-once is achievable", () => {
    expect(allText).not.toMatch(
      /exactly-once[^.]{0,40}\b(?:is|are|can be|will be)\s+(?:achievable|guaranteed|possible|delivered)/i,
    );
    expect(allText).not.toMatch(/\bguarantees?\s+exactly-once/i);
    expect(allText).not.toMatch(/\bexactly-once\s+delivery\b/i);
    expect(prose).toMatch(
      /end-to-end exactly-once across independent systems is not achievable/,
    );
  });

  it("never promises a risk-free or duplicate-free backfill", () => {
    for (const re of [
      /\bzero[- ]downtime\b/i,
      /\bno duplicates\b/i,
      /\bwithout (?:any )?duplicates\b/i,
      /\bduplicate[- ]free\b/i,
      /\blossless\b/i,
      /\brisk[- ]free\b/i,
      /\bcannot fail\b/i,
      /\bguarantees?\s+(?:no|zero|that)\b/i,
    ]) {
      expect(allText).not.toMatch(re);
    }
    expect(prose).toMatch(/Duplicates during the overlap are expected/);
  });

  it("does not offer a physical delete or a loosened guard as the fix", () => {
    expect(allText).not.toMatch(/\bsafe fix\b/i);
    expect(allText).not.toMatch(
      /\b(?:simply|just)\s+(?:hard[- ])?delete\s+the\s+row/i,
    );
    expect(prose).toMatch(/Do not loosen the guard/);
    const deletes = codeBlocks.filter((b) => /\bDELETE\s+FROM\b/i.test(b));
    expect(deletes).toHaveLength(0);
  });

  it("does not use the banned filler or emojis", () => {
    expect(allText).not.toMatch(
      /\b(?:seamless(?:ly)?|robust|leverage|game-?changer)\b/i,
    );
    expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe("the stamp rule of choice 5", () => {
  const start = body.indexOf('<section id="sql-reload"');
  const section = text(body.slice(start, body.indexOf("</section>", start)));
  const rule = /The rule: (.*?)\. The reason/.exec(section)?.[1] ?? "";

  it("states the rule as a position at or below the first change of every open transaction", () => {
    expect(start).toBeGreaterThan(-1);
    expect(rule).toMatch(/stamp the loaded rows with a position at or below/);
    expect(rule).not.toMatch(/after the read|start position/i);
  });

  it("names restart_lsn and explains why positions below the start arrive", () => {
    expect(section).toMatch(/restart_lsn/);
    expect(section).toMatch(/arrives with positions below that start/);
    expect(section).toMatch(/at or below/);
  });

  it("never recommends stamping the start position or a position after the read", () => {
    expect(section).not.toMatch(
      /\b(?:should|must|always)\s+stamp\b[^.]*(?:start position|after the read)/i,
    );
    expect(section).toMatch(
      /Do not stamp the loaded rows with the position after the read/,
    );
  });

  it("carries the slot caveats and the wait-for-quiet procedure in order", () => {
    expect(section).toMatch(/wal_status is not lost/);
    expect(section).toMatch(
      /only costs you coverage: the reload repairs rows stored below the stamp and leaves rows stored above it/,
    );
    const steps = [
      "pg_current_wal_lsn()",
      "pg_snapshot_xmax(pg_current_snapshot())",
      "pg_snapshot_xmin(pg_current_snapshot())",
    ].map((t) => section.indexOf(t));
    expect(steps.every((i) => i > -1)).toBe(true);
    expect(steps).toEqual([...steps].sort((x, y) => x - y));
    expect(section).toMatch(/pg_prepared_xacts/);
    expect(section).toMatch(/txid_\*/);
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
      const [p, inlineHash = ""] = m[1].split("#");
      const hash = inlineHash || (m[2] ? m[2].replace(/^#/, "") : "");
      return { path: p, hash };
    });

  it("links to the pages the plan names", () => {
    const paths = new Set(internal.map((l) => l.path));
    for (const want of [
      "/snapshotting/",
      "/postgres-replication-slots/",
      "/test-your-pipeline/",
      "/merge-cookbook/",
      "/deletes-stay-deleted/",
      "/which-row-wins/",
      "/partitioning/",
      "/reconciliation-surgery/",
      "/ops-offsets/",
      "/glossary/",
    ]) {
      expect(paths.has(want), want).toBe(true);
    }
  });

  it("resolves every internal link and anchor", () => {
    expect(internal.length).toBeGreaterThan(20);
    for (const { path: p, hash } of internal) {
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
    expect(externals.length).toBeGreaterThanOrEqual(8);
    for (const m of externals) {
      expect(m.index, m[1]).toBeGreaterThan(resourcesAt);
      expect(m[2], m[1]).toContain('rel="noopener"');
    }
  });

  it("links the primary documentation for each claim family", () => {
    for (const host of [
      "debezium.io/documentation/reference/stable/connectors/postgresql.html",
      "debezium.io/documentation/reference/stable/connectors/mysql.html",
      "debezium.io/documentation/reference/stable/configuration/signalling.html",
      "debezium.io/documentation/reference/stable/connectors/jdbc.html",
      "kafka.apache.org/43/operations/basic-kafka-operations/",
      "kafka.apache.org/43/kafka-connect/user-guide/",
      "kafka.apache.org/43/configuration/topic-configs/",
      "kafka.apache.org/43/design/design/",
      "arxiv.org/abs/2010.12597",
    ]) {
      expect(body, host).toContain(`https://${host}`);
    }
  });

  it("does not link the playground: no scenario demonstrates a backfill", () => {
    expect(body).not.toMatch(/\/playground\//);
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
      .filter((f) => f.endsWith(".njk") && !f.includes("backfill-resnapshot"))
      .filter((f) => readFileSync(f, "utf8").includes("/backfill-resnapshot/"))
      .map((f) => path.relative(ROOT, f));
    expect(linkers.length).toBeGreaterThanOrEqual(3);
    for (const want of [
      "src/snapshotting/index.njk",
      "src/postgres-replication-slots/index.njk",
    ]) {
      expect(linkers).toContain(want);
    }
  });

  const kb = parseAssistantYaml(read("src/data/assistant.yml"));
  const id = (q, page = null) => matchIntent(q, kb, page)?.id ?? null;

  it("has at least two intents for this module, each with 5+ triggers, whose links resolve here", () => {
    const mine = kb.intents.filter((i) =>
      i.links.some((l) => l.url === "/backfill-resnapshot/"),
    );
    expect(mine.map((i) => i.id).sort()).toEqual([
      "backfill_overwrite",
      "backfill_reload",
    ]);
    for (const intent of mine) {
      expect(intent.triggers.length, intent.id).toBeGreaterThanOrEqual(5);
      for (const l of intent.links.filter(
        (x) => x.url === "/backfill-resnapshot/",
      )) {
        expect(l.anchor, intent.id).toBeTruthy();
        expect(body, `${intent.id} ${l.anchor}`).toContain(
          `id="${l.anchor.slice(1)}"`,
        );
      }
    }
  });

  it.each([
    ["how do I backfill a new sink", "backfill_reload"],
    ["how do I re-snapshot one table", "backfill_reload"],
    ["what does an execute-snapshot signal do", "backfill_reload"],
    ["blocking snapshot or incremental snapshot signal", "backfill_reload"],
    ["which snapshot.mode should I use", "backfill_reload"],
    ["my backfill overwrote newer rows", "backfill_overwrite"],
    ["the snapshot overwrote newer changes", "backfill_overwrite"],
    ["ghost rows after a re-snapshot", "backfill_overwrite"],
    ["is it safe to rerun a backfill", "backfill_overwrite"],
  ])("%j reaches %s", (query, expected) => {
    expect(id(query)).toBe(expected);
    // And from the page itself, where the module boost applies.
    expect(id(query, "backfill-resnapshot")).toBe(expected);
  });

  it("every trigger, typed verbatim, reaches its own intent", () => {
    for (const intent of kb.intents.filter((i) =>
      i.id.startsWith("backfill_"),
    )) {
      for (const t of intent.triggers) {
        expect(id(t), `${intent.id}: ${t}`).toBe(intent.id);
      }
    }
  });

  it.each([
    ["what is a snapshot", "snapshot_strategy"],
    ["what is the initial load", "snapshot_strategy"],
    ["how do offsets work", "offset_management"],
    ["why did my deleted row come back after a replay", "delete_resurrection"],
  ])("does not take over %j (still %s)", (query, expected) => {
    expect(id(query)).toBe(expected);
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
 * Execute the SQL printed on the page against SQLite. `node:sqlite` is
 * available without a flag from Node 22.13, the floor in package.json.
 */
const sqlite = require("node:sqlite");

describe("the SQL on the page, executed against SQLite", () => {
  const ruleBlock = codeBlocks.find((b) => /CREATE TABLE customers/.test(b));
  const sweepBlock = codeBlocks.find(
    (b) => /backfill_keys/.test(b) && /UPDATE customers/.test(b),
  );
  const verifyBlock = codeBlocks.find((b) =>
    /Suspect rows after the sweep/.test(b),
  );

  const ddl = ruleBlock.match(/CREATE TABLE customers \([\s\S]*?\);/)[0];
  const upsert = ruleBlock.match(/INSERT INTO customers[\s\S]*?;/)[0];
  const VALUES = "VALUES (7, 'a@example.com', FALSE, 150)";
  expect(upsert).toContain(VALUES);
  const upsertSql = upsert.replace(VALUES, "VALUES (?, ?, ?, ?)");

  const strip = (sql) => sql.replace(/--.*$/gm, "");
  const sweepSql = (b, { tenant = false } = {}) =>
    strip(
      tenant
        ? sweepBlock.replace("-- AND tenant_id = 5", "AND tenant_id = 5")
        : sweepBlock,
    )
      .replaceAll(":boundary", String(b.boundary))
      .replaceAll(":lo", String(b.lo))
      .replaceAll(":hi", String(b.hi));

  const create = () => {
    const db = new sqlite.DatabaseSync(":memory:");
    db.exec(ddl);
    db.exec("CREATE TABLE backfill_keys (id BIGINT PRIMARY KEY);");
    const stmt = db.prepare(upsertSql);
    // row = [id, email | null, isDeleted, lsn]
    const apply = ([id, email, del, lsn]) =>
      stmt.run(id, email, del ? 1 : 0, lsn);
    const rows = () =>
      db
        .prepare(
          "SELECT id, email, is_deleted, source_lsn FROM customers ORDER BY id",
        )
        .all()
        .map((r) => ({
          id: Number(r.id),
          email: r.email,
          deleted: Number(r.is_deleted) === 1,
          lsn: Number(r.source_lsn),
        }));
    return { db, apply, rows };
  };

  it("the guard skips an older backfill row and applies the same row only once", () => {
    const { apply, rows } = create();
    apply([7, "streamed@example.com", false, 200]);
    apply([7, "snapshot@example.com", false, 150]);
    expect(rows()).toEqual([
      { id: 7, email: "streamed@example.com", deleted: false, lsn: 200 },
    ]);
    apply([7, "streamed@example.com", false, 200]);
    expect(rows()).toHaveLength(1);
  });

  it("a delete marker blocks a backfill row from before the delete", () => {
    const { apply, rows } = create();
    apply([7, null, true, 180]);
    apply([7, "snapshot@example.com", false, 150]);
    expect(rows()).toEqual([{ id: 7, email: null, deleted: true, lsn: 180 }]);
  });

  describe("backfill rows and streamed changes in every order", () => {
    // The backfill read the table at boundary 150; the stream moved on.
    const EVENTS = [
      [1, "s1", false, 150], // backfill: unchanged since
      [2, "s2", false, 150], // backfill: changed later in the stream
      [3, "s3", false, 150], // backfill: deleted later in the stream
      [1, "u1", false, 120], // stream, older than the boundary (overlap)
      [2, "n2", false, 200], // stream: update after the boundary
      [3, null, true, 220], // stream: delete after the boundary
      [4, "n4", false, 210], // stream: new key, never in the backfill
    ];
    const EXPECTED = [
      { id: 1, email: "s1", deleted: false, lsn: 150 },
      { id: 2, email: "n2", deleted: false, lsn: 200 },
      { id: 3, email: null, deleted: true, lsn: 220 },
      { id: 4, email: "n4", deleted: false, lsn: 210 },
    ];

    const permutations = (items) => {
      const out = [];
      const walk = (rest, acc) => {
        if (rest.length === 0) return out.push(acc);
        rest.forEach((x, i) =>
          walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]),
        );
      };
      walk(items, []);
      return out;
    };

    it("ends in the same table for all 5,040 orders, replayed again in reverse", () => {
      expect(EVENTS).toHaveLength(7);
      const { db, apply, rows } = create();
      const orders = permutations(EVENTS);
      expect(orders).toHaveLength(5040);
      for (const order of orders) {
        db.exec("DELETE FROM customers");
        order.forEach(apply);
        [...order].reverse().forEach(apply); // duplicates, and reordered
        expect(rows()).toEqual(EXPECTED);
      }
    });
  });

  describe("ties: two different changes at one position", () => {
    it("the single-position guard keeps whichever arrives first, so ties need an ordinal", () => {
      const a = [1, "first-change", false, 150];
      const b = [1, "second-change", false, 150];
      const one = create();
      [a, b].forEach(one.apply);
      const two = create();
      [b, a].forEach(two.apply);
      expect(one.rows()[0].email).toBe("first-change");
      expect(two.rows()[0].email).toBe("second-change");
    });

    it("comparing (position, ordinal) converges in every order, with a backfill row in the mix", () => {
      const db = new sqlite.DatabaseSync(":memory:");
      db.exec(`CREATE TABLE customers (
        id BIGINT PRIMARY KEY, email TEXT, is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        source_lsn BIGINT NOT NULL, ordinal BIGINT NOT NULL)`);
      const stmt = db.prepare(`INSERT INTO customers VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
          is_deleted = EXCLUDED.is_deleted, source_lsn = EXCLUDED.source_lsn,
          ordinal = EXCLUDED.ordinal
        WHERE (customers.source_lsn, customers.ordinal)
            < (EXCLUDED.source_lsn, EXCLUDED.ordinal)`);
      const events = [
        [1, "backfill", 0, 150, 0], // the backfill row for key 1
        [1, "first-change", 0, 150, 1], // two different changes share position 150
        [1, "second-change", 0, 150, 2],
        [2, "backfill", 0, 150, 0],
        [2, "later", 0, 200, 0],
        [3, "backfill", 0, 150, 0],
        [3, null, 1, 150, 1], // a delete that shares the boundary position
      ];
      const permute = (items) =>
        items.length <= 1
          ? [items]
          : items.flatMap((x, i) =>
              permute([...items.slice(0, i), ...items.slice(i + 1)]).map(
                (rest) => [x, ...rest],
              ),
            );
      const orders = permute(events);
      expect(orders).toHaveLength(5040);
      for (const order of orders) {
        db.exec("DELETE FROM customers");
        order.forEach((e) => stmt.run(...e));
        const got = db
          .prepare("SELECT id, email, is_deleted FROM customers ORDER BY id")
          .all()
          .map((r) => [Number(r.id), r.email, Number(r.is_deleted)]);
        expect(got).toEqual([
          [1, "second-change", 0],
          [2, "later", 0],
          [3, null, 1],
        ]);
      }
    });

    it("loosening the guard to <= lets a late backfill row at the shared boundary revive a swept key", () => {
      const { db, apply, rows } = create();
      apply([5, "ghost", false, 100]);
      db.exec("INSERT INTO backfill_keys VALUES (1)");
      db.exec(
        strip(sweepBlock)
          .replaceAll(":boundary", "150")
          .replaceAll(":lo", "1")
          .replaceAll(":hi", "999"),
      );
      expect(rows()[0]).toMatchObject({ deleted: true, lsn: 150 });
      apply([5, "ghost", false, 150]);
      expect(rows()[0]).toMatchObject({ deleted: true }); // strict guard: stays deleted
      const loose = upsertSql.replace(
        "WHERE customers.source_lsn <",
        "WHERE customers.source_lsn <=",
      );
      expect(loose).not.toBe(upsertSql);
      db.prepare(loose).run(5, "ghost", 0, 150);
      expect(rows()[0]).toMatchObject({ deleted: false, email: "ghost" });
    });
  });

  describe("choice 5: the stamp of a SQL reload and a transaction that straddles the stream start", () => {
    // Stream start 150. A transaction opened at 130 changed key 9 (WAL record
    // at 140, below the start) and commits after the read, so the stream
    // delivers it with source_lsn 140. The read did not see it.
    const STREAMED = [9, "streamed-straddling", false, 140];
    const loaded = (stamp) => [9, "loaded", false, stamp];
    const outcome = (stamp, streamFirst) => {
      const { apply, rows } = create();
      const seq = streamFirst
        ? [STREAMED, loaded(stamp)]
        : [loaded(stamp), STREAMED];
      seq.forEach(apply);
      return rows()[0].email;
    };

    it("stamping the stream's start position makes the loaded row beat the change, in either order", () => {
      expect(outcome(150, false)).toBe("loaded");
      expect(outcome(150, true)).toBe("loaded");
    });

    it("stamping a lower bound (or the lowest position, for an empty target) lets the change win, in either order", () => {
      for (const stamp of [100, 0]) {
        expect(outcome(stamp, false)).toBe("streamed-straddling");
        expect(outcome(stamp, true)).toBe("streamed-straddling");
      }
    });

    it("a loaded row with the lowest stamp still fills a key the stream never touched", () => {
      const { apply, rows } = create();
      apply([4, "loaded-only", false, 0]);
      expect(rows()).toEqual([
        { id: 4, email: "loaded-only", deleted: false, lsn: 0 },
      ]);
    });

    // The same page statement on a PostgreSQL-compatible engine. One engine
    // for the whole block: a cold PGlite start is the slow part, and it can
    // exceed vitest's 5s default when the full suite is running.
    let pg;
    beforeAll(async () => {
      pg = new PGlite();
      await pg.waitReady;
    }, 60_000);
    afterAll(async () => pg?.close());

    it("on PGlite, the same statement gives the same outcomes", async () => {
      const literal = ([id, email, del, lsn]) =>
        upsert.replace(
          VALUES,
          `VALUES (${id}, ${email === null ? "NULL" : `'${email}'`}, ${del ? "TRUE" : "FALSE"}, ${lsn})`,
        );
      const run = async (stamp, streamFirst) => {
        await pg.exec("DROP TABLE IF EXISTS customers");
        await pg.exec(ddl);
        const seq = streamFirst
          ? [STREAMED, loaded(stamp)]
          : [loaded(stamp), STREAMED];
        for (const r of seq) await pg.exec(literal(r));
        const { rows } = await pg.query("SELECT email FROM customers");
        return rows[0].email;
      };
      expect(await run(150, false)).toBe("loaded");
      expect(await run(150, true)).toBe("loaded");
      expect(await run(100, false)).toBe("streamed-straddling");
      expect(await run(100, true)).toBe("streamed-straddling");
    }, 60_000);
  });

  describe("rows the snapshot never mentions", () => {
    const SCOPE = { boundary: 150, lo: 1, hi: 999 };
    // The sink before the backfill: key 5 was deleted at the source during the
    // gap and the delete was lost; key 5000 is outside the backfill's scope.
    const BEFORE = [
      [1, "old1", false, 100],
      [2, "old2", false, 100],
      [5, "ghost", false, 100],
      [5000, "outside", false, 100],
    ];
    const BACKFILL = [
      [1, "new1", false, 150],
      [2, "new2", false, 150],
    ];
    const loadKeys = (db, keys) => {
      db.exec("DELETE FROM backfill_keys");
      for (const k of keys) db.exec(`INSERT INTO backfill_keys VALUES (${k})`);
    };

    it("the backfill alone leaves the ghost live, and the sweep marks it deleted", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      BACKFILL.forEach(apply);
      loadKeys(db, [1, 2]);
      expect(rows().find((r) => r.id === 5)).toMatchObject({
        deleted: false,
        lsn: 100,
      });
      db.exec(sweepSql(SCOPE));
      expect(rows()).toEqual([
        { id: 1, email: "new1", deleted: false, lsn: 150 },
        { id: 2, email: "new2", deleted: false, lsn: 150 },
        { id: 5, email: null, deleted: true, lsn: 150 },
        { id: 5000, email: "outside", deleted: false, lsn: 100 },
      ]);
    });

    it("a late older update for the swept key cannot bring it back", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      BACKFILL.forEach(apply);
      loadKeys(db, [1, 2]);
      db.exec(sweepSql(SCOPE));
      apply([5, "ghost", false, 100]);
      expect(rows().find((r) => r.id === 5)).toMatchObject({ deleted: true });
    });

    it("rows the stream wrote after the boundary are never swept", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      apply([6, "new-after-boundary", false, 170]); // inserted after the key list was read
      loadKeys(db, [1, 2]);
      db.exec(sweepSql(SCOPE));
      expect(rows().find((r) => r.id === 6)).toMatchObject({ deleted: false });
    });

    it("running the backfill and the sweep twice changes nothing", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      loadKeys(db, [1, 2]);
      BACKFILL.forEach(apply);
      db.exec(sweepSql(SCOPE));
      const once = rows();
      BACKFILL.forEach(apply);
      db.exec(sweepSql(SCOPE));
      expect(rows()).toEqual(once);
    });

    it("a live key that is in the list but not yet refreshed is left alone", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      loadKeys(db, [1, 2]); // the backfill rows have not been applied yet
      db.exec(sweepSql(SCOPE));
      expect(rows().find((r) => r.id === 1)).toMatchObject({
        deleted: false,
        email: "old1",
        lsn: 100,
      });
      expect(rows().find((r) => r.id === 2)).toMatchObject({ deleted: false });
      expect(rows().find((r) => r.id === 5)).toMatchObject({ deleted: true });
    });

    it("an existing marker is not touched, and a row at exactly the boundary is not swept", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      apply([7, null, true, 120]); // a marker below the boundary, not in the list
      apply([8, "at-boundary", false, 150]); // live, at the boundary, not in the list
      loadKeys(db, [1, 2]);
      db.exec(sweepSql(SCOPE));
      expect(rows().find((r) => r.id === 7)).toEqual({
        id: 7,
        email: null,
        deleted: true,
        lsn: 120,
      });
      expect(rows().find((r) => r.id === 8)).toMatchObject({
        deleted: false,
        lsn: 150,
      });
    });

    it("under the runbook order the backfilled rows are exempt even if the list is partial", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      BACKFILL.forEach(apply); // load first, as in the runbook
      loadKeys(db, [1]); // key 2 missing from the list
      db.exec(sweepSql(SCOPE));
      expect(rows().find((r) => r.id === 1)).toMatchObject({ deleted: false });
      expect(rows().find((r) => r.id === 2)).toMatchObject({
        deleted: false,
        email: "new2",
      });
    });

    it("a key live at the source but missing from both the list and the load is swept and stays deleted", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      apply([6, "live-at-source", false, 100]);
      BACKFILL.forEach(apply);
      loadKeys(db, [1, 2]); // key 6 is in neither
      db.exec(sweepSql(SCOPE));
      expect(rows().find((r) => r.id === 6)).toMatchObject({
        deleted: true,
        lsn: 150,
      });
      apply([6, "live-at-source", false, 150]); // a later row at the same position
      expect(rows().find((r) => r.id === 6)).toMatchObject({
        deleted: true,
        email: null,
      });
    });

    it("a sweep before the load, with a list that lacks a key, deletes that key for good", () => {
      const { db, apply, rows } = create();
      BEFORE.forEach(apply);
      loadKeys(db, [1]); // key 2 missing from the list
      db.exec(sweepSql(SCOPE));
      expect(rows().find((r) => r.id === 1)).toMatchObject({ deleted: false });
      expect(rows().find((r) => r.id === 2)).toMatchObject({
        deleted: true,
        lsn: 150,
      });
      BACKFILL.forEach(apply); // the row for key 2 has position 150, not higher
      expect(rows().find((r) => r.id === 2)).toMatchObject({
        deleted: true,
        email: null,
      });
      expect(rows().find((r) => r.id === 1)).toMatchObject({
        deleted: false,
        email: "new1",
      });
    });

    it("the sweep must repeat the backfill's filter: a tenant-5 backfill must not delete tenant-6 rows", () => {
      const { db, apply, rows } = create();
      db.exec("ALTER TABLE customers ADD COLUMN tenant_id INTEGER");
      apply([20, "t5-ghost", false, 100]); // tenant 5, deleted at the source
      apply([21, "t5-live", false, 100]); // tenant 5, in the list
      apply([30, "t6-live", false, 100]); // tenant 6, never part of the backfill
      db.exec("UPDATE customers SET tenant_id = 5 WHERE id IN (20, 21)");
      db.exec("UPDATE customers SET tenant_id = 6 WHERE id = 30");
      loadKeys(db, [21]);
      const range = { boundary: 150, lo: 10, hi: 900 };
      // The printed filter line is a comment; without repeating it, tenant 6 is swept.
      const unfiltered = create();
      unfiltered.db.exec("ALTER TABLE customers ADD COLUMN tenant_id INTEGER");
      [
        [20, "t5-ghost", false, 100],
        [21, "t5-live", false, 100],
        [30, "t6-live", false, 100],
      ].forEach(unfiltered.apply);
      unfiltered.db.exec("INSERT INTO backfill_keys VALUES (21)");
      unfiltered.db.exec(sweepSql(range));
      expect(unfiltered.rows().find((r) => r.id === 30)).toMatchObject({
        deleted: true,
      });
      expect(sweepBlock).toContain("-- AND tenant_id = 5");
      db.exec(sweepSql(range, { tenant: true }));
      expect(rows().find((r) => r.id === 20)).toMatchObject({ deleted: true });
      expect(rows().find((r) => r.id === 21)).toMatchObject({ deleted: false });
      expect(rows().find((r) => r.id === 30)).toMatchObject({
        deleted: false,
        email: "t6-live",
      });
    });

    it("a boundary above the lower bound sweeps a row that a straddling transaction inserted", () => {
      const lowerBound = 100;
      const higher = 150;
      const run = (boundary) => {
        const { db, apply, rows } = create();
        loadKeys(db, [1]); // the key list was read before that transaction committed
        apply([8, "straddling-insert", false, 140]); // WAL record below `higher`
        db.exec(sweepSql({ boundary, lo: 1, hi: 999 }));
        return rows().find((r) => r.id === 8);
      };
      expect(run(higher)).toMatchObject({ deleted: true });
      expect(run(lowerBound)).toMatchObject({
        deleted: false,
        email: "straddling-insert",
      });
    });

    it("the suspect-row query counts exactly what the sweep would mark", () => {
      const { db, apply } = create();
      BEFORE.forEach(apply);
      BACKFILL.forEach(apply);
      loadKeys(db, [1, 2]);
      const suspects = strip(verifyBlock)
        .split(";")
        .map((s) => s.trim())
        .find((s) => /AS suspects/.test(s))
        .replaceAll(":boundary", "150")
        .replaceAll(":lo", "1")
        .replaceAll(":hi", "999");
      // Without the key list the query counts every live row below the boundary in scope.
      expect(Number(db.prepare(suspects).get().suspects)).toBe(1);
      db.exec(sweepSql(SCOPE));
      expect(Number(db.prepare(suspects).get().suspects)).toBe(0);
    });
  });

  it("the bucket query gives live rows and the highest position per 1000 keys", () => {
    const { db, apply } = create();
    [
      [1, "a", false, 150],
      [2, "b", false, 200],
      [3, null, true, 220], // a marker is not counted
      [1500, "c", false, 90],
    ].forEach(apply);
    const bucket = strip(verifyBlock).split(";")[0];
    expect(bucket).toMatch(/GROUP BY id \/ 1000/);
    const out = db
      .prepare(bucket)
      .all()
      .map((r) => ({
        bucket: Number(r.bucket),
        live: Number(r.live_rows),
        max: Number(r.max_lsn),
      }));
    expect(out).toEqual([
      { bucket: 0, live: 2, max: 200 },
      { bucket: 1, live: 1, max: 90 },
    ]);
  });

  describe("the payload checksum query, on PGlite", () => {
    const checksumBlock = codeBlocks.find((b) => /string_agg/.test(b));
    let pg;
    beforeAll(async () => {
      pg = new PGlite();
      await pg.exec(ddl);
    }, 60_000);
    afterAll(async () => pg?.close());

    it("hashes live rows per 1000-key bucket and ignores markers", async () => {
      await pg.exec(`
        INSERT INTO customers VALUES
          (1, 'a', FALSE, 150), (2, 'b', FALSE, 150),
          (3, NULL, TRUE, 160), (1500, 'c', FALSE, 150)`);
      const query = strip(checksumBlock)
        .split(";")
        .find((q) => /string_agg/.test(q));
      const { rows } = await pg.query(query);
      expect(rows.map((r) => [Number(r.bucket), Number(r.live_rows)])).toEqual([
        [0, 2],
        [1, 1],
      ]);
      // The page hashes id:email joined by commas; compute that by hand so a
      // changed expression on the page shows up here.
      const { rows: expected } = await pg.query(
        "SELECT md5('1:a,2:b') AS m, md5('1500:c') AS n",
      );
      expect(rows[0].checksum).toBe(expected[0].m);
      expect(rows[1].checksum).toBe(expected[0].n);
    }, 60_000);
  });
});
