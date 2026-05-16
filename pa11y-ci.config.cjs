const path = require("path");

const outputDirName = process.env.BUILD_OUTPUT_DIR || "_site";

const toFileUrl = (...segments) => {
  const filePath = path.resolve(process.cwd(), outputDirName, ...segments);
  return `file://${filePath}`;
};

module.exports = {
  defaults: {
    standard: "WCAG2AA",
    // PR #275 deferred all stylesheets via rel=preload+onload.
    // 1000ms wasn't enough on slow CI VMs — pa11y was inspecting
    // before the onload-swap fired, catching browser-default blue
    // link colors on the inline dark bg (2.05:1 contrast).
    wait: 2000,
    timeout: 30000,
    chromeLaunchConfig: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  urls: [
    toFileUrl("index.html"),
    toFileUrl("overview", "index.html"),
    toFileUrl("intro", "index.html"),
    toFileUrl("multi-tenancy", "index.html"),
    toFileUrl("use-cases", "index.html"),
    toFileUrl("quickstarts", "index.html"),
    toFileUrl("partitioning", "index.html"),
    toFileUrl("exactly-once", "index.html"),
  ],
};
