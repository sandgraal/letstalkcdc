/**
 * Meta Content-Security-Policy (P17-24).
 *
 * Part one tests lib/csp.mjs directly. Part two runs one real Eleventy build
 * (with every optional integration switched on, so the Supabase, GoatCounter
 * and Buttondown branches all render) and checks every built page: a policy
 * exists, it has no 'unsafe-eval' and no script 'unsafe-inline', and each
 * inline script's SHA-256 is in the page's own script-src. The browser-side
 * proof (zero violations on every page) is tests/e2e/csp.spec.js.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CSP_PLACEHOLDER,
  applyCsp,
  buildCsp,
  checkPageCsp,
  inlineScripts,
} from "../../lib/csp.mjs";

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

const policyOf = (html) =>
  html.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/,
  )?.[1];
const directive = (policy, name) =>
  policy.split(/;\s*/).find((d) => d.startsWith(`${name} `)) ?? "";
const sha = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

describe("lib/csp.mjs", () => {
  it("allows only the site itself and YouTube's no-cookie player by default", () => {
    const policy = buildCsp({});
    expect(policy).toContain("default-src 'self'");
    expect(directive(policy, "script-src")).toBe("script-src 'self'");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(policy).toContain("frame-src https://www.youtube-nocookie.com");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
  });

  it("never emits directives a meta tag ignores, or eval", () => {
    const policy = buildCsp({
      scriptHashes: [sha("x")],
      supabaseUrl: "https://abc.supabase.co/rest/v1",
      goatcounterCode: "demo",
      newsletter: true,
    });
    expect(policy).not.toMatch(/frame-ancestors|report-uri|report-to|sandbox/);
    expect(policy).not.toMatch(/unsafe-eval/);
    expect(directive(policy, "script-src")).not.toMatch(/unsafe-inline/);
  });

  it("adds exactly the configured origins, and only when configured", () => {
    const policy = buildCsp({
      supabaseUrl: "https://abc.supabase.co/rest/v1/",
      goatcounterCode: "demo",
      newsletter: true,
    });
    expect(directive(policy, "connect-src")).toBe(
      "connect-src 'self' https://abc.supabase.co https://demo.goatcounter.com",
    );
    expect(directive(policy, "script-src")).toBe(
      "script-src 'self' https://gc.zgo.at",
    );
    expect(directive(policy, "form-action")).toBe(
      "form-action 'self' https://buttondown.com",
    );
    // A non-https or unparseable Supabase URL adds nothing.
    for (const bad of ["http://abc.supabase.co", "not a url", ""]) {
      expect(directive(buildCsp({ supabaseUrl: bad }), "connect-src")).toBe(
        "connect-src 'self'",
      );
    }
  });

  it("finds executable inline scripts and skips data blocks and src scripts", () => {
    const html = `
      <script type="application/ld+json">{"a":1}</script>
      <script type="module" src="/x.js" defer></script>
      <script>var a = 1;</script>
      <script type="module">import "/y.js";</script>`;
    expect(inlineScripts(html)).toEqual(["var a = 1;", 'import "/y.js";']);
  });

  it("replaces the placeholder with hashes of the exact script text", () => {
    const body = "\n  window.x = 1;\n";
    const html = `<head><meta http-equiv="Content-Security-Policy" content="${CSP_PLACEHOLDER}"><script>${body}</script></head>`;
    const out = applyCsp(html, {});
    expect(out).not.toContain(CSP_PLACEHOLDER);
    expect(directive(policyOf(out), "script-src")).toContain(sha(body));
    expect(checkPageCsp(out)).toEqual([]);
  });

  it("flags a page whose inline script is not covered, or that uses unsafe-eval", () => {
    const meta = (p) =>
      `<meta http-equiv="Content-Security-Policy" content="${p}">`;
    expect(
      checkPageCsp(meta("script-src 'self'") + "<script>a()</script>"),
    ).toEqual([expect.stringContaining("not covered by a hash")]);
    expect(checkPageCsp(meta("script-src 'self' 'unsafe-eval'"))).toContain(
      "allows unsafe-eval",
    );
    expect(checkPageCsp(meta("script-src 'unsafe-inline'"))).toContain(
      "script-src allows unsafe-inline",
    );
    expect(checkPageCsp("<head></head>")).toEqual([
      "no Content-Security-Policy meta tag",
    ]);
    expect(
      checkPageCsp(meta("script-src 'self'") + '<a onclick="x()">y</a>'),
    ).toContain("inline event-handler attribute");
  });
});

describe("built pages", () => {
  let out;
  /** @type {Map<string, string>} */
  let pages;

  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-csp-"));
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
          ELEVENTY_PATH_PREFIX: "/site",
          SUPABASE_URL: "https://abcdefgh.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
          GOATCOUNTER_CODE: "csp-test",
          BUTTONDOWN_USERNAME: "csp-test",
        },
      },
    );
    pages = new Map(
      walk(out)
        .filter((f) => f.endsWith(".html"))
        .map((f) => [path.relative(out, f), readFileSync(f, "utf8")]),
    );
  }, 300_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  // Verbatim search-console verification file: no scripts, not a site page.
  const exempt = (rel) => /^google[0-9a-f]+\.html$/.test(rel);

  it("built a representative set of pages", () => {
    for (const rel of [
      "intro/index.html",
      "privacy/index.html",
      "newsletter/index.html",
      "dashboard/index.html",
      "tooling/index.html",
      "overview/index.html",
      "404.html",
      "mermaid-sandbox/index.html",
      "styleguide/index.html",
    ]) {
      expect(pages.has(rel), rel).toBe(true);
    }
    expect(pages.size).toBeGreaterThan(60);
  });

  it("gives every page a policy with no unsafe-eval, no script unsafe-inline and a matching hash for each inline script", () => {
    const problems = [];
    for (const [rel, html] of pages) {
      if (exempt(rel)) continue;
      for (const p of checkPageCsp(html)) problems.push(`${rel}: ${p}`);
    }
    expect(problems).toEqual([]);
  });

  it("puts the policy before any script or stylesheet in <head>", () => {
    for (const [rel, html] of pages) {
      if (exempt(rel) || !policyOf(html)) continue;
      const at = html.indexOf("Content-Security-Policy");
      const firstResource = html.search(/<(script|link|style)\b/i);
      expect(at, rel).toBeGreaterThan(-1);
      if (firstResource > -1) expect(at < firstResource, rel).toBe(true);
    }
  });

  it("covers the Supabase config script, the GoatCounter loader and the dashboard module script by hash", () => {
    const intro = pages.get("intro/index.html");
    const scripts = inlineScripts(intro);
    expect(scripts.some((s) => s.includes("window.SUPABASE_URL"))).toBe(true);
    expect(scripts.some((s) => s.includes("gc.zgo.at"))).toBe(true);
    const script = directive(policyOf(intro), "script-src");
    for (const s of scripts) expect(script).toContain(sha(s));
    const dash = pages.get("dashboard/index.html");
    expect(/<script type="module">/.test(dash)).toBe(true);
    expect(checkPageCsp(dash)).toEqual([]);
  });

  it("allows the configured origins and nothing else third-party", () => {
    const policy = policyOf(pages.get("intro/index.html"));
    expect(directive(policy, "connect-src")).toBe(
      "connect-src 'self' https://abcdefgh.supabase.co https://csp-test.goatcounter.com",
    );
    expect(directive(policy, "form-action")).toBe(
      "form-action 'self' https://buttondown.com",
    );
    expect(directive(policy, "script-src")).toContain("https://gc.zgo.at");
    const hosts = new Set(policy.match(/https:\/\/[a-z0-9.-]+/g));
    expect([...hosts].sort()).toEqual([
      "https://abcdefgh.supabase.co",
      "https://buttondown.com",
      "https://csp-test.goatcounter.com",
      "https://gc.zgo.at",
      "https://img.youtube.com",
      "https://www.youtube-nocookie.com",
    ]);
  });

  it("leaves JSON-LD blocks in place (data blocks are not governed by script-src)", () => {
    const html = pages.get("intro/index.html");
    expect(html).toMatch(/<script type="application\/ld\+json">/);
    expect(policyOf(html)).not.toContain("ld+json");
  });

  it("ships no inline event handlers (deferred stylesheets use data-deferred-style)", () => {
    for (const [rel, html] of pages) {
      expect(html, rel).not.toMatch(/\sonload="/);
    }
    expect(pages.get("overview/index.html")).toContain("data-deferred-style");
  });
});
