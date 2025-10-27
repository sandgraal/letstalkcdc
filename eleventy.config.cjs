const { getPathPrefix } = require("./lib/path-prefix.cjs");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({
    "src/static": "/",
    "src/assets": "assets",
    "src/resources": "downloads",
    "compose.yaml": "downloads/compose.yaml",
    "src/css": "css",
    "src/scripts": "scripts",
    scripts: "scripts",
  });

  eleventyConfig.addWatchTarget("src/assets/css");
  eleventyConfig.addWatchTarget("src/assets/js");

  eleventyConfig.addNunjucksFilter("startsWith", (value, prefix) => {
    if (typeof value !== "string") return false;
    return value.startsWith(prefix);
  });

  eleventyConfig.addNunjucksFilter("absoluteUrl", (value, site = {}) => {
    if (!site || !site.host) {
      return value;
    }

    if (typeof value !== "string" || value.length === 0) {
      return site.host;
    }

    const trimmedValue = value.trim();
    if (/^https?:\/\//i.test(trimmedValue)) {
      return trimmedValue;
    }

    const host = site.host.replace(/\/$/, "");
    let path = trimmedValue;

    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    const prefix = site.pathPrefix;
    if (typeof prefix === "string" && prefix !== "/" && prefix.length > 0) {
      const prefixNoTrailingSlash = prefix.replace(/\/$/, "");
      const hostIncludesPrefix = host.endsWith(prefixNoTrailingSlash);

      if (hostIncludesPrefix && path.startsWith(prefix)) {
        path = path.slice(prefix.length - 1);
      }
    }

    return `${host}${path}`;
  });

  const pathPrefix = getPathPrefix();

  return {
    pathPrefix,
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_includes/layouts",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html", "11ty.js"],
  };
};
