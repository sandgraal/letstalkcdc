/**
 * Guard: the corrections from the second content accuracy sample (P17-13).
 *
 * Each block pins one correction on the real page source, so putting the old
 * wording back fails here. The thesis: at-least-once delivery, an idempotent
 * sink keyed on the primary key and ordered by SOURCE LOG POSITION (never
 * ts_ms or updated_at), no end-to-end exactly-once. Where a vendor fact
 * could not be verified from the repo, the page was softened, not replaced.
 *
 * The page's PostgreSQL block on /partitioning/ is executed on PGlite
 * (PostgreSQL compiled to WebAssembly), with the psql-style `:name`
 * placeholders replaced by literals.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import errata from "../../src/_data/errata.mjs";
import {
  orderingGuarantee,
  PER_KEY,
  PER_KEY_BROKEN_FOR_HOT_KEY,
} from "../../src/assets/js/lib/partitioning-kpi.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&rsquo;/g, "'")
    .replace(/&amp;/g, "&");
const flat = (s) => s.replace(/\s+/g, " ").trim();
/** Visible text: tags dropped, entities decoded, whitespace collapsed. */
const text = (html) =>
  flat(decode(html.replace(/<[^>]+>/g, " "))).replace(/ ([,.:;)])/g, "$1");

const oracle = read("src/oracle-notes/index.njk");
const nonRel = read("src/non-relational/index.njk");
const exactlyOnce = read("src/exactly-once/index.njk");
const partitioning = read("src/partitioning/index.njk");
const materialization = read("src/materialization/index.njk");

const entry = (id) => {
  const e = errata.find((x) => x.id === id);
  expect(e, id).toBeTruthy();
  return e;
};

describe("/oracle-notes/: guard on (position, tie-break), not the SCN alone", () => {
  const prose = text(oracle);
  const latestWins = decode(
    /<h3>Duplicate \/ Latest-wins Checks \(sink\)<\/h3>([\s\S]*?)<\/pre>/.exec(
      oracle,
    )[1],
  );

  it("first aid guards on the (position, tie-break) pair and links the pattern", () => {
    expect(prose).toMatch(
      /guarded on the \(position, tie-break\) pair: the source log position \(SCN\) plus a tie-break such as rs_id and ssn, because the SCN can repeat across changes in one transaction/,
    );
    expect(oracle).toContain("{{ '/partitioning/' | url }}#recon");
    expect(partitioning).toMatch(/<h2 id="recon">/);
  });

  it("no longer guards on the SCN alone", () => {
    expect(prose).not.toMatch(/guarded on the source log position \(SCN\);/);
  });

  it("the latest-wins query ranks by (scn, tie_break) and does not take MAX(source_scn)", () => {
    expect(latestWins).toMatch(
      /ROW_NUMBER\(\) OVER \(PARTITION BY business_id\s+ORDER BY source_scn DESC, tie_break DESC\)/,
    );
    expect(latestWins).not.toMatch(/MAX\(source_scn\)/);
  });

  it("exposes SCN / commit timestamp for lag metrics only, never for ordering", () => {
    expect(prose).toContain(
      "Expose SCN / commit timestamp per event (headers/columns) all the way to the sink (for lag metrics only, never for ordering).",
    );
  });

  it("labels every box that carries Oracle SQL as untested", () => {
    const boxes = oracle.split(/<div class="box">/).slice(1);
    const withSql = boxes.filter((b) => b.includes("<pre>"));
    expect(withSql.length).toBeGreaterThanOrEqual(3);
    for (const b of withSql) {
      expect(text(b.split("<pre>")[0])).toContain(
        "Untested: not run against an Oracle database",
      );
    }
  });

  it("leaves the ARCHIVELOG wording to the maintainer", () => {
    expect(prose).toContain("(recommended for CDC resiliency)");
  });

  it("is recorded in errata (link-free), and the page is re-dated", () => {
    const e = entry("oracle-scn-tie-break-2026-10-12");
    expect(e.urls).toEqual(["/oracle-notes/"]);
    expect(e.body).not.toMatch(/href=/);
    expect(e.body).toMatch(/tie-break/);
    expect(oracle).toMatch(/^dateModified: "2026-10-12"$/m);
  });
});

describe("/non-relational/: the Cassandra timestamp and the checklist", () => {
  const prose = text(nonRel);

  it("no longer calls the cell timestamp a logical clock the database assigns", () => {
    expect(prose).not.toMatch(/logical clock/);
    expect(prose).not.toMatch(/not a wall-clock guess/);
  });

  it("says it mirrors the source's rule, is coordinator- or client-assigned, and can be skewed", () => {
    expect(prose).toMatch(/because it mirrors the source's own conflict rule/);
    expect(prose).toMatch(
      /write time assigned by the coordinator or the client, not a log position, so clock skew can pick a different winner than real time would/,
    );
    expect(prose).toMatch(
      /Reproduce the rule; do not treat it as an order you can trust anywhere else/,
    );
  });

  it("the LSN-equivalent sentence drops the cell timestamp and the resume token", () => {
    const m = /Identify what plays the role of the LSN[^.]*\./.exec(prose);
    expect(m).toBeTruthy();
    expect(m[0]).not.toMatch(/cell timestamp/);
    expect(m[0]).not.toMatch(/resume token/);
    expect(m[0]).toMatch(
      /use the field the source documents as orderable, and check its documentation/,
    );
  });

  it("softens the unverifiable DynamoDB absolutes without adding replacements", () => {
    expect(prose).not.toMatch(/the only repair/);
    expect(prose).not.toMatch(/There is no equivalent of extending/);
    expect(prose).toMatch(
      /This page assumes the stream's retention cannot be extended; check your provider's current options/,
    );
    expect(prose).toMatch(
      /the repair this page covers is a fresh full scan of the table; check your provider's documentation for other options/,
    );
  });

  it("keeps the thesis-lint allowlist entry in step with the reworded paragraph", () => {
    const allow = JSON.parse(read("lib/thesis-lint.allow.json")).find(
      (e) => e.file === "src/non-relational/index.njk",
    );
    expect(allow.owner).toBe("needs-editor-review");
    expect(prose).toContain(allow.textIncludes);
    expect(allow.reason).toMatch(/coordinator or the client/);
    expect(allow.reason).not.toMatch(/logical clock/);
  });

  it("is recorded in errata (link-free), and the page is re-dated", () => {
    const e = entry("cassandra-timestamp-rationale-2026-10-12");
    expect(e.urls).toEqual(["/non-relational/"]);
    expect(e.body).not.toMatch(/href=/);
    expect(
      require(path.join(ROOT, "src/non-relational/index.11tydata.cjs"))
        .dateModified,
    ).toBe("2026-10-12");
  });
});

describe("/exactly-once/: the event-ID recipes dedupe replays only", () => {
  const prose = text(exactlyOnce);

  it("the processed_events recipe puts the ID insert and the sink write in the same transaction", () => {
    expect(prose).toMatch(
      /The ID insert and the sink write must happen in the same transaction: if the ID is recorded and the process crashes before the sink write, the replayed event is skipped as a duplicate and the change is lost permanently/,
    );
  });

  it("says beside the pseudocode and the two MERGEs that they dedupe replays only, and links the pattern", () => {
    const at = exactlyOnce.indexOf("These dedupe replays only.");
    expect(at).toBeGreaterThan(-1);
    const note = text(exactlyOnce.slice(at, at + 1200));
    expect(note).toMatch(/upsert_into_sink\(event\.key, event\.payload\)/);
    expect(note).toMatch(/late, older change overwrite a newer row/);
    expect(note).toMatch(/position-ordered upsert/);
    expect(exactlyOnce.slice(at, at + 1200)).toContain(
      "{{ '/partitioning/' | url }}#recon",
    );
    // beside the code: after the comparison, before the first MERGE block
    expect(at).toBeGreaterThan(exactlyOnce.indexOf("upsert_into_sink("));
    expect(at).toBeLessThan(exactlyOnce.indexOf("MERGE INTO dw.orders"));
  });

  it("labels the Snowflake-style and BigQuery MERGE blocks untested", () => {
    for (const heading of [
      "Warehouse MERGE (Snowflake-style)",
      "BigQuery MERGE (idempotent)",
    ]) {
      const at = exactlyOnce.indexOf(heading);
      expect(at, heading).toBeGreaterThan(-1);
      const card = exactlyOnce.slice(at, exactlyOnce.indexOf("</div>", at));
      expect(card, heading).toMatch(/Untested: not run/);
    }
  });

  it("is recorded in errata (link-free), and the page is re-dated", () => {
    const e = entry("dedup-table-same-transaction-2026-10-12");
    expect(e.urls).toEqual(["/exactly-once/"]);
    expect(flat(e.body)).toMatch(/same transaction/);
    expect(e.body).not.toMatch(/href=/);
    expect(
      require(path.join(ROOT, "src/exactly-once/index.11tydata.cjs"))
        .dateModified,
    ).toBe("2026-10-12");
  });
});

describe("/partitioning/: ts_ms is not a tie-break", () => {
  const prose = text(partitioning);

  it("says lag metrics only, with the ordinal as the tie-break", () => {
    expect(prose).toContain(
      "Keep ts_ms for lag metrics only; use the ordinal as the tie-break.",
    );
    expect(prose).not.toMatch(/at most, as a secondary tie-break/);
  });

  it("agrees with /materialization/, which keeps ts_ms out of ordering", () => {
    expect(text(materialization)).toMatch(
      /Keep ts_ms out of ordering entirely/,
    );
  });

  it("labels the BigQuery example untested and the Postgres example as executed on PGlite", () => {
    expect(prose).toMatch(/Untested: not run against a live BigQuery project/);
    expect(prose).toMatch(
      /Executed on PGlite \(PostgreSQL compiled to WebAssembly\) by this site's unit tests/,
    );
    expect(prose).toMatch(/It has not been run on a PostgreSQL server/);
  });

  it("is recorded in errata (link-free), and the page is re-dated", () => {
    const e = entry("partitioning-ts-ms-tie-break-2026-10-12");
    expect(e.urls).toEqual(["/partitioning/"]);
    expect(e.body).not.toMatch(/href=/);
    expect(
      require(path.join(ROOT, "src/partitioning/index.11tydata.cjs"))
        .dateModified,
    ).toBe("2026-10-12");
  });
});

describe("/partitioning/ simulator: Ordering guarantee KPI", () => {
  it("is plain per-key while the hot key sits on one partition", () => {
    expect(orderingGuarantee({ dist: "hot", shards: 1 })).toBe(PER_KEY);
    expect(orderingGuarantee({ dist: "hot", shards: "1" })).toBe(PER_KEY);
    expect(orderingGuarantee({ dist: "uniform", shards: 1 })).toBe(PER_KEY);
  });

  it("says it is broken for the hot key once the hot key is split over shards", () => {
    expect(orderingGuarantee({ dist: "hot", shards: 2 })).toBe(
      "Per-key, broken for the hot key",
    );
    expect(orderingGuarantee({ dist: "hot", shards: "8" })).toBe(
      PER_KEY_BROKEN_FOR_HOT_KEY,
    );
  });

  it("matches the simulator, which only splits a key in the hot distribution", () => {
    const sim = read("src/assets/js/pages/partitioning.js");
    expect(sim).toMatch(/dist\.value === "hot" && i === 0 && S > 1/);
    expect(orderingGuarantee({ dist: "zipf", shards: 8 })).toBe(PER_KEY);
  });

  it("the page script uses the function instead of a hard-coded label", () => {
    const sim = read("src/assets/js/pages/partitioning.js");
    expect(sim).toMatch(/orderingGuarantee\(\{ dist: D, shards: S \}\)/);
    expect(sim).not.toMatch(/textContent = "Per-key"/);
  });
});

describe("/partitioning/ Postgres sink block, executed on PGlite", () => {
  const block = decode(
    /<h3>Production-Ready Idempotent Sink Pattern \(Postgres\)<\/h3>\s*<pre><code>([\s\S]*?)<\/code><\/pre>/.exec(
      partitioning,
    )[1],
  );

  /** The page's statement with its `:name` placeholders replaced by literals. */
  const statement = ({ id, payload, op, lsn }) =>
    block.replace(/(?<!:):(\w+)/g, (_, name) => {
      const v = { entity_id: id, payload, op, source_lsn: lsn }[name];
      if (v === undefined) throw new Error(`unexpected placeholder :${name}`);
      return v;
    });
  const ev = (id, payload, op, lsn) =>
    statement({
      id: String(id),
      payload: payload === null ? "NULL" : `'${JSON.stringify(payload)}'`,
      op: `'${op}'`,
      lsn: String(lsn),
    });

  it("insert, replay, newer update, late older change and a delete marker", async () => {
    const db = new PGlite();
    try {
      expect(
        (await db.query("SHOW server_version")).rows[0].server_version,
      ).toMatch(/^18\./);
      await db.exec(`CREATE TABLE target_table (
        id bigint PRIMARY KEY, payload jsonb,
        deleted boolean NOT NULL DEFAULT false, source_lsn bigint NOT NULL)`);
      const row = async () =>
        (await db.query("SELECT * FROM target_table WHERE id = 1")).rows[0];

      await db.exec(ev(1, { v: "a" }, "c", 100));
      expect(await row()).toMatchObject({
        payload: { v: "a" },
        deleted: false,
        source_lsn: 100,
      });

      // a replay of the same change (same position, even a different payload) is a no-op
      await db.exec(ev(1, { v: "replay" }, "c", 100));
      expect((await row()).payload).toEqual({ v: "a" });

      await db.exec(ev(1, { v: "b" }, "u", 120));
      expect(await row()).toMatchObject({
        payload: { v: "b" },
        source_lsn: 120,
      });

      // a late, older change cannot overwrite the newer row
      await db.exec(ev(1, { v: "stale" }, "u", 110));
      expect(await row()).toMatchObject({
        payload: { v: "b" },
        source_lsn: 120,
      });

      // a delete is kept as a marker with its position
      await db.exec(ev(1, null, "d", 130));
      expect(await row()).toMatchObject({
        payload: null,
        deleted: true,
        source_lsn: 130,
      });

      // a replayed older update cannot resurrect the deleted row
      await db.exec(ev(1, { v: "b" }, "u", 120));
      expect(await row()).toMatchObject({ deleted: true, source_lsn: 130 });
    } finally {
      await db.close();
    }
  }, 120_000);

  it("a delete for a key never seen creates the marker", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE target_table (
        id bigint PRIMARY KEY, payload jsonb,
        deleted boolean NOT NULL DEFAULT false, source_lsn bigint NOT NULL)`);
      await db.exec(ev(7, null, "d", 50));
      await db.exec(ev(7, { v: "late" }, "c", 40));
      const r = (await db.query("SELECT * FROM target_table WHERE id = 7"))
        .rows[0];
      expect(r).toMatchObject({ deleted: true, source_lsn: 50 });
    } finally {
      await db.close();
    }
  }, 120_000);
});

describe("/materialization/: what ts_ms is", () => {
  it("is recorded in errata (link-free), and the page is re-dated", () => {
    const e = entry("materialization-ts-ms-meaning-2026-10-12");
    expect(e.urls).toEqual(["/materialization/"]);
    expect(e.body).toMatch(/source\.ts_ms/);
    expect(e.body).not.toMatch(/href=/);
    expect(
      require(path.join(ROOT, "src/materialization/index.11tydata.cjs"))
        .dateModified,
    ).toBe("2026-10-12");
  });
});
