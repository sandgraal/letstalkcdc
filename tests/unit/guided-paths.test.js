/**
 * Guard for the guided-path data (P17-31): src/_data/paths.mjs against
 * series.mjs, the validator's failure modes, and the /path/ page (source,
 * client-side progress and the built HTML).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import series from "../../src/_data/series.mjs";
import tracks from "../../src/_data/paths.mjs";
import {
  validatePaths,
  resolvePaths,
  REQUIRED_TRACKS,
} from "../../lib/guided-paths.mjs";
import { applyPathProgress } from "../../src/assets/js/pages/path.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const good = () => [
  { key: "newcomer", title: "N", audience: "a", summary: "s", steps: [] },
  {
    key: "operator",
    title: "O",
    audience: "a",
    summary: "s",
    steps: [{ href: "intro/", reason: "why" }],
  },
  { key: "architect", title: "A", audience: "a", summary: "s", steps: [] },
];

describe("guided path data", () => {
  it("defines the three tracks in order and validates against series.mjs", () => {
    expect(tracks.map((t) => t.key)).toEqual(REQUIRED_TRACKS);
    expect(validatePaths(tracks, series)).toEqual([]);
  });

  it("references only pages that exist in series.mjs, once per track", () => {
    const hrefs = new Set(series.map((s) => s.href));
    for (const track of tracks) {
      const seen = track.steps.map((s) => s.href);
      expect(new Set(seen).size, track.key).toBe(seen.length);
      for (const href of seen) expect(hrefs.has(href), href).toBe(true);
    }
  });

  it("has a non-empty title, audience, summary and reason everywhere", () => {
    for (const track of tracks) {
      for (const f of ["title", "audience", "summary"]) {
        expect(track[f].trim(), `${track.key}.${f}`).not.toBe("");
      }
      for (const step of track.steps) {
        expect(step.reason.trim(), step.href).not.toBe("");
      }
    }
  });

  it("resolves each step to its series key and title", () => {
    const intro = tracks[0].steps[0];
    expect(intro.key).toBe("intro");
    expect(intro.title).toBe(series.find((s) => s.key === "intro").title);
  });

  it("accepts a valid set and rejects each kind of mistake", () => {
    expect(validatePaths(good(), series)).toEqual([]);

    const unknown = good();
    unknown[0].steps = [{ href: "nope/", reason: "x" }];
    expect(validatePaths(unknown, series).join()).toMatch(/not a page/);

    const dup = good();
    dup[1].steps.push({ href: "intro/", reason: "again" });
    expect(validatePaths(dup, series).join()).toMatch(/duplicate step/);

    const blankTitle = good();
    blankTitle[2].title = "  ";
    expect(validatePaths(blankTitle, series).join()).toMatch(/empty title/);

    const noReason = good();
    noReason[1].steps[0].reason = "";
    expect(validatePaths(noReason, series).join()).toMatch(/no reason/);

    expect(validatePaths(good().slice(1), series).join()).toMatch(/missing/);
    expect(validatePaths(good().reverse(), series).join()).toMatch(/ordered/);
    const dupTrack = good();
    dupTrack.push({ ...dupTrack[0] });
    expect(validatePaths(dupTrack, series).join()).toMatch(/duplicate track/);
    expect(() => resolvePaths(unknown, series)).toThrow(/Invalid guided path/);
  });

  it("does not count a disabled series entry as a page", () => {
    const withDisabled = [
      ...series,
      { key: "x", href: "x/", state: "disabled" },
    ];
    const t = good();
    t[0].steps = [{ href: "x/", reason: "r" }];
    expect(validatePaths(t, withDisabled).join()).toMatch(/not a page/);
  });
});

describe("/path/ registration and source", () => {
  const page = read("src/path/index.njk");
  const data = require(path.join(ROOT, "src/path/index.11tydata.cjs"));
  const front = /^---\n([\s\S]*?)\n---/.exec(page)[1];
  const fm = (k) => new RegExp(`^${k}:\\s*"(.*)"\\s*$`, "m").exec(front)?.[1];

  it("is registered in series.mjs with a matching seriesKey", () => {
    const entry = series.find((s) => s.key === "path");
    expect(entry.href).toBe("path/");
    expect(data.seriesKey).toBe("path");
  });

  it("has a description of at most 160 characters, dates and a canonical path", () => {
    expect(fm("description").length).toBeLessThanOrEqual(160);
    expect(fm("canonicalPath")).toBe("/path/");
    expect(data.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses | url for every internal link and has no hardcoded root href", () => {
    expect(page).not.toMatch(/href="\//);
    expect(page).not.toMatch(/<h1/i);
  });

  it("makes no network call and writes no console output", () => {
    const js = read("src/assets/js/pages/path.js");
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|console\./);
  });

  it("holds the thesis and does not claim a review", () => {
    const text = page.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toMatch(/at-least-once/);
    expect(text).toMatch(/idempotent sink/);
    expect(text).toMatch(/log position/);
    expect(text).toMatch(/no end-to-end exactly-once is claimed/);
    expect(text).toMatch(/AI-assisted/);
    expect(text).not.toMatch(/reviewed by|SME/i);
  });
});

describe("applyPathProgress", () => {
  const html = `<section data-path-track>
    <p role="status" data-path-progress>2 steps.</p>
    <ol>
      <li data-path-step data-series-key="a"><a href="#">Alpha</a><span data-path-status></span></li>
      <li data-path-step data-series-key="b"><a href="#">Beta</a><span data-path-status></span></li>
    </ol></section>`;
  const make = () => new JSDOM(html).window.document;

  it("leaves the static markup alone's meaning: nothing completed, nothing labelled", () => {
    const doc = make();
    applyPathProgress(doc, new Set(), {});
    expect(doc.querySelector("[data-path-progress]").textContent).toBe(
      "0 of 2 steps complete. Next: Alpha.",
    );
    expect(doc.querySelectorAll("[data-path-status]")[0].textContent).toBe("");
  });

  it("labels completed and opened steps in words and names the next step", () => {
    const doc = make();
    applyPathProgress(doc, new Set(["a"]), { b: { visitCount: 1 } });
    const [a, b] = doc.querySelectorAll("[data-path-step]");
    expect(a.textContent).toContain("(completed)");
    expect(b.textContent).toContain("(opened, not marked complete)");
    expect(doc.querySelector("[data-path-progress]").textContent).toBe(
      "1 of 2 steps complete. Next: Beta.",
    );
  });

  it("reports a finished track", () => {
    const doc = make();
    applyPathProgress(doc, new Set(["a", "b"]), {});
    expect(doc.querySelector("[data-path-progress]").textContent).toBe(
      "2 of 2 steps complete. Track complete.",
    );
  });

  it("ignores completed keys that are not on the page", () => {
    const doc = make();
    applyPathProgress(doc, new Set(["zzz"]), {});
    expect(doc.querySelector("[data-path-progress]").textContent).toMatch(
      /^0 of 2/,
    );
  });
});

describe("/path/ built page", () => {
  const PREFIX = "/site";
  let out;
  let doc;

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-path-"));
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"),
        "--config=eleventy.config.mjs",
        `--output=${out}`,
      ],
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
    const file = path.join(out, "path", "index.html");
    expect(existsSync(file)).toBe(true);
    doc = new JSDOM(readFileSync(file, "utf8")).window.document;
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it("has one h1 and h2s for the intro and each track, in order", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    const h2 = [...doc.querySelectorAll("main h2, #main-content h2")].map((h) =>
      h.textContent.trim(),
    );
    const own = ["How the paths work", "Newcomer", "Operator", "Architect"];
    expect(h2.filter((t) => own.includes(t))).toEqual(own);
  });

  it("lists each seeded step as a prefixed link without JavaScript", () => {
    const link = doc.querySelector("[data-path-step] a");
    expect(link.getAttribute("href")).toBe(`${PREFIX}/intro/`);
    expect(doc.querySelectorAll("[data-path-track]")).toHaveLength(3);
  });

  it("tells the reader when a track is not written yet", () => {
    const operator = doc.getElementById("operator");
    expect(operator.textContent).toMatch(/still being written/);
    expect(operator.querySelector("a").getAttribute("href")).toBe(
      `${PREFIX}/intro/`,
    );
  });

  it("loads the page script and keeps the thesis sentence", () => {
    const srcs = [...doc.querySelectorAll("script[src]")].map((s) =>
      s.getAttribute("src"),
    );
    expect(srcs).toContain(`${PREFIX}/assets/js/pages/path.js`);
    expect(doc.body.textContent).toMatch(/no end-to-end exactly-once/);
  });
});
