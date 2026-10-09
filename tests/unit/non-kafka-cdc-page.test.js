/**
 * Guard: /non-kafka-cdc/ (content-gap plan batch 2, module J). Reads the real
 * page source. Scope: at-least-once and an idempotent, position-ordered write
 * stay the thesis, the verified facts and the "untested" labels are kept,
 * links resolve, and the page's JavaScript is executed against hand-made
 * Debezium events and a real Elasticsearch bulk response shape.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import glossary from "../../src/_data/glossary.mjs";
import series from "../../src/_data/series.mjs";
import { parseAssistantYaml } from "../../lib/assistant-yaml.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const require = createRequire(import.meta.url);

const page = read("src/non-kafka-cdc/index.njk");
const data = require(path.join(ROOT, "src/non-kafka-cdc/index.11tydata.cjs"));
const flat = (s) => s.replace(/\s+/g, " ");
const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&[lr]dquo;/g, '"')
    .replace(/&rsquo;/g, "'");
const prose = flat(
  decode(page.replace(/<pre>[\s\S]*?<\/pre>/g, "").replace(/<[^>]+>/g, " ")),
);
const codeBlock = (lang) =>
  decode(
    page.match(
      new RegExp(
        `<pre><code class="language-${lang}">([\\s\\S]*?)</code></pre>`,
      ),
    )[1],
  );

describe("front matter and registration", () => {
  const fm = page.match(/^---\n([\s\S]*?)\n---/)[1];
  const title = fm.match(/^title: "(.+)"$/m)[1];
  const description = fm.match(/^description: "(.+)"$/m)[1];

  it("fits title and description limits", () => {
    expect(title.length).toBeLessThanOrEqual(50);
    expect(`${title} | CDC: The Missing Manual`.length).toBeLessThanOrEqual(60);
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("has dates, canonical path and a series entry", () => {
    expect(fm).toMatch(/^canonicalPath: "\/non-kafka-cdc\/"$/m);
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
    expect(data.seriesKey).toBe("non-kafka-cdc");
    const entry = series.find((s) => s.key === "non-kafka-cdc");
    expect(entry.href).toBe("non-kafka-cdc/");
  });

  it("has one h1 source (the hero) and five valid quiz questions", () => {
    expect(page).not.toMatch(/<h1[\s>]/);
    expect(page).toContain("{{ ui.hero(heroConfig) | safe }}");
    expect(data.quizConfig.questions).toHaveLength(5);
    for (const q of data.quizConfig.questions) {
      expect(q.options).toHaveLength(4);
      expect(Number(q.correct)).toBeGreaterThanOrEqual(1);
      expect(Number(q.correct)).toBeLessThanOrEqual(4);
    }
  });
});

describe("sections", () => {
  it.each([
    "question",
    "decide",
    "server",
    "engine",
    "managed",
    "search",
    "eos",
    "try-it",
    "monday",
    "resources",
  ])("has section %s", (id) => {
    expect(page).toContain(
      `<section id="${id}" aria-labelledby="${id}-title">`,
    );
    expect(page).toContain(`<h2 id="${id}-title">`);
  });

  it("has a decision table with five paths", () => {
    const sec = page.slice(
      page.indexOf('id="decide"'),
      page.indexOf('id="server"'),
    );
    const body = sec.slice(sec.indexOf("<tbody>"), sec.indexOf("</tbody>"));
    expect([...body.matchAll(/<tr>/g)]).toHaveLength(5);
  });
});

describe("the verified facts are kept", () => {
  it("states the Server and engine facts", () => {
    for (const s of [
      "exactly one connector",
      "debezium.sink.type",
      "FileOffsetBackingStore",
      "JdbcOffsetBackingStore",
      "RedisOffsetBackingStore",
      "KafkaOffsetBackingStore",
      "markProcessed",
      "markBatchFinished",
      "handleBatch",
      "does not currently provide the same delivery guarantees",
      "deduplicate, for example by the source LSN",
    ]) {
      expect(prose, s).toContain(s);
    }
  });

  it("states the Elasticsearch facts and the measured window", () => {
    for (const s of [
      "version_type=external",
      "index.gc_deletes",
      "9.5.5",
      "accepted (201) at 61 s",
      "409 at 61 s",
      "non-negative 64-bit integer",
      "strictly higher",
    ]) {
      expect(prose, s).toContain(s);
    }
  });

  it("quotes the managed services without inventing guarantees", () => {
    expect(prose).toMatch(/Doesn't guarantee ordering/);
    expect(prose).toMatch(/at-least-once delivery guarantee/);
    expect(prose).toMatch(
      /state no (overall )?delivery guarantee|state no overall guarantee/,
    );
    expect(prose).toMatch(/without regard to transaction order/);
  });

  it("labels what was not run", () => {
    expect(prose).toMatch(
      /Nothing else on this page was run against a live product/,
    );
    expect(page).toMatch(/Untested sketch/);
    expect(page).toMatch(/check your version/i);
    expect(prose).toMatch(/I did not run\s+OpenSearch/);
  });
});

describe("wording", () => {
  it("keeps the thesis and never promises exactly-once or timestamp ordering", () => {
    expect(prose).toMatch(/at-least-once/);
    expect(prose).toMatch(/not achievable in general/);
    expect(prose).toMatch(/source log position/);
    expect(prose).toMatch(/delete markers|marker document/);
    expect(prose).not.toMatch(/exactly-once (is|holds|is guaranteed)\b/i);
    expect(prose).not.toMatch(/guarantees? exactly[- ]once/i);
    expect(prose).not.toMatch(
      /order(ed|ing)? by (ts_ms|op_ts|updated_at|timestamp)/i,
    );
    expect(prose).not.toMatch(/\bimpossible\b/i);
  });

  it("names Debezium's exactly-once opt-in only for Kafka Connect", () => {
    expect(prose).toMatch(
      /documented for connectors deployed in Kafka Connect/,
    );
  });
});

describe("links", () => {
  const links = [
    ...page.matchAll(/\{\{ '(\/[^']*)' \| url \}\}(#[A-Za-z0-9_-]+)?/g),
  ].map((m) => `${m[1]}${m[2] ?? ""}`);

  it("uses | url and no root-absolute href", () => {
    expect(page).not.toMatch(/href="\/(?!\/)/);
    expect(links.length).toBeGreaterThan(10);
  });

  it.each([...new Set(links)])("%s exists", (target) => {
    const [p, anchor] = target.split("#");
    if (p === "/glossary/") {
      expect(glossary.map((g) => g.slug)).toContain(anchor);
      return;
    }
    const file = path.join(ROOT, `src${p}index.njk`);
    expect(existsSync(file), p).toBe(true);
    if (anchor) {
      expect(readFileSync(file, "utf8")).toMatch(
        new RegExp(`id=["']${anchor}["']|id: ['"]${anchor}['"]`),
      );
    }
  });

  it("adds three glossary terms and is linked from at least three lessons", () => {
    const slugs = glossary.map((g) => g.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        "debezium-server",
        "embedded-engine",
        "external-versioning",
      ]),
    );
    const from = [
      "src/use-cases/index.njk",
      "src/event-envelope/index.njk",
      "src/tooling/index.njk",
      "src/compare/index.njk",
    ].filter((f) => read(f).includes("{{ '/non-kafka-cdc/"));
    expect(from.length).toBeGreaterThanOrEqual(3);
  });

  it("registers two assistant intents that link to the page", () => {
    const kb = parseAssistantYaml(read("src/data/assistant.yml"));
    for (const id of ["debezium_server_engine", "search_index_sync"]) {
      const i = kb.intents.find((x) => x.id === id);
      expect(i.triggers.length).toBeGreaterThanOrEqual(5);
      expect(i.links.map((l) => l.url)).toContain("/non-kafka-cdc/");
    }
  });
});

describe("the page's JavaScript runs", () => {
  const src = codeBlock("js").replace(/^export /gm, "");
  const { toBulkLines, classifyBulk } = new Function(
    `${src}\nreturn { toBulkLines, classifyBulk };`,
  )();
  const ev = (op, id, lsn, extra = {}) => ({
    op,
    source: { lsn },
    ...(op === "d" ? { before: { id } } : { after: { id, ...extra } }),
  });
  const parse = (ndjson) =>
    ndjson
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

  it("uses the log position as an external version and the key as the id", () => {
    const [action, doc] = parse(
      toBulkLines([ev("u", 7, 200, { name: "b" })], { index: "i" }),
    );
    expect(action.index).toEqual({
      _index: "i",
      _id: "7",
      version: 200,
      version_type: "external",
    });
    expect(doc).toEqual({ id: 7, name: "b", deleted: false });
  });

  it("sends a delete with its own version, or a marker document", () => {
    const [del] = parse(toBulkLines([ev("d", 7, 300)], { index: "i" }));
    expect(del.delete).toEqual({
      _index: "i",
      _id: "7",
      version: 300,
      version_type: "external",
    });
    const [action, doc] = parse(
      toBulkLines([ev("d", 7, 300)], { index: "i", softDelete: true }),
    );
    expect(action.index.version).toBe(300);
    expect(doc.deleted).toBe(true);
  });

  it("skips tombstones and refuses an unusable position", () => {
    expect(toBulkLines([null, { op: undefined }], { index: "i" })).toBe("");
    expect(() =>
      toBulkLines([ev("u", 1, "16/B374D848")], { index: "i" }),
    ).toThrow(/safe non-negative integer/);
    expect(() => toBulkLines([ev("u", 1, 2 ** 53)], { index: "i" })).toThrow();
  });

  it("never reads a timestamp as the version", () => {
    expect(src).not.toMatch(/ts_ms|updated_at|timestamp/);
  });

  it("treats 409 version conflicts as applied and splits retry from reject", () => {
    // Status shape captured from Elasticsearch 9.5.5 on 2026-10-09.
    const conflict = {
      status: 409,
      error: { type: "version_conflict_engine_exception" },
    };
    const response = {
      items: [
        { index: { status: 201, result: "created" } },
        { index: { status: 200, result: "updated" } },
        { index: { ...conflict } },
        { delete: { status: 200, result: "deleted" } },
        {
          index: {
            status: 429,
            error: { type: "es_rejected_execution_exception" },
          },
        },
        { index: { status: 400, error: { type: "mapper_parsing_exception" } } },
        {
          index: {
            status: 503,
            error: { type: "unavailable_shards_exception" },
          },
        },
      ],
    };
    expect(classifyBulk(response)).toEqual({ retry: [4, 6], rejected: [5] });
  });
});

describe("the Redis script", () => {
  const lua = decode(
    page.match(/<pre><code class="language-lua">([\s\S]*?)<\/code>/)[1],
  );
  it("applies only when the incoming version is higher and keeps a delete tombstone with a TTL", () => {
    expect(lua).toMatch(
      /tonumber\(current\) >= tonumber\(ARGV\[1\]\) then return 0/,
    );
    expect(lua).toMatch(/'deleted', '1'/);
    expect(lua).toMatch(/EXPIRE/);
    expect(lua).not.toMatch(/ts_ms|timestamp/);
  });
});
