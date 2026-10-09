# Moving the site to its own domain

Runbook for moving Let's Talk CDC from a GitHub Pages project URL
(`https://<owner>.github.io/<repo>/`) to a domain you own. The code is set up
so that the move is a **variable change**: the host is written down once, in
`lib/site-host.mjs`, and every canonical URL, Open Graph tag, JSON-LD block,
`sitemap.xml`, `feed.xml` and `robots.txt` derives from `SITE_HOST`
(`tests/unit/site-host.test.js` builds the site with a different host and fails
if the old one shows up anywhere).

## When to use this

- You bought a domain and want the site served from it.
- You are moving between custom domains.

You do not need it to change the repo name or owner. That changes the default
path prefix, not the host. See "Path prefix" below.

## What stays manual

Some references name the canonical URL on purpose and are not derived. They
are listed in the [checklist](#hand-edited-references-checklist) at the end.
Work through it as part of the move.

## Steps

### 1. Choose the shape

| Shape           | `SITE_HOST`                 | `ELEVENTY_PATH_PREFIX` |
| --------------- | --------------------------- | ---------------------- |
| Apex domain     | `https://example.org`       | `/`                    |
| Subdomain       | `https://cdc.example.org`   | `/`                    |
| Under a sub-dir | `https://example.org`       | `/cdc`                 |
| Today (project) | `https://<owner>.github.io` | `/<repo>` (derived)    |

`SITE_HOST` is scheme plus domain, with no path. A trailing slash is stripped.

### 2. Path prefix: use `/`, not blank

`lib/path-prefix.mjs` treats an unset or empty `ELEVENTY_PATH_PREFIX` as "work
it out from `GITHUB_REPOSITORY`". For a project repo that gives `/<repo>/`. So
a blank variable does **not** mean root. Checked against the module with
`GITHUB_REPOSITORY=sandgraal/letstalkcdc`:

| `ELEVENTY_PATH_PREFIX` | Resulting prefix | Host suffix    |
| ---------------------- | ---------------- | -------------- |
| unset or `""`          | `/letstalkcdc/`  | `/letstalkcdc` |
| `/`                    | `/`              | none           |
| `letstalkcdc`          | `/letstalkcdc/`  | `/letstalkcdc` |

Set the variable to `/` to serve from the root. The deploy workflow passes
`vars.ELEVENTY_PATH_PREFIX` through as-is, and an unset repo variable arrives as
an empty string, so leaving it unset on a custom domain would build every link
with `/letstalkcdc/` in it.

### 3. DNS

Described generically; take the current record values from GitHub's custom
domain documentation, which changes more often than this file.

- **Apex domain** (`example.org`): `A` records (and optionally `AAAA`) pointing
  at the GitHub Pages addresses.
- **Subdomain** (`cdc.example.org`, or `www`): one `CNAME` record pointing at
  `<owner>.github.io`.
- If you want both `example.org` and `www.example.org`, configure both and set
  the one you want as canonical in Pages. GitHub redirects the other.
- Do not use wildcard DNS records for the domain. Verifying the domain in your
  GitHub account settings (a `TXT` record) stops anyone else claiming it.

### 4. GitHub Pages settings

1. Repository **Settings -> Pages -> Custom domain**: enter the domain and save.
2. Wait for the DNS check to pass and for the certificate to be issued. This can
   take from minutes to a day.
3. Tick **Enforce HTTPS** once it becomes available.

**About a `CNAME` file.** `src/static` is passed through to the site root
(`eleventy.config.mjs`: `"src/static": "/"`). Checked: a file at
`src/static/CNAME` is emitted as `_site/CNAME`. This repo publishes with
`actions/deploy-pages` (a custom Actions workflow), and GitHub's documentation
says a `CNAME` file is ignored and not required in that case; the domain comes
from the Settings field above. Add the file only if the publishing method ever
changes to "deploy from a branch".

### 5. Set the repository variables and redeploy

Under **Settings -> Secrets and variables -> Actions -> Variables**:

- `SITE_HOST` = the new origin, for example `https://example.org`
- `ELEVENTY_PATH_PREFIX` = `/` (see step 2)

`.github/workflows/deploy.yml` reads both as `vars.*`. Trigger **Run workflow**
on the Deploy workflow (it has `workflow_dispatch`) or push to `main`.

Order matters. A build made with prefix `/` does not work under the old
`/<repo>/` URL, and a build made with the old prefix does not work on the new
domain. Do steps 4 and 5 back to back rather than days apart, and expect a short
window in between where one of the two URLs is broken.

### 6. Other workflows that pin the host

- `.github/workflows/linkcheck.yml` reads the same `SITE_HOST` and
  `ELEVENTY_PATH_PREFIX` repository variables as `deploy.yml`
  (`${{ vars.SITE_HOST || 'https://<owner>.github.io' }}`, and likewise
  `vars.ELEVENTY_PATH_PREFIX || '/<repo>'`). Step 5 therefore moves the link
  check too, and no edit is needed. The literals after `||` are only fallbacks
  for when a variable is unset; update them at your leisure so they do not
  point at the old host. An empty variable counts as unset (the build treats it
  the same way), so for a root-domain site set `ELEVENTY_PATH_PREFIX` to `/`,
  not to an empty value.
- `npm run build:lhci` already builds with `ELEVENTY_PATH_PREFIX=/` and needs no
  change. The Lighthouse run audits a local build, not the live domain.
- `lib/site-host.mjs` holds `DEFAULT_SITE_HOST`, used only when `SITE_HOST` is
  unset (local builds). Change it to the new origin once the move is done so a
  bare `npm run build` produces the right URLs.

## Redirects from the old URLs

What is and is not possible, as far as is verified:

- **GitHub Pages cannot serve custom server-side redirects** (no `_redirects`,
  no `.htaccess`, no response-header control). Nothing in this repo can issue a
  301 by itself.
- **Built-in redirect.** GitHub's custom-domain documentation describes the
  default `github.io` address redirecting to the custom domain (re-read the
  current wording before relying on it). If that applies, the old
  `.../letstalkcdc/...` URLs are handled by GitHub. This has not been tested for
  this repo. After step 4, run `curl -sI https://<owner>.github.io/<repo>/intro/` and look for a `301`
  and a `Location` header on the new domain. Whether paths are preserved is
  something to confirm in that output.
- **A stub site on the old host.** If the built-in redirect is missing or drops
  paths, the only way to put anything at the old URLs is a _different_ Pages
  site that owns that URL space, such as a `<owner>.github.io` user-site
  repository. It could serve one tiny HTML page per old URL using both
  `<meta http-equiv="refresh" content="0; url=...">` and
  `<link rel="canonical" href="...">`. The module list comes from `sitemap.xml`,
  so the stubs can be generated from it. This is a client-side redirect, not a 301. Search engines generally follow a zero-delay meta refresh, but it is a
  weaker signal than a 301. Whether a user-site repository can serve a path that
  a project site previously used has not been tested here.
- **Search Console "Change of address"** is meant for moving a whole verified
  site between domains. A path on a shared `github.io` host is probably not
  eligible; check whether the tool lets you choose it. Without it: add the new
  domain as a property, submit `https://<new host>/sitemap.xml`, and rely on the
  redirect plus the new canonical tags.
- Inbound links that you control should be edited directly: the repository
  "About -> Website" field, social profiles, the playground cross-links, and
  anything on other sites.

## Checks afterwards

Run these against the live domain once the deploy finishes.

```bash
# nothing should still point at the old host
curl -s https://example.org/ | rg "github\.io"
curl -s https://example.org/sitemap.xml | rg -c "<loc>https://example.org"
curl -s https://example.org/robots.txt            # Sitemap: line uses new host
curl -s https://example.org/feed.xml | rg "<link>|atom:link" | head -3

SITE_HOST=https://example.org ELEVENTY_PATH_PREFIX=/ npm run verify:deployment
```

- **Canonical and Open Graph:** view source on `/`, `/intro/` and one deep page.
  `<link rel="canonical">`, `og:url`, `og:image` and `twitter:*` all use the new
  origin.
- **JSON-LD:** the `Article` block (with its `Person`, `Organization` and `WebPage` parts) in the page head and the
  `BreadcrumbList` on `/intro/`, `/overview/` and the other module pages carry
  the new origin. Run a page through the Rich Results Test if in doubt.
- **Sitemap and RSS:** every `<loc>` and `<link>` starts with the new origin;
  submit the sitemap in Search Console and re-point feed subscribers.
- **Redirect stubs under `src/_redirects/`:** their canonical tags are derived,
  so they follow the new origin. Open two of them.
- **Link check:** once the variables from step 5 are set, `linkcheck.yml`
  builds for the new host and the lychee job should stay green. A new page's own canonical URL does not exist until it deploys, so
  the first run on a fresh domain can flag it. Rerun after the deploy, or add a
  temporary `.lycheeignore` entry with a removal note.
- **Lighthouse:** `npm run lighthouse` audits a root-prefixed local build. For
  the live domain use PageSpeed Insights on the home page and `/intro/`.
- **Supabase:** if the assistant feedback or the playground are configured for a
  project, check the Supabase project's URL configuration (and any allowed
  origins or redirect URLs) for the old host.
- **Playground:** `scripts/publish-playground.sh` copies `playground/` and
  fills the `__SITE_URL__` placeholder in the `<head>` of `index.html`
  (canonical, `og:url`, `og:image`, Twitter image) from `SITE_HOST` and
  `ELEVENTY_PATH_PREFIX`, so those follow the variables. The other hardcoded
  site URLs in the playground (`LTCDC_BASE`, `shareBaseUrl`) do not. See the
  checklist. The sitemap lists `/playground/` from `src/sitemap.11ty.cjs`.
- **Old URLs:** `curl -sI` a handful of the old URLs and record what they do.

## Hand-edited references checklist

These name the canonical URL deliberately or sit in files that are copied
verbatim. None of them derive from `SITE_HOST`. Search for the old host with
`rg -n "<owner>\.github\.io"` and tick them off.

- [ ] `LICENSE-CONTENT.md` (attribution wording, line 44) **and**
      `tests/unit/license.test.js` (line 58 pins the same sentence). Change
      both together.
- [ ] `README.md` (live-site link, and the `SITE_HOST` example).
- [ ] `CLAUDE.md` (intro line and the `SITE_HOST` example in "Path prefix").
- [ ] `docs/STATE-OF-PROJECT.md` (live-site link).
- [ ] `lib/site-host.mjs` `DEFAULT_SITE_HOST` (fallback for unset `SITE_HOST`).
- [ ] `.github/workflows/linkcheck.yml` (the fallback literals after `||` for
      `SITE_HOST` and `ELEVENTY_PATH_PREFIX`; the variables themselves are set
      in step 5).
- [ ] `src/resources/drill-bundle/README.md`: five links to the site. It is
      copied verbatim (and packed into `drill-bundle.zip`), so it cannot use
      template variables. After editing it, rebuild `drill-bundle.zip` and
      update `drill-bundle.zip.sha256`.
- [ ] Playground, which is published verbatim under `/playground/`:
  - `playground/assets/app.js` (`LTCDC_BASE`)
  - `playground/index.html` (header/footer links and `shareBaseUrl`)
  - `playground/web/App.tsx` (the "Learn more about CDC" line) and the
    bundle compiled from it, `playground/assets/generated/ui-shell.js`.
    Regenerate it with the playground's own build (`npm run check:bundles`
    in `playground/` verifies it is in sync).
  - `playground/README.md` and `playground/docs/AGENT_TEAM_BRIEF.md` (prose).
- [ ] GitHub repository "About -> Website" field, social profiles and any
      external listings.
- [ ] Supabase project URL configuration, if it lists the old origin.
- [ ] Google Search Console / Bing Webmaster: new property and sitemap.

Not on the list, because they are not the site host: `repository` in
`src/_data/site.mjs`, the `github.com/<owner>/<repo>` links across the templates
and `scripts/smoke.mjs`. Those change only if the repository is renamed or moved.
