#!/usr/bin/env node
/**
 * Measure the contrast of gradient-clipped (background-clip: text) text.
 *
 * axe cannot score this text: the glyph colour is `transparent` and the
 * visible colour comes from a background gradient clipped to the glyphs. So
 * this measures it from rendered pixels instead of from the CSS:
 *
 *   B  the element with its text and its own background removed
 *      (= whatever really sits behind the text: section gradient, radial glow)
 *   C  the element's gradient painted as a plain box (= the colour the clipped
 *      text would have at every pixel)
 *   F/G  the same text drawn solid black and solid white; (G - F) / 255 is the
 *      exact glyph coverage per pixel
 *
 * For every pixel with coverage >= 0.98 the contrast of C against B is
 * computed (WCAG 2.x). Large text (>= 24px, or >= 18.66px and bold) needs
 * 3:1, anything else 4.5:1. The minimum per element / theme / viewport is
 * reported, with a 20-bin profile along the text so a failure can be placed.
 *
 * Usage (after `ELEVENTY_PATH_PREFIX=/letstalkcdc NODE_ENV=production npm run build`):
 *   node scripts/measure-gradient-contrast.mjs [--json] [--strict]
 *
 * --strict exits 1 when any measured minimum is below its threshold.
 * Targets are listed in tests/unit/gradient-text-contrast.test.js; keep the
 * two in step.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "_site");
const PREFIX = "/letstalkcdc";
const THEMES = ["light", "dark"];
const VIEWPORTS = [375, 1280];
const BINS = 20;

export const TARGETS = [
  { name: "hero-h1", selector: ".hero-section h1", marker: "hero-section" },
  {
    name: "styleguide-accent",
    selector: ".hero h1 .accent",
    marker: 'class="accent"',
    only: "styleguide/index.html",
  },
];

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!p.startsWith(PREFIX + "/")) p = PREFIX + p;
    p = p.slice(PREFIX.length);
    let file = path.join(SITE, p);
    if (!file.startsWith(SITE)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    if (!fs.existsSync(file)) return res.writeHead(404).end("not found");
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server)),
  );
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "index.html") out.push(p);
  }
  return out;
}

const PROBES = {
  A: "",
  B: "background:none!important;-webkit-text-fill-color:transparent!important;color:transparent!important;text-shadow:none!important",
  C: "-webkit-background-clip:border-box!important;background-clip:border-box!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important",
  F: "background:none!important;-webkit-text-fill-color:#000!important;color:#000!important;text-shadow:none!important",
  G: "background:none!important;-webkit-text-fill-color:#fff!important;color:#fff!important;text-shadow:none!important",
};

async function measure(page, helper, target, theme) {
  const loc = page.locator(target.selector).first();
  if (!(await loc.count())) return null;
  await loc.scrollIntoViewIfNeeded();
  const info = await loc.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      fontSize: parseFloat(cs.fontSize),
      fontWeight: parseInt(cs.fontWeight, 10),
      bgImage: cs.backgroundImage,
      clip: cs.backgroundClip || cs.webkitBackgroundClip,
    };
  });
  const large =
    info.fontSize >= 24 || (info.fontSize >= 18.66 && info.fontWeight >= 700);
  const shots = {};
  for (const [k, css] of Object.entries(PROBES)) {
    await loc.evaluate((el, v) => {
      el.__style = el.getAttribute("style");
      el.setAttribute("style", (el.__style || "") + ";" + v);
    }, css);
    shots[k] = (await loc.screenshot({ animations: "disabled" })).toString(
      "base64",
    );
    await loc.evaluate((el) => {
      if (el.__style === null) el.removeAttribute("style");
      else el.setAttribute("style", el.__style);
    });
  }
  const px = await helper.evaluate(
    async ({ shots, BINS }) => {
      const dec = async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bytes]));
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext("2d");
        ctx.drawImage(bmp, 0, 0);
        return {
          w: bmp.width,
          h: bmp.height,
          d: ctx.getImageData(0, 0, bmp.width, bmp.height).data,
        };
      };
      const S = {};
      for (const k of Object.keys(shots)) S[k] = await dec(shots[k]);
      const lum = (r, g, b) => {
        const f = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const { w, h } = S.B;
      let min = Infinity;
      let n = 0;
      let odd = 0;
      let minAt = null;
      const bins = Array(BINS).fill(Infinity);
      // Glyph coverage from the black/white pair, then keep only interior
      // pixels (all 8 neighbours fully covered): edge pixels are anti-aliased
      // differently by the clip mask than by the glyph raster.
      const cov = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        let a = 0;
        for (let ch = 0; ch < 3; ch++)
          a += (S.G.d[o + ch] - S.F.d[o + ch]) / 255;
        cov[i] = a / 3 >= 0.98 ? 1 : 0;
      }
      for (let i = 0; i < w * h; i++) {
        if (!cov[i]) continue;
        const x = i % w;
        const y = (i - x) / w;
        let interior = x > 0 && y > 0 && x < w - 1 && y < h - 1;
        for (let dy = -1; interior && dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (!cov[i + dy * w + dx]) {
              interior = false;
              break;
            }
        if (!interior) continue;
        const o = i * 4;
        const dA = Math.max(
          Math.abs(S.A.d[o] - S.C.d[o]),
          Math.abs(S.A.d[o + 1] - S.C.d[o + 1]),
          Math.abs(S.A.d[o + 2] - S.C.d[o + 2]),
        );
        if (dA > 3) {
          odd++;
          continue;
        }
        const l1 = lum(S.C.d[o], S.C.d[o + 1], S.C.d[o + 2]);
        const l2 = lum(S.B.d[o], S.B.d[o + 1], S.B.d[o + 2]);
        const cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        n++;
        const bin = Math.min(BINS - 1, Math.floor(((i % w) / w) * BINS));
        if (cr < bins[bin]) bins[bin] = cr;
        if (cr < min) {
          min = cr;
          minAt = {
            x: i % w,
            y: Math.floor(i / w),
            fg: [S.C.d[o], S.C.d[o + 1], S.C.d[o + 2]],
            bg: [S.B.d[o], S.B.d[o + 1], S.B.d[o + 2]],
          };
        }
      }
      return { n, odd, min: n ? min : null, minAt, bins };
    },
    { shots, BINS },
  );
  return {
    large,
    threshold: large ? 3 : 4.5,
    fontSize: info.fontSize,
    fontWeight: info.fontWeight,
    gradient: info.bgImage,
    pixels: px.n,
    rejected: px.odd,
    min: px.min,
    minAt: px.minAt,
    bins: px.bins.map((v) => (Number.isFinite(v) ? +v.toFixed(2) : null)),
  };
}

async function main() {
  const asJson = process.argv.includes("--json");
  const strict = process.argv.includes("--strict");
  if (!fs.existsSync(SITE))
    throw new Error("build the site first (_site/ missing)");
  const files = walk(SITE);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}${PREFIX}`;
  const browser = await chromium.launch();
  const results = [];
  try {
    const helper = await (await browser.newContext()).newPage();
    await helper.goto("about:blank");
    for (const target of TARGETS) {
      const pages = files
        .filter((f) => {
          const rel = path.relative(SITE, f).split(path.sep).join("/");
          if (target.only) return rel === target.only;
          return fs.readFileSync(f, "utf8").includes(target.marker);
        })
        .map(
          (f) =>
            "/" +
            path.relative(SITE, path.dirname(f)).split(path.sep).join("/") +
            "/",
        )
        .map((p) => p.replace(/^\/\.\/$/, "/"));
      for (const theme of THEMES) {
        for (const width of VIEWPORTS) {
          const ctx = await browser.newContext({
            viewport: { width, height: 900 },
            colorScheme: theme,
            reducedMotion: "reduce",
          });
          await ctx.addInitScript((t) => {
            window.localStorage.setItem("theme", t);
          }, theme);
          await ctx.route(
            (u) => !u.hostname.startsWith("127."),
            (r) => r.abort(),
          );
          const page = await ctx.newPage();
          let worst = null;
          for (const p of pages) {
            await page.goto(base + p, { waitUntil: "load" });
            await page.evaluate((t) => {
              const root = document.documentElement;
              if (!root.getAttribute("data-theme"))
                root.setAttribute("data-theme", t);
            }, theme);
            await page.addStyleTag({
              content:
                "*,*::before,*::after{transition:none!important;animation:none!important}",
            });
            await page.evaluate(() => document.fonts.ready);
            const m = await measure(page, helper, target, theme);
            if (m && m.min !== null && (!worst || m.min < worst.min))
              worst = { page: p, ...m };
          }
          results.push({
            element: target.name,
            theme,
            width,
            pagesMeasured: pages.length,
            ...worst,
          });
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (asJson) console.log(JSON.stringify(results, null, 2));
  else {
    console.log(
      "element | theme | vw | size/wt | min | need | pages | worst page",
    );
    for (const r of results)
      console.log(
        `${r.element} | ${r.theme} | ${r.width} | ${r.fontSize}px/${r.fontWeight} | ${r.min?.toFixed(2)} | ${r.threshold} | ${r.pagesMeasured} | ${r.page}`,
      );
  }
  const failing = results.filter((r) => r.min === null || r.min < r.threshold);
  if (strict && failing.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
