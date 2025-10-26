# Adding New Modules to the CDC Series

This project treats each Eleventy module as a self-contained directory that ships its own layout data, content, and any bespoke assets. The overview grid at `/overview/` is driven by structured metadata, so as soon as you register a module the build will surface it with the correct description and classification tags. Follow the checklist below whenever you add a new topic.

## 1. Define the series card metadata

The overview page consumes `src/_data/series.cjs`. Add a new object to that array so the module appears automatically in the overview grid. Use the `key` as the canonical slug and supply the author-controlled description and classification tags that should render in the card.

```js
// src/_data/series.cjs
{
  key: 'anatomy-of-connectors',
  title: 'Anatomy of Connectors',
  description: 'Explain the moving parts inside a CDC connector so operators can debug sync drift confidently.',
  href: '/anatomy-of-connectors/',
  ctaLabel: 'Start Exploring',
  tags: [
    { label: 'Core Concept', variant: 'tag-concept' }
  ]
}
```

> **Why first?** The `series.cjs` dataset drives navigation chrome, SEO metadata for adjacent modules, and the overview grid. Updating it before writing content ensures the automated wiring (description text, CTA label, badge/tags) is ready as soon as the page ships.

## 2. Scaffold the module directory

Create a folder under `src/` whose name matches the `key`. Each module must have:

- `index.njk` — the authored content with standard front matter.
- `index.11tydata.cjs` — shared data that Eleventy merges into the page context (hero blocks, series key, etc.).

Example structure:

```
src/
  anatomy-of-connectors/
    index.11tydata.cjs
    index.njk
```

## 3. Export the series key and hero configuration

Inside `index.11tydata.cjs`, export an object that at minimum defines `seriesKey` to match the dataset entry and any hero configuration the base layout should render.

```js
// src/anatomy-of-connectors/index.11tydata.cjs
module.exports = {
  seriesKey: 'anatomy-of-connectors',
  heroConfig: {
    title: 'Anatomy of Connectors',
    description: `Walk through the stages of change capture connectors — from snapshotting to steady-state streams — and learn how to observe each step.`,
    align: 'center',
    actions: [
      { href: '#connector-lifecycle', label: 'View the Lifecycle', variant: 'secondary' },
      { href: '#operational-playbook', label: 'Download Ops Checklist', variant: 'ghost' }
    ]
  }
};
```

Eleventy will now expose `seriesKey`, `heroConfig`, and any other exports to the page template at build time.

## 4. Author the page template

Author `index.njk` with standard front matter and use the shared UI macros. The `layout: base.njk` line pulls in the global navigation, while `seriesKey` enables the previous/next module strip to resolve automatically based on `series.cjs` ordering.

{% raw %}
```njk
---
layout: base.njk
title: Anatomy of Connectors
description: Understand each subsystem of a CDC connector so you can tune throughput, trace lag, and debug replays.
canonicalPath: /anatomy-of-connectors/
---
{% from "components/ui.njk" import ui %}

{{ ui.hero(heroConfig) }}

<section id="connector-lifecycle" class="content-section">
  <h2>The connector lifecycle</h2>
  <p>…</p>
</section>
```
{% endraw %}

## 5. Add optional assets

If the module requires custom styling or client-side logic, drop files under `src/assets/css/pages/` or `src/assets/js/pages/` and reference them via the template front matter (`head_extra` or `scripts`).

## 6. Preview locally

Run the standard development server to confirm the new module renders and the overview card appears with the supplied description and tags.

```bash
npm run serve
```

Visit `http://localhost:8080/overview/` and confirm the module card shows the correct metadata. Because the overview consumes `series.cjs`, no additional wiring is required—the card renders automatically with the description and classification tags you defined.

## 7. Commit and document

Once satisfied, commit your changes (module content, dataset update, any assets) together with an appropriate message. Update related documentation or navigation links if the module introduces new dependencies.

Following these steps keeps the overview grid, navigation chrome, and module pages in sync with minimal manual work.

