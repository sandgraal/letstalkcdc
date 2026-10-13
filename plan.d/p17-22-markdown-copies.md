item: P17-22
action: done

Shipped in the PR carrying this change: `src/markdown-twins.11ty.cjs` writes an `index.md` beside every sitemap page (56 of them), converted by `lib/markdown-twin.cjs` with no dependency; `base.njk` links each with `<link rel="alternate" type="text/markdown">` and `llms.txt` lists each twin. Proved by `tests/unit/markdown-twin.test.js` (headings and code blocks equal the HTML on three sample pages) and the twin checks in `scripts/smoke.mjs`. GitHub Pages cannot set `X-Robots-Tag`, so each twin names its canonical HTML URL in its first lines.
