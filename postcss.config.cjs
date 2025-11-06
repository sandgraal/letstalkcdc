module.exports = {
  plugins: [
    require("postcss-import")({
      path: ["src/assets/css"],
    }),
    require("autoprefixer")(),
    require("cssnano")({
      preset: [
        "default",
        {
          discardComments: {
            removeAll: true,
          },
          normalizeWhitespace: true,
          colormin: true,
          minifyFontValues: true,
          minifySelectors: true,
        },
      ],
    }),
  ],
};
