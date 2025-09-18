# CI Quality Gates for CDC: The Missing Manual

This scaffold adds three GitHub Actions:

- **Link check** with lychee (`.github/workflows/links.yml`)
- **Accessibility** with pa11y-ci (`.github/workflows/a11y.yml`)
- **CSS build/minify** with PostCSS + CSSO (`.github/workflows/build.yml`)

## How to integrate

1. **Copy files** from this zip into your repo root.
2. If your site builds into a different directory (`dist/`), edit:
   - `.github/workflows/links.yml` to point lychee at `dist/`
   - `.pa11yci` URLs to match your local preview path (or serve `dist/`)
3. **Install Node deps locally (optional)** to test:
   ```bash
   npm ci
   npm run build
   npm run serve  # open http://127.0.0.1:8081
   npm run a11y
   ```
4. **Update HTML to use minified CSS (optional but recommended):**
   ```html
   <link rel="preload" href="styles.min.css" as="style" />
   <link rel="stylesheet" href="styles.min.css" />
   ```
5. **Branch protection**: require the three workflows to pass before merge.

### Notes

- lychee ignores `mailto:`, `tel:`, localhost, and common Google Fonts URLs by default. Tweak `.lychee.toml` as needed.
- pa11y waits 700ms for JS to render. Increase if your pages hydrate more slowly.
- If you add new pages, add them to `.pa11yci`.
