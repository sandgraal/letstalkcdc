/**
 * Guard: the PostgreSQL recipe and the resume claims on /snapshotting/
 * (P17-12 accuracy sample). Reads the real page source; the one fact about
 * PostgreSQL the snippet depends on is checked on PGlite (PostgreSQL 18.3
 * compiled to WebAssembly).
 *
 * What it holds:
 *   - the snippet does not tell the reader a reload applies wal_level or
 *     max_replication_slots (both need a restart);
 *   - the REPEATABLE READ + pg_current_wal_lsn() lines are labelled as an
 *     illustration with the race stated, and the slot / exported snapshot
 *     approach is named;
 *   - only an incremental snapshot is said to resume mid-table;
 *   - the corrections are recorded in errata.mjs and the page is re-dated.
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import errata from "../../src/_data/errata.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const page = readFileSync(
  path.join(ROOT, "src/snapshotting/index.njk"),
  "utf8",
);
const data = require(path.join(ROOT, "src/snapshotting/index.11tydata.cjs"));

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = (html) => flat(decode(html.replace(/<[^>]+>/g, " ")));

const pgDetails =
  /<summary><strong>PostgreSQL<\/strong><\/summary>([\s\S]*?)<\/details>/.exec(
    page,
  )[1];
const pgCode = decode(
  /<pre><code>([\s\S]*?)<\/code><\/pre>/.exec(pgDetails)[1],
);
const pgNote = text(pgDetails.replace(/<pre>[\s\S]*?<\/pre>/, ""));
const prose = text(page.replace(/^---[\s\S]*?\n---\n/, ""));

describe("the PostgreSQL snippet: setup", () => {
  const db = new PGlite();
  afterAll(async () => db.close());

  it("both settings it changes need a restart (pg_settings.context is postmaster)", async () => {
    const { rows } = await db.query(
      "SELECT name, context FROM pg_settings WHERE name IN ('wal_level','max_replication_slots') ORDER BY name",
    );
    expect(rows).toEqual([
      { name: "max_replication_slots", context: "postmaster" },
      { name: "wal_level", context: "postmaster" },
    ]);
    // The snippet changes exactly those two settings.
    expect(pgCode).toContain("ALTER SYSTEM SET wal_level = logical;");
    expect(pgCode).toContain("ALTER SYSTEM SET max_replication_slots");
  }, 60_000);

  it("does not offer a reload as the way to apply them, and says a restart is required", () => {
    expect(pgCode).not.toMatch(/^\s*SELECT pg_reload_conf\(\);/m);
    expect(pgCode).toMatch(/restart/i);
    expect(pgCode).toMatch(/pg_reload_conf\(\) does not apply/);
    expect(pgCode).toContain("SHOW wal_level;");
  });
});

describe("the PostgreSQL snippet: boundary lines", () => {
  it("labels the LSN lines as an illustration, not a procedure", () => {
    expect(pgCode).toMatch(/Illustration of the idea only, NOT a procedure/);
  });

  it("states the race: snapshot taken before the LSN is read, so a commit in between is missed", () => {
    expect(pgNote).toMatch(/snapshot is taken before the LSN is read/);
    expect(pgNote).toMatch(/commit in between is invisible to the scan/);
    expect(pgNote).toMatch(/misses it/);
  });

  it("names the correct approach: a replication slot and its exported snapshot", () => {
    expect(pgNote).toMatch(/create the logical replication slot/);
    expect(pgNote).toMatch(/exported snapshot/);
    expect(pgNote).toContain("pg_export_snapshot()");
  });
});

describe("resume claims", () => {
  it("no longer says a plain boundary snapshot resumes from the last chunk", () => {
    expect(prose).not.toMatch(/Resume from last chunk/);
    expect(prose).not.toMatch(
      /Snapshots should be restartable: resume from last completed chunk/,
    );
  });

  it("says in both places that only an incremental snapshot resumes mid-table", () => {
    expect(prose).toMatch(
      /Only an incremental snapshot resumes mid-table \(see below\)/,
    );
    expect(prose).toMatch(
      /Only an incremental snapshot resumes mid-table, from the last completed chunk/,
    );
    // ...consistently with the mode list further down.
    expect(prose).toMatch(/supports resuming mid-table/);
  });
});

describe("errata and dates", () => {
  const ids = [
    "postgres-wal-level-needs-restart-2026-10-11",
    "postgres-snapshot-lsn-race-2026-10-11",
    "snapshot-resume-claim-2026-10-11",
  ];

  it.each(ids)("records %s for /snapshotting/, link-free and dated", (id) => {
    const e = errata.find((x) => x.id === id);
    expect(e, id).toBeTruthy();
    expect(e.urls).toEqual(["/snapshotting/"]);
    expect(e.dateModified).toBe("2026-10-11");
    expect(e.body).not.toMatch(/href=/);
  });

  it("bumps dateModified to the day of the correction", () => {
    expect(data.dateModified).toBe("2026-10-11");
  });
});
