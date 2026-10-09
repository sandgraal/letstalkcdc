import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * P13-6: font loading must be deterministic.
 *
 * Every self-hosted IBM Plex weight that paints above the fold has to be
 * preloaded (otherwise it is discovered only after styles.css applies, and the
 * swap shifts the h1 and the nav), and every swap has to land on a
 * metric-matched local fallback so the shift is invisible even when a font
 * arrives late. Weights that are lazy by design are listed explicitly, so a
 * new late-loading weight fails here instead of silently costing CLS.
 */

const read = (p) => fs.readFileSync(path.resolve(p), "utf8");
const base = read("src/_includes/layouts/base.njk");
const css = read("src/assets/css/01-variables.css").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const preloaded = [
  ...base.matchAll(
    /<link rel="preload" href="\{\{ '\/fonts\/([^']+\.woff2)' \| url \}\}" as="font" type="font\/woff2" crossorigin>/g,
  ),
].map((m) => m[1]);

/** Parse every @font-face block into { family, weight, src, props }. */
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
  const props = {};
  for (const decl of m[1].split(";")) {
    const i = decl.indexOf(":");
    if (i > 0)
      props[decl.slice(0, i).trim()] = decl
        .slice(i + 1)
        .replace(/\s+/g, " ")
        .trim();
  }
  return { family: props["font-family"].replace(/"/g, ""), props };
});

const plexFiles = faces
  .filter((f) => /^IBM Plex (Sans|Mono)$/.test(f.family))
  .map((f) => ({
    family: f.family,
    weight: f.props["font-weight"],
    file: f.props.src.match(/fonts\/([^"]+\.woff2)/)[1],
  }));

// Never above the fold on any page; lazy by design, covered by the fallback.
const LAZY_BY_DESIGN = new Set([
  "ibm-plex-mono-500.woff2",
  "ibm-plex-mono-600.woff2",
]);

describe("font preloads (base.njk)", () => {
  it("preloads each above-the-fold weight", () => {
    for (const f of [
      "ibm-plex-sans-400.woff2",
      "ibm-plex-sans-500.woff2",
      "ibm-plex-sans-600.woff2",
      "ibm-plex-sans-700.woff2",
      "ibm-plex-mono-400.woff2",
    ])
      expect(preloaded, f).toContain(f);
  });

  it("preloads or explicitly defers every declared Plex weight, no orphans", () => {
    expect(plexFiles).toHaveLength(7);
    for (const { file } of plexFiles) {
      const ok = preloaded.includes(file) || LAZY_BY_DESIGN.has(file);
      expect(ok, `${file} is neither preloaded nor lazy-by-design`).toBe(true);
    }
    for (const file of preloaded)
      expect(
        plexFiles.some((f) => f.file === file),
        `${file} is preloaded but has no @font-face`,
      ).toBe(true);
  });

  it("only references font files that exist, with the | url filter", () => {
    for (const file of [...preloaded, ...plexFiles.map((f) => f.file)])
      expect(fs.existsSync(path.resolve("src/static/fonts", file)), file).toBe(
        true,
      );
    expect(base).not.toMatch(/href="\/fonts\//);
  });
});

describe("metric-matched fallback faces (01-variables.css)", () => {
  const fallbacks = (family) => faces.filter((f) => f.family === family);

  it("declares a Sans fallback for each of the four weights", () => {
    expect(
      fallbacks("IBM Plex Sans Fallback")
        .map((f) => f.props["font-weight"])
        .sort(),
    ).toEqual(["400", "500", "600", "700"]);
  });

  it("declares a Mono fallback for regular and bold", () => {
    expect(fallbacks("IBM Plex Mono Fallback")).toHaveLength(2);
  });

  it("gives every fallback local() sources and all four override metrics", () => {
    const all = [
      ...fallbacks("IBM Plex Sans Fallback"),
      ...fallbacks("IBM Plex Mono Fallback"),
    ];
    for (const f of all) {
      expect(f.props.src).toMatch(/^local\("/);
      expect(f.props.src).not.toMatch(/url\(/);
      for (const key of [
        "size-adjust",
        "ascent-override",
        "descent-override",
        "line-gap-override",
      ])
        expect(f.props[key], `${f.family} ${key}`).toMatch(/^\d+(\.\d+)?%$/);
      // Sanity bounds: a fallback rescaled by more than 15% is a typo.
      const size = parseFloat(f.props["size-adjust"]);
      expect(size).toBeGreaterThan(85);
      expect(size).toBeLessThan(115);
      // Plex has a 1.025 / 0.275 em vertical box and no line gap; dividing by
      // size-adjust must land inside this band.
      const asc = parseFloat(f.props["ascent-override"]);
      const desc = parseFloat(f.props["descent-override"]);
      expect(asc * (size / 100)).toBeCloseTo(102.5, 0);
      expect(desc * (size / 100)).toBeCloseTo(27.5, 0);
      expect(parseFloat(f.props["line-gap-override"])).toBe(0);
    }
  });

  it("puts each fallback straight after its Plex family in the tokens", () => {
    expect(css).toMatch(
      /--font-sans:\s*"IBM Plex Sans", "IBM Plex Sans Fallback",/,
    );
    expect(css).toMatch(
      /--font-display:\s*"IBM Plex Sans", "IBM Plex Sans Fallback",/,
    );
    expect(css).toMatch(
      /--font-mono:\s*"IBM Plex Mono", "IBM Plex Mono Fallback",/,
    );
  });
});
