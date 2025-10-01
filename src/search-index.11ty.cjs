const stripTags = (html = '') =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const MAX_CHARS = 1200;

module.exports = class {
  data() {
    return {
      permalink: 'search-index.json',
      eleventyExcludeFromCollections: true
    };
  }

  render({ collections }) {
    const entries = (collections.all || [])
      .filter((item) => item.url && !item.inputPath.includes('/_redirects/'))
      .map((item) => {
        const title = item.data.title || item.data.page?.fileSlug || item.url;
        const description = item.data.description || '';
        const body = stripTags(item.templateContent || item.content || '');
        const combined = [description, body].filter(Boolean).join(' ');
        const text = combined.length > MAX_CHARS
          ? combined.slice(0, MAX_CHARS) + '…'
          : combined;
        return {
          path: item.url,
          title: title.toString(),
          text
        };
      })
      .filter((entry) => entry.text.length > 0);

    return JSON.stringify(entries, null, 2);
  }
};
