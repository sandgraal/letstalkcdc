const stripTags = (html = "") =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Extract heading text from HTML content (h1-h4).
 * Returns a deduplicated, space-joined string.
 */
const extractHeadings = (html = "") => {
  const matches = html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi) || [];
  const headings = matches.map((m) => stripTags(m)).filter(Boolean);
  return [...new Set(headings)].join(" ");
};

const MAX_CHARS = 1200;

module.exports = class {
  data() {
    return {
      permalink: "search-index.json",
      eleventyExcludeFromCollections: true,
    };
  }

  render({ collections }) {
    const entries = (collections.all || [])
      .filter((item) => item.url && !item.inputPath.includes("/_redirects/"))
      .map((item) => {
        const title = item.data.title || item.data.page?.fileSlug || item.url;
        const description = item.data.description || "";
        const rawHtml = item.templateContent || item.content || "";
        const headings = extractHeadings(rawHtml);
        const body = stripTags(rawHtml);
        const combined = [description, body].filter(Boolean).join(" ");
        const text =
          combined.length > MAX_CHARS
            ? combined.slice(0, MAX_CHARS) + "…"
            : combined;
        const tags = Array.isArray(item.data.tags)
          ? item.data.tags.filter((t) => t !== "all" && t !== "post")
          : [];
        return {
          path: item.url,
          title: title.toString(),
          description,
          tags,
          headings,
          text,
        };
      })
      .filter((entry) => entry.text.length > 0);

    return JSON.stringify(entries, null, 2);
  }
};
