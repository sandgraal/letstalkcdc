// Vendored third-party script metadata (P17-23). Only a default export here:
// Eleventy would nest the data under "default" if this file had named exports.
import { getMermaidAsset } from "../../lib/vendor-assets.mjs";

const mermaid = getMermaidAsset();

export default {
  mermaid: { path: mermaid.publicPath, integrity: mermaid.integrity },
};
