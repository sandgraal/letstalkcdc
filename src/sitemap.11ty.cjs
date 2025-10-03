const formatDate = (date) => {
  try {
    return new Date(date).toISOString().split('T')[0];
  } catch (_) {
    return new Date().toISOString().split('T')[0];
  }
};

module.exports = class {
  data() {
    return {
      permalink: '/sitemap.xml',
      eleventyExcludeFromCollections: true,
      exclusionTags: ['draft', 'noindex']
    };
  }

  render({ collections, site, exclusionTags }) {
    const base = (site?.host || '').replace(/\/$/, '');

    const candidates = collections.all.filter((item) => {
      if (!item.url) return false;
      if (item.inputPath.includes('/_redirects/')) return false;
      if (item.fileSlug === '404') return false;
      if (item.data?.eleventyExcludeFromSitemap) return false;
      if (item.data?.tags && exclusionTags.some((tag) => item.data.tags.includes(tag))) return false;
      return true;
    });

    const unique = Array.from(new Map(candidates.map((item) => [item.url, item])).values());

    const urls = unique
      .map((item) => {
        const loc = `${base}${item.url}`;
        const lastmod = formatDate(item.date);
        return `    <url>\n      <loc>${loc}</loc>\n      <lastmod>${lastmod}</lastmod>\n    </url>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }
};
