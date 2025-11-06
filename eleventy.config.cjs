const fs = require("fs");
const path = require("path");
const { getPathPrefix } = require("./lib/path-prefix.cjs");

function parseAssistantYaml(content) {
  const lines = content.split(/\r?\n/);
  const intents = [];
  let current = null;
  let collectingAnswer = false;
  let answerLines = [];
  let collectingLinks = false;

  const finalizeAnswer = () => {
    if (!current) return;
    current.answer = answerLines.join(" ").replace(/\s+/g, " ").trim();
    answerLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (collectingAnswer) {
      if (trimmed === "links:") {
        finalizeAnswer();
        collectingAnswer = false;
        collectingLinks = true;
        current.links = [];
        continue;
      }
      if (/^\s{4,}/.test(line) && trimmed !== "") {
        answerLines.push(trimmed);
        continue;
      }
      if (trimmed === "") {
        answerLines.push("");
        continue;
      }
      finalizeAnswer();
      collectingAnswer = false;
      i--;
      continue;
    }

    if (collectingLinks) {
      if (!trimmed) {
        continue;
      }
      if (trimmed.startsWith("- label:")) {
        const label = trimmed.slice("- label:".length).trim();
        const nextLine = lines[++i] || "";
        const url = nextLine.trim().replace(/^url:\s*/, "");
        current.links.push({ label, url });
        continue;
      }
      collectingLinks = false;
      i--;
      continue;
    }

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("- id:")) {
      if (current) {
        if (current.links && current.links.length === 0) {
          delete current.links;
        }
        intents.push(current);
      }
      current = { id: trimmed.slice("- id:".length).trim() };
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith("triggers:")) {
      const listStr = trimmed.slice("triggers:".length).trim();
      current.triggers = JSON.parse(listStr.replace(/'/g, '"'));
      continue;
    }

    if (trimmed === "answer: >") {
      collectingAnswer = true;
      answerLines = [];
      continue;
    }

    if (trimmed === "links:") {
      collectingLinks = true;
      current.links = [];
      continue;
    }
  }

  if (collectingAnswer && current) {
    finalizeAnswer();
  }

  if (current) {
    if (current.links && current.links.length === 0) {
      delete current.links;
    }
    intents.push(current);
  }

  return { intents };
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({
    "src/static": "/",
    "src/assets/css/styles.min.css": "assets/css/styles.min.css",
    "src/assets/js": "assets/js",
    "src/resources": "downloads",
    "compose.yaml": "downloads/compose.yaml",
    "src/css": "css",
    "src/js": "js",
    "src/data": "data",
    "src/scripts": "scripts",
    scripts: "scripts",
  });

  eleventyConfig.on("eleventy.after", () => {
    const inputPath = path.join("src", "data", "assistant.yml");
    if (!fs.existsSync(inputPath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(inputPath, "utf8");
      const data = parseAssistantYaml(raw);
      const outputDir = path.join("_site", "data");
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(
        path.join(outputDir, "assistant.json"),
        JSON.stringify(data, null, 2)
      );
    } catch (err) {
      console.warn("Failed to emit assistant.json:", err);
    }
  });

  eleventyConfig.addWatchTarget("src/assets/css");
  eleventyConfig.addWatchTarget("src/assets/js");

  eleventyConfig.addNunjucksFilter("startsWith", (value, prefix) => {
    if (typeof value !== "string") return false;
    return value.startsWith(prefix);
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
