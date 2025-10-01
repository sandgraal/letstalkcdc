module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({
    "src/assets": "assets"
  });


  eleventyConfig.addWatchTarget("src/assets/css");
  eleventyConfig.addWatchTarget("src/assets/js");

  eleventyConfig.addNunjucksFilter('startsWith', (value, prefix) => {
    if (typeof value !== 'string') return false;
    return value.startsWith(prefix);
  });

  return {
    dir: {
      input: "src",
      output: "dist",
      includes: "_includes",
      layouts: "_includes/layouts"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html", "11ty.js"]
  };
};
