# Licensing

Let's Talk CDC uses two licences, split by what the material is.

| What                              | Licence            | Full text                                      |
| --------------------------------- | ------------------ | ---------------------------------------------- |
| Written lessons, diagrams, images | [CC BY 4.0][cc-by] | [LICENSE-CC-BY-4.0.txt](LICENSE-CC-BY-4.0.txt) |
| Code and everything else          | MIT                | [LICENSE](LICENSE)                             |

Copyright holder: Christopher Ennis.

## Covered by CC BY 4.0 (content)

- The lesson text on the site: the page bodies in the topic folders under
  `src/` (for example `src/intro/index.njk`, `src/snapshotting/index.njk`,
  `src/cloud-labs/**/index.njk`, `src/quickstart/**`), including the code
  samples shown inside a lesson.
- The glossary, comparison and vendor data that feed those pages:
  `src/_data/glossary.mjs`, `src/_data/cdcCompare.mjs`,
  `src/_data/cdcVendors.mjs`, `src/from-change-capture-to-ci/data.json`.
- The assistant knowledge base, `src/data/assistant.yml`.
- Diagrams and images made for the site: `src/static/diagrams/**` and
  `src/static/images/**` (the logo and social cover image), plus
  `src/static/favicon.svg`.

You may share and adapt this material, including commercially, as long as you
give attribution, link to the licence, and say if you made changes.

### Attribution

Use this wording, or equivalent:

> Let's Talk CDC by Christopher Ennis, https://sandgraal.github.io/letstalkcdc/, licensed CC BY 4.0
> (https://creativecommons.org/licenses/by/4.0/)

## Covered by MIT (code)

Everything not listed above, in particular:

- Site chrome and build: `src/_includes/**` (layouts and components),
  `src/assets/**` (CSS and JS), `src/css/**`, `src/js/**`, `src/scripts/**`,
  `eleventy.config.mjs`, `lib/**`, `scripts/**`, `vite.config.mjs`,
  `postcss.config.mjs`.
- Lab and drill material you run: the configs and scripts under
  `src/resources/**`.
- Tests, CI workflows and tooling: `tests/**`, `.github/**`, `.claude/**`.
- Project documentation: `README.md`, `docs/**`, `SECURITY.md`.

## Not covered by either licence

Third-party material keeps its own licence and is not relicensed here:

- Vendor and product names, logos and trademarks (Debezium, Kafka, Oracle,
  Snowflake and so on) belong to their owners.
- Libraries loaded from CDNs or installed from npm (Mermaid, Chart.js and
  others) are under their own licences.
- The IBM Plex fonts in `src/static/fonts/**` are third-party and distributed
  under their own licence (the SIL Open Font License).
- Quotes from vendor documentation, RFCs and papers belong to their authors.

## `playground/`

`playground/` has its own `README.md`, `CONTRIBUTING.md` and `SECURITY.md` but
no licence file of its own. The licences in this repository's root apply to
it, unless a file says otherwise.

[cc-by]: https://creativecommons.org/licenses/by/4.0/
