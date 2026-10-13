type: Added

**Markdown copy of every page (P17-22).** Each indexable page now has a clean
Markdown twin at a predictable address: `/intro/` has `/intro/index.md`, and
the home page has `/index.md`. The twin holds the page's prose, headings,
lists, tables and code blocks, with absolute links, and none of the scripts or
navigation. Each HTML page points to its twin with
`<link rel="alternate" type="text/markdown">`, and `/llms.txt` lists the twin
next to each page. A twin names the canonical HTML page in its first lines,
because GitHub Pages cannot send a `noindex` or canonical header.
