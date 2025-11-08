const importPlugin = require("postcss-import");
const autoprefixer = require("autoprefixer");

const plugins = [
  importPlugin({
    path: ["src/assets/css"],
  }),
  autoprefixer(),
];

if (process.env.NODE_ENV === "production") {
  plugins.push(
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
    })
  );
}

module.exports = {
  plugins,
};
