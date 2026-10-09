/**
 * Pure helpers behind scripts/lighthouse-ci.mjs.
 *
 * Everything here is deterministic and browser-free so tests/unit can cover
 * it with fixtures: score aggregation, the assertion matrix, URL-to-file
 * mapping for the static server, and the results table.
 *
 * The assertion model is the subset of Lighthouse CI that this repo used:
 * `categories:<id>` audits with a `minScore`, at level `off`, `warn` or
 * `error`. A URL is checked against every matrix entry whose
 * `matchingUrlPattern` matches it, so a stricter `error` floor can sit next
 * to a looser `warn` one. Only `error` failures fail the run.
 */

export const AGGREGATIONS = ["median", "optimistic", "pessimistic"];
export const LEVELS = ["off", "warn", "error"];

const CATEGORY_PREFIX = "categories:";

/**
 * Median of a list of numbers. An even count averages the two middle values
 * (same as Lighthouse CI's median).
 */
export function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid] + sorted[mid + 1]) / 2;
}

/**
 * Collapse the per-run scores for one category into one number.
 * For a `minScore` floor, "optimistic" is the best run and "pessimistic" the
 * worst. Returns NaN if any run produced no usable score and the method is
 * "pessimistic", or if no run did, so a broken run can never pass silently.
 */
export function aggregate(values, method = "median") {
  if (!AGGREGATIONS.includes(method)) {
    throw new Error(
      `Unknown aggregation "${method}" (expected ${AGGREGATIONS.join(", ")})`,
    );
  }
  const finite = values.filter(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
  if (!finite.length) return NaN;
  if (method === "pessimistic" && finite.length !== values.length) return NaN;
  if (method === "median") return median(finite);
  return method === "optimistic" ? Math.max(...finite) : Math.min(...finite);
}

/**
 * Pull `{ "categories:performance": 0.86, ... }` out of a Lighthouse result.
 * A category Lighthouse could not score comes back as null.
 */
export function categoryScores(lhr) {
  const out = {};
  for (const [id, category] of Object.entries(lhr?.categories ?? {})) {
    out[`${CATEGORY_PREFIX}${id}`] =
      typeof category?.score === "number" ? category.score : null;
  }
  return out;
}

/** Reject a config the script cannot honour, instead of ignoring parts of it. */
export function validateConfig(config) {
  const problems = [];
  if (!Number.isInteger(config?.runs) || config.runs < 1)
    problems.push("runs must be a positive integer");
  if (!AGGREGATIONS.includes(config?.aggregation)) {
    problems.push(`aggregation must be one of ${AGGREGATIONS.join(", ")}`);
  }
  for (const key of ["distDir", "outputDir"]) {
    if (typeof config?.[key] !== "string" || !config[key])
      problems.push(`${key} must be a non-empty string`);
  }
  if (!Array.isArray(config?.urls) || !config.urls.length) {
    problems.push("urls must be a non-empty array");
  } else {
    for (const url of config.urls) {
      if (typeof url !== "string" || !url.startsWith("/"))
        problems.push(`url "${url}" must be a path starting with /`);
    }
  }
  if (!Array.isArray(config?.assertMatrix)) {
    problems.push("assertMatrix must be an array");
  } else {
    config.assertMatrix.forEach((entry, i) => {
      try {
        new RegExp(entry.matchingUrlPattern);
      } catch {
        problems.push(
          `assertMatrix[${i}].matchingUrlPattern is not a valid regular expression`,
        );
      }
      for (const [auditId, assertion] of Object.entries(
        entry.assertions ?? {},
      )) {
        if (!auditId.startsWith(CATEGORY_PREFIX)) {
          problems.push(
            `assertMatrix[${i}]: only "categories:*" assertions are supported, got "${auditId}"`,
          );
          continue;
        }
        const [level, options] = normalizeAssertion(assertion);
        if (!LEVELS.includes(level))
          problems.push(
            `assertMatrix[${i}] ${auditId}: unknown level "${level}"`,
          );
        if (level !== "off" && typeof options.minScore !== "number") {
          problems.push(
            `assertMatrix[${i}] ${auditId}: minScore must be a number`,
          );
        }
      }
    });
  }
  return problems;
}

function normalizeAssertion(assertion) {
  if (typeof assertion === "string") return [assertion, {}];
  if (Array.isArray(assertion)) return [assertion[0], assertion[1] ?? {}];
  return ["off", {}];
}

/**
 * Evaluate the assertion matrix for one URL.
 *
 * @param {Array} matrix       config.assertMatrix
 * @param {string} urlPath     e.g. "/intro/index.html"
 * @param {Record<string, Array<number|null>>} scoresByAudit  one value per run
 * @param {string} aggregation "median" | "optimistic" | "pessimistic"
 * @returns {Array<{auditId, level, minScore, actual, values, passed}>}
 */
export function evaluateAssertions(
  matrix,
  urlPath,
  scoresByAudit,
  aggregation = "median",
) {
  const results = [];
  for (const entry of matrix) {
    if (!new RegExp(entry.matchingUrlPattern).test(urlPath)) continue;
    for (const [auditId, assertion] of Object.entries(entry.assertions ?? {})) {
      const [level, options] = normalizeAssertion(assertion);
      if (level === "off") continue;
      const values = scoresByAudit[auditId] ?? [];
      const actual = aggregate(values, aggregation);
      results.push({
        auditId,
        level,
        minScore: options.minScore,
        actual,
        values,
        passed: Number.isFinite(actual) && actual >= options.minScore,
      });
    }
  }
  return results;
}

/** Split results into the two buckets the exit code cares about. */
export function summarizeResults(results) {
  const failed = results.filter((r) => !r.passed);
  return {
    errors: failed.filter((r) => r.level === "error"),
    warnings: failed.filter((r) => r.level === "warn"),
  };
}

/**
 * Map a request path to a path relative to the dist directory, or null when
 * the request must be refused (traversal, NUL bytes, bad encoding).
 * A trailing slash or empty path means `index.html`. Query and hash are
 * ignored. This mirrors how `staticDistDir` served `_site/` at the root.
 */
export function urlToRelativePath(requestUrl) {
  let pathname = requestUrl.split("#")[0].split("?")[0];
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.includes("\\")) return null;
  const segments = [];
  for (const segment of pathname.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  if (pathname.endsWith("/") || segments.length === 0)
    segments.push("index.html");
  return segments.join("/");
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

export function contentTypeFor(filePath) {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** Text-like types worth gzipping (the old static server compressed these). */
export function isCompressible(contentType) {
  return /^(text\/|application\/(json|xml|manifest\+json)|image\/svg\+xml)/.test(
    contentType,
  );
}

/** A filesystem-safe name for a URL path: "/intro/index.html" -> "intro-index". */
export function slugForUrl(urlPath) {
  const slug = urlPath
    .replace(/\.html$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "root";
}

/**
 * Plain-text results table. `rows` is
 * `[{ url, scores: { "categories:performance": 0.86, ... } }]` (aggregated).
 */
export function formatTable(rows, auditIds) {
  const label = (id) => id.slice(CATEGORY_PREFIX.length);
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
  const header = ["URL", ...auditIds.map(label)];
  const body = rows.map((row) => [
    row.url,
    ...auditIds.map((id) => fmt(row.scores[id])),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...body.map((r) => r[i].length)),
  );
  const line = (cells) =>
    cells
      .map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i])))
      .join("  ");
  return [
    line(header),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...body.map(line),
  ].join("\n");
}
