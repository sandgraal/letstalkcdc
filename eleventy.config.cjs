const normalizePathPrefix = (prefix) => {
  if (!prefix || prefix === "/") {
    return "/";
  }

  const trimmed = prefix.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
};

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({
    "src/static": "/",
    "src/assets": "assets",
    "src/resources": "downloads",
    "compose.yaml": "downloads/compose.yaml",
    scripts: "scripts",
  });

  eleventyConfig.addWatchTarget("src/assets/css");
  eleventyConfig.addWatchTarget("src/assets/js");

  eleventyConfig.addNunjucksFilter("startsWith", (value, prefix) => {
    if (typeof value !== "string") return false;
    return value.startsWith(prefix);
  });

  const pathPrefix = normalizePathPrefix(process.env.ELEVENTY_PATH_PREFIX);

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
