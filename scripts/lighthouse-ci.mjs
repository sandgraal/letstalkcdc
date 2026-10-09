#!/usr/bin/env node
/**
 * Lighthouse score gate.
 *
 * Serves the built site (`_site/` by default) at the root of a local HTTP
 * server, audits each URL in lighthouse-ci.config.json N times with the
 * `lighthouse` Node API (default settings: mobile emulation, simulated
 * throttling, all four categories), and checks the scores against the
 * assertion matrix in the same file. Floors are checked against the best of
 * the runs by default ("aggregation" in the config), as Lighthouse CI did;
 * the table also prints the median and every run. A run that errored or lost
 * its LCP is retried (3 attempts), never counted; a URL left with too few
 * valid runs (checkRunCoverage) ends the job with exit 2.
 *
 *   npm run build:lhci && npm run lighthouse
 *
 * Build with `npm run build:lhci`, not `npm run build`: the production build
 * emits asset URLs under /letstalkcdc/, which 404 at the root of this server
 * and make Lighthouse audit an unstyled page. The script refuses to run
 * against such a build.
 *
 * Exit codes: 0 no `error` assertion failed (warnings are printed),
 *             1 at least one `error` assertion failed,
 *             2 the run itself could not complete (no Chrome, bad config...).
 *
 * Chrome: CHROME_PATH if set, otherwise chrome-launcher's discovery.
 * Reports (JSON + HTML per run, plus summary.json) go to config.outputDir.
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { parseArgs } from "node:util";
import { Launcher, launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import {
  categoryScores,
  checkRunCoverage,
  contentTypeFor,
  evaluateAssertions,
  exitCodeFor,
  formatTable,
  incompleteReason,
  isCompressible,
  slugForUrl,
  summarizeResults,
  urlToRelativePath,
  validateConfig,
} from "../lib/lighthouse-ci.mjs";

const { values: args } = parseArgs({
  options: {
    config: { type: "string", default: "lighthouse-ci.config.json" },
    runs: { type: "string" },
  },
});

const fail = (message) => {
  process.stderr.write(`lighthouse-ci: ${message}\n`);
  process.exit(2);
};

const config = JSON.parse(await readFile(resolve(args.config), "utf8"));
if (args.runs) config.runs = Number(args.runs);
const problems = validateConfig(config);
if (problems.length)
  fail(`invalid ${args.config}:\n  - ${problems.join("\n  - ")}`);

const distDir = resolve(config.distDir);
const outputDir = resolve(config.outputDir);

try {
  const home = await readFile(join(distDir, "index.html"), "utf8");
  if (/(?:href|src)="\/letstalkcdc\//.test(home)) {
    fail(
      `${config.distDir} was built with the /letstalkcdc/ path prefix; run \`npm run build:lhci\` first.`,
    );
  }
} catch (error) {
  if (error.code === "ENOENT")
    fail(
      `${config.distDir}/index.html not found; run \`npm run build:lhci\` first.`,
    );
  throw error;
}

// ── Static server ────────────────────────────────────────────────────────
// Serves distDir at "/", gzips text assets and sends `max-age=0`, which is
// what the static server Lighthouse CI used did, so the audits see the same
// transfer sizes and cache policy.
const fileCache = new Map();

async function loadFile(relativePath) {
  const filePath = resolve(distDir, relativePath);
  if (filePath !== distDir && !filePath.startsWith(distDir + sep)) return null;
  let info = await stat(filePath).catch(() => null);
  let finalPath = filePath;
  if (info?.isDirectory()) {
    finalPath = join(filePath, "index.html");
    info = await stat(finalPath).catch(() => null);
  }
  if (!info?.isFile()) return null;
  const cached = fileCache.get(finalPath);
  if (cached && cached.mtimeMs === info.mtimeMs) return cached;
  const body = await readFile(finalPath);
  const type = contentTypeFor(finalPath);
  const entry = {
    mtimeMs: info.mtimeMs,
    type,
    body,
    gzip: isCompressible(type) && body.length >= 1024 ? gzipSync(body) : null,
    etag: `W/"${body.length.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`,
  };
  fileCache.set(finalPath, entry);
  return entry;
}

const server = createServer(async (req, res) => {
  try {
    const relativePath =
      req.method === "GET" || req.method === "HEAD"
        ? urlToRelativePath(req.url ?? "/")
        : null;
    const entry = relativePath === null ? null : await loadFile(relativePath);
    if (!entry) {
      res.writeHead(relativePath === null ? 400 : 404, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end(relativePath === null ? "Bad request" : "Not found");
      return;
    }
    const headers = {
      "Content-Type": entry.type,
      "Cache-Control": "public, max-age=0",
      ETag: entry.etag,
    };
    if (req.headers["if-none-match"] === entry.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const useGzip =
      entry.gzip && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
    const body = useGzip ? entry.gzip : entry.body;
    if (entry.gzip) headers.Vary = "Accept-Encoding";
    if (useGzip) headers["Content-Encoding"] = "gzip";
    headers["Content-Length"] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(String(error));
  }
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://localhost:${server.address().port}`;

// ── Audits ───────────────────────────────────────────────────────────────
// Fail with exit code 2 and a clear message, not a spawn crash that would
// exit 1 and read as a score failure.
const chromePath = process.env.CHROME_PATH || Launcher.getFirstInstallation();
if (!chromePath || !existsSync(chromePath)) {
  server.close();
  fail(
    `no Chrome found${process.env.CHROME_PATH ? ` at CHROME_PATH=${process.env.CHROME_PATH}` : ""}; install Chrome or set CHROME_PATH.`,
  );
}

const chromeFlags = ["--headless=new"];
if (process.env.CI) chromeFlags.push("--no-sandbox");

// Lighthouse can hang if Chrome is throttled; a hung run must not hang CI.
const RUN_TIMEOUT_MS = 120_000;

async function auditOnce(url) {
  // A fresh Chrome per run, as Lighthouse CI did: no state leaks between runs.
  const chrome = await launch({
    chromePath,
    chromeFlags,
  });
  let timer;
  try {
    const audit = lighthouse(url, {
      port: chrome.port,
      output: ["json", "html"],
      logLevel: "error",
    });
    audit.catch(() => {}); // Rejects after a timeout once Chrome is killed.
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no result after ${RUN_TIMEOUT_MS / 1000}s`)),
        RUN_TIMEOUT_MS,
      );
    });
    const result = await Promise.race([audit, deadline]);
    if (!result) throw new Error("Lighthouse returned no result");
    return { lhr: result.lhr, json: result.report[0], html: result.report[1] };
  } finally {
    clearTimeout(timer);
    await chrome.kill();
  }
}

// A run that ends in a Lighthouse runtime error (for example "the page did not
// paint any content"), times out, or lost its LCP (see incompleteReason) is not
// a measurement of the page. Try each run up to MAX_ATTEMPTS times with a short
// backoff. A run that is still invalid is returned as such, with the reason,
// and the caller decides what a URL with too few valid runs means.
const MAX_ATTEMPTS = 3;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function auditWithRetry(url) {
  let lastInvalid = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const audit = await auditOnce(url);
      const reason = incompleteReason(audit.lhr);
      if (!reason) return { valid: true, ...audit };
      lastInvalid = { reason, json: audit.json, html: audit.html };
    } catch (error) {
      lastInvalid = { reason: error.message };
    }
    if (attempt < MAX_ATTEMPTS) {
      process.stdout.write(
        `invalid (${lastInvalid.reason.slice(0, 70)}), retrying ... `,
      );
      await sleep(attempt * 2000);
    }
  }
  return { valid: false, ...lastInvalid };
}

const aggregation = config.aggregation;
const perUrl = [];
let results = [];
let infrastructureError = false;
const annotate = (level, message) =>
  process.stdout.write(
    process.env.GITHUB_ACTIONS
      ? `::${level}::${message}\n`
      : `${level.toUpperCase()}  ${message}\n`,
  );

try {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const urlPath of config.urls) {
    const scoresByAudit = {};
    let valid = 0;
    for (let run = 1; run <= config.runs; run++) {
      process.stdout.write(
        `Running Lighthouse ${run}/${config.runs} on ${origin}${urlPath} ... `,
      );
      const audit = await auditWithRetry(`${origin}${urlPath}`);
      const base = join(outputDir, `${slugForUrl(urlPath)}-run${run}`);
      if (!audit.valid) {
        // Kept for diagnosis; never counted.
        if (audit.json) await writeFile(`${base}-invalid.json`, audit.json);
        process.stdout.write(
          `INVALID after ${MAX_ATTEMPTS} attempts: ${audit.reason}\n`,
        );
        continue;
      }
      valid++;
      await writeFile(`${base}.json`, audit.json);
      await writeFile(`${base}.html`, audit.html);
      const scores = categoryScores(audit.lhr);
      for (const [id, score] of Object.entries(scores))
        (scoresByAudit[id] ??= []).push(score);
      process.stdout.write(
        `${Object.entries(scores)
          .map(
            ([id, s]) =>
              `${id.split(":")[1]} ${s === null ? "n/a" : s.toFixed(2)}`,
          )
          .join(", ")}\n`,
      );
    }
    perUrl.push({ url: urlPath, scoresByAudit, valid });
  }

  const auditIds = [
    ...new Set(config.assertMatrix.flatMap((e) => Object.keys(e.assertions))),
  ];
  const rows = perUrl.map(({ url, scoresByAudit }) => ({
    url,
    scores: scoresByAudit,
  }));
  process.stdout.write(
    `\nCategory scores: median of ${config.runs} runs [each run]\n${formatTable(rows, auditIds)}\n\n`,
  );

  const summary = [];
  for (const { url, scoresByAudit, valid } of perUrl) {
    const coverage = checkRunCoverage({
      matrix: config.assertMatrix,
      urlPath: url,
      valid,
      requested: config.runs,
      minValidRuns: config.minValidRuns,
      minValidRunsForError: config.minValidRunsForError,
    });
    if (coverage.warning) annotate("warning", coverage.warning);
    if (coverage.fatal) {
      annotate("error", coverage.fatal);
      infrastructureError = true;
    }
    const found = evaluateAssertions(
      config.assertMatrix,
      url,
      scoresByAudit,
      aggregation,
    );
    results.push(...found);
    summary.push({ url, aggregation, scores: scoresByAudit, results: found });
    const { errors, warnings } = summarizeResults(found);
    for (const [level, list] of [
      ["error", errors],
      ["warning", warnings],
    ]) {
      for (const r of list) {
        const actual = Number.isFinite(r.actual)
          ? r.actual.toFixed(2)
          : "no score";
        const message = `${url} ${r.auditId}: ${r.aggregation} ${actual} < ${r.minScore} (runs: ${r.values.map((v) => v?.toFixed(2) ?? "n/a").join(", ")})`;
        annotate(level, message);
      }
    }
  }
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  const counts = summarizeResults(results);
  process.stdout.write(
    `Checked ${results.length} assertions over ${config.urls.length} URLs: ${counts.errors.length} error(s), ${counts.warnings.length} warning(s). Reports in ${config.outputDir}/\n`,
  );
} catch (error) {
  process.stderr.write(`lighthouse-ci: ${error?.stack ?? error}\n`);
  infrastructureError = true;
} finally {
  server.close();
}

process.exit(exitCodeFor({ results, infrastructureError }));
