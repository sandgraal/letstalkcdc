/**
 * Guard: the /postgres-replication-slots/ runbook (content-gap plan, M3).
 *
 * It must teach the site's thesis (a slot holds a position; delivery is
 * at-least-once; the sink is idempotent, keyed by primary key and ordered by
 * log position; there is no end-to-end exactly-once), carry the monitoring
 * query an operator can paste, say what max_slot_wal_keep_size trades, and
 * only link to pages and anchors that exist. Reads the real sources, not
 * copies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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

const SLUG = "postgres-replication-slots";
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

describe("/postgres-replication-slots/ front matter", () => {
  it("has a short title, a description within the limit and the right path", () => {
    expect(fm("layout")).toBe("base.njk");
    expect(fm("canonicalPath")).toBe(`/${SLUG}/`);
    expect(fm("title").length).toBeGreaterThan(0);
    expect(fm("title").length).toBeLessThanOrEqual(50);
    const description = fm("description");
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("carries the 2026-10-09 dates and the series key", () => {
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
    expect(data.seriesKey).toBe(SLUG);
  });

  it("renders exactly one h1 (the hero) and names the page in it", () => {
    expect(source).toContain(HERO_CALL);
    expect(source.match(HERO_CALL.replace(/[|{}()]/g, "\\$&"))).toHaveLength(1);
    expect(data.heroConfig.title).toMatch(/^Postgres Replication Slots/);
    expect(source).not.toMatch(/<h1[\s>]/);
    expect(html).not.toMatch(/<h1[\s>]/);
  });
});

describe("/postgres-replication-slots/ sections", () => {
  it.each([
    "triage",
    "how-slots-work",
    "why-it-fills",
    "cap",
    "debezium",
    "failover",
    "decision",
    "drop",
    "replay",
    "alerting",
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

  it("has the decision table with all four situations", () => {
    const table = html.match(
      /<section[^>]*id="decision"[\s\S]*?<\/section>/,
    )[0];
    for (const row of [
      "Lagging consumer",
      "Dead consumer",
      "Abandoned slot",
      "Invalidated slot",
    ]) {
      expect(table).toContain(row);
    }
    expect(table).toContain("/snapshotting/");
    expect(table).toContain("/reconciliation-surgery/");
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
    expect(html).toContain('id="replication-slots-quiz"');
  });
});

describe("/postgres-replication-slots/ monitoring query", () => {
  it("reads pg_replication_slots with the columns the runbook explains", () => {
    expect(sql).toMatch(/FROM pg_replication_slots/);
    for (const col of [
      "active",
      "active_pid",
      "wal_status",
      "safe_wal_size",
      "restart_lsn",
      "confirmed_flush_lsn",
    ]) {
      expect(sql, col).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("measures retained WAL as the gap between the current position and restart_lsn", () => {
    expect(sql).toMatch(
      /pg_wal_lsn_diff\(pg_current_wal_lsn\(\), restart_lsn\)/,
    );
    expect(sql).toMatch(
      /pg_wal_lsn_diff\(pg_current_wal_lsn\(\), confirmed_flush_lsn\)/,
    );
  });

  it("does not hide invalidated slots behind a NULL sort", () => {
    expect(sql).toMatch(/DESC NULLS LAST/);
    expect(text).toMatch(/lost.{0,40}NULL\s+restart_lsn/);
  });

  it("offers the other checks: WAL directory, catalog xmin, PG17 columns, failover readiness", () => {
    expect(sql).toMatch(/pg_ls_waldir\(\)/);
    expect(sql).toMatch(/age\(catalog_xmin\)/);
    expect(sql).toMatch(
      /inactive_since, invalidation_reason, failover, synced/,
    );
    expect(sql).toMatch(
      /synced AND NOT temporary AND invalidation_reason IS NULL/,
    );
  });

  it("says which version each column needs, and what was not run", () => {
    expect(text).toMatch(/PostgreSQL 13\+/);
    expect(text).toMatch(/PostgreSQL 17\+/);
    expect(text).toMatch(/PGlite/);
    expect(text).toMatch(/Not run/);
    expect(text).toMatch(/check your version/i);
  });

  it("drops a slot with pg_drop_replication_slot and says an active slot errors", () => {
    expect(sql).toMatch(/pg_drop_replication_slot\('[a-z_]+'\)/);
    expect(text).toMatch(/Dropping an active slot raises an error/);
  });
});

describe("/postgres-replication-slots/ retention cap", () => {
  const cap = html.match(/<section[^>]*id="cap"[\s\S]*?<\/section>/)[0];
  const capText = flat(cap);

  it("states the default and what exceeding it does", () => {
    expect(capText).toContain("max_slot_wal_keep_size");
    expect(capText).toMatch(/default is\s*-1/);
    expect(capText).toMatch(/unlimited/i);
    expect(capText).toMatch(/unreserved/);
    expect(capText).toMatch(/lost/);
    expect(capText).toMatch(/re-snapshot/);
  });

  it("frames the limit as a trade, with no number to copy", () => {
    expect(capText).toMatch(/disk for a lost slot/);
    expect(capText).toMatch(/peak WAL rate/);
    expect(capText).not.toMatch(/set (it )?to \d+\s*(GB|MB|TB)/i);
  });

  it("does not present wal_keep_size as the cap on slots", () => {
    expect(text).toMatch(/wal_keep_size\s+does not cap a slot/i);
    expect(text).toMatch(/minimum/);
  });
});

describe("/postgres-replication-slots/ Debezium section", () => {
  const dbz = flat(
    html.match(/<section[^>]*id="debezium"[\s\S]*?<\/section>/)[0],
  );

  it("covers heartbeats, the action query, slot naming and slot.drop.on.stop", () => {
    for (const s of [
      "heartbeat.interval.ms",
      "heartbeat.action.query",
      "slot.name",
      "slot.drop.on.stop",
      "publication",
    ]) {
      expect(dbz, s).toContain(s);
    }
    expect(dbz).toMatch(/own slot\s+name/);
    expect(dbz).toMatch(/heartbeat table must be in the\s+publication/);
  });

  it("explains confirmed_flush_lsn while the connector is down and says heartbeats are not exactly-once", () => {
    expect(dbz).toMatch(/confirmed_flush_lsn.{0,40}connector is down/);
    expect(dbz).toMatch(/at-least-once/);
    expect(dbz).toMatch(/do not make\s+delivery exactly-once/);
  });

  it("marks version-dependent settings instead of asserting them", () => {
    expect(dbz).toMatch(/lsn\.flush\.mode/);
    expect(dbz).toMatch(/check your version/i);
  });

  it("covers failover slots with their caveats", () => {
    const failover = flat(
      html.match(/<section[^>]*id="failover"[\s\S]*?<\/section>/)[0],
    );
    expect(failover).toMatch(/sync_replication_slots/);
    expect(failover).toMatch(/synchronized_standby_slots/);
    expect(failover).toMatch(/failover = true/);
    expect(failover).toMatch(/failover_ready/);
    expect(failover).toMatch(/My reading, not a documented guarantee/);
  });
});

describe("/postgres-replication-slots/ thesis", () => {
  it("teaches at-least-once, an idempotent sink, primary key and log position", () => {
    expect(text).toMatch(/at-least-once/);
    expect(text).toMatch(/idempotent/);
    expect(text).toMatch(/primary key/);
    expect(text).toMatch(/log position/);
    expect(text).toMatch(/re-snapshot/);
  });

  it("denies end-to-end exactly-once rather than promising it", () => {
    expect(text).toMatch(/no end-to-end exactly-once/i);
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
    expect(text).toMatch(/Do not order by an event timestamp/);
    expect(text).not.toMatch(/\bdelete is complete\b/i);
  });

  it("links to the pages that carry the sink patterns", () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toContain("/partitioning/#recon");
    expect(hrefs).toContain("/materialization/");
    expect(hrefs).toContain("/snapshotting/");
    expect(hrefs).toContain("/reconciliation-surgery/");
    expect(hrefs).toContain("/ops-offsets/");
    expect(hrefs).toContain("/connector-builder/");
  });

  it("says alert thresholds depend on write rate and disk, with no hard-coded value", () => {
    const alerting = flat(
      html.match(/<section[^>]*id="alerting"[\s\S]*?<\/section>/)[0],
    );
    expect(alerting).toMatch(/write rate/);
    expect(alerting).toMatch(/free space/);
    expect(alerting).toMatch(/is a guess/);
    expect(alerting).not.toMatch(/\b\d+\s?(GB|MB|TB)\b/);
  });
});

describe("/postgres-replication-slots/ links", () => {
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

  it("only links to pages that exist (the playground is a passthrough)", () => {
    for (const href of new Set(internal)) {
      const [pathname] = href.split("#");
      if (pathname === "/playground/") {
        expect(existsSync(path.join(ROOT, "playground/index.html"))).toBe(true);
      } else {
        expect(pages.has(pathname), href).toBe(true);
      }
    }
  });

  it("only links to anchors that exist on the target page or glossary", () => {
    const slugs = new Set(glossary.map((g) => g.slug));
    for (const href of new Set(internal)) {
      const [pathname, anchor] = href.split("#");
      if (!anchor || pathname === "/playground/") continue;
      if (pathname === "/glossary/") {
        expect(slugs.has(anchor), href).toBe(true);
      } else {
        const target = readFileSync(pages.get(pathname), "utf8");
        expect(target, href).toContain(`id="${anchor}"`);
      }
    }
  });

  it("points external links at the primary PostgreSQL and Debezium docs only", () => {
    expect(external.length).toBeGreaterThanOrEqual(8);
    for (const url of external) {
      expect(url, url).toMatch(
        /^https:\/\/(www\.postgresql\.org\/docs\/|debezium\.io\/documentation\/)/,
      );
    }
  });

  it("ships no console output", () => {
    expect(source).not.toMatch(/console\./);
  });
});

describe("/postgres-replication-slots/ registration", () => {
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
    // New intents carry no module boost (pinned in the knowledge-base test),
    // so find ours by what they link to.
    const mine = kb.intents.filter((i) =>
      i.links.some((l) => l.url === `/${SLUG}/`),
    );
    expect(mine.map((i) => i.id)).toEqual([
      "replication_slot_wal",
      "debezium_heartbeat",
    ]);
    for (const intent of mine) {
      expect(intent.triggers.length, intent.id).toBeGreaterThanOrEqual(5);
      expect(
        intent.links.some((l) => l.url === `/${SLUG}/`),
        intent.id,
      ).toBe(true);
    }
  });

  it("is linked from at least three existing lessons", () => {
    const from = [
      "src/troubleshooting/index.njk",
      "src/quickstart/quickstart-postgres/index.njk",
      "src/cloud-labs/fivetran/index.njk",
      "src/cloud-labs/snowflake-cdc/index.njk",
      "src/observability/index.njk",
      "src/snapshotting/index.njk",
    ];
    const linking = from.filter((f) => read(f).includes(`'/${SLUG}/' | url`));
    expect(linking.length).toBeGreaterThanOrEqual(3);
  });
});
