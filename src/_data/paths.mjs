// Guided paths (P17-31): three ordered tracks of existing lessons. A step's
// `href` is a series.mjs `href` (no leading slash); `reason` is one line on
// why it sits there. The full routes are P17-32 (newcomer), P17-33 (operator)
// and P17-34 (architect); until then only the series' own start-here lesson is
// seeded. Validated against series.mjs at build time (lib/guided-paths.mjs).
import series from "./series.mjs";
import { resolvePaths } from "../../lib/guided-paths.mjs";

// No named exports: Eleventy only uses the default export as data when it is
// the module's sole export.
const tracks = [
  {
    key: "newcomer",
    title: "Newcomer",
    audience: "New to change data capture.",
    summary: "The ideas first, before any tooling.",
    steps: [
      {
        href: "intro/",
        reason: "What CDC is, how the methods differ and where the tools fit.",
      },
    ],
  },
  {
    key: "operator",
    title: "Operator",
    audience: "Running connectors in production.",
    summary: "Slots, lag, snapshots and recovery.",
    steps: [],
  },
  {
    key: "architect",
    title: "Architect",
    audience: "Choosing tools and sink designs.",
    summary: "Delivery guarantees, sink design and contracts.",
    steps: [],
  },
];

export default resolvePaths(tracks, series);
