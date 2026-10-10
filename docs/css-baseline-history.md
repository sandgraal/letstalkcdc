# Production CSS baseline: history

The **current** baseline hash lives only in
[`.claude/css-baseline.sha256`](../.claude/css-baseline.sha256) (one line, 64
hex characters). Check it with `/css-byte-check` or
`NODE_ENV=production npm run build:css && npm run check:css-baseline`.

This file is the record of every earlier baseline and why it moved. When you
re-baseline on purpose, update the `.sha256` file and add a line here saying
what changed in the CSS (and that nothing else did).

## History as it stood in CLAUDE.md (moved verbatim)

```
# baseline at HEAD of main is: c5806349294d3bc295a07c93054684a70545d291216916e45cef1c154017f944
# (re-baselined 2026-10-09 (P16-8, P15-50): `.series-related` list rules
#  added to components/progress.css (the Related lessons list under the
#  progress card), the only addition; plus the `.copy-btn` / `button.copy`
#  page-CSS rules removed with their static buttons (those are page CSS,
#  not in the bundle). Previously fceb82df… from the same day (P15-50): the dead `.copy-snippet` selectors and
#  rule removed from components/code-block.css, the only CSS difference
#  (deletions only). Previously f59f964f… from the same day (P16-9): `.h-as-3` / `.h-as-4` presentational
#  heading-level helpers appended to 05-utilities.css, the only CSS
#  difference; headings promoted to the right outline level keep their
#  computed style. Previously 83943ab3… from the same day (P13-6): deterministic font loading, the only
#  CSS difference is in 01-variables.css: six metric-matched local()
#  fallback `@font-face` rules (IBM Plex Sans/Mono Fallback, with
#  size-adjust/ascent/descent/line-gap overrides) and the three
#  `--font-sans/-display/-mono` tokens listing them right after the Plex
#  family. Previously 7ba70b50… from the same day (P13-8): cssnano 7 -> 9 tool upgrade, no source
#  CSS change; output proven computed-style/pixel equivalent (declaration
#  order is no longer alphabetised, `transition ... ease` and similar
#  default tokens dropped, calc() rewritten). Previously c32d01ac… from
#  earlier the same day (P15-21, contrast debt): new
#  `components/code-block.css` (the code-block header / copy-button
#  classes were essentially unstyled), light-theme
#  `--color-success/-warning/-error` (+ hovers) darkened to 4.5:1, the
#  `.status-badge` variants in 07-version-status.css moved onto those
#  tokens, and `.badge.recommended` given dark ink. Previously 163231e6… from earlier the same day: visible-UI fixes - new `.discussion-callout`
#  rules (community box), the orphaned dead `.stats-*` / `.session-modal`
#  rules removed along with the chip markup, the `.button-primary` text
#  and hover colours, and the `a.button:where(:hover, :active,
#  :focus-visible)` text-colour rule in 04-components.css so plain
#  `.button` anchors keep a passing label on hover/active, and the last
#  undefined `--accent-dark` / `--hover-bg` tokens in dashboard-page.css
#  replaced. Previously 1d52a8f2… and e70f54c7… (same PR, earlier states) and 424e77a0… from 2026-10-08:
#  light-theme accent darkened for WCAG AA,
#  `--color-accent-primary/-hover/-active` and `--color-info/-info-hover`
#  in the `:root[data-theme="light"]` block of 01-variables.css, the only
#  CSS difference. Previously e54f4182… from the same day: author headshot
#  rule `.page-meta__author > .author-photo` added to 04-components.css.
#  Before that b1478af0… from the same day: in-range dependency update,
#  cssnano 7.1.9 keeps rgba(248,113,113,.22) in scorecard.css instead of a
#  lossy hsla(), +4 bytes. Before that eebaa34a… from 2026-08-26: nav/drawer
#  fixes, then the undefined-token sweep + panels.css bundling)
```

## History as it stood in .claude/commands/css-byte-check.md (moved verbatim)

```
   (re-baselined 2026-10-09 for P16-8: `.series-related` rules for the Related
   lessons list added to components/progress.css, nothing else; previously
   `fceb82df…`, re-baselined the same day for P15-50: the dead `.copy-snippet` selectors
   and rule removed from components/code-block.css, deletions only; previously
   `f59f964f…`, re-baselined the same day for P16-9: `.h-as-3` / `.h-as-4` heading-level
   helpers in 05-utilities.css, nothing else; previously `83943ab3…`,
   re-baselined the same day for P13-6: metric-matched fallback `@font-face`
   rules and the `--font-*` tokens that list them, nothing else; previously
   `7ba70b50…`, re-baselined the same day for P13-8: cssnano 7 to 9 tool upgrade, no
   source CSS change, output proven computed-style and pixel equivalent;
   previously `c32d01ac…`, re-baselined the same day for the P15-21 contrast debt: new
   `components/code-block.css`, light-theme `--color-success/-warning/-error`
   darkened to 4.5:1 and the `.status-badge` variants moved onto them;
   previously `163231e6…`, the visible-UI fixes: `.discussion-callout`
   rules in 02-base.css, the orphaned stats-chip / session-modal rules
   removed from 09-mobile-responsive.css along with their markup, the
   `.button-primary` text and hover colours in dashboard-page.css, and the
   `a.button:where(:hover, :active, :focus-visible)` text-colour rule in
   04-components.css; the `--accent-dark` / `--hover-bg` token
   replacements in dashboard-page.css; previously `1d52a8f2…` and `e70f54c7…`
   (same PR, earlier states) and `424e77a0…`, the light-theme
   accent contrast fix: only
   `--color-accent-primary/-hover/-active` and `--color-info/-info-hover`
   in the light block changed; previously `e54f4182…`, which added the
   `.page-meta__author > .author-photo` headshot rule over `b1478af0…`.)
```
