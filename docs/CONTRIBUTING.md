# Contributing

Welcome — and thanks for considering a contribution to _CDC: The Missing Manual_.
This file covers the practical bits: how to run the site locally, what we expect
in a pull request, and where the conventions live.

## Quick start

```bash
git clone https://github.com/sandgraal/letstalkcdc.git
cd letstalkcdc
npm install
npm run dev          # http://localhost:8080
```

Before opening a PR:

```bash
npm run build        # production build into _site/
npm run smoke        # core + a11y + perf checks
npm run test         # unit tests
```

## Pull requests

- Keep PRs focused. One topic per PR is easier to review and easier to revert.
- Match the surrounding code style. Prettier and ESLint run via `npm run lint`.
- For new content modules, follow **[docs/adding-modules.md](./adding-modules.md)**.
- For visual changes, attach before/after screenshots in light and dark mode.
- For new pages, ensure: `<title>`, meta description, `datePublished` /
  `dateModified` in the page data file, and `npm run smoke` passes.

## Site conventions

- **Voice & tone**: practitioner-to-practitioner. Approachable without dumbing
  down. Concrete examples preferred over abstract definitions.
- **Code samples**: must be runnable or clearly marked as illustrative.
  Prefer real shell transcripts to pseudo-code.
- **Diagrams**: author in Mermaid where possible (see `src/mermaid-sandbox/`).
  For polished visuals, use the SVG illustration system under
  `src/static/illustrations/`.
- **External links**: cite primary sources (vendor docs, RFCs, papers) over
  blog reposts. Link rot is real — verify before you ship.

## Assistant knowledge base

The conversational helper ships with a curated YAML knowledge base at
`src/data/assistant.yml`.

- Follow the existing intent structure when adding content (`id`, `triggers`,
  `answer`, and optional `links`).
- Keep `triggers` short and action-oriented so substring matching works
  reliably.
- Prefer internal documentation URLs when possible; external links should be
  vetted for long-term stability.
- Run `npm run build` (or `npm run smoke:core`) to regenerate
  `_site/data/assistant.json` and ensure the smoke test passes.
- Mention significant knowledge-base updates in the pull request summary so
  reviewers can validate the new guidance.

## Reporting issues

- **Bugs** — open a GitHub issue with reproduction steps and your environment
  (Node version, browser, OS).
- **Content errors** — open an issue or PR; please cite a source where
  appropriate.
- **Security issues** — see [SECURITY.md](../SECURITY.md) if present, otherwise
  open a private security advisory on the repo.
