/**
 * sitemap.xml generator.
 *
 * `<lastmod>` is the page's own `dateModified` front matter, falling back to
 * `datePublished`, and is omitted when neither is a valid date (P16-5). It
 * is deliberately NOT the build date or the file's date: a lastmod that is
 * identical on every URL tells a crawler nothing.
 *
 * A page leaves the sitemap by setting `eleventyExcludeFromSitemap: true`
 * (use this together with a `noindex` robots meta) or by carrying a
 * `draft` / `noindex` tag. Redirect stubs and the 404 page are always
 * excluded.
 */
const pad = (n) => String(n).padStart(2, "0");

/**
 * Normalise a front-matter date to YYYY-MM-DD, or null when it is missing or
 * not a real calendar date. Accepts a Date (what YAML gives for an unquoted
 * `2026-08-25`) or a string beginning YYYY-MM-DD.
 */
const toLastmod = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const check = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
};

const xmlEscape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = class {
  data() {
    return {
      permalink: "/sitemap.xml",
      eleventyExcludeFromCollections: true,
      exclusionTags: ["draft", "noindex"],
    };
  }

  render({ collections, site, exclusionTags }) {
    const base = (site?.host || "").replace(/\/$/, "");

    const candidates = collections.all.filter((item) => {
      if (!item.url) return false;
      if (item.inputPath.includes("/_redirects/")) return false;
      if (item.fileSlug === "404") return false;
      if (item.data?.eleventyExcludeFromSitemap) return false;
      if (
        item.data?.tags &&
        exclusionTags.some((tag) => item.data.tags.includes(tag))
      )
        return false;
      return true;
    });

    const unique = Array.from(
      new Map(candidates.map((item) => [item.url, item])).values(),
    );

    const urls = unique
      .map((item) => {
        const loc = xmlEscape(`${base}${item.url}`);
        const lastmod =
          toLastmod(item.data?.dateModified) ??
          toLastmod(item.data?.datePublished);
        const lastmodXml = lastmod
          ? `\n      <lastmod>${lastmod}</lastmod>`
          : "";
        return `    <url>\n      <loc>${loc}</loc>${lastmodXml}\n    </url>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }
};
