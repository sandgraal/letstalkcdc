/**
 * Guard: GoatCounter visit counting (P15-10) renders nothing unless
 * GOATCOUNTER_CODE is a valid site code, then exactly one async count.js
 * loader that is skipped for Do Not Track, and /privacy/ stays true both ways.
 * Renders the real partial and the real privacy template, not copies.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import analyticsData from "../../src/_data/analytics.mjs";
import { readGoatcounterCode } from "../../lib/goatcounter-code.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(path.join(ROOT, "src/_includes")),
  { autoescape: true },
);
const render = (goatcounterCode) =>
  env.render("components/analytics.njk", { analytics: { goatcounterCode } });

/** Run the emitted inline loader against a fake browser; return appended nodes. */
function run(html, nav = {}, win = {}) {
  const body = html.slice(
    html.indexOf(">", html.indexOf("<script")) + 1,
    html.lastIndexOf("</script"),
  );
  const appended = [];
  const document = {
    head: { appendChild: (el) => appended.push(el) },
    createElement: () => ({ dataset: {} }),
  };
  new Function("navigator", "window", "document", body)(nav, win, document);
  return appended;
}

describe("readGoatcounterCode", () => {
  it("accepts a plain site code and trims whitespace", () => {
    expect(readGoatcounterCode("letstalkcdc")).toBe("letstalkcdc");
    expect(readGoatcounterCode("  my-site-2 \n")).toBe("my-site-2");
  });

  it("treats unset, empty and the string 'undefined' as off, silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const v of [undefined, "", "   ", "undefined"]) {
      expect(readGoatcounterCode(v)).toBe("");
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects anything that could carry markup, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = [
      '"><script>alert(1)</script>',
      "a.b",
      "a/b",
      "-lead",
      "trail-",
      "UPPER",
      "a b",
      "x".repeat(64),
    ];
    for (const v of bad) {
      expect(readGoatcounterCode(v), v).toBe("");
    }
    expect(warn).toHaveBeenCalledTimes(bad.length);
    warn.mockRestore();
  });

  it("is off in this test environment (no variable set)", () => {
    expect(analyticsData.goatcounterCode).toBe("");
  });

  it("the data file has only a default export (Eleventy nests named exports)", async () => {
    const mod = await import("../../src/_data/analytics.mjs");
    expect(Object.keys(mod)).toEqual(["default"]);
  });
});

describe("analytics partial", () => {
  it("renders nothing when unset", () => {
    for (const v of [undefined, ""]) {
      expect(render(v).trim()).toBe("");
    }
  });

  it("renders nothing for an invalid code even if one slips past the data file", () => {
    expect(render('"><img src=x onerror=alert(1)>').trim()).toBe("");
    expect(render("a.b").trim()).toBe("");
  });

  it("renders exactly one script, no third-party src in markup, no cookies", () => {
    const html = render("letstalkcdc");
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).not.toMatch(/cookie|localStorage|sessionStorage/i);
    expect(html).not.toMatch(/<(img|iframe|link)\b/i);
  });

  it("loads count.js async from gc.zgo.at with the right endpoint", () => {
    const [el, ...rest] = run(render("letstalkcdc"));
    expect(rest).toHaveLength(0);
    expect(el.async).toBe(true);
    expect(el.src).toBe("https://gc.zgo.at/count.js");
    expect(el.dataset.goatcounter).toBe(
      "https://letstalkcdc.goatcounter.com/count",
    );
  });

  it("loads nothing when Do Not Track is on, however the browser reports it", () => {
    const html = render("letstalkcdc");
    expect(run(html, { doNotTrack: "1" })).toHaveLength(0);
    expect(run(html, { doNotTrack: "yes" })).toHaveLength(0);
    expect(run(html, {}, { doNotTrack: "1" })).toHaveLength(0);
    expect(run(html, { msDoNotTrack: "1" })).toHaveLength(0);
  });

  it("still loads when Do Not Track is off or unspecified", () => {
    const html = render("letstalkcdc");
    expect(run(html, { doNotTrack: "0" })).toHaveLength(1);
    expect(run(html, { doNotTrack: null })).toHaveLength(1);
    expect(run(html, {})).toHaveLength(1);
  });
});

describe("base.njk wiring", () => {
  it("includes the partial once, inside <head>", () => {
    const base = read("src/_includes/layouts/base.njk");
    const include = '{% include "components/analytics.njk" %}';
    expect(base.split(include)).toHaveLength(2);
    expect(base.indexOf(include)).toBeGreaterThan(base.indexOf("<head>"));
    expect(base.indexOf(include)).toBeLessThan(base.indexOf("</head>"));
  });

  it("deploy.yml passes the repository variable to the build only", () => {
    const deploy = read(".github/workflows/deploy.yml");
    expect(deploy).toContain("GOATCOUNTER_CODE: ${{ vars.GOATCOUNTER_CODE }}");
    for (const f of ["ci.yml", "linkcheck.yml"]) {
      expect(read(`.github/workflows/${f}`)).not.toContain("GOATCOUNTER");
    }
  });
});
