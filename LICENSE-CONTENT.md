# Licensing

CDC: The Missing Manual (the Let's Talk CDC repository) uses two licences,
split by what the material is.

| What                              | Licence            | Full text                                      |
| --------------------------------- | ------------------ | ---------------------------------------------- |
| Written lessons, diagrams, images | [CC BY 4.0][cc-by] | [LICENSE-CC-BY-4.0.txt](LICENSE-CC-BY-4.0.txt) |
| Code and everything else          | MIT                | [LICENSE](LICENSE)                             |

Copyright holder: Christopher Ennis.

**Code samples in lessons.** Code samples, configs and commands shown inside
lessons and quickstarts are CC BY 4.0 as part of the page text, and are also
available under MIT with no attribution required, so you can copy them into
your own projects.

## Covered by CC BY 4.0 (content)

- The lesson text on the site: the page bodies in the topic folders under
  `src/` (for example `src/intro/index.njk`, `src/snapshotting/index.njk`,
  `src/cloud-labs/**/index.njk`, `src/quickstart/**/index.njk`), including
  the code samples shown inside a lesson (see the note above).
- Prose-bearing data files under `src/_data/` that feed those pages:
  `src/_data/glossary.mjs`, `src/_data/cdcCompare.mjs`,
  `src/_data/cdcVendors.mjs`, `src/_data/errata.mjs`, `src/_data/series.mjs`
  and `src/_data/community.mjs`. Also `src/from-change-capture-to-ci/data.json`.
- The assistant knowledge base, `src/data/assistant.yml`.
- Instructional Markdown under `src/resources/`: `src/resources/*.md` and
  `src/resources/drill-bundle/README.md`.
- Diagrams and images made for the site: `src/static/diagrams/**` and
  `src/static/images/**` (the logo and social cover image), plus the site
  icons `src/static/favicon.svg`, `src/static/favicon.ico` and
  `src/static/apple-touch-icon.png`, which follow the favicon as the author's
  own work.

You may share and adapt this material, including commercially, as long as you
give attribution, link to the licence, and say if you made changes.

### Attribution

Use this wording, or equivalent:

> CDC: The Missing Manual by Christopher Ennis (Let's Talk CDC), https://sandgraal.github.io/letstalkcdc/, licensed under CC BY 4.0
> (https://creativecommons.org/licenses/by/4.0/)

## Covered by MIT (code)

Everything not listed above, in particular:

- Site chrome and build: `src/_includes/**` (layouts and components),
  `src/assets/**` (CSS and JS), `src/css/**`, `src/js/**`, `src/scripts/**`,
  `eleventy.config.mjs`, `lib/**`, `scripts/**`, `vite.config.mjs`,
  `postcss.config.mjs`.
- Site configuration and non-prose data under `src/_data/`: `site.mjs`,
  `author.mjs`, `pkg.mjs`, `supabase.mjs` and `toolVersions.mjs`.
- Lab and drill material you run: the scripts and configs under
  `src/resources/**` (everything there except the Markdown files named above).
- Tests, CI workflows and tooling: `tests/**`, `.github/**`, `.claude/**`.
- Project documentation: `README.md`, `CONTRIBUTING.md`, `SECURITY.md` and
  the other root Markdown files, and `docs/**`.

## Not covered by either licence

Third-party material keeps its own licence and is not relicensed here:

- Vendor and product names, logos and trademarks (Debezium, Kafka, Oracle,
  Snowflake and so on) belong to their owners.
- Libraries loaded from CDNs or installed from npm (Mermaid, Chart.js and
  others) are under their own licences.
- Quotes from vendor documentation, RFCs and papers belong to their authors.

### IBM Plex fonts

The fonts in `src/static/fonts/*.woff2` are IBM Plex, Copyright © 2017 IBM
Corp. with Reserved Font Name "Plex", licensed under the SIL Open Font
License 1.1. Project: https://github.com/IBM/plex. The licence notice ships
with the fonts at `src/static/fonts/OFL.txt`, served on the site at
`/fonts/OFL.txt`.

## `playground/`

`playground/` has its own `README.md`, `CONTRIBUTING.md` and `SECURITY.md` but
no licence file of its own. The licences in this repository's root apply to
it, unless a file says otherwise. Two caveats:

- The generated bundles under `playground/assets/generated/**` may include
  third-party code under its own licences. They have not been audited.
- The provenance of `playground/CDC_logo.png` is not recorded.

[cc-by]: https://creativecommons.org/licenses/by/4.0/
