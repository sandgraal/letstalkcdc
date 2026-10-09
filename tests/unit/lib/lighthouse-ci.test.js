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
  checkRunCoverage,
  exitCodeFor,
  hasErrorAssertions,
  formatTable,
  incompleteReason,
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

  it("defaults to optimistic, the best run", () => {
    expect(aggregate([0.65, 0.65, 0.87])).toBe(0.87);
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

  it("defaults to the best run, as Lighthouse CI did", () => {
    const scores = { "categories:performance": [0.65, 0.65, 0.87] };
    const results = evaluateAssertions(matrix, "/intro/index.html", scores);
    expect(results.map((r) => r.aggregation)).toEqual([
      "optimistic",
      "optimistic",
    ]);
    expect(summarizeResults(results).errors).toHaveLength(0);
  });

  it("[0.65, 0.65, 0.87] passes a 0.82 floor under optimistic and fails under median", () => {
    const scores = { "categories:performance": [0.65, 0.65, 0.87] };
    const optimistic = evaluateAssertions(
      matrix,
      "/intro/index.html",
      scores,
      "optimistic",
    );
    const asMedian = evaluateAssertions(
      matrix,
      "/intro/index.html",
      scores,
      "median",
    );
    expect(summarizeResults(optimistic).errors).toHaveLength(0);
    expect(summarizeResults(asMedian).errors).toHaveLength(1);
  });

  it("a page that is bad in every run still fails under optimistic", () => {
    const scores = { "categories:performance": [0.7, 0.71, 0.69] };
    const results = evaluateAssertions(matrix, "/intro/index.html", scores);
    expect(summarizeResults(results).errors).toHaveLength(1);
  });

  it("an assertion's own aggregationMethod overrides the default", () => {
    const strict = [
      {
        matchingUrlPattern: ".*",
        assertions: {
          "categories:performance": [
            "error",
            { minScore: 0.82, aggregationMethod: "median" },
          ],
        },
      },
    ];
    const results = evaluateAssertions(
      strict,
      "/intro/index.html",
      { "categories:performance": [0.65, 0.65, 0.87] },
      "optimistic",
    );
    expect(results[0].aggregation).toBe("median");
    expect(summarizeResults(results).errors).toHaveLength(1);
  });

  it("runs with no score are excluded, not counted as zeros or passes", () => {
    const scores = { "categories:performance": [null, 0.65, 0.87] };
    const results = evaluateAssertions(matrix, "/intro/index.html", scores);
    expect(results.find((r) => r.level === "error").actual).toBe(0.87);
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

describe("incompleteReason", () => {
  const good = {
    audits: {
      "largest-contentful-paint": {
        scoreDisplayMode: "numeric",
        numericValue: 2566,
      },
      "lcp-breakdown-insight": { scoreDisplayMode: "informative" },
    },
  };

  it("accepts a run that painted and recorded an LCP", () => {
    expect(incompleteReason(good)).toBeNull();
  });

  it("rejects a runtime error such as NO_FCP, with its message", () => {
    expect(
      incompleteReason({
        runtimeError: { code: "NO_FCP", message: "did not paint" },
      }),
    ).toBe("did not paint");
  });

  it("rejects a run whose LCP audit has no value or errored", () => {
    const noValue = structuredClone(good);
    delete noValue.audits["largest-contentful-paint"].numericValue;
    expect(incompleteReason(noValue)).toMatch(/Largest Contentful Paint/);

    const errored = structuredClone(good);
    errored.audits["largest-contentful-paint"].scoreDisplayMode = "error";
    expect(incompleteReason(errored)).toMatch(/Largest Contentful Paint/);

    expect(incompleteReason({ audits: {} })).toMatch(
      /Largest Contentful Paint/,
    );
    expect(incompleteReason(undefined)).toMatch(/Largest Contentful Paint/);
  });

  it("rejects a NO_LCP run: fallback LCP of ~7.7 s, LCP insights notApplicable", () => {
    // Shape taken from a real report of the flaky run (perf 0.71 vs 0.91).
    const noLcp = {
      audits: {
        "largest-contentful-paint": {
          scoreDisplayMode: "numeric",
          numericValue: 7682.55,
          score: 0.03,
        },
        "lcp-breakdown-insight": { scoreDisplayMode: "notApplicable" },
        "lcp-discovery-insight": { scoreDisplayMode: "notApplicable" },
      },
    };
    expect(incompleteReason(noLcp)).toMatch(/NO_LCP/);
  });

  it("does not reject a slow but well-formed run", () => {
    const slow = structuredClone(good);
    slow.audits["largest-contentful-paint"].numericValue = 9000;
    expect(incompleteReason(slow)).toBeNull();
  });
});

describe("run coverage policy (checkRunCoverage)", () => {
  const matrix = config.assertMatrix;
  const check = (urlPath, valid, extra = {}) =>
    checkRunCoverage({
      matrix,
      urlPath,
      valid,
      requested: 3,
      minValidRuns: config.minValidRuns,
      minValidRunsForError: config.minValidRunsForError,
      ...extra,
    });

  it("says nothing when every run is valid", () => {
    expect(check("/overview/index.html", 3)).toEqual({
      fatal: null,
      warning: null,
    });
    expect(check("/intro/index.html", 3)).toEqual({
      fatal: null,
      warning: null,
    });
  });

  it("warns, naming the URL and the counts, when some runs are invalid", () => {
    const { fatal, warning } = check("/overview/index.html", 1);
    expect(fatal).toBeNull();
    expect(warning).toContain("/overview/index.html");
    expect(warning).toContain("1 of 3 runs valid, 2 invalid");
    expect(check("/overview/index.html", 2).warning).toContain(
      "2 of 3 runs valid, 1 invalid",
    );
  });

  it("is fatal when a URL has zero valid runs", () => {
    const { fatal, warning } = check("/overview/index.html", 0);
    expect(fatal).toContain("/overview/index.html");
    expect(fatal).toContain("no usable run");
    expect(warning).toBeNull();
  });

  it("is fatal when /intro/ (error floors) has fewer than 2 valid runs", () => {
    const { fatal } = check("/intro/index.html", 1);
    expect(fatal).toContain("/intro/index.html");
    expect(fatal).toContain("at least 2 valid runs");
  });

  it("accepts 2 valid runs on /intro/ but still warns about the invalid one", () => {
    const { fatal, warning } = check("/intro/index.html", 2);
    expect(fatal).toBeNull();
    expect(warning).toContain("2 of 3 runs valid, 1 invalid");
  });

  it("never asks for more valid runs than were requested", () => {
    expect(check("/intro/index.html", 1, { requested: 1 })).toEqual({
      fatal: null,
      warning: null,
    });
    expect(check("/index.html", 0, { requested: 1 }).fatal).toContain(
      "no usable run",
    );
  });

  it("knows which URLs carry error floors", () => {
    expect(hasErrorAssertions(matrix, "/intro/index.html")).toBe(true);
    expect(hasErrorAssertions(matrix, "/overview/index.html")).toBe(false);
  });

  it("maps to exit codes: warning only is 0, fatal coverage is 2 (infrastructure)", () => {
    const warned = check("/overview/index.html", 1);
    expect(
      exitCodeFor({ results: [], infrastructureError: !!warned.fatal }),
    ).toBe(0);
    const zero = check("/overview/index.html", 0);
    expect(
      exitCodeFor({ results: [], infrastructureError: !!zero.fatal }),
    ).toBe(2);
    const lone = check("/intro/index.html", 1);
    expect(
      exitCodeFor({ results: [], infrastructureError: !!lone.fatal }),
    ).toBe(2);
  });

  it("asserts on the valid runs only: [0.87] alone still satisfies an optimistic 0.82", () => {
    const results = evaluateAssertions(
      matrix,
      "/overview/index.html",
      { "categories:performance": [0.87] },
      config.aggregation,
    );
    expect(results.every((r) => r.passed || r.level === "warn")).toBe(true);
    expect(exitCodeFor({ results })).toBe(0);
  });
});

describe("exitCodeFor", () => {
  const pass = { level: "error", passed: true };
  const warnFail = { level: "warn", passed: false };
  const errorFail = { level: "error", passed: false };

  it("is 0 when everything passes", () => {
    expect(exitCodeFor({ results: [pass, pass] })).toBe(0);
    expect(exitCodeFor({ results: [] })).toBe(0);
  });

  it("is 0 when only warnings failed", () => {
    expect(exitCodeFor({ results: [pass, warnFail] })).toBe(0);
  });

  it("is 1 when an error assertion failed, even with warnings too", () => {
    expect(exitCodeFor({ results: [errorFail] })).toBe(1);
    expect(exitCodeFor({ results: [warnFail, errorFail, pass] })).toBe(1);
  });

  it("is 2 for an infrastructure error, which outranks any assertion result", () => {
    expect(exitCodeFor({ infrastructureError: true })).toBe(2);
    expect(
      exitCodeFor({ results: [errorFail], infrastructureError: true }),
    ).toBe(2);
    expect(exitCodeFor({ results: [pass], infrastructureError: true })).toBe(2);
  });

  it("an unscored category (NaN actual) is an error exit through evaluateAssertions", () => {
    const results = evaluateAssertions(
      [
        {
          matchingUrlPattern: ".*",
          assertions: { "categories:seo": ["error", { minScore: 0.9 }] },
        },
      ],
      "/index.html",
      { "categories:seo": [null, null, null] },
    );
    expect(exitCodeFor({ results })).toBe(1);
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
  it("shows the median and every run, one row per URL", () => {
    const table = formatTable(
      [
        {
          url: "/intro/index.html",
          scores: {
            "categories:performance": [0.65, 0.65, 0.87],
            "categories:seo": [1, 1, 1],
          },
        },
        {
          url: "/index.html",
          scores: {
            "categories:performance": [null, null, null],
            "categories:seo": [0.9, 0.9, 0.9],
          },
        },
      ],
      ["categories:performance", "categories:seo"],
    ).split("\n");
    expect(table).toHaveLength(4);
    expect(table[0]).toMatch(/^URL\s+performance\s+seo$/);
    expect(table[2]).toMatch(
      /^\/intro\/index\.html\s+0\.65 \[0\.65 0\.65 0\.87\]\s+1\.00 \[1\.00 1\.00 1\.00\]$/,
    );
    expect(table[3]).toMatch(/n\/a \[n\/a n\/a n\/a\]/);
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

  it("keeps the /intro/ floors: performance >= 0.84 and accessibility >= 0.93 are errors", () => {
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
    expect(summarizeResults(at(0.84, 0.93)).errors).toHaveLength(0);
    expect(
      summarizeResults(at(0.83, 0.93)).errors.map((r) => r.auditId),
    ).toEqual(["categories:performance"]);
    expect(
      summarizeResults(at(0.84, 0.92)).errors.map((r) => r.auditId),
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

  it("requires 1 valid run per URL and 2 where error floors apply", () => {
    expect(config.minValidRuns).toBe(1);
    expect(config.minValidRunsForError).toBe(2);
  });

  it("asserts on the best run by default, as Lighthouse CI did", () => {
    expect(config.aggregation).toBe("optimistic");
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
