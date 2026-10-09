/**
 * Guard: the Postgres card on /merge-cookbook/ actually behaves as taught
 * (P15-22). The SQL is lifted from the page source and run on PGlite
 * (PostgreSQL compiled to WebAssembly), so a flipped or loosened guard fails
 * here, not just in a reader's warehouse. Only Postgres can be executed this
 * way; the other dialects are pinned by merge-cookbook-page.test.js and
 * marked untested on the page.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const source = readFileSync(
  path.join(ROOT, "src/merge-cookbook/index.njk"),
  "utf8",
);
const unescape = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const blocks = [
  ...source.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g),
].map((m) => unescape(m[1]));
const block = (needle) => {
  const found = blocks.filter((b) => b.includes(needle));
  if (found.length !== 1) throw new Error(`${needle}: ${found.length} blocks`);
  return found[0];
};

const card = block("INSERT INTO target_customers AS t");
const cut = card.indexOf("-- idempotent upsert");
const createTarget = card.slice(0, cut);
// RETURNING makes "rows changed" countable; a clean replay returns zero.
const upsert = card.slice(cut).replace(/;\s*$/, " RETURNING t.id;");
const checks = block("CREATE VIEW stg_latest")
  .split(/;\s*\n\n/)
  .map((q) => q.trim().replace(/;$/, ""))
  .filter(Boolean);

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE stg_customers (
      id bigint, email text, op text, source_lsn bigint NOT NULL,
      seq integer NOT NULL, op_ts timestamptz DEFAULT now()
    );
  `);
  await db.exec(createTarget);
}, 60_000);
afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec("TRUNCATE target_customers; TRUNCATE stg_customers;");
});

const stage = async (rows) => {
  await db.exec("TRUNCATE stg_customers");
  for (const r of rows) {
    await db.query(
      "INSERT INTO stg_customers (id, email, op, source_lsn, seq) VALUES ($1,$2,$3,$4,$5)",
      r,
    );
  }
};
const apply = async () => (await db.query(upsert)).rows.length;
const row = async (id) =>
  (await db.query("SELECT * FROM target_customers WHERE id = $1", [id]))
    .rows[0];

describe("postgres card: executed behaviour", () => {
  it("picks the newest position from an out-of-order batch, then a replay changes nothing", async () => {
    await stage([
      [1, "a", "c", 100, 0],
      [1, "b", "u", 120, 0],
      [1, "mid", "u", 110, 0],
    ]);
    expect(await apply()).toBe(1);
    expect((await row(1)).email).toBe("b");
    expect(await apply()).toBe(0);
  });

  it("skips an older change that arrives after a newer one", async () => {
    await stage([[1, "new", "u", 120, 0]]);
    await apply();
    await stage([[1, "stale", "u", 110, 0]]);
    expect(await apply()).toBe(0);
    expect((await row(1)).email).toBe("new");
  });

  it("breaks a tie on the position with the ordinal, strictly", async () => {
    await stage([[1, "seq0", "c", 120, 0]]);
    await apply();
    await stage([[1, "seq1", "u", 120, 1]]);
    expect(await apply()).toBe(1);
    expect((await row(1)).email).toBe("seq1");
    await stage([[1, "seq1-again", "u", 120, 1]]);
    expect(await apply()).toBe(0);
    await stage([[1, "seq0-late", "u", 120, 0]]);
    expect(await apply()).toBe(0);
    expect((await row(1)).email).toBe("seq1");
  });

  it("keeps a delete as a marker, so a late older update cannot resurrect the row", async () => {
    await stage([[1, "x", "c", 100, 0]]);
    await apply();
    await stage([[1, null, "d", 200, 0]]);
    expect(await apply()).toBe(1);
    const deleted = await row(1);
    expect(deleted.is_deleted).toBe(true);
    expect(Number(deleted.source_lsn)).toBe(200);
    await stage([[1, "late", "u", 150, 0]]);
    expect(await apply()).toBe(0);
    expect((await row(1)).is_deleted).toBe(true);
  });

  it("inserts a marker for a never-seen key, and a newer insert revives it", async () => {
    await stage([[2, null, "d", 300, 0]]);
    expect(await apply()).toBe(1);
    expect((await row(2)).is_deleted).toBe(true);
    await stage([[2, "ghost", "c", 250, 0]]);
    expect(await apply()).toBe(0);
    expect((await row(2)).is_deleted).toBe(true);
    await stage([[2, "back", "c", 400, 0]]);
    expect(await apply()).toBe(1);
    expect((await row(2)).is_deleted).toBe(false);
  });

  it("tolerates identical duplicate rows in staging", async () => {
    await stage([
      [3, "x", "c", 500, 0],
      [3, "x", "c", 500, 0],
    ]);
    expect(await apply()).toBe(1);
  });
});

describe("postgres card: the acceptance checks pass on good data and can fail", () => {
  const count = async (i) => Number((await db.query(checks[i])).rows[0].count);

  it("has the six statements the page shows", () => {
    expect(checks).toHaveLength(6); // view + 4 checks + freshness
  });

  it("reports clean after a normal run", async () => {
    await stage([
      [1, null, "d", 200, 0],
      [1, "late", "u", 150, 0],
      [2, "b", "c", 400, 0],
    ]);
    await apply();
    await db.exec("DROP VIEW IF EXISTS stg_latest");
    await db.query(checks[0]);
    const dup = (await db.query(checks[1])).rows[0];
    expect(Number(dup.row_count)).toBe(Number(dup.key_count));
    expect(await count(2)).toBe(0); // missing keys
    expect(await count(3)).toBe(0); // stale
    expect(await count(4)).toBe(0); // delete sanity
  });

  it("detects a missing key, a stale row and an unmarked delete", async () => {
    await stage([
      [1, null, "d", 200, 0],
      [2, "b", "c", 400, 0],
      [4, null, "d", 600, 0],
    ]);
    await db.exec("DROP VIEW IF EXISTS stg_latest");
    await db.query(checks[0]);
    await db.exec(
      "INSERT INTO target_customers VALUES (1,'z',false,150,0),(2,'b',false,100,0)",
    );
    expect(await count(2)).toBe(1); // id 4 missing
    expect(await count(3)).toBe(2); // ids 1 and 2 are behind
    expect(await count(4)).toBe(1); // id 1 is a delete with no marker
  });
});
