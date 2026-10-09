/**
 * Guard: the sink examples on /snapshotting/, /materialization/ and /errata/
 * (P15-23) follow the site's rule: an idempotent sink keyed on the primary
 * key, ordered by source log position (never a timestamp), with deletes kept
 * as delete markers. Reads the real page sources, not copies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nunjucks from "nunjucks";
import errata from "../../src/_data/errata.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const require = createRequire(import.meta.url);

const snapshotting = read("src/snapshotting/index.njk");
const materialization = read("src/materialization/index.njk");
const errataPage = read("src/errata/index.njk");

/** Text between `from` and the next `to` after it. */
const between = (src, from, to) => {
  const i = src.indexOf(from);
  expect(i, `missing: ${from}`).toBeGreaterThan(-1);
  const j = src.indexOf(to, i);
  expect(j, `missing end: ${to}`).toBeGreaterThan(i);
  return src.slice(i, j);
};

/** Collapse whitespace so prose assertions survive prettier reflowing. */
const flat = (s) => s.replace(/\s+/g, " ");

/** Every <pre><code> body on a page, HTML entities decoded. */
const codeBlocks = (src) =>
  [...src.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)]
    .map((m) => m[1])
    .filter((c) => c.includes("\n"))
    .map((c) => c.replace(/&lt;/g, "<").replace(/&gt;/g, ">"));

describe("/snapshotting/ warehouse MERGE", () => {
  const mergeBlock = between(
    snapshotting,
    "<summary><strong>Warehouse MERGE example",
    "</details>",
  );
  const sql = codeBlocks(mergeBlock).join("\n");

  it("guards the update on log position, so a replay cannot overwrite a newer row", () => {
    expect(sql).toMatch(/WHEN MATCHED AND t\.source_lsn < s\.lsn THEN/);
  });

  it("never copies or compares a timestamp as the version", () => {
    expect(sql).not.toMatch(/updated_at\s*=\s*s\.updated_at/);
    expect(sql).not.toMatch(/WHEN MATCHED THEN/);
  });

  it("keeps deletes as a marker and dedupes to one source row per key", () => {
    expect(sql).toMatch(/deleted\s*=\s*\(s\.op = 'd'\)/);
    expect(sql).not.toMatch(/WHEN MATCHED[^\n]*THEN DELETE/);
    expect(sql).toMatch(
      /ROW_NUMBER\(\) OVER \(PARTITION BY customer_id ORDER BY lsn DESC/,
    );
  });

  it("is marked untested", () => {
    expect(sql).toMatch(/^-- Untested:/m);
  });

  it("warns that a NULL source_lsn is never updated", () => {
    expect(sql).toMatch(/NULL < x is[\s-]+NULL/);
    expect(sql).toMatch(/COALESCE\(t\.source_lsn, -1\) < s\.lsn/);
  });

  it("explains how snapshot rows interleave with streamed changes", () => {
    const section = flat(
      between(
        snapshotting,
        '<h2 id="idempotent">',
        '<section aria-labelledby="observability">',
      ),
    );
    expect(section).toMatch(/interleave/);
    expect(section).toMatch(/<code>op = 'r'<\/code>/);
    expect(section).toMatch(/higher position wins/);
  });

  it("Gotcha covers replays and overlapping chunks, not just deletes", () => {
    const gotcha = flat(
      between(snapshotting, '<aside aria-label="Gotcha"', "</aside>"),
    );
    expect(gotcha).toMatch(/replay/);
    expect(gotcha).toMatch(/overlapping snapshot chunk/);
    expect(gotcha).toMatch(/delete marker|marker/);
  });

  it("does not teach a timestamp as the ordering key anywhere", () => {
    expect(snapshotting).not.toMatch(/latest timestamp/i);
    expect(snapshotting).not.toMatch(/hash \+ latest/i);
  });
});

describe("/materialization/ SQL", () => {
  const blocks = codeBlocks(materialization);

  it("never filters deletes out before the target", () => {
    for (const b of blocks) {
      expect(b).not.toMatch(/op\s*(!=|<>)\s*'d'/i);
    }
  });

  it("uses no BigQuery-only EXCEPT in the dbt model", () => {
    for (const b of blocks) {
      expect(b).not.toMatch(/select\s+\*\s+except/i);
    }
  });

  describe("dbt incremental model", () => {
    const details = between(
      materialization,
      "<summary>dbt incremental model</summary>",
      "</details>",
    );
    const dbt = codeBlocks(details)[0];

    it("uses the merge strategy on the primary key", () => {
      expect(dbt).toMatch(/incremental_strategy='merge'/);
      expect(dbt).toMatch(/unique_key='order_id'/);
    });

    it("dedupes portably by log position, ordinal as tie-break", () => {
      expect(dbt).toMatch(
        /row_number\(\) over \(\s*partition by order_id\s*order by lsn desc, seq desc\s*\)/,
      );
      expect(dbt).toMatch(/where rnk = 1/);
    });

    it("bounds the incremental scan by source position with >=", () => {
      expect(dbt).toMatch(/\{% if is_incremental\(\) %\}/);
      expect(dbt).toMatch(/where lsn >= \(/);
      expect(dbt).toMatch(/max\(source_lsn\)/);
      expect(dbt).toMatch(/var\('lsn_lookback', 0\)/);
      expect(dbt).not.toMatch(/where lsn > \(/);
    });

    it("carries deletes as a marker and applies the position guard", () => {
      expect(dbt).toMatch(/\(l\.op = 'd'\) as deleted/);
      expect(dbt).toMatch(/t\.source_lsn < l\.lsn/);
    });

    it("never orders or guards on a timestamp", () => {
      expect(dbt).not.toMatch(/ts_ms|op_ts|updated_at/);
    });

    it("is marked untested", () => {
      expect(details).toMatch(/Untested:/);
    });

    it("survives Nunjucks: the dbt Jinja renders literally", () => {
      const env = new nunjucks.Environment(null, { autoescape: false });
      env.addFilter("url", (p) => `/letstalkcdc${p}`);
      const out = env.renderString(details, {});
      expect(out).toContain("{{ source('cdc', 'orders') }}");
      expect(out).toContain("{% if is_incremental() %}");
      expect(out).toContain("{{ this }}");
      expect(out).toContain("{% endif %}");
    });
  });
});

describe("/errata/ and the errata data", () => {
  it("does not tell readers to reconcile snapshots by version column or op_ts", () => {
    expect(errataPage).not.toMatch(/version columns or/);
    const panel = flat(between(errataPage, "id: 'snapshots'", "{% endcall %}"));
    expect(panel).toMatch(/log position/);
    // op_ts may be named only to be ruled out.
    for (const m of panel.matchAll(/op_ts/g)) {
      expect(panel.slice(Math.max(0, m.index - 80), m.index)).toMatch(
        /Do not use/,
      );
    }
  });

  it("records the correction as a dated entry on the pages it touched", () => {
    const entry = errata.find((e) =>
      e.id.startsWith("reconcile-by-log-position"),
    );
    expect(entry).toBeTruthy();
    expect(entry.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.urls).toEqual(
      expect.arrayContaining(["/snapshotting/", "/materialization/"]),
    );
    // The callout footer links to /errata/, so it must not be shown there.
    expect(entry.urls).not.toContain("/errata/");
    expect(entry.body).toMatch(/log position/);
    // errata.mjs rule: no root-absolute internal links (they skip `| url`).
    expect(entry.body).not.toMatch(/href="\//);
  });

  it("bumps dateModified on the three pages it changed", () => {
    for (const dir of ["errata", "snapshotting", "materialization"]) {
      const data = require(path.join(ROOT, `src/${dir}/index.11tydata.cjs`));
      expect(data.dateModified >= "2026-10-09", dir).toBe(true);
    }
  });
});
