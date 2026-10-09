/**
 * Guard for /transactional-outbox/ (content-gap plan module H).
 *
 * Reads the real page source, its data file, the series registration and the
 * assistant knowledge base. Three kinds of check:
 *   - structure: the sections a reader needs are there, one h1, front matter
 *     within the SEO limits, every internal link and anchor resolves;
 *   - wording: the page never teaches an event id, offset or timestamp as the
 *     ordering key, promises exactly-once delivery, or tells the reader to
 *     flag outbox rows with an UPDATE under the router;
 *   - behaviour: the consumer SQL printed on the page is executed against
 *     SQLite (`node:sqlite`, available without a flag from Node 22.13, the
 *     floor in package.json "engines") and must give the rows the page claims.
 *     The PostgreSQL-only SQL (UPDATE ... RETURNING in a CTE) was run on PGlite
 *     by hand; it is not run here because PGlite is not a dependency.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import series from "../../src/_data/series.mjs";
import site from "../../src/_data/site.mjs";
import glossary from "../../src/_data/glossary.mjs";
import { matchIntent } from "../../src/js/assistant-matcher.js";
import { parseAssistantYaml } from "../../lib/assistant-yaml.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const PAGE_DIR = "src/transactional-outbox";
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
const text = (html) =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
const prose = text(body.replace(/\{\{[\s\S]*?\}\}/g, " "));
const quizProse = JSON.stringify(data.quizConfig);
const allText = `${prose} ${quizProse} ${data.heroConfig.description}`;

/** The text of a code block by its id, entities decoded. */
const codeById = (id) => {
  const m = new RegExp(`id="${id}">([\\s\\S]*?)</code>`).exec(body);
  expect(m, `code block #${id}`).toBeTruthy();
  return decode(m[1]);
};

describe("front matter and registration", () => {
  it("has a title short enough for the full <title>, and a description of 120 to 160", () => {
    const full = `${frontMatter.title} | ${site.title}`;
    expect(frontMatter.title.length).toBeGreaterThan(0);
    expect(full.length).toBeLessThanOrEqual(60);
    expect(frontMatter.title.length).toBeLessThanOrEqual(50);
    expect(frontMatter.description.length).toBeGreaterThanOrEqual(120);
    expect(frontMatter.description.length).toBeLessThanOrEqual(160);
    expect(frontMatter.canonicalPath).toBe("/transactional-outbox/");
    expect(frontMatter.layout).toBe("base.njk");
  });

  it("dates the page 2026-10-09 in its data file", () => {
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
  });

  it("is registered once in series.mjs with a matching key and href", () => {
    const entries = series.filter((s) => s.key === data.seriesKey);
    expect(entries).toHaveLength(1);
    expect(entries[0].href).toBe("transactional-outbox/");
    expect(entries[0].title).toBe(data.heroConfig.title);
    expect(entries[0].skillLevel).toBe(data.heroConfig.skillLevel);
    expect(entries[0].description.length).toBeLessThanOrEqual(200);
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
    "dual-write",
    "table",
    "relay",
    "router",
    "duplicates",
    "consumer",
    "cleanup",
    "partitions",
    "testing",
    "eos",
    "try-it",
    "monday",
    "verified",
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

  it("puts every table inside its own horizontal scroll container", () => {
    const tables = [...body.matchAll(/<table/g)].length;
    expect(tables).toBeGreaterThanOrEqual(6);
    const wrapped = [
      ...body.matchAll(
        /<div style="overflow-x: auto"[^>]*data-table-scroll>\s*<table[\s\S]*?<\/table>\s*<\/div>/g,
      ),
    ];
    expect(wrapped.length).toBe(tables);
  });

  it("has a what-to-do-Monday checklist of at least eight steps", () => {
    const section = body.slice(
      body.indexOf('<section id="monday"'),
      body.indexOf('<section id="verified"'),
    );
    expect(section.match(/<li>/g).length).toBeGreaterThanOrEqual(8);
  });

  it("says what was run and what was not, and uses 'check your version'", () => {
    const section = text(
      body.slice(
        body.indexOf('<section id="verified"'),
        body.indexOf('<section id="resources"'),
      ),
    );
    expect(section).toMatch(/Run:/);
    expect(section).toMatch(/PGlite/);
    expect(section).toMatch(/SQLite/);
    expect(section).toMatch(/Not run:/);
    expect(section).toMatch(/Debezium, Kafka Connect and Kafka/);
    expect(section).toMatch(/Check your version/);
    expect(prose).toMatch(/not a tested result|I did not run it/);
  });
});

describe("the router content matches the Debezium reference", () => {
  it("names the SMT class and every option the page relies on", () => {
    for (const needle of [
      "io.debezium.transforms.outbox.EventRouter",
      "table.field.event.id",
      "table.field.event.key",
      "table.field.event.payload",
      "table.field.event.timestamp",
      "route.by.field",
      "route.topic.replacement",
      "table.expand.json.payload",
      "table.fields.additional.placement",
      "table.op.invalid.behavior",
      "tracing.span.context.field",
      "tracing.operation.name",
      "tracing.with.context.field.only",
    ]) {
      expect(body, needle).toContain(needle);
    }
  });

  it("states the documented defaults", () => {
    const cfg = text(
      body.slice(
        body.indexOf('<section id="router"'),
        body.indexOf('<section id="duplicates"'),
      ),
    );
    expect(cfg).toMatch(/table\.field\.event\.id id/);
    expect(cfg).toMatch(/table\.field\.event\.key aggregateid/);
    expect(cfg).toMatch(/route\.by\.field aggregatetype/);
    expect(cfg).toMatch(/outbox\.event\.\$\{routedByValue\}/);
    expect(cfg).toMatch(/table\.expand\.json\.payload false/);
    expect(cfg).toMatch(/table\.op\.invalid\.behavior warn/);
    expect(cfg).toMatch(/tracingspancontext/);
  });

  it("says what the router drops and refuses, and that the source position is not forwarded", () => {
    expect(prose).toMatch(/automatically filters out DELETE operations/);
    expect(prose).toMatch(/expected to be inserts/);
    expect(prose).toMatch(/does not forward the source position/i);
    expect(prose).toMatch(/not compatible with the MongoDB connector/);
    expect(prose).toMatch(/3\.0\.0\.Final/);
  });

  it("scopes the version claim and does not hide the renamed option", () => {
    expect(prose).toMatch(/1\.9, 2\.7, 3\.0, 3\.3 and 3\.7/);
    expect(prose).toMatch(/table\.field\.additional\.missing/);
    expect(prose).toMatch(/table\.fields\.additional\.error\.on\.missing/);
  });

  it("gives a connector config that captures the outbox table only", () => {
    const cfg = codeById("cfg-router");
    expect(cfg).toMatch(/^table\.include\.list=public\.outbox$/m);
    expect(cfg).toMatch(
      /^transforms\.outbox\.type=io\.debezium\.transforms\.outbox\.EventRouter$/m,
    );
    expect(cfg).toMatch(
      /^transforms\.outbox\.table\.fields\.additional\.placement=seq:header:seq$/m,
    );
    expect(cfg).not.toMatch(/ts_ms/);
  });

  it("pins the config to the prose, the option table and the producer DDL", () => {
    const cfg = codeById("cfg-router");
    // Parse "key=value" lines; no regex is built from the option name.
    const props = new Map(
      cfg
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    const prop = (k) => props.get(`transforms.outbox.${k}`);
    const ddl = /CREATE TABLE outbox \(([\s\S]*?)\);/.exec(
      codeById("sql-producer"),
    )[1];
    const columns = [...ddl.matchAll(/^\s+(\w+)\s+\w+/gm)].map((m) => m[1]);
    // key and routing columns exist in the outbox table the page creates
    expect(prop("table.field.event.key")).toBe("aggregateid");
    expect(columns).toContain(prop("table.field.event.key"));
    expect(prop("route.by.field")).toBe("aggregatetype");
    expect(columns).toContain(prop("route.by.field"));
    expect(prop("route.topic.replacement")).toBe(
      "outbox.event.${routedByValue}",
    );
    // the JSON expansion needs a JSON column and the JsonConverter
    expect(prop("table.expand.json.payload")).toBe("true");
    expect(ddl).toMatch(/payload\s+jsonb/);
    expect(cfg).toMatch(
      /^value\.converter=org\.apache\.kafka\.connect\.json\.JsonConverter$/m,
    );
    expect(cfg).toMatch(/^value\.converter\.schemas\.enable=false$/m);
    // the additional field is a real column, named in the prose as well
    const extra = prop("table.fields.additional.placement");
    expect(extra).toBe("seq:header:seq");
    expect(columns).toContain(extra.split(":")[0]);
    // the prose describes exactly this config: topic, key and header
    expect(prose).toMatch(
      /sends the OrderShipped row above to the topic outbox\.event\.order with the key ORD-221 ?, the event id in the id header, the version in a seq header/,
    );
    expect(codeById("sql-producer")).toMatch(
      /'order', 'ORD-221', 1, 'OrderCreated'/,
    );
  });

  it("says the router passes snapshot reads through, so retained rows are re-published", () => {
    expect(prose).toMatch(/Passes snapshot reads through/);
    expect(prose).toMatch(/op=r/);
    expect(prose).toMatch(/only deletes, tombstones and updates are dropped/);
    expect(prose).toMatch(/3\.0\.0\.Final and 3\.4\.0\.Final/);
    expect(prose).toMatch(/route\.tombstone\.on\.empty\.payload/);
    const dup = text(
      body.slice(
        body.indexOf('<section id="duplicates"'),
        body.indexOf("</table>", body.indexOf('<section id="duplicates"')),
      ),
    );
    expect(dup).toMatch(
      /Snapshot or incremental snapshot of an outbox table that still holds rows/,
    );
    // five rows of causes
    const rows = body
      .slice(
        body.indexOf('<section id="duplicates"'),
        body.indexOf("</table>", body.indexOf('<section id="duplicates"')),
      )
      .match(/<tr>/g);
    expect(rows.length).toBe(1 + 5);
    expect(prose).not.toMatch(
      /a snapshot of an empty table recovers nothing\.(?! Keeping)/,
    );
    expect(prose).toMatch(/Keeping rows cuts both ways/);
  });

  it("conditions the dense-version check and names the id-reuse hole", () => {
    expect(prose).toMatch(/every version bump writes exactly one outbox row/);
    expect(prose).toMatch(/UPDATE orders SET version = version \+ 1/);
    expect(prose).toMatch(/parks every later event for that aggregate forever/);
    expect(prose).toMatch(/The id-reuse hole/);
    expect(prose).toMatch(/changed 0 rows/);
    expect(prose).toMatch(/never reuse an aggregate id/);
  });

  it("labels what the reviewer reproduced on PostgreSQL 18", () => {
    expect(prose).toMatch(/0\/17C1868/);
    expect(prose).toMatch(/0\/17C19A8/);
    expect(prose).toMatch(/id 1 uncommitted and id 2 committed/);
    expect(prose).not.toMatch(/I did not run it\./);
  });
});

describe("the thesis", () => {
  it("holds the site's rule", () => {
    expect(prose).toMatch(/at-least-once/);
    expect(prose).toMatch(/not achievable in general/);
    expect(prose).toMatch(/exactly-once processing/i);
    expect(prose).toMatch(/idempotent consumer/);
    expect(prose).toMatch(/delete markers?|deletes as markers?/);
    expect(prose).toMatch(/does not give you exactly-once delivery/);
  });

  it("says what an id can and cannot do for ordering", () => {
    expect(prose).toMatch(/a random UUID has no order/i);
    expect(prose).toMatch(/aggregate id/i);
    expect(prose).toMatch(/UPDATE \.\.\. RETURNING/);
    expect(prose).toMatch(/higher than the last one applied/);
    expect(prose).toMatch(/new, higher offset/);
  });

  it("warns that pruning seen ids by offset is wrong, and says what to do", () => {
    expect(prose).toMatch(/does not bound how old a duplicate can be/);
    expect(prose).toMatch(/prune by time, not offset/);
    expect(prose).toMatch(/longest rewind/);
  });

  it("separates outbox housekeeping from the delete-marker rule", () => {
    expect(prose).toMatch(/This is not the delete-marker problem/);
    expect(prose).toMatch(/log-based CDC does not look at the table/);
    expect(prose).toMatch(/my reasoning, not from the sources/);
  });

  it("never teaches an id, offset or timestamp as the ordering key", () => {
    expect(allText).not.toMatch(/\bts_ms\b/);
    expect(allText).not.toMatch(
      /order(?:ed|ing)?\s+by\s+(?:the\s+)?(?:timestamp|op_ts|updated_at|offset|event id|uuid)/i,
    );
    expect(allText).not.toMatch(/(?:latest|newest) timestamp wins/i);
    const code = [...body.matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code>/g)]
      .map((m) => decode(m[1]))
      .join("\n");
    expect(code).not.toMatch(/ts_ms|op_ts|updated_at|created_at/i);
    expect(code).not.toMatch(/ORDER BY\s+(?:id|event_id)\b/i);
  });

  it("never claims exactly-once delivery is achievable end to end", () => {
    expect(allText).not.toMatch(
      /exactly-once[^.]{0,40}\b(?:is|are|can be|will be)\s+(?:achievable|guaranteed|possible|delivered)/i,
    );
    expect(allText).not.toMatch(/\bguarantees?\s+exactly-once/i);
    expect(allText).not.toMatch(
      /\bexactly-once\s+delivery\s+to\s+the\s+(?:warehouse|sink|consumer)/i,
    );
  });

  it("never offers an UPDATE flag on outbox rows under the router, or a read-then-increment version", () => {
    expect(prose).toMatch(/never flag rows with an UPDATE/);
    expect(prose).toMatch(/Do not read it first/);
    const producer = codeById("sql-producer");
    expect(producer).toMatch(/version = version \+ 1/);
    expect(producer).toMatch(/RETURNING id, status, version/);
    expect(producer).not.toMatch(/SELECT\s+version/i);
  });

  it("does not use banned filler or emojis", () => {
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
      const [p, inlineHash = ""] = m[1].split("#");
      const hash = inlineHash || (m[2] ? m[2].replace(/^#/, "") : "");
      return { path: p, hash };
    });

  it("links the lessons the plan names, the playground and the testing page", () => {
    const paths = new Set(internal.map((l) => l.path));
    for (const want of [
      "/exactly-once/",
      "/is-cdc-exactly-once/",
      "/partitioning/",
      "/deletes-stay-deleted/",
      "/which-row-wins/",
      "/test-your-pipeline/",
      "/ops-offsets/",
      "/postgres-replication-slots/",
      "/playground/",
      "/glossary/",
    ]) {
      expect(paths.has(want), want).toBe(true);
    }
  });

  it("resolves every internal link and anchor", () => {
    expect(internal.length).toBeGreaterThan(20);
    for (const { path: p, hash } of internal) {
      if (p === "/playground/") continue;
      const file = path.join(
        ROOT,
        "src",
        p.replace(/^\/|\/$/g, ""),
        "index.njk",
      );
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
    expect(externals.length).toBeGreaterThanOrEqual(15);
    for (const m of externals) {
      expect(m.index, m[1]).toBeGreaterThan(resourcesAt);
      expect(m[2], m[1]).toContain('rel="noopener"');
    }
  });

  it("cites the primary sources the claims rest on", () => {
    for (const host of [
      "debezium.io/documentation/reference/stable/transformations/outbox-event-router.html",
      "debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/",
      "debezium.io/documentation/reference/stable/connectors/postgresql.html",
      "microservices.io/patterns/data/transactional-outbox.html",
      "microservices.io/patterns/data/polling-publisher.html",
      "microservices.io/patterns/data/transaction-log-tailing.html",
      "www.postgresql.org/docs/current/logicaldecoding-output-plugin.html",
      "www.postgresql.org/docs/current/transaction-iso.html",
      "kafka.apache.org/42/getting-started/introduction/",
      "kafka.apache.org/42/configuration/producer-configs/",
    ]) {
      expect(body, host).toContain(`https://${host}`);
    }
  });

  it("names the playground scenario as the playground shows it", () => {
    expect(prose).toMatch(/Outbox Relay/);
    expect(prose).toMatch(/outbox-relay/);
    expect(prose).toMatch(/does not run a relay, repeat an event or dedupe/);
    expect(prose).toMatch(/EVT-221-1/);
  });
});

describe("inbound links and the assistant", () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n);
      return statSync(f).isDirectory() ? walk(f) : [f];
    });

  it("is linked from at least four other lessons", () => {
    const linkers = walk(path.join(ROOT, "src"))
      .filter((f) => f.endsWith(".njk") && !f.includes("transactional-outbox"))
      .filter((f) => readFileSync(f, "utf8").includes("/transactional-outbox/"))
      .map((f) => path.relative(ROOT, f));
    expect(linkers.length).toBeGreaterThanOrEqual(4);
    for (const want of [
      "src/exactly-once/index.njk",
      "src/is-cdc-exactly-once/index.njk",
    ]) {
      expect(linkers).toContain(want);
    }
  });

  const kb = parseAssistantYaml(read("src/data/assistant.yml"));
  const id = (q, page = null) => matchIntent(q, kb, page)?.id ?? null;
  const mine = [
    "outbox_router_relay",
    "outbox_consumer_order",
    "outbox_cleanup",
  ];
  const byId = (i) => kb.intents.find((x) => x.id === i);

  it("has three intents, each with 8+ triggers, no boost, and links that resolve here", () => {
    for (const i of mine) {
      const intent = byId(i);
      expect(intent, i).toBeTruthy();
      expect(intent.modules).toEqual([]);
      expect(intent.triggers.length, i).toBeGreaterThanOrEqual(8);
      const own = intent.links.filter(
        (l) => l.url === "/transactional-outbox/",
      );
      expect(own.length, i).toBeGreaterThanOrEqual(1);
      for (const l of own) {
        expect(body, `${i} ${l.anchor}`).toContain(`id="${l.anchor.slice(1)}"`);
      }
    }
  });

  it("shares no trigger with another intent", () => {
    for (const i of mine) {
      for (const t of byId(i).triggers) {
        expect(t).not.toMatch(/'/);
        for (const o of kb.intents.filter((x) => x.id !== i)) {
          expect(o.triggers, `${t} is also in ${o.id}`).not.toContain(t);
        }
      }
    }
  });

  it("the older outbox intent now links here as well", () => {
    expect(byId("outbox").links.map((l) => l.url)).toContain(
      "/transactional-outbox/",
    );
  });

  it.each([
    ["what does the outbox event router do", "outbox_router_relay"],
    ["how do I configure route.by.field", "outbox_router_relay"],
    ["outbox relay vs polling publisher", "outbox_router_relay"],
    ["what is table.op.invalid.behavior", "outbox_router_relay"],
    ["how do i dedupe outbox duplicates", "outbox_consumer_order"],
    ["outbox out of order events", "outbox_consumer_order"],
    ["can i order outbox events by event id", "outbox_consumer_order"],
    ["outbox idempotent consumer", "outbox_consumer_order"],
    ["outbox table growth", "outbox_cleanup"],
    ["can i delete outbox rows after publishing", "outbox_cleanup"],
    ["how do i clean up the outbox", "outbox_cleanup"],
  ])("%j reaches %s", (query, expected) => {
    expect(id(query)).toBe(expected);
  });

  it.each([
    ["what is the transactional outbox pattern", "outbox"],
    ["does outbox give exactly-once?", "outbox"],
    ["what is the dual write problem", "outbox"],
    ["why do i get duplicate events", "exactly_once"],
    ["events arrive out of order", "idempotent_sink"],
    ["is polling a form of cdc", "cdc_methods"],
  ])("does not take over %j (still %s)", (query, expected) => {
    expect(id(query)).toBe(expected);
  });

  it("answers the same way from the outbox page and from the exactly-once page", () => {
    for (const page of ["transactional-outbox", "exactly-once"]) {
      expect(id("what does the outbox event router do", page)).toBe(
        "outbox_router_relay",
      );
      expect(id("outbox table growth", page)).toBe("outbox_cleanup");
    }
  });

  it("keeps the answers on thesis", () => {
    for (const i of mine) {
      const a = byId(i).answer.toLowerCase();
      expect(a).not.toMatch(/exactly-once (is|holds)/);
      expect(a).not.toMatch(/order(ed)? by (ts_ms|timestamp|event id)/);
      expect(a).not.toMatch(/[<>&]/);
    }
    expect(byId("outbox_router_relay").answer).toMatch(/at-least-once/);
    expect(byId("outbox_router_relay").answer).toMatch(/check your version/);
    expect(byId("outbox_consumer_order").answer).toMatch(
      /higher than the last/,
    );
    expect(byId("outbox_consumer_order").answer).toMatch(
      /by time rather than by Kafka offset/,
    );
    expect(byId("outbox_cleanup").answer).toMatch(/not the delete-marker rule/);
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

  it("renders the quiz with the shared macro and script", () => {
    expect(body).toMatch(/quizMacro\.quiz\(quizConfig\)/);
    expect(frontMatter.layout).toBe("base.njk");
    expect(source).toContain('"/assets/js/lib/quiz.js"');
  });
});

/**
 * Execute the consumer SQL printed on the page against SQLite.
 */
const sqlite = require("node:sqlite");

describe("the consumer SQL on the page, executed against SQLite", () => {
  const consumer = codeById("sql-consumer");
  const ddl = consumer.match(/CREATE TABLE shipments \([\s\S]*?\);/)[0];
  const upsert = consumer.match(/INSERT INTO shipments[\s\S]*?;/)[0];
  const VALS = "VALUES ('ORD-221', 'shipped', false, 2)";

  it("prints the template this test rewrites", () => {
    expect(upsert).toContain(VALS);
    expect(upsert).toContain("WHERE shipments.last_seq < excluded.last_seq");
  });

  /**
   * steps: [seq, kind] with kind "u" (update), "d" (delete event), "prune"
   * (forget every seen id). mode "guard" runs the page's statement; mode
   * "idonly" applies an event whenever its id is new, with no version test.
   */
  const run = (steps, mode) => {
    const db = new sqlite.DatabaseSync(":memory:");
    db.exec(ddl);
    db.exec("CREATE TABLE seen (id TEXT PRIMARY KEY)");
    const changes = [];
    for (const [seq, kind] of steps) {
      if (kind === "prune") {
        db.exec("DELETE FROM seen");
        continue;
      }
      const status = kind === "d" ? "NULL" : `'s${seq}'`;
      const deleted = kind === "d" ? "true" : "false";
      const vals = `VALUES ('ORD-221', ${status}, ${deleted}, ${seq})`;
      let stmt = upsert.replace(VALS, vals);
      if (mode === "idonly") {
        const seen = db
          .prepare("INSERT OR IGNORE INTO seen (id) VALUES (?)")
          .run(`e${seq}`);
        if (seen.changes === 0) {
          changes.push(0);
          continue;
        }
        stmt = stmt.replace(
          /\n WHERE shipments\.last_seq < excluded\.last_seq/,
          "",
        );
        expect(stmt).not.toMatch(/WHERE/);
      }
      changes.push(db.prepare(stmt.replace(/;$/, "")).run().changes);
    }
    const row = db.prepare("SELECT * FROM shipments").get();
    return { row: { ...row }, changes };
  };

  const U = (n) => [n, "u"];
  const CASES = [
    // [label, steps, id-only end seq/deleted, guard end seq/deleted]
    ["1,2,3 then 2 again", [U(1), U(2), U(3), U(2)], [3, 0], [3, 0]],
    ["1,3,2 (swapped)", [U(1), U(3), U(2)], [2, 0], [3, 0]],
    [
      "1,2,3, prune ids, 2 replayed",
      [U(1), U(2), U(3), [0, "prune"], U(2)],
      [2, 0],
      [3, 0],
    ],
    [
      "1,2,3, delete 4, 3 replayed (ids kept)",
      [U(1), U(2), U(3), [4, "d"], U(3)],
      [4, 1],
      [4, 1],
    ],
    [
      "1,2,3, delete 4, prune ids, 3 replayed",
      [U(1), U(2), U(3), [4, "d"], [0, "prune"], U(3)],
      [3, 0],
      [4, 1],
    ],
  ];

  it.each(CASES)("%s", (_label, steps, idOnly, guard) => {
    const a = run(steps, "idonly").row;
    expect([a.last_seq, a.deleted ? 1 : 0]).toEqual(idOnly);
    const b = run(steps, "guard").row;
    expect([b.last_seq, b.deleted ? 1 : 0]).toEqual(guard);
  });

  it("the guard changes zero rows for a duplicate and for a stale event", () => {
    const { changes } = run([U(1), U(2), U(2), U(1), U(3)], "guard");
    expect(changes).toEqual([1, 1, 0, 0, 1]);
  });

  it("a re-created id restarting at version 1 is silently dropped by the plain guard", () => {
    const { row, changes } = run([U(1), U(2), [3, "d"], U(1)], "guard");
    expect(changes).toEqual([1, 1, 1, 0]);
    expect(row.deleted).toBe(1);
    expect(row.last_seq).toBe(3);
  });

  it("the (epoch, version) guard on the page accepts the re-created id and refuses the old generation", () => {
    const epoch = codeById("sql-epoch");
    const ddl2 = epoch.match(/CREATE TABLE shipments \([\s\S]*?\);/)[0];
    const up = epoch.match(/INSERT INTO shipments[\s\S]*?;/)[0];
    const V = "VALUES ('ORD-221', 'created', false, 2, 1)";
    expect(up).toContain(V);
    const db = new sqlite.DatabaseSync(":memory:");
    db.exec(ddl2);
    const apply = (status, deleted, e, q) =>
      db
        .prepare(
          up
            .replace(V, `VALUES ('ORD-221', ${status}, ${deleted}, ${e}, ${q})`)
            .replace(/;$/, ""),
        )
        .run().changes;
    expect(apply("'s1'", "false", 1, 1)).toBe(1);
    expect(apply("NULL", "true", 1, 3)).toBe(1);
    expect(apply("'new1'", "false", 2, 1)).toBe(1);
    expect(apply("'late'", "false", 1, 2)).toBe(0);
    expect(db.prepare("SELECT * FROM shipments").get()).toMatchObject({
      status: "new1",
      epoch: 2,
      last_seq: 1,
    });
  });

  it("a delete keeps the row as a marker with its version", () => {
    const { row } = run([U(1), [2, "d"]], "guard");
    expect(row.deleted).toBe(1);
    expect(row.last_seq).toBe(2);
    expect(row.status).toBeNull();
  });
});

describe("the PostgreSQL-only SQL is escaped for HTML and Nunjucks", () => {
  it("has no raw angle brackets or template delimiters in any code block", () => {
    const blocks = [
      ...body.matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code>/g),
    ].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    for (const c of blocks) {
      expect(c).not.toMatch(/[<>]/);
      expect(c).not.toMatch(/\{\{|\{%|\{#/);
    }
  });

  it("marks the connector config as not run", () => {
    expect(body).toMatch(/<summary>Kafka Connect:[^<]*\(not run\)<\/summary>/);
  });
});
