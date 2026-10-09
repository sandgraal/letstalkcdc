/**
 * Unit tests for lib/lighthouse-ci.mjs, the pure half of
 * scripts/lighthouse-ci.mjs. No browser: scores are fixtures.
 *
 * The last block runs the repo's real lighthouse-ci.config.json through the
 * same evaluator, so the floors CI enforces on /intro/ are pinned here.
 *
 * @module tests/unit/lib/lighthouse-ci.test
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  aggregate,
  categoryScores,
  contentTypeFor,
  evaluateAssertions,
  formatTable,
  isCompressible,
  median,
  slugForUrl,
  summarizeResults,
  urlToRelativePath,
  validateConfig,
} from "../../../lib/lighthouse-ci.mjs";

const config = JSON.parse(readFileSync("lighthouse-ci.config.json", "utf8"));

describe("median / aggregate", () => {
  it("takes the middle of an odd count regardless of order", () => {
    expect(median([0.9, 0.7, 0.8])).toBe(0.8);
  });

  it("averages the two middle values of an even count", () => {
    expect(median([0.6, 0.8, 0.7, 0.9])).toBeCloseTo(0.75);
  });

  it("is NaN for no values", () => {
    expect(median([])).toBeNaN();
  });

  it("is not moved by one outlier run", () => {
    expect(aggregate([0.86, 0.85, 0.2], "median")).toBe(0.85);
  });

  it("optimistic is the best run, pessimistic the worst", () => {
    expect(aggregate([0.8, 0.9, 0.7], "optimistic")).toBe(0.9);
    expect(aggregate([0.8, 0.9, 0.7], "pessimistic")).toBe(0.7);
  });

  it("ignores runs with no score, but pessimistic refuses them", () => {
    expect(aggregate([0.9, null, 0.8], "median")).toBeCloseTo(0.85);
    expect(aggregate([0.9, null, 0.8], "pessimistic")).toBeNaN();
  });

  it("is NaN when no run produced a score", () => {
    expect(aggregate([null, null, null], "median")).toBeNaN();
  });

  it("rejects an unknown method", () => {
    expect(() => aggregate([1], "mean")).toThrow(/Unknown aggregation/);
  });
});

describe("categoryScores", () => {
  it("keys scores as categories:<id> and keeps unscored categories as null", () => {
    const lhr = {
      categories: {
        performance: { score: 0.86 },
        seo: { score: 1 },
        accessibility: { score: null },
      },
    };
    expect(categoryScores(lhr)).toEqual({
      "categories:performance": 0.86,
      "categories:seo": 1,
      "categories:accessibility": null,
    });
  });

  it("copes with a result that has no categories", () => {
    expect(categoryScores({})).toEqual({});
  });
});

describe("evaluateAssertions", () => {
  const matrix = [
    {
      matchingUrlPattern: ".*",
      assertions: { "categories:performance": ["warn", { minScore: 0.9 }] },
    },
    {
      matchingUrlPattern: ".*/intro/index\\.html$",
      assertions: { "categories:performance": ["error", { minScore: 0.82 }] },
    },
  ];

  it("checks every matching entry, so warn and error floors both report", () => {
    const results = evaluateAssertions(matrix, "/intro/index.html", {
      "categories:performance": [0.86, 0.85, 0.87],
    });
    expect(results.map((r) => [r.level, r.passed])).toEqual([
      ["warn", false],
      ["error", true],
    ]);
    const { errors, warnings } = summarizeResults(results);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it("an error-level miss lands in errors", () => {
    const results = evaluateAssertions(matrix, "/intro/index.html", {
      "categories:performance": [0.8, 0.79, 0.81],
    });
    expect(summarizeResults(results).errors).toHaveLength(1);
  });

  it("does not apply the /intro/ floor to other pages", () => {
    const results = evaluateAssertions(matrix, "/overview/index.html", {
      "categories:performance": [0.5, 0.5, 0.5],
    });
    expect(results.map((r) => r.level)).toEqual(["warn"]);
    expect(summarizeResults(results).errors).toHaveLength(0);
  });

  it("treats a score equal to the floor as passing", () => {
    const results = evaluateAssertions(matrix, "/intro/index.html", {
      "categories:performance": [0.82, 0.82, 0.82],
    });
    expect(results.find((r) => r.level === "error").passed).toBe(true);
  });

  it("fails an assertion whose category produced no score, never passes it silently", () => {
    const results = evaluateAssertions(matrix, "/intro/index.html", {
      "categories:performance": [null, null, null],
    });
    expect(summarizeResults(results).errors).toHaveLength(1);
    const missing = evaluateAssertions(matrix, "/intro/index.html", {});
    expect(summarizeResults(missing).errors).toHaveLength(1);
  });

  it("skips assertions switched off", () => {
    const off = [
      { matchingUrlPattern: ".*", assertions: { "categories:seo": "off" } },
    ];
    expect(
      evaluateAssertions(off, "/index.html", { "categories:seo": [0] }),
    ).toEqual([]);
  });

  it("uses the aggregation it is given", () => {
    const scores = { "categories:performance": [0.7, 0.7, 0.95] };
    const asMedian = evaluateAssertions(
      matrix,
      "/intro/index.html",
      scores,
      "median",
    );
    const asBest = evaluateAssertions(
      matrix,
      "/intro/index.html",
      scores,
      "optimistic",
    );
    expect(summarizeResults(asMedian).errors).toHaveLength(1);
    expect(summarizeResults(asBest).errors).toHaveLength(0);
  });
});

describe("urlToRelativePath", () => {
  it("maps explicit files and directory URLs the way a root static server does", () => {
    expect(urlToRelativePath("/intro/index.html")).toBe("intro/index.html");
    expect(urlToRelativePath("/intro/")).toBe("intro/index.html");
    expect(urlToRelativePath("/")).toBe("index.html");
    expect(urlToRelativePath("/assets/css/styles.css")).toBe(
      "assets/css/styles.css",
    );
  });

  it("ignores query strings and hashes", () => {
    expect(urlToRelativePath("/assets/app.js?v=3#x")).toBe("assets/app.js");
  });

  it("decodes percent-escapes", () => {
    expect(urlToRelativePath("/a%20b.txt")).toBe("a b.txt");
  });

  it("refuses traversal, backslashes, NUL and bad escapes", () => {
    expect(urlToRelativePath("/../package.json")).toBeNull();
    expect(urlToRelativePath("/a/%2e%2e/b")).toBeNull();
    expect(urlToRelativePath("/a%5Cb")).toBeNull();
    expect(urlToRelativePath("/a%00b")).toBeNull();
    expect(urlToRelativePath("/%E0%A4%A")).toBeNull();
  });
});

describe("static server helpers", () => {
  it("sends the content types a browser needs to apply CSS and run modules", () => {
    expect(contentTypeFor("a/index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("styles.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeFor("app.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeFor("logo.SVG")).toBe("image/svg+xml");
    expect(contentTypeFor("font.woff2")).toBe("font/woff2");
    expect(contentTypeFor("blob.xyz")).toBe("application/octet-stream");
    expect(contentTypeFor("noext")).toBe("application/octet-stream");
  });

  it("compresses text-like types only", () => {
    for (const file of [
      "a.html",
      "a.css",
      "a.js",
      "a.json",
      "a.svg",
      "a.xml",
    ]) {
      expect(isCompressible(contentTypeFor(file))).toBe(true);
    }
    for (const file of ["a.png", "a.woff2", "a.jpg"]) {
      expect(isCompressible(contentTypeFor(file))).toBe(false);
    }
  });

  it("makes a flat filename from a URL path", () => {
    expect(slugForUrl("/intro/index.html")).toBe("intro-index");
    expect(slugForUrl("/index.html")).toBe("index");
    expect(slugForUrl("/")).toBe("root");
  });
});

describe("formatTable", () => {
  it("aligns a header, a rule and one row per URL", () => {
    const table = formatTable(
      [
        {
          url: "/intro/index.html",
          scores: { "categories:performance": 0.86, "categories:seo": 1 },
        },
        {
          url: "/index.html",
          scores: { "categories:performance": NaN, "categories:seo": 0.9 },
        },
      ],
      ["categories:performance", "categories:seo"],
    ).split("\n");
    expect(table).toHaveLength(4);
    expect(table[0]).toMatch(/^URL\s+performance\s+seo$/);
    expect(table[2]).toMatch(/^\/intro\/index\.html\s+0\.86\s+1\.00$/);
    expect(table[3]).toMatch(/n\/a/);
  });
});

describe("lighthouse-ci.config.json", () => {
  it("is valid for the script", () => {
    expect(validateConfig(config)).toEqual([]);
  });

  it("rejects configs the script cannot honour", () => {
    const bad = {
      runs: 0,
      aggregation: "mean",
      distDir: "",
      outputDir: ".lighthouseci",
      urls: ["intro"],
      assertMatrix: [
        { matchingUrlPattern: "(", assertions: {} },
        {
          matchingUrlPattern: ".*",
          assertions: { "first-contentful-paint": ["warn", { minScore: 0.9 }] },
        },
        {
          matchingUrlPattern: ".*",
          assertions: { "categories:seo": ["fatal", {}] },
        },
      ],
    };
    expect(validateConfig(bad)).toHaveLength(8);
  });

  it("keeps the /intro/ floors: performance >= 0.82 and accessibility >= 0.93 are errors", () => {
    const intro = "/intro/index.html";
    const at = (perf, a11y) =>
      evaluateAssertions(
        config.assertMatrix,
        intro,
        {
          "categories:performance": [perf],
          "categories:accessibility": [a11y],
          "categories:best-practices": [1],
          "categories:seo": [1],
        },
        config.aggregation,
      );
    expect(summarizeResults(at(0.82, 0.93)).errors).toHaveLength(0);
    expect(
      summarizeResults(at(0.81, 0.93)).errors.map((r) => r.auditId),
    ).toEqual(["categories:performance"]);
    expect(
      summarizeResults(at(0.82, 0.92)).errors.map((r) => r.auditId),
    ).toEqual(["categories:accessibility"]);
  });

  it("holds every URL to a 0.9 warning on all four categories, with no errors elsewhere", () => {
    for (const url of config.urls.filter((u) => u !== "/intro/index.html")) {
      const results = evaluateAssertions(
        config.assertMatrix,
        url,
        Object.fromEntries(
          ["performance", "accessibility", "best-practices", "seo"].map((c) => [
            `categories:${c}`,
            [0.5],
          ]),
        ),
        config.aggregation,
      );
      expect(results).toHaveLength(4);
      expect(
        results.every((r) => r.level === "warn" && r.minScore === 0.9),
      ).toBe(true);
    }
  });

  it("audits the same five pages as before", () => {
    expect(config.urls).toEqual([
      "/index.html",
      "/intro/index.html",
      "/overview/index.html",
      "/quickstarts/index.html",
      "/snapshotting/index.html",
    ]);
    expect(config.runs).toBe(3);
  });
});
