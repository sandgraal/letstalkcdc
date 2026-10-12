/**
 * Guard (P17-13): /sql-server-mysql-cdc/ says its PostgreSQL-written guard
 * "ran on PGlite" (an insert, an update in the same SQL Server transaction,
 * replays, an older update arriving late, a delete, a replay after the
 * delete; MySQL rows from one binlog event; a file rollover). Until now no
 * test in the repository ran it. This one extracts the SQL from the page and
 * runs those scenarios on PGlite (PostgreSQL 18.3 compiled to WebAssembly).
 * The position values are hand-written to match the formats on the page; no
 * real SQL Server or MySQL produced them.
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
  path.join(ROOT, "src/sql-server-mysql-cdc/index.njk"),
  "utf8",
);
const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

const blocks = [
  ...source.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g),
].map((m) => decode(m[1]));
const guardBlocks = blocks.filter((b) =>
  b.includes("CREATE TABLE customers_sink"),
);
if (guardBlocks.length !== 1) {
  throw new Error(`expected one guard block, found ${guardBlocks.length}`);
}
const guard = guardBlocks[0];

const createTable = /CREATE TABLE customers_sink[\s\S]*?\n\);/.exec(guard)[0];
// "Apply one event ($1..$4 = id, email, op, epoch; $5 = the key built above)."
const apply = guard.slice(guard.indexOf("INSERT INTO customers_sink AS t"));
const applyReturning = apply.replace(/;\s*$/, " RETURNING t.id;");

/** The commented key expression that follows `-- <marker>` in the block. */
const keyExpression = (marker) => {
  const lines = guard.split("\n");
  const start = lines.findIndex((l) => l.includes(marker));
  if (start < 0) throw new Error(`missing marker: ${marker}`);
  const expr = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^--\s{3}(.*)$/.exec(lines[i]);
    if (!m) break;
    expr.push(m[1]);
  }
  return expr.join("\n");
};
const sqlServerKey = keyExpression("SQL Server event fields");
const mysqlKey = keyExpression("MySQL event fields");

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(createTable);
}, 120_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec("TRUNCATE customers_sink");
});

const mssqlKey = async (commit, change, serial) =>
  (
    await db.query(
      `SELECT ${sqlServerKey} AS k FROM (VALUES ($1::text, $2::text, $3::int)) AS e(commit_lsn, change_lsn, event_serial_no)`,
      [commit, change, serial],
    )
  ).rows[0].k;
const myKey = async (file, pos, rowIdx) =>
  (
    await db.query(
      `SELECT ${mysqlKey} AS k FROM (VALUES ($1::text, $2::int, $3::int)) AS e(binlog_file, binlog_pos, row_idx)`,
      [file, pos, rowIdx],
    )
  ).rows[0].k;

/** Apply one event; returns how many rows the statement changed. */
const send = async (id, email, op, epoch, key) =>
  (await db.query(applyReturning, [id, email, op, epoch, key])).rows.length;
const row = async (id) =>
  (await db.query("SELECT * FROM customers_sink WHERE id = $1", [id])).rows[0];

describe("sql-server-mysql-cdc: the extracted SQL is the page's", () => {
  it("found the table, the apply statement and both key expressions", () => {
    expect(createTable).toMatch(/source_epoch int\s+NOT NULL/);
    expect(apply).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    expect(apply).toMatch(
      /WHERE \(t\.source_epoch, t\.src_pos\) < \(EXCLUDED\.source_epoch, EXCLUDED\.src_pos\)/,
    );
    expect(sqlServerKey).toMatch(/event_serial_no/);
    expect(mysqlKey).toMatch(/binlog_file/);
  });

  it("runs on PostgreSQL 18 (PGlite)", async () => {
    const { rows } = await db.query("SHOW server_version");
    expect(rows[0].server_version).toMatch(/^18\./);
  });
});

describe("sql-server-mysql-cdc: SQL Server key on PGlite", () => {
  // Same transaction: same commit_lsn, increasing change_lsn / event_serial_no.
  const COMMIT = "00000027:00000ac8:0003";
  const events = async () => ({
    insert: await mssqlKey(COMMIT, "00000027:00000ac8:0001", 1),
    update: await mssqlKey(COMMIT, "00000027:00000ac8:0002", 1),
    older: await mssqlKey(
      "00000026:00000100:0001",
      "00000026:00000100:0001",
      1,
    ),
    deleteAt: await mssqlKey(
      "00000027:00000b00:0001",
      "00000027:00000b00:0001",
      1,
    ),
  });

  it("the key is 8+8+4 hex digits per LSN with colons removed, plus a 10-digit serial", async () => {
    const k = await mssqlKey(
      "00000027:00000ac8:0003",
      "00000027:00000ac8:0001",
      1,
    );
    expect(k).toBe(
      "00000027" +
        "00000ac8" +
        "0003" +
        "00000027" +
        "00000ac8" +
        "0001" +
        "0000000001",
    );
    expect(k).toHaveLength(20 + 20 + 10);
  });

  it("insert, update in the same transaction, replays, late older update, delete, replay after delete", async () => {
    const k = await events();
    expect(k.insert < k.update).toBe(true);
    expect(k.older < k.insert).toBe(true);

    expect(await send(1, "a@x", "c", 1, k.insert)).toBe(1);
    // the update shares the transaction (commit_lsn) and is applied
    expect(await send(1, "b@x", "u", 1, k.update)).toBe(1);
    expect(await row(1)).toMatchObject({ email: "b@x", deleted: false });

    // replays of both: no-ops, state unchanged
    expect(await send(1, "a@x", "c", 1, k.insert)).toBe(0);
    expect(await send(1, "b@x", "u", 1, k.update)).toBe(0);
    expect(await row(1)).toMatchObject({ email: "b@x", src_pos: k.update });

    // an older update arriving late cannot overwrite the newer row
    expect(await send(1, "stale@x", "u", 1, k.older)).toBe(0);
    expect(await row(1)).toMatchObject({ email: "b@x" });

    // the delete ends on a delete marker
    expect(await send(1, null, "d", 1, k.deleteAt)).toBe(1);
    expect(await row(1)).toMatchObject({ deleted: true, src_pos: k.deleteAt });

    // replays after the delete cannot bring the row back
    expect(await send(1, "b@x", "u", 1, k.update)).toBe(0);
    expect(await send(1, "a@x", "c", 1, k.insert)).toBe(0);
    expect(await send(1, null, "d", 1, k.deleteAt)).toBe(0);
    expect(await row(1)).toMatchObject({ deleted: true, src_pos: k.deleteAt });
  });

  it("commit_lsn alone would tie inside a transaction; the full key does not", async () => {
    const a = await mssqlKey(COMMIT, "00000027:00000ac8:0001", 1);
    const b = await mssqlKey(COMMIT, "00000027:00000ac8:0001", 2);
    expect(a.slice(0, 20)).toBe(b.slice(0, 20));
    expect(a < b).toBe(true);
    await send(2, "first", "c", 1, a);
    expect(await send(2, "second", "u", 1, b)).toBe(1);
    expect(await row(2)).toMatchObject({ email: "second" });
  });

  it("a higher lineage number wins even when the position restarts lower", async () => {
    const high = await mssqlKey(COMMIT, "00000027:00000ac8:0002", 1);
    const low = await mssqlKey(
      "00000001:00000001:0001",
      "00000001:00000001:0001",
      1,
    );
    await send(3, "old lineage", "c", 1, high);
    expect(await send(3, "new lineage", "u", 2, low)).toBe(1);
    expect(await row(3)).toMatchObject({
      email: "new lineage",
      source_epoch: 2,
    });
    // and a late event from the old lineage is skipped
    expect(await send(3, "old again", "u", 1, high)).toBe(0);
  });
});

describe("sql-server-mysql-cdc: MySQL key on PGlite", () => {
  it("rows 0 and 1 of one binlog event (same file and position) both apply, in order", async () => {
    const r0 = await myKey("mysql-bin.000009", 4096, 0);
    const r1 = await myKey("mysql-bin.000009", 4096, 1);
    expect(r0 < r1).toBe(true);
    // two different keys' rows from the same event
    expect(await send(10, "row0", "c", 1, r0)).toBe(1);
    expect(await send(11, "row1", "c", 1, r1)).toBe(1);
    // two changes to one key from the same event: row index separates them
    expect(await send(12, "first", "c", 1, r0)).toBe(1);
    expect(await send(12, "second", "u", 1, r1)).toBe(1);
    expect(await send(12, "first", "c", 1, r0)).toBe(0);
    expect(await row(12)).toMatchObject({ email: "second" });
  });

  it("a file rollover from .000009 to .000010 ends on the newest state", async () => {
    const before = await myKey("mysql-bin.000009", 999999, 0);
    const after = await myKey("mysql-bin.000010", 4, 0);
    // as plain text '9' > '10' would be the wrong way round; the padded key is right
    expect("mysql-bin.000009" < "mysql-bin.000010").toBe(true);
    expect("9" < "10").toBe(false);
    expect(before < after).toBe(true);
    await send(20, "old file", "c", 1, before);
    expect(await send(20, "new file", "u", 1, after)).toBe(1);
    expect(await send(20, "old file", "c", 1, before)).toBe(0);
    expect(await row(20)).toMatchObject({ email: "new file" });
  });
});
