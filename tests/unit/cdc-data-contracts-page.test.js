/**
 * Guard: /cdc-data-contracts/ (content-gap plan, batch 2, module G). Reads the
 * real page source. The JavaScript gate on the page is extracted and executed
 * and its output compared with the output the page prints. The compatibility
 * table is checked cell by cell against a small model of the Avro
 * schema-resolution rules, and the model itself is checked against the Avro
 * table in Confluent's Schema Registry documentation. That is a check of the
 * page against the documentation, not a run of a real Schema Registry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
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

const page = read("src/cdc-data-contracts/index.njk");
const data = require(
  path.join(ROOT, "src/cdc-data-contracts/index.11tydata.cjs"),
);
const flat = (s) => s.replace(/\s+/g, " ");
const decode = (s) =>
  s
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
// Inline tags vanish; block tags become a space, so "<code>x</code>," reads "x,".
const text = (html) =>
  flat(
    decode(
      html
        .replace(/<\/?(code|em|strong|a|span)\b[^>]*>/g, "")
        .replace(/<[^>]+>/g, " "),
    ),
  ).trim();
const prose = text(page.replace(/<pre>[\s\S]*?<\/pre>/g, ""));
const codeBlocks = [
  ...page.matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g),
].map((m) => decode(m[1]));

/** The HTML of one section, by id. */
const section = (id) => {
  const start = page.indexOf(`<section id="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const end = page.indexOf("</section>", start);
  return page.slice(start, end);
};

describe("front matter and registration", () => {
  const fm = page.match(/^---\n([\s\S]*?)\n---/)[1];
  const title = fm.match(/^title: "(.+)"$/m)[1];
  const description = fm.match(/^description: "(.+)"$/m)[1];

  it("fits the title (50 before the suffix, 60 with it) and description limits", () => {
    expect(title.length).toBeLessThanOrEqual(34);
    expect(`${title} | CDC: The Missing Manual`.length).toBeLessThanOrEqual(60);
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("has dates, a canonical path and a series entry that match the key", () => {
    expect(fm).toMatch(/^canonicalPath: "\/cdc-data-contracts\/"$/m);
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
    expect(data.seriesKey).toBe("cdc-data-contracts");
    const entry = series.find((s) => s.key === "cdc-data-contracts");
    expect(entry.href).toBe("cdc-data-contracts/");
    expect(entry.description.length).toBeLessThanOrEqual(160);
  });

  it("has one h1 source (the hero) and five valid quiz questions", () => {
    expect(page).not.toMatch(/<h1[\s>]/);
    expect(page.match(/ui\.hero\(heroConfig\)/g)).toHaveLength(1);
    expect(data.quizConfig.questions).toHaveLength(5);
    const positions = new Set();
    for (const q of data.quizConfig.questions) {
      expect(q.options).toHaveLength(4);
      expect(Number(q.correct)).toBeGreaterThanOrEqual(1);
      expect(Number(q.correct)).toBeLessThanOrEqual(4);
      expect(q.explanation.length).toBeGreaterThan(80);
      positions.add(q.correct);
    }
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });

  it("keeps the hero description inside a paragraph and under 300 characters", () => {
    expect(data.heroConfig.description).toMatch(/^<p>[\s\S]*<\/p>$/);
    expect(text(data.heroConfig.description).length).toBeLessThanOrEqual(300);
  });
});

describe("required sections", () => {
  it.each([
    "contract",
    "surface",
    "ddl-map",
    "registry",
    "debezium",
    "shape",
    "versioning",
    "gate",
    "process",
    "failures",
    "try-it",
    "resources",
  ])("has section %s with a labelled heading", (id) => {
    expect(page).toContain(
      `<section id="${id}" aria-labelledby="${id}-title">`,
    );
    expect(page).toContain(`<h2 id="${id}-title">`);
  });

  it("has a caption and column headers on every table", () => {
    const tables = [...page.matchAll(/<table>([\s\S]*?)<\/table>/g)];
    expect(tables.length).toBeGreaterThanOrEqual(6);
    for (const [, body] of tables) {
      expect(body).toContain("<caption>");
      expect(body).toMatch(/<th scope="col"/);
    }
  });
});

/* ------------------------------------------------------------------ *
 * A model of Avro schema resolution, used to check the page's table.  *
 * It models the Avro specification (schema resolution), not the       *
 * Schema Registry.                                                    *
 * ------------------------------------------------------------------ */
const PROMOTE = {
  int: ["long", "float", "double"],
  long: ["float", "double"],
  float: ["double"],
  string: ["bytes"],
  bytes: ["string"],
};
const promotable = (writer, reader) =>
  writer === reader || (PROMOTE[writer] ?? []).includes(reader);
const branches = (t) => (t.nullable ? ["null", t.t] : [t.t]);
/** Every branch the writer can produce must resolve to some reader branch. */
const typeResolves = (reader, writer) =>
  branches(writer).every((w) =>
    branches(reader).some((r) => w === r || promotable(w, r)),
  );
/** Debezium nullable column -> optional Connect field -> Avro default null. */
const f = (name, t, { nullable = false, def } = {}) => ({
  name,
  type: { t, nullable },
  hasDefault: nullable || def !== undefined,
  def,
});
const readerCanRead = (reader, writer) =>
  reader.every((rf) => {
    const wf = writer.find((x) => x.name === rf.name);
    return wf ? typeResolves(rf.type, wf.type) : rf.hasDefault;
  });
const accepts = (mode, older, newer) => {
  const bw = readerCanRead(newer, older); // new reader, old data
  const fw = readerCanRead(older, newer); // old reader, new data
  return mode === "BACKWARD" ? bw : mode === "FORWARD" ? fw : bw && fw;
};
const cells = (older, newer) =>
  ["BACKWARD", "FORWARD", "FULL"].map((m) => accepts(m, older, newer));

describe("the Avro model reproduces Confluent's Avro compatibility table", () => {
  // Transcribed from the table at
  // docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html
  // (Avro columns BW, FW, Full), read 2026-10-09.
  const id = f("id", "int");
  const CONFLUENT = [
    {
      row: "Add optional field",
      older: [id],
      newer: [id, f("x", "string", { nullable: true })],
      expected: [true, true, true],
    },
    {
      row: "Remove optional field",
      older: [id, f("x", "string", { nullable: true })],
      newer: [id],
      expected: [true, true, true],
    },
    {
      row: "Add required field",
      older: [id],
      newer: [id, f("x", "string")],
      expected: [false, true, false],
    },
    {
      row: "Remove required field",
      older: [id, f("x", "string")],
      newer: [id],
      expected: [true, false, false],
    },
    {
      row: "Add union variant",
      older: [id, f("x", "string")],
      newer: [id, f("x", "string", { nullable: true })],
      expected: [true, false, false],
    },
    {
      row: "Remove union variant",
      older: [id, f("x", "string", { nullable: true })],
      newer: [id, f("x", "string")],
      expected: [false, true, false],
    },
    {
      row: "Widen a scalar type",
      older: [f("x", "int")],
      newer: [f("x", "long")],
      expected: [true, false, false],
    },
    {
      row: "Narrow a scalar type",
      older: [f("x", "long")],
      newer: [f("x", "int")],
      expected: [false, true, false],
    },
  ];

  it("covers the eight rows and 24 cells of the table", () => {
    expect(CONFLUENT).toHaveLength(8);
    expect(CONFLUENT.flatMap((c) => c.expected)).toHaveLength(24);
  });

  it.each(CONFLUENT)("$row", ({ older, newer, expected }) => {
    expect(cells(older, newer)).toEqual(expected);
  });
});

describe("the page's DDL table matches the model, row by row", () => {
  const id = f("id", "int");
  const email = f("email", "string");
  // One scenario per row, in the order the page lists them.
  const SCENARIOS = [
    {
      ddl: "ADD COLUMN nullable",
      older: [id, email],
      newer: [id, email, f("phone", "string", { nullable: true })],
    },
    {
      ddl: "ADD COLUMN ... NOT NULL DEFAULT x",
      older: [id, email],
      newer: [id, email, f("tier", "string", { def: "standard" })],
    },
    {
      ddl: "DROP COLUMN that was nullable",
      older: [id, f("name", "string", { nullable: true })],
      newer: [id],
    },
    {
      ddl: "DROP COLUMN that was NOT NULL with no default",
      older: [id, email],
      newer: [id],
    },
    {
      ddl: "RENAME COLUMN, nullable",
      older: [id, f("name", "string", { nullable: true })],
      newer: [id, f("full_name", "string", { nullable: true })],
    },
    {
      ddl: "RENAME COLUMN, NOT NULL with no default",
      older: [id, email],
      newer: [id, f("email_address", "string")],
    },
    {
      ddl: "Widen a type (int to bigint)",
      older: [f("n", "int")],
      newer: [f("n", "long")],
    },
    {
      ddl: "Narrow a type",
      older: [f("n", "long")],
      newer: [f("n", "int")],
    },
    {
      ddl: "Change to an unrelated type (int to text)",
      older: [f("n", "int")],
      newer: [f("n", "string")],
    },
    {
      ddl: "SET NOT NULL",
      older: [id, f("name", "string", { nullable: true })],
      newer: [id, f("name", "string")],
    },
    {
      ddl: "DROP NOT NULL",
      older: [id, f("name", "string")],
      newer: [id, f("name", "string", { nullable: true })],
    },
  ];

  const body = section("ddl-map");
  const tbody = body.slice(body.indexOf("<tbody>"), body.indexOf("</tbody>"));
  const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const parsed = rows.map((r) => ({
    header: text(r.match(/<th scope="row">([\s\S]*?)<\/th>/)[1]),
    cells: [...r.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((m) => ({
      attrs: m[1],
      value: text(m[2]),
    })),
  }));

  it("has eleven three-mode rows and one default row", () => {
    expect(parsed).toHaveLength(12);
    for (const r of parsed.slice(0, 11)) {
      expect(r.cells, r.header).toHaveLength(4);
      for (const c of r.cells.slice(1)) {
        expect(["accepted", "rejected"], r.header).toContain(c.value);
      }
    }
  });

  it.each(SCENARIOS.map((s, i) => [s.ddl, s, i]))(
    "%s",
    (_name, scenario, i) => {
      const row = parsed[i];
      expect(row.header).toBe(scenario.ddl);
      const shown = row.cells.slice(1).map((c) => c.value === "accepted");
      expect(shown).toEqual(cells(scenario.older, scenario.newer));
    },
  );

  it("the default-change row is accepted in every mode, as the page says", () => {
    const older = [f("tier", "string", { def: "standard" })];
    const newer = [f("tier", "string", { def: "basic" })];
    expect(cells(older, newer)).toEqual([true, true, true]);
    const last = parsed[11];
    expect(last.header).toBe("Change or drop a default");
    expect(last.cells[1].attrs).toContain('colspan="3"');
    expect(last.cells[1].value).toMatch(/accepted/);
  });

  it("a renamed nullable column passes every mode (the silent break)", () => {
    expect(
      cells(
        [id, f("email", "string", { nullable: true })],
        [id, f("email_address", "string", { nullable: true })],
      ),
    ).toEqual([true, true, true]);
    expect(prose).toMatch(/accepted in every mode/);
  });
});

describe("transitive compatibility: the page's drifting-default example", () => {
  const v1 = [f("id", "int"), f("email", "string")];
  const v2 = [...v1, f("tier", "string", { def: "standard" })]; // ADD COLUMN ... DEFAULT
  const v3 = [...v1, f("tier", "string")]; // ALTER COLUMN tier DROP DEFAULT

  it("BACKWARD accepts v2 and v3 one step at a time", () => {
    expect(accepts("BACKWARD", v1, v2)).toBe(true);
    expect(accepts("BACKWARD", v2, v3)).toBe(true);
  });

  it("BACKWARD_TRANSITIVE rejects v3 because v1 data has no tier", () => {
    expect(accepts("BACKWARD", v1, v3)).toBe(false);
  });

  it("states the example on the page", () => {
    const reg = section("registry");
    expect(reg).toContain("ALTER COLUMN tier DROP DEFAULT");
    expect(text(reg)).toContain("BACKWARD_TRANSITIVE rejects version 3");
  });
});

describe("the DDL gate on the page runs and prints what the page says", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "g-gate-"));
  const gate = codeBlocks.find((c) => c.includes("ddl-gate.mjs"));
  const expectedOut = codeBlocks.find((c) =>
    c.startsWith("add nullable phone:"),
  );
  const file = path.join(dir, "ddl-gate.mjs");
  writeFileSync(file, gate);
  const run = spawnSync(process.execPath, [file], { encoding: "utf8" });

  it("exists on the page with its expected output", () => {
    expect(gate).toBeTruthy();
    expect(expectedOut).toBeTruthy();
  });

  it("prints exactly the expected output", () => {
    expect(run.stderr).toBe("");
    expect(run.stdout.trimEnd()).toBe(expectedOut.trimEnd());
  });

  it("exits 1, because at least one scenario breaks", () => {
    expect(run.status).toBe(1);
  });

  it("flags four BREAK scenarios, one WARN and one OK, as the page's six scenarios say", () => {
    const out = run.stdout;
    const block = (name) =>
      out.slice(out.indexOf(`${name}:`)).split(/\n(?=\S)/)[0];
    expect(block("add nullable phone")).not.toMatch(/BREAK/);
    for (const n of [
      "drop name",
      "rename email",
      "widen id to bigint",
      "email becomes nullable",
    ]) {
      expect(block(n), n).toMatch(/BREAK/);
    }
    expect(block("change tier default")).toMatch(/WARN/);
    expect(block("rename email")).toMatch(/rename\?/);
  });

  it("does not touch the network or the file system", () => {
    expect(gate).not.toMatch(
      /require\(|from "node:(fs|http|https|net)"|fetch\(/,
    );
  });
});

describe("claims carry their sources and their limits", () => {
  it("names the Debezium and Confluent versions it was read against", () => {
    expect(prose).toMatch(/2026-10-09/);
    expect(prose).toMatch(/Debezium 3\.7/);
    expect(prose).toMatch(/Avro 1\.12\.0/);
  });

  it("says what is derived or inferred and what was not run", () => {
    expect(prose).toMatch(/derived/);
    expect(prose).toMatch(/Inference, not a measurement/);
    expect(prose).toMatch(/not a run of a real Schema Registry/);
    expect(prose).toMatch(/not run against a registry/);
    expect(prose).toMatch(/not tried with a Debezium connector/);
    expect(prose).toMatch(/check your version/i);
    expect(prose).toMatch(/practice, not a documented rule/);
  });

  it("keeps the documented Debezium and Confluent facts it cites", () => {
    for (const s of [
      "in an incubating state and is subject to change without notice",
      "schema.history.internal.kafka.topic",
      "snapshot.mode=recovery",
      "include.schema.changes",
      "logical decoding does not support DDL changes",
      "new capture instance",
      "table.op.invalid.behavior",
      "delete.tombstone.handling.mode",
      "auto.register.schemas",
      "use.latest.version",
      "latest.compatibility.strict",
      "409 Conflict",
      "no dead letter queue for source connectors",
      "BACKWARD_TRANSITIVE",
      "FULL_TRANSITIVE",
      "Enterprise",
      "7.4",
      "column.include.list",
      "REPLICA IDENTITY",
      "field.name.adjustment.mode",
      "time.precision.mode",
      "decimal.handling.mode",
    ]) {
      expect(prose.toLowerCase(), s).toContain(s.toLowerCase());
    }
  });

  it("pins the name-adjustment defaults and the single-partition schema history", () => {
    expect(prose).toMatch(
      /field\.name\.adjustment\.mode and schema\.name\.adjustment\.mode \(both none by default\)/,
    );
    expect(prose).toMatch(/must have a single partition/);
    expect(prose).toMatch(/you should not partition it/);
  });

  it("carries the incremental-snapshot position exception and the recovery warning", () => {
    expect(prose).toMatch(
      /lsn and txId are left out when source\.snapshot is incremental/,
    );
    expect(prose).toMatch(/needs an explicit rule for them/);
    expect(prose).toContain(
      "Do not use this mode to perform a snapshot if schema changes were committed to the database after the last connector shutdown.",
    );
    expect(prose).toMatch(/string and bytes promote to each other/);
  });

  it("states the version trap in the unwrap default rather than picking a side", () => {
    expect(prose).toMatch(
      /default of tombstone, while the "Behavior" paragraph of the same page still says the SMT drops delete records by default/,
    );
  });

  it("does not claim the outbox router carries the log position", () => {
    expect(prose).toMatch(/not the log position/);
    expect(prose).toMatch(/not the source block/);
  });
});

describe("wording", () => {
  it("never calls end-to-end exactly-once achievable", () => {
    expect(prose).not.toMatch(/exactly-once (is|holds|is guaranteed)\b/i);
    expect(prose).not.toMatch(/guarantees? exactly[- ]once/i);
    expect(prose).not.toMatch(/exactly-once end to end/i);
  });

  it("never orders by a timestamp", () => {
    expect(prose).not.toMatch(
      /order(ed|ing)? by (ts_ms|op_ts|updated_at|timestamp)/i,
    );
  });

  it("makes no unscoped safety claim about a registry or a schema change", () => {
    for (const re of [
      /\bnever breaks?\b/i,
      /\balways safe\b/i,
      /\bguaranteed (to be )?compatible\b/i,
      /\bwill never\b/i,
      /\bzero[- ]downtime\b/i,
      /\bbulletproof\b/i,
      /\bimpossible\b/i,
      /\bcatches (every|all)\b/i,
      /\bprevents? (every|all|any) (break|failure)/i,
    ]) {
      expect(prose, String(re)).not.toMatch(re);
    }
  });

  it("keeps at-least-once and the position-guarded idempotent sink as the delivery thesis", () => {
    expect(prose).toMatch(/at-least-once/);
    expect(prose).toMatch(/source log position is newer/);
    expect(prose).toMatch(/Nothing on this page makes a hop exactly-once/);
    expect(prose).toMatch(
      /A schema contract does not replace that, and a stricter registry mode does not remove it/,
    );
  });

  it("separates the schema history topic from the consumer-facing schema change topic", () => {
    expect(prose).toMatch(/for the connector's internal use only/);
    expect(prose).toMatch(/signal, not a contract to parse/);
  });
});

describe("links", () => {
  const links = [
    ...page.matchAll(/\{\{ '(\/[^']*)' \| url \}\}(#[A-Za-z0-9_-]+)?/g),
  ].map((m) => `${m[1]}${m[2] ?? ""}`);

  it("uses | url and no root-absolute href", () => {
    expect(page).not.toMatch(/href="\/(?!\/)/);
    expect(links.length).toBeGreaterThan(15);
  });

  it.each([...new Set(links)])("%s resolves", (target) => {
    const [p, anchor] = target.split("#");
    if (p === "/glossary/") {
      expect(glossary.map((g) => g.slug)).toContain(anchor);
      return;
    }
    if (p === "/playground/") return; // built from playground/, not src/
    const file = path.join(ROOT, `src${p}index.njk`);
    expect(existsSync(file), p).toBe(true);
    if (anchor) {
      expect(readFileSync(file, "utf8")).toMatch(
        new RegExp(`id=["']${anchor}["']|id: ['"]${anchor}['"]`),
      );
    }
  });

  it("links the pages it complements", () => {
    for (const p of [
      "/schema-evolution/",
      "/event-envelope/",
      "/test-your-pipeline/#contract",
      "/is-cdc-exactly-once/",
      "/postgres-replication-slots/",
      "/deletes-stay-deleted/",
      "/dlq-triage/",
    ]) {
      expect(links, p).toContain(p);
    }
  });

  it("opens external links safely and uses https", () => {
    const externals = [...page.matchAll(/<a href="(https?:[^"]+)"([^>]*)>/g)];
    expect(externals.length).toBeGreaterThan(10);
    for (const [, href, rest] of externals) {
      expect(href.startsWith("https://"), href).toBe(true);
      expect(rest, href).toContain('rel="noopener"');
    }
  });

  it("only cites sources it can name: every external host is a primary source", () => {
    const hosts = new Set(
      [...page.matchAll(/<a href="(https:\/\/[^/"]+)/g)].map((m) => m[1]),
    );
    expect([...hosts].sort()).toEqual([
      "https://avro.apache.org",
      "https://debezium.io",
      "https://docs.confluent.io",
      "https://github.com",
      "https://kafka.apache.org",
      "https://www.confluent.io",
    ]);
  });

  it("is linked from the schema, envelope and strategy lessons", () => {
    const from = [
      "src/schema-evolution/index.njk",
      "src/event-envelope/index.njk",
      "src/strategy/index.njk",
    ].filter((p) => read(p).includes("{{ '/cdc-data-contracts/' | url }}"));
    expect(from).toHaveLength(3);
  });

  it("registers two assistant intents that link to the page", () => {
    const kb = parseAssistantYaml(read("src/data/assistant.yml"));
    for (const id of ["cdc_data_contract", "ddl_breaks_consumers"]) {
      const i = kb.intents.find((x) => x.id === id);
      expect(i.triggers.length).toBeGreaterThanOrEqual(5);
      expect(i.links.map((l) => l.url)).toContain("/cdc-data-contracts/");
    }
  });
});
