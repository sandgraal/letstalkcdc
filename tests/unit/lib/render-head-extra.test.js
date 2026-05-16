/**
 * Unit tests for lib/render-head-extra.mjs.
 *
 * The filter is the minimal stand-in for Nunjucks rendering of
 * `head_extra` front-matter blocks. The regression that triggered this
 * test suite: PR #265 added `{{ site.origin }}` to four `head_extra`
 * blocks for the path-prefix-doubling fix, but the filter only knew
 * about `{{ site.host }}`. Production HTML shipped the literal string
 * `{{ site.origin }}` in JSON-LD `BreadcrumbList`s.
 *
 * Every supported expression has a test below. **If you add a new
 * `{{ ... }}` substitution to `lib/render-head-extra.mjs`, add a case
 * here so the next regression of this class fails CI instead of
 * production.**
 *
 * @module tests/unit/lib/render-head-extra.test
 */
import { describe, it, expect } from "vitest";
import { renderHeadExtra } from "../../../lib/render-head-extra.mjs";

const ctx = {
  pathPrefix: "/letstalkcdc",
  host: "https://sandgraal.github.io/letstalkcdc",
  origin: "https://sandgraal.github.io",
};

describe("lib/render-head-extra.mjs", () => {
  describe("falsy input", () => {
    it("returns '' for an empty string", () => {
      expect(renderHeadExtra("", ctx)).toBe("");
    });

    it("returns '' for undefined input", () => {
      expect(renderHeadExtra(undefined, ctx)).toBe("");
    });

    it("returns '' for null input", () => {
      expect(renderHeadExtra(null, ctx)).toBe("");
    });
  });

  describe("{{ '/path' | url }}", () => {
    it("prepends the path prefix to a quoted path", () => {
      expect(renderHeadExtra("<link href=\"{{ '/foo/' | url }}\">", ctx)).toBe(
        '<link href="/letstalkcdc/foo/">',
      );
    });

    it("works with double-quoted paths", () => {
      expect(renderHeadExtra('{{ "/bar/" | url }}', ctx)).toBe(
        "/letstalkcdc/bar/",
      );
    });

    it("tolerates extra whitespace inside the expression", () => {
      expect(renderHeadExtra("{{   '/baz/'   |   url   }}", ctx)).toBe(
        "/letstalkcdc/baz/",
      );
    });

    it("emits the bare path when pathPrefix is empty (root-deploy case)", () => {
      expect(
        renderHeadExtra("{{ '/foo/' | url }}", { ...ctx, pathPrefix: "" }),
      ).toBe("/foo/");
    });

    it("handles multiple `| url` expressions in one string", () => {
      expect(renderHeadExtra("{{ '/a/' | url }} {{ '/b/' | url }}", ctx)).toBe(
        "/letstalkcdc/a/ /letstalkcdc/b/",
      );
    });
  });

  describe("{{ site.host }}", () => {
    it("substitutes the host (which already contains the prefix)", () => {
      expect(renderHeadExtra("{{ site.host }}/static.png", ctx)).toBe(
        "https://sandgraal.github.io/letstalkcdc/static.png",
      );
    });

    it("emits '' when host is unset", () => {
      expect(renderHeadExtra("{{ site.host }}", { ...ctx, host: "" })).toBe("");
    });
  });

  describe("{{ site.origin }}", () => {
    // This is the case that broke before PR #265's Codex review caught it.
    it("substitutes the bare host with no path prefix", () => {
      expect(
        renderHeadExtra("{{ site.origin }}{{ '/intro/' | url }}", ctx),
      ).toBe("https://sandgraal.github.io/letstalkcdc/intro/");
    });

    it("emits '' when origin is unset", () => {
      expect(renderHeadExtra("{{ site.origin }}", { ...ctx, origin: "" })).toBe(
        "",
      );
    });
  });

  describe("mixed + passthrough", () => {
    it("renders a realistic BreadcrumbList JSON-LD entry", () => {
      const input = `{"@type": "ListItem", "position": 1, "name": "Intro", "url": "{{ site.origin }}{{ '/intro/' | url }}"}`;
      const output = renderHeadExtra(input, ctx);
      expect(output).toBe(
        `{"@type": "ListItem", "position": 1, "name": "Intro", "url": "https://sandgraal.github.io/letstalkcdc/intro/"}`,
      );
    });

    it("leaves unsupported expressions unchanged (passthrough)", () => {
      expect(renderHeadExtra("{{ site.unknown }}", ctx)).toBe(
        "{{ site.unknown }}",
      );
      expect(renderHeadExtra("{{ page.url }}", ctx)).toBe("{{ page.url }}");
    });

    it("ignores non-expression content", () => {
      expect(renderHeadExtra("plain text", ctx)).toBe("plain text");
    });
  });

  describe("stylesheet preload conversion", () => {
    it('rewrites <link rel="stylesheet"> to preload + onload + noscript', () => {
      const input = `<link rel="stylesheet" href="{{ '/assets/css/pages/intro.css' | url }}">`;
      const output = renderHeadExtra(input, ctx);
      const resolved = "/letstalkcdc/assets/css/pages/intro.css";
      expect(output).toBe(
        `<link rel="preload" href="${resolved}" as="style" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${resolved}"></noscript>`,
      );
    });

    it("also rewrites href-first stylesheet links", () => {
      const input = `<link href="{{ '/assets/css/styles.css' | url }}" rel="stylesheet" />`;
      const output = renderHeadExtra(input, ctx);
      const resolved = "/letstalkcdc/assets/css/styles.css";
      expect(output).toBe(
        `<link rel="preload" href="${resolved}" as="style" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${resolved}"></noscript>`,
      );
    });

    it("converts multiple stylesheet links in one head_extra block", () => {
      const input =
        `<link rel="stylesheet" href="/a.css">` +
        `\n<link href="/b.css" rel="stylesheet">`;
      const output = renderHeadExtra(input, ctx);
      expect(output).toContain(
        '<noscript><link rel="stylesheet" href="/a.css"></noscript>',
      );
      expect(output).toContain(
        '<noscript><link rel="stylesheet" href="/b.css"></noscript>',
      );
      expect((output.match(/rel="preload"/g) || []).length).toBe(2);
    });

    it("leaves non-stylesheet <link> tags alone", () => {
      const input = `<link rel="canonical" href="https://example.com/">`;
      expect(renderHeadExtra(input, ctx)).toBe(input);
    });
  });

  describe("defaults", () => {
    it("treats omitted context options as empty strings", () => {
      // No second arg at all.
      expect(renderHeadExtra("{{ site.host }}")).toBe("");
      // Partial options.
      expect(
        renderHeadExtra("{{ site.host }}{{ site.origin }}", { host: "H" }),
      ).toBe("H");
    });
  });
});
