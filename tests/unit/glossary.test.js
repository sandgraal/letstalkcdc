/**
 * Guard: the glossary defines the words the lessons use (P16-14).
 *
 * The first half checks the data file: every entry has a slug and a
 * definition, slugs are unique and kebab-case, every `related` target exists,
 * and the ten terms the SEO audit found most-used-and-undefined are present.
 * The second half runs one real production Eleventy build into a scratch
 * directory (on a made-up host and prefix) and checks what a reader gets:
 * each term has an anchor on /glossary/, and lessons deep-link to those
 * anchors with the path prefix applied and a target that exists.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import glossary from "../../src/_data/glossary.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ELEVENTY_BIN = path.join(
  ROOT,
  "node_modules",
  "@11ty",
  "eleventy",
  "cmd.cjs",
);
const PREFIX = "/site";

const NEW_TERMS = [
  "upsert",
  "kafka-connect",
  "deduplication",
  "replication-slot",
  "backfill",
  "at-least-once",
  "schema-registry",
  "outbox",
  "smt",
  "watermark",
];

describe("glossary data", () => {
  const slugs = glossary.map((e) => e.slug);

  it("gives every entry a term, a kebab-case slug and a definition", () => {
    for (const entry of glossary) {
      expect(entry.term, entry.slug).toMatch(/\S/);
      expect(entry.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(entry.definition, entry.slug).toMatch(/<p>[\s\S]*\S[\s\S]*<\/p>/);
    }
  });

  it("has no duplicate slugs or terms", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    const terms = glossary.map((e) => e.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("only relates entries to slugs that exist, and never to themselves", () => {
    for (const entry of glossary) {
      for (const target of entry.related ?? []) {
        expect(slugs, `${entry.slug} -> ${target}`).toContain(target);
        expect(target).not.toBe(entry.slug);
      }
    }
  });

  it("defines the ten most-used terms from the SEO audit, each with related links", () => {
    for (const slug of NEW_TERMS) {
      const entry = glossary.find((e) => e.slug === slug);
      expect(entry, slug).toBeDefined();
      expect(entry.related?.length, `${slug} related`).toBeGreaterThan(0);
    }
  });

  it("keeps definitions short and free of root-relative links", () => {
    for (const slug of NEW_TERMS) {
      const { definition } = glossary.find((e) => e.slug === slug);
      const text = definition.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const sentences = text.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) ?? [];
      expect(sentences.length, slug).toBeLessThanOrEqual(4);
      expect(definition).not.toMatch(/href="\//);
    }
  });

  it("holds the delivery-semantics thesis in the wording", () => {
    const get = (slug) =>
      glossary.find((e) => e.slug === slug).definition.replace(/\s+/g, " ");
    // Per hop, and not exactly-once end to end.
    expect(get("at-least-once")).toMatch(/per-hop/);
    expect(get("at-least-once")).toMatch(
      /not make the pipeline\s+exactly-once/,
    );
    // Ordering is by log position, never by timestamp or Kafka offset.
    expect(get("deduplication")).toMatch(/log position/);
    expect(get("deduplication")).toMatch(/not by timestamp or Kafka offset/);
    // Unconsumed slots retain WAL.
    expect(get("replication-slot")).toMatch(/retains WAL/);
    expect(get("replication-slot")).toMatch(/max_slot_wal_keep_size/);
  });
});

function walkHtml(dir, rel = "") {
  return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(
    (d) => {
      const r = path.join(rel, d.name);
      if (d.isDirectory()) return walkHtml(dir, r);
      return r.endsWith(".html") ? [r] : [];
    },
  );
}

describe("built site", () => {
  let out;
  let pages; // relative html path -> html
  let glossaryHtml;
  /** [page, slug] for every deep link into /glossary/#slug outside /glossary/ */
  let deepLinks;

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-glossary-"));
    execFileSync(
      process.execPath,
      [ELEVENTY_BIN, "--config=eleventy.config.mjs", `--output=${out}`],
      {
        cwd: ROOT,
        stdio: "pipe",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "",
          NODE_ENV: "production",
          SITE_HOST: "https://example.org",
          ELEVENTY_PATH_PREFIX: PREFIX,
        },
      },
    );
    pages = new Map(
      walkHtml(out).map((f) => [f, readFileSync(path.join(out, f), "utf8")]),
    );
    glossaryHtml = readFileSync(
      path.join(out, "glossary", "index.html"),
      "utf8",
    );
    const re = new RegExp(`href="${PREFIX}/glossary/#([a-z0-9-]+)"`, "g");
    deepLinks = [];
    for (const [file, html] of pages) {
      if (file === path.join("glossary", "index.html")) continue;
      for (const m of html.matchAll(re)) deepLinks.push([file, m[1]]);
    }
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it("renders /glossary/ with an anchor for every entry", () => {
    expect(existsSync(path.join(out, "glossary", "index.html"))).toBe(true);
    const ids = new Set(
      [...glossaryHtml.matchAll(/<dt id="([^"]+)"/g)].map((m) => m[1]),
    );
    for (const { slug } of glossary) expect(ids.has(slug), slug).toBe(true);
    expect(ids.size).toBe(glossary.length);
  });

  it("links every new term from at least two lessons", () => {
    for (const slug of NEW_TERMS) {
      const from = new Set(
        deepLinks.filter(([, s]) => s === slug).map(([f]) => f),
      );
      expect(
        from.size,
        `${slug} linked from ${[...from].join(", ")}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("points every deep link at an anchor that exists", () => {
    const ids = new Set(glossary.map((e) => e.slug));
    for (const [file, slug] of deepLinks) {
      expect(ids.has(slug), `${file} -> #${slug}`).toBe(true);
    }
  });

  it("has more than 20 content links into /glossary/ from lessons", () => {
    expect(deepLinks.length).toBeGreaterThan(20);
  });
});
