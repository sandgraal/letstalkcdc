/**
 * Guard: the /sql-server-mysql-cdc/ page (content-gap plan, batch 2, module I).
 *
 * It must teach the site's thesis (the connector resumes from a stored log
 * position; delivery is at-least-once; the sink is idempotent, keyed by
 * primary key and ordered by log position; there is no end-to-end
 * exactly-once), carry triage queries and a symptom/check/fix table for each
 * engine, label the SQL it could not run, and only link to pages and anchors
 * that exist. Reads the real sources, not copies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nunjucks from "nunjucks";
import series from "../../src/_data/series.mjs";
import glossary from "../../src/_data/glossary.mjs";
import { parseAssistantYaml } from "../../lib/assistant-yaml.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const require = createRequire(import.meta.url);

const SLUG = "sql-server-mysql-cdc";
const source = read(`src/${SLUG}/index.njk`);
const data = require(path.join(ROOT, `src/${SLUG}/index.11tydata.cjs`));

const frontMatter = source.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
const fm = (key) =>
  frontMatter.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"))?.[1] ?? "";
// Render everything after the hero macro call (the hero is the page's only h1
// and is built from heroConfig by the shared ui macro).
const HERO_CALL = "{{ ui.hero(heroConfig) | safe }}";
const body =
  '{% import "components/quiz.njk" as quizMacro %}' +
  source.slice(source.indexOf(HERO_CALL) + HERO_CALL.length);

const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(path.join(ROOT, "src/_includes")),
  { autoescape: true },
);
env.addFilter("url", (p) => p);
env.addFilter("filterValidActions", (actions) => actions);
env.addFilter("slugify", (s) => String(s).toLowerCase().replace(/\W+/g, "-"));
const html = env.renderString(body, data);

const flat = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const text = flat(html);
const sectionIds = [...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map(
  (m) => m[1],
);

/** Every <pre><code> block, entities decoded. */
const codeBlocks = [...html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)]
  .map((m) => m[1])
  .map((c) =>
    c
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&"),
  );
const sql = codeBlocks.join("\n");

describe("/sql-server-mysql-cdc/ front matter", () => {
  it("has a short title, a description within the limit and the right path", () => {
    expect(fm("layout")).toBe("base.njk");
    expect(fm("canonicalPath")).toBe(`/${SLUG}/`);
    // base.njk appends " | CDC: The Missing Manual": the full <title> must stay within 60.
    expect(fm("title").length).toBeGreaterThan(0);
    expect(fm("title").length).toBeLessThanOrEqual(50);
    expect(
      fm("title").length + " | CDC: The Missing Manual".length,
    ).toBeLessThanOrEqual(60);
    const description = fm("description");
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("carries the 2026-10-09 dates and the series key", () => {
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
    expect(data.seriesKey).toBe(SLUG);
  });

  it("renders exactly one h1 (the hero)", () => {
    expect(source).toContain(HERO_CALL);
    expect(source.split(HERO_CALL)).toHaveLength(2);
    expect(data.heroConfig.title).toMatch(/^SQL Server & MySQL CDC/);
    expect(source).not.toMatch(/<h1[\s>]/);
    expect(html).not.toMatch(/<h1[\s>]/);
  });
});

describe("/sql-server-mysql-cdc/ sections", () => {
  it.each([
    "scope",
    "positions",
    "mysql",
    "mysql-runbook",
    "sqlserver",
    "sqlserver-runbook",
    "guard",
    "checked",
    "resources",
  ])("has the %s section", (id) => {
    expect(sectionIds).toContain(id);
  });

  it("gives every section a heading that matches its aria-labelledby", () => {
    for (const m of html.matchAll(
      /<section[^>]*aria-labelledby="([^"]+)"[^>]*>/g,
    )) {
      expect(html, m[1]).toMatch(new RegExp(`<h2 id="${m[1]}"`));
    }
  });

  it("ships a quiz of four questions whose answers are in range and not all the same", () => {
    const qs = data.quizConfig.questions;
    expect(qs).toHaveLength(4);
    for (const q of qs) {
      expect(Number(q.correct)).toBeGreaterThanOrEqual(1);
      expect(Number(q.correct)).toBeLessThanOrEqual(q.options.length);
      expect(q.explanation.length).toBeGreaterThan(40);
    }
    expect(new Set(qs.map((q) => q.correct)).size).toBeGreaterThan(1);
    expect(source).toContain("/assets/js/lib/quiz.js");
    expect(html).toContain('id="sqlserver-mysql-quiz"');
  });
});

const section = (id) =>
  html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))[0];

describe("/sql-server-mysql-cdc/ positions", () => {
  const positions = flat(section("positions"));

  it("names the position fields for each engine and the tuple the sink compares", () => {
    for (const f of [
      "file",
      "pos",
      "row",
      "gtid",
      "commit_lsn",
      "change_lsn",
      "event_serial_no",
    ]) {
      expect(positions, f).toContain(f);
    }
    expect(positions).toMatch(/commit_lsn alone is shared by every change/);
    expect(positions).toMatch(/binlog file number,\s*pos\s*,\s*row/);
  });

  it("gives the SQL Server LSN structure and the string format", () => {
    expect(positions).toContain("[VLF ID:Log Block ID:Log Record ID]");
    expect(positions).toContain("00000031:00000da0:0001");
    expect(positions).toMatch(/binary\(10\)/);
    expect(positions).toMatch(/eight,\s*eight and four hex digits/);
  });

  it("says a GTID names a transaction and a GTID set is not a sortable position", () => {
    expect(positions).toMatch(/GTID <em>set<\/em>|GTID set/);
    expect(positions).toMatch(/not comparable/);
    expect(positions).toMatch(/Use the GTID to name a transaction/);
  });

  it("marks the direct-mode ordering as unverified", () => {
    expect(positions).toMatch(/Check your version/);
    expect(positions).toMatch(/__\$command_id/);
    expect(positions).toMatch(/did not\s+verify/);
  });
});

describe("/sql-server-mysql-cdc/ MySQL", () => {
  const mysql = flat(section("mysql"));
  const runbook = section("mysql-runbook");
  const runbookText = flat(runbook);

  it("states the required settings and the retention default", () => {
    for (const s of [
      "binlog_format",
      "binlog_row_image",
      "gtid_mode",
      "enforce_gtid_consistency",
      "database.server.id",
      "binlog_expire_logs_seconds",
      "2592000",
      "30 days",
      "expire_logs_days",
    ]) {
      expect(mysql, s).toContain(s);
    }
    expect(mysql).toMatch(/removed in 8\.4/);
  });

  it("says nothing holds the files for a disconnected consumer", () => {
    expect(mysql).toMatch(/nothing holds the files|replica is not connected/);
    expect(mysql).toMatch(/cannot replicate after it\s+reconnects/);
  });

  it("covers the purge errors, when_needed and why not to skip the gap", () => {
    expect(mysql).toContain("1236");
    expect(mysql).toContain("1789");
    expect(mysql).toContain("ER_SOURCE_HAS_PURGED_REQUIRED_GTIDS");
    expect(mysql).toContain("snapshot.mode=when_needed");
    expect(mysql).toMatch(/purged position by moving past it/);
    expect(mysql).toMatch(/re-snapshot/);
    expect(mysql).toMatch(/reconcile/);
  });

  it("covers schema history, DDL, server_id uniqueness, topology and failover", () => {
    for (const s of [
      "schema history topic",
      "skip.unparseable.ddl",
      "gh-ost",
      "database.server.id",
      "gtid.source.includes",
      "check your version",
    ]) {
      expect(mysql, s).toContain(s);
    }
    expect(mysql).toMatch(/one<\/em> server|<em>one<\/em> server|one server/);
    expect(mysql).toMatch(/RESET BINARY LOGS AND GTIDS|lineage/);
  });

  it("has a triage query block that is labelled untested and a symptom/check/fix table", () => {
    expect(runbookText).toMatch(/Untested/);
    expect(runbookText).toMatch(/node-sql-parser/);
    expect(runbook).toMatch(/SHOW BINARY LOGS/);
    expect(runbook).toMatch(/SHOW BINARY LOG STATUS/);
    expect(runbook).toMatch(/GTID_SUBSET\(@@global\.gtid_purged/);
    expect(runbook).toMatch(/@@global\.binlog_expire_logs_seconds/);
    for (const col of ["Symptom", "Check", "Fix"]) {
      expect(runbook).toContain(`<th scope="col">${col}</th>`);
    }
    expect(runbook.match(/<tr>/g).length).toBeGreaterThanOrEqual(7);
  });
});

describe("/sql-server-mysql-cdc/ SQL Server", () => {
  const ms = flat(section("sqlserver"));
  const runbook = section("sqlserver-runbook");
  const runbookText = flat(runbook);

  it("states the job defaults from Microsoft and the 500 versus 1000 discrepancy", () => {
    for (const s of [
      "4320 minutes (3 days)",
      "5 seconds",
      "Daily at 2 A.M.",
      "5000",
      "500 and 10",
      "1000",
      "poll.interval.ms",
    ]) {
      expect(ms, s).toContain(s);
    }
  });

  it("explains the validity interval and cleanup measured from the last captured commit", () => {
    expect(ms).toMatch(/validity interval/);
    expect(ms).toContain("sys.fn_cdc_get_min_lsn");
    expect(ms).toMatch(/latest captured commit time/);
    expect(ms).toMatch(/not from the wall clock/);
    expect(ms).toContain("sys.sp_cdc_change_job");
    expect(ms).toMatch(/stopped and started again/);
  });

  it("explains the log that will not truncate and the two capture instances", () => {
    expect(ms).toMatch(/will not advance until all the changes/);
    expect(ms).toContain("log_reuse_wait_desc");
    expect(ms).toContain("REPLICATION");
    expect(ms).toMatch(/at most\s+two\s+capture instances/);
    expect(ms).toContain("dbo_customers_v2");
    expect(ms).toContain("sp_cdc_disable_table");
  });

  it("covers Always On availability groups", () => {
    expect(ms).toContain("applicationIntent=ReadOnly");
    expect(ms).toContain("sys.sp_cdc_add_job");
    expect(ms).toContain("sys.dm_cdc_log_scan_sessions");
    expect(ms).toMatch(/trace flag 1448/);
  });

  it("has triage queries labelled untested and a symptom/check/fix table", () => {
    expect(runbookText).toMatch(/Untested/);
    expect(runbookText).toMatch(/node-sql-parser/);
    for (const s of [
      "sp_cdc_help_jobs",
      "sp_cdc_help_change_data_capture",
      "sys.dm_cdc_log_scan_sessions",
      "sys.dm_cdc_errors",
      "fn_cdc_get_min_lsn",
      "fn_cdc_get_max_lsn",
      "log_reuse_wait_desc",
    ]) {
      expect(runbook, s).toContain(s);
    }
    expect(runbook).toMatch(/'PURGED'/);
    for (const col of ["Symptom", "Check", "Fix"]) {
      expect(runbook).toContain(`<th scope="col">${col}</th>`);
    }
    expect(runbook.match(/<tr>/g).length).toBeGreaterThanOrEqual(7);
  });

  it("warns that a zero low endpoint means check the name, not that nothing was purged", () => {
    expect(runbookText).toMatch(/0x00000000000000000000/);
    expect(runbookText).toMatch(
      /not\s+&ldquo;nothing was purged&rdquo;|not .nothing was purged./,
    );
  });
});

describe("/sql-server-mysql-cdc/ thesis and guard", () => {
  const guard = flat(section("guard"));

  it("teaches at-least-once, an idempotent sink, primary key and log position", () => {
    expect(text).toMatch(/at-least-once/);
    expect(text).toMatch(/idempotent/);
    expect(text).toMatch(/primary key/);
    expect(text).toMatch(/log position/);
    expect(text).toMatch(/re-snapshot/);
  });

  it("denies end-to-end exactly-once rather than promising it", () => {
    expect(text).toMatch(/no end-to-end\s+exactly-once/i);
    expect(text).toMatch(/no exactly-once across the whole path/i);
  });

  it("never orders by a timestamp or ts_ms, or promises exactly-once across systems", () => {
    expect(text).not.toMatch(
      /order(ed)? by (the )?(event )?(ts_ms|timestamp)/i,
    );
    expect(text).not.toMatch(
      /(guarantees?|provides?|achieves?|gives you) exactly-once/i,
    );
    expect(text).not.toMatch(
      /exactly-once (end-to-end|across (all )?systems)/i,
    );
    expect(text).toMatch(
      /never substitute\s+<code>ts_ms<\/code>|never.{0,40}ts_ms/,
    );
    expect(text).not.toMatch(/\bdelete is complete\b/i);
  });

  it("lists what becomes a duplicate on restart for both engines", () => {
    expect(guard).toMatch(/offsets are committed\s+periodically/);
    expect(guard).toMatch(/commit_lsn, change_lsn,\s*event_serial_no/);
    expect(guard).toMatch(/\(file, pos, row\)/);
    expect(guard).toMatch(/re-snapshot/);
    expect(guard).toMatch(
      /do not make\s+delivery exactly-once|do not make delivery exactly-once/,
    );
  });

  it("builds the guard key as typed, zero-padded text under a lineage number", () => {
    expect(sql).toMatch(/CREATE TABLE customers_sink/);
    expect(sql).toMatch(/source_epoch int\s+NOT NULL/);
    expect(sql).toMatch(
      /WHERE \(t\.source_epoch, t\.src_pos\) < \(EXCLUDED\.source_epoch, EXCLUDED\.src_pos\)/,
    );
    expect(sql).toMatch(
      /lpad\(substring\(binlog_file from '\[0-9\]\+\$'\), 10, '0'\)/,
    );
    expect(sql).toMatch(/replace\(coalesce\(commit_lsn/);
    expect(sql).toMatch(/deleted\s+boolean NOT NULL/);
    expect(guard).toMatch(/increment/);
    expect(guard).toMatch(/PGlite/);
  });

  it("links to the pages that carry the sink patterns", () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const h of [
      "/partitioning/#recon",
      "/materialization/",
      "/snapshotting/",
      "/snapshotting/#idempotent",
      "/reconciliation-surgery/",
      "/ops-offsets/",
      "/connector-builder/",
      "/postgres-replication-slots/",
      "/quickstarts/quickstart-mysql/",
      "/quickstarts/quickstart-mssql/",
      "/merge-cookbook/",
      "/oracle-notes/",
    ]) {
      expect(hrefs, h).toContain(h);
    }
  });

  it("is honest about what was and was not run", () => {
    const checked = flat(section("checked"));
    expect(checked).toMatch(/Not run/);
    expect(checked).toMatch(/PGlite 0\.5\.8/);
    expect(checked).toMatch(/node-sql-parser 5\.4\.0/);
    expect(checked).toMatch(/not verified/);
    expect(checked).toMatch(/check your version/i);
  });
});

describe("/sql-server-mysql-cdc/ links", () => {
  /** canonicalPath -> source file, for every page in src/. */
  const pages = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".njk")) {
        const m = readFileSync(p, "utf8").match(
          /^canonicalPath:\s*"?([^"\n]+)"?/m,
        );
        if (m) pages.set(m[1], p);
      }
    }
  };
  walk(path.join(ROOT, "src"));

  const internal = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
  const external = [...html.matchAll(/href="(https?:[^"]+)"/g)].map(
    (m) => m[1],
  );

  it("has internal links, none of them hard-coded in the source", () => {
    expect(internal.length).toBeGreaterThan(10);
    expect(source).not.toMatch(/href="\//);
    expect(source).not.toMatch(/href='\//);
  });

  it("only links to pages that exist", () => {
    for (const href of new Set(internal)) {
      const [pathname] = href.split("#");
      expect(pages.has(pathname), href).toBe(true);
    }
  });

  it("only links to anchors that exist on the target page or glossary", () => {
    const slugs = new Set(glossary.map((g) => g.slug));
    for (const href of new Set(internal)) {
      const [pathname, anchor] = href.split("#");
      if (!anchor) continue;
      if (pathname === "/glossary/") {
        expect(slugs.has(anchor), href).toBe(true);
      } else if (pathname === `/${SLUG}/`) {
        expect(html, href).toContain(`id="${anchor}"`);
      } else {
        const target = readFileSync(pages.get(pathname), "utf8");
        expect(target, href).toContain(`id="${anchor}"`);
      }
    }
  });

  it("links in-page anchors that exist", () => {
    for (const m of html.matchAll(/href="#([^"]+)"/g)) {
      expect(html, m[1]).toContain(`id="${m[1]}"`);
    }
  });

  it("points external links at the primary Debezium, MySQL and Microsoft docs only", () => {
    expect(external.length).toBeGreaterThanOrEqual(12);
    for (const url of external) {
      expect(url, url).toMatch(
        /^https:\/\/(debezium\.io\/documentation\/|github\.com\/debezium\/debezium\/blob\/main\/|dev\.mysql\.com\/doc\/|learn\.microsoft\.com\/en-us\/sql\/)/,
      );
    }
  });

  it("ships no console output", () => {
    expect(source).not.toMatch(/console\./);
  });
});

describe("/sql-server-mysql-cdc/ registration", () => {
  it("is in the series, in the Ops group, with a matching href", () => {
    const entry = series.find((s) => s.key === SLUG);
    expect(entry).toBeTruthy();
    expect(entry.href).toBe(`${SLUG}/`);
    expect(entry.tags.map((t) => t.label)).toContain("Ops");
    expect(entry.description.length).toBeGreaterThan(40);
    expect(new Set(series.map((s) => s.key)).size).toBe(series.length);
  });

  it("has at least two assistant intents, each with enough triggers and a link to the page", () => {
    const kb = parseAssistantYaml(read("src/data/assistant.yml"));
    const mine = kb.intents.filter((i) =>
      i.links.some((l) => l.url === `/${SLUG}/`),
    );
    expect(mine.map((i) => i.id)).toEqual([
      "mysql_binlog_purged",
      "sqlserver_cdc_jobs",
    ]);
    for (const intent of mine) {
      expect(intent.triggers.length, intent.id).toBeGreaterThanOrEqual(5);
    }
  });

  it("is linked from at least three existing lessons", () => {
    const from = [
      "src/troubleshooting/index.njk",
      "src/quickstart/quickstart-mysql/index.njk",
      "src/quickstart/quickstart-mssql/index.njk",
      "src/snapshotting/index.njk",
    ];
    const linking = from.filter((f) => read(f).includes(`'/${SLUG}/' | url`));
    expect(linking.length).toBeGreaterThanOrEqual(3);
  });
});
