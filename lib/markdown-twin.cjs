/**
 * Markdown twin of a page (P17-22).
 *
 * `htmlToMarkdown` turns the rendered body of a page (Eleventy's
 * `templateContent`, which is the page without the layout, so no header,
 * footer or navigation) into plain Markdown: headings, paragraphs, lists,
 * tables, fenced code blocks, links, images and emphasis. Scripts, styles,
 * SVG, forms, buttons, navigation and anything hidden are dropped.
 *
 * It is a small tolerant tokenizer, not a full HTML parser: the input is
 * this site's own build output, which is well formed. No dependency.
 *
 * Plain CommonJS so the .11ty.cjs templates and the Eleventy config can both
 * load it.
 */

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// Dropped with everything inside them.
const SKIP = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  "head",
  "dialog",
  "audio",
  "video",
  "object",
  "embed",
]);

const RAW_TEXT = new Set(["script", "style"]);

const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "ul",
]);

const NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rarr: "→",
  larr: "←",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  middot: "·",
  times: "×",
  copy: "©",
  bull: "•",
};

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n =
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(n);
      } catch {
        return m;
      }
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });

const parseAttrs = (src) => {
  const attrs = {};
  const re = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
};

/** Parse HTML into { tag, attrs, children } / { text } nodes. */
const parse = (html) => {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</gi;
  let m;
  while ((m = re.exec(html))) {
    const tok = m[0];
    const top = stack[stack.length - 1];
    if (m[2] === undefined) {
      if (tok.startsWith("<!") || tok === "<") continue;
      top.children.push({ text: tok });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node = { tag, attrs: parseAttrs(m[3]), children: [] };
    top.children.push(node);
    if (RAW_TEXT.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "i");
      const rest = html.slice(re.lastIndex);
      const end = rest.search(close);
      re.lastIndex = end === -1 ? html.length : re.lastIndex + end;
      continue;
    }
    const selfClosed = /\/\s*$/.test(m[3]);
    if (!VOID.has(tag) && !selfClosed) stack.push(node);
  }
  return root;
};

const textOf = (node) =>
  node.text !== undefined
    ? decode(node.text)
    : SKIP.has(node.tag)
      ? ""
      : node.children.map(textOf).join("");

// Navigation-only asides: the author byline and the discussion link. Every
// other <aside> (errata, version and "not tested" callouts, gotchas) holds
// content a reader of the twin needs and is kept as a blockquote.
const NAV_ASIDE = /\b(page-meta|discussion-callout)\b/;

const hidden = (n) =>
  n.attrs &&
  (n.attrs.hidden !== undefined ||
    n.attrs["aria-hidden"] === "true" ||
    /\bskip-link\b/.test(n.attrs.class || "") ||
    (n.tag === "aside" && NAV_ASIDE.test(n.attrs.class || "")));

const makeConverter = (baseUrl) => {
  const abs = (href) => {
    if (!href) return "";
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return href;
    }
  };

  const squash = (s) => s.replace(/[ \t\r\n\f]+/g, " ");

  const inline = (nodes) => {
    let out = "";
    for (const n of nodes) {
      if (n.text !== undefined) {
        out += squash(decode(n.text));
        continue;
      }
      if (SKIP.has(n.tag) || hidden(n)) continue;
      const inner = () => inline(n.children);
      switch (n.tag) {
        case "br":
          out += "  \n";
          break;
        case "a": {
          const text = inner().trim();
          const href = n.attrs.href;
          if (!text) break;
          if (!href || href.startsWith("#") || /^javascript:/i.test(href))
            out += text;
          else out += `[${text.replace(/[\\\]]/g, "\\$&")}](${abs(href)})`;
          break;
        }
        case "img": {
          if (!n.attrs.alt) break;
          out += `![${n.attrs.alt.replace(/[\\\]]/g, "\\$&")}](${abs(n.attrs.src)})`;
          break;
        }
        case "strong":
        case "b": {
          const t = inner();
          out += t.trim() ? `**${t.trim()}**` : t;
          break;
        }
        case "em":
        case "i": {
          const t = inner();
          out += t.trim() ? `*${t.trim()}*` : t;
          break;
        }
        case "code":
        case "kbd":
        case "samp": {
          const t = textOf(n).replace(/\s+/g, " ").trim();
          if (!t) break;
          // CommonMark: the fence must be longer than any backtick run inside,
          // and content that starts or ends with a backtick is space-padded.
          const run = Math.max(
            0,
            ...(t.match(/`+/g) || []).map((r) => r.length),
          );
          const fence = "`".repeat(run + 1);
          const pad = t.startsWith("`") || t.endsWith("`") ? " " : "";
          out += `${fence}${pad}${t}${pad}${fence}`;
          break;
        }
        default:
          out += inner();
      }
    }
    return out;
  };

  const tidy = (s) =>
    s
      .replace(/ *\n */g, "\n")
      .replace(/[ \t]{2,}(?!\n)/g, " ")
      .trim();

  const cell = (n) =>
    tidy(inline(n.children)).replace(/\n/g, " ").replace(/[\\|]/g, "\\$&");

  const table = (n) => {
    const rows = [];
    const walk = (node) => {
      for (const c of node.children) {
        if (c.tag === "tr") {
          rows.push(
            c.children
              .filter((x) => x.tag === "th" || x.tag === "td")
              .map(cell),
          );
        } else if (c.tag && !SKIP.has(c.tag)) walk(c);
      }
    };
    walk(n);
    const width = Math.max(0, ...rows.map((r) => r.length));
    if (!width) return "";
    const pad = (r) => [...r, ...Array(width - r.length).fill("")];
    const line = (r) => `| ${pad(r).join(" | ")} |`;
    const [head, ...body] = rows;
    return [
      line(head),
      `| ${Array(width).fill("---").join(" | ")} |`,
      ...body.map(line),
    ].join("\n");
  };

  const list = (n, depth) => {
    const ordered = n.tag === "ol";
    let i = Number(n.attrs.start) || 1;
    const lines = [];
    for (const li of n.children) {
      if (li.tag !== "li" || hidden(li)) continue;
      const marker = ordered ? `${i++}.` : "-";
      const indent = " ".repeat(marker.length + 1);
      // Tight (no blank line) unless the item holds paragraphs of its own.
      const tight = !li.children.some(
        (c) => c.tag && BLOCK.has(c.tag) && c.tag !== "ul" && c.tag !== "ol",
      );
      const body = blocks(li.children, depth + 1, tight).trim();
      if (!body) continue;
      const [first, ...rest] = body.split("\n");
      lines.push(
        [`${marker} ${first}`, ...rest.map((l) => (l ? indent + l : l))].join(
          "\n",
        ),
      );
    }
    return lines.join("\n");
  };

  const pre = (n) => {
    const code = n.children.find((c) => c.tag === "code");
    const cls = (code?.attrs.class || n.attrs.class || "").match(
      /(?:language|lang)-([\w+#-]+)/,
    );
    const body = textOf(n).replace(/^\n/, "").replace(/\s+$/, "");
    const longest = Math.max(
      0,
      ...(body.match(/`+/g) || []).map((s) => s.length),
    );
    const fence = "`".repeat(Math.max(3, longest + 1));
    return `${fence}${cls ? cls[1] : ""}\n${body}\n${fence}`;
  };

  /** Block-level rendering: returns paragraphs joined by blank lines. */
  function blocks(nodes, depth = 0, tight = false) {
    const out = [];
    let buf = [];
    const flush = () => {
      const t = tidy(inline(buf));
      buf = [];
      if (t) out.push(t);
    };
    for (const n of nodes) {
      if (n.text !== undefined) {
        buf.push(n);
        continue;
      }
      if (SKIP.has(n.tag) || hidden(n)) continue;
      if (!BLOCK.has(n.tag)) {
        buf.push(n);
        continue;
      }
      flush();
      switch (n.tag) {
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
          const t = tidy(inline(n.children)).replace(/\n/g, " ");
          if (t) out.push(`${"#".repeat(Number(n.tag[1]))} ${t}`);
          break;
        }
        case "p": {
          const t = tidy(inline(n.children));
          if (t) out.push(t);
          break;
        }
        case "pre":
          out.push(pre(n));
          break;
        case "ul":
        case "ol": {
          const t = list(n, depth);
          if (t) out.push(t);
          break;
        }
        case "table": {
          const t = table(n);
          if (t) out.push(t);
          break;
        }
        case "aside":
        case "blockquote": {
          const t = blocks(n.children, depth).trim();
          if (t)
            out.push(
              t
                .split("\n")
                .map((l) => (l ? `> ${l}` : ">"))
                .join("\n"),
            );
          break;
        }
        case "hr":
          out.push("---");
          break;
        case "dt":
        case "summary": {
          const t = tidy(inline(n.children));
          if (t) out.push(`**${t}**`);
          break;
        }
        default: {
          const t = blocks(n.children, depth);
          if (t) out.push(t);
        }
      }
    }
    flush();
    return out.join(tight ? "\n" : "\n\n");
  }

  return blocks;
};

/**
 * @param {string} html  Rendered body of a page.
 * @param {{ baseUrl?: string }} opts  Absolute URL of the page, used to turn
 *   root-relative links and images into absolute ones.
 */
const htmlToMarkdown = (html, { baseUrl = "http://localhost/" } = {}) =>
  makeConverter(baseUrl)(parse(String(html ?? "")).children).trim();

/**
 * Output path of a page's twin, relative to the site root with no path
 * prefix: `/a/b/` becomes `/a/b/index.md`, `/` becomes `/index.md`, and a
 * file URL such as `/x.html` becomes `/x.md`.
 */
const twinPath = (url) => {
  if (!url || typeof url !== "string") return null;
  if (url.endsWith("/")) return `${url}index.md`;
  if (/\.html?$/i.test(url)) return url.replace(/\.html?$/i, ".md");
  return null;
};

const oneLine = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ESC[c]);

/**
 * The page's "Known errata" callout, as HTML with the same shape as
 * src/_includes/components/errata-callout.njk. base.njk renders that partial
 * outside `templateContent`, so the twin has to add it itself; without it a
 * correction would reach HTML readers and not Markdown readers.
 */
const errataHtml = (entries, hubUrl) => {
  if (!Array.isArray(entries) || !entries.length) return "";
  const items = entries
    .map(
      (e) =>
        `<li class="errata-callout__entry"><p class="errata-callout__title"><strong>${esc(e.title)}</strong>${e.dateModified ? ` (updated ${esc(e.dateModified)})` : ""}</p><div class="errata-callout__body">${e.body || ""}</div></li>`,
    )
    .join("");
  return `<aside class="errata-callout"><details><summary>Known errata for this page (${entries.length})</summary><ul>${items}</ul><p><a href="${esc(hubUrl)}">See all corrections and caveats</a></p></details></aside>`;
};

/**
 * Full twin document: title, description, a pointer to the canonical HTML
 * page, then the converted body. `host` is `site.host` (it carries the path
 * prefix); `url` is the page URL.
 */
const renderTwin = ({
  title,
  description,
  url,
  bodyHtml,
  site,
  errata = [],
}) => {
  const base = (site?.host || "").replace(/\/$/, "");
  const canonical = `${base}${url}`;
  let body = htmlToMarkdown(bodyHtml, { baseUrl: `${canonical}` });
  const heading = oneLine(title);
  const head = [];
  // The page's own H1 leads when it is in the first few blocks; any short
  // lines before it (a hero eyebrow such as "Advanced") are dropped. The
  // front-matter title is kept as a line of its own when it differs.
  const blocks = body.split("\n\n");
  const h1 = blocks.slice(0, 4).findIndex((b) => /^# [^\n]+$/.test(b));
  if (h1 !== -1 && blocks.slice(0, h1).every((b) => b.length <= 60)) {
    head.push(blocks[h1]);
    body = blocks.slice(h1 + 1).join("\n\n");
    if (heading && blocks[h1] !== `# ${heading}`)
      head.push(`Page title: ${heading}`);
  } else if (heading) head.push(`# ${heading}`);
  const desc = oneLine(description);
  if (desc) head.push(`> ${desc}`);
  head.push(`Canonical page: <${canonical}>`);
  const license =
    site?.title && site?.author
      ? `${site.title} by ${site.author} (${site.brand || site.author}), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Attribution is required.`
      : "";
  const callout = htmlToMarkdown(errataHtml(errata, `${base}/errata/`), {
    baseUrl: canonical,
  });
  body = [...head, callout, body].filter(Boolean).join("\n\n");
  return `${body}\n${license ? `\n---\n\n${license}\n` : ""}`;
};

module.exports = { htmlToMarkdown, twinPath, renderTwin };
