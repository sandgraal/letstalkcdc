/**
 * The inline <script> in base.njk that exposes the Supabase URL and publishable
 * key to the browser. Values come from env vars at build time, so a hostile or
 * mistyped value must not be able to break out of the script element.
 *
 * Renders the real fragment from base.njk (not a copy) with nunjucks, the
 * engine Eleventy uses (a transitive dependency of @11ty/eleventy).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const template = readFileSync(
  path.join(ROOT, "src/_includes/layouts/base.njk"),
  "utf8",
);
const start = template.indexOf("{% if supabase.url");
const end = template.indexOf("{% endif %}", start) + "{% endif %}".length;
const fragment = template.slice(start, end);
const env = new nunjucks.Environment(null, { autoescape: true });

const render = (supabase) => env.renderString(fragment, { supabase });

/** Run the emitted <script> body against a fake window and return it. */
function evaluate(html) {
  const body = html
    .replace(/^[\s\S]*?<script>/, "")
    .replace(/<\/script>[\s\S]*$/, "");
  const win = {};
  new Function("window", body)(win);
  return win;
}

describe("base.njk inline Supabase config", () => {
  it("found the fragment in base.njk", () => {
    expect(start).toBeGreaterThan(-1);
    expect(fragment).toContain("window.SUPABASE_URL");
  });

  it("emits both values for an https url and a key", () => {
    const html = render({
      url: "https://abc.supabase.co",
      publishableKey: "sb_publishable_x",
    });
    expect(evaluate(html)).toEqual({
      SUPABASE_URL: "https://abc.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    });
  });

  it("neutralises </script> in either value", () => {
    const html = render({
      url: 'https://x.co/</script><img src=x onerror="alert(1)">',
      publishableKey: "k</script><script>alert(2)</script><!--",
    });

    // Exactly one closing tag: the template's own.
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<!--");

    // And the values survive intact once the script runs.
    expect(evaluate(html)).toEqual({
      SUPABASE_URL: 'https://x.co/</script><img src=x onerror="alert(1)">',
      SUPABASE_PUBLISHABLE_KEY: "k</script><script>alert(2)</script><!--",
    });
  });

  it.each([
    ["http url", { url: "http://abc.supabase.co", publishableKey: "k" }],
    ["javascript url", { url: "javascript:alert(1)", publishableKey: "k" }],
    ["missing key", { url: "https://abc.supabase.co", publishableKey: "" }],
    ["missing url", { url: "", publishableKey: "k" }],
    ["nothing", { url: "", publishableKey: "" }],
  ])("emits nothing for %s", (_name, supabase) => {
    expect(render(supabase).trim()).toBe("");
  });
});
