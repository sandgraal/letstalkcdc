import importPlugin from "postcss-import";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";

const plugins = [
  importPlugin({
    path: ["src/assets/css"],
  }),
  autoprefixer(),
];

if (process.env.NODE_ENV === "production") {
  plugins.push(
    cssnano({
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
  );
}

export default {
  plugins,
};
