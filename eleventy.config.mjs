import fs from "fs";
import path from "path";
import { getPathPrefix } from "./lib/path-prefix.mjs";

// ---------------------------------------------------------------------------
// Vite manifest helpers — resolve hashed asset paths in production builds.
// In development (no manifest), fall back to the original source paths.
// ---------------------------------------------------------------------------

const VITE_MANIFEST_PATH = path.resolve("dist", ".vite", "manifest.json");

let _viteManifest = null;
let _viteManifestChecked = false;

const loadViteManifest = () => {
  if (_viteManifestChecked) return _viteManifest;
  _viteManifestChecked = true;
  try {
    if (fs.existsSync(VITE_MANIFEST_PATH)) {
      _viteManifest = JSON.parse(fs.readFileSync(VITE_MANIFEST_PATH, "utf-8"));
    }
  } catch {
    _viteManifest = null;
  }
  return _viteManifest;
};

/**
 * Resolve a source entry to its hashed output path via the Vite manifest.
 * @param {string} srcPath  Source path relative to project root,
 *                          e.g. "src/assets/js/app.js"
 * @returns {string}  Public URL path, e.g. "/assets/js/app.cGYExZ3c.js"
 */
const resolveViteAsset = (srcPath) => {
  const manifest = loadViteManifest();
  if (manifest && manifest[srcPath]) {
    return "/assets/" + manifest[srcPath].file;
  }
  // Fallback: strip "src/" prefix to derive the unbundled public path.
  const fallback = srcPath.startsWith("src/") ? srcPath.slice(4) : srcPath;
  return "/" + fallback;
};

/**
 * Collect all chunk imports (including transitive) for preload hints.
 * @param {string} srcPath  Source path matching a manifest key.
 * @returns {string[]}  Array of public URL paths for chunk files.
 */
const collectViteChunks = (srcPath) => {
  const manifest = loadViteManifest();
  if (!manifest || !manifest[srcPath]) return [];
  const seen = new Set();
  const chunks = [];
  const walk = (key) => {
    const entry = manifest[key];
    if (!entry || !entry.imports) return;
    for (const imp of entry.imports) {
      if (seen.has(imp)) continue;
      seen.add(imp);
      if (manifest[imp]) {
        chunks.push("/assets/" + manifest[imp].file);
        walk(imp);
      }
    }
  };
  walk(srcPath);
  return chunks;
};

const normalizeToArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
};

const pathPrefix = getPathPrefix();

const escapeAttributeValue = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function parseAssistantYaml(content) {
  const lines = content.split(/\r?\n/);
  const intents = [];
  let current = null;
  let collectingAnswer = false;
  let answerLines = [];
  let collectingLinks = false;
  let currentLink = null;

  const finalizeAnswer = () => {
    if (!current) return;
    current.answer = answerLines.join(" ").replace(/\s+/g, " ").trim();
    answerLines = [];
  };

  const pushLink = () => {
    if (currentLink && current && current.links) {
      current.links.push(currentLink);
    }
    currentLink = null;
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
        pushLink();
        currentLink = { label: trimmed.slice("- label:".length).trim() };
        continue;
      }
      if (currentLink) {
        if (trimmed.startsWith("url:")) {
          currentLink.url = trimmed.slice("url:".length).trim();
          continue;
        }
        if (trimmed.startsWith("anchor:")) {
          currentLink.anchor = trimmed
            .slice("anchor:".length)
            .trim()
            .replace(/^["']|["']$/g, "");
          continue;
        }
        if (trimmed.startsWith("preview:")) {
          currentLink.preview = trimmed.slice("preview:".length).trim();
          continue;
        }
      }
      pushLink();
      collectingLinks = false;
      i--;
      continue;
    }

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("- id:")) {
      if (collectingLinks) {
        pushLink();
        collectingLinks = false;
      }
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
      if (listStr && listStr.startsWith("[")) {
        current.triggers = JSON.parse(
          listStr.replace(/'/g, '"').replace(/,\s*]/g, "]"),
        );
      } else {
        // Multi-line array: collect subsequent lines until we find the closing ]
        let arrayStr = "";
        while (++i < lines.length) {
          arrayStr += lines[i].trim() + " ";
          if (lines[i].trim().endsWith("]")) break;
        }
        current.triggers = JSON.parse(
          arrayStr.trim().replace(/'/g, '"').replace(/,\s*]/g, "]"),
        );
      }
      continue;
    }

    if (trimmed.startsWith("modules:")) {
      const listStr = trimmed.slice("modules:".length).trim();
      if (listStr && listStr.startsWith("[")) {
        current.modules = JSON.parse(
          listStr.replace(/'/g, '"').replace(/,\s*]/g, "]"),
        );
      } else {
        // Multi-line array: collect subsequent lines until we find the closing ]
        let arrayStr = "";
        while (++i < lines.length) {
          arrayStr += lines[i].trim() + " ";
          if (lines[i].trim().endsWith("]")) break;
        }
        current.modules = JSON.parse(
          arrayStr.trim().replace(/'/g, '"').replace(/,\s*]/g, "]"),
        );
      }
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

  if (collectingLinks) {
    pushLink();
  }

  if (current) {
    if (current.links && current.links.length === 0) {
      delete current.links;
    }
    intents.push(current);
  }

  return { intents };
}

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({
    "src/static": "/",
    "src/assets/css/styles.min.css": "assets/css/styles.css",
    "src/assets/css/auth.css": "assets/css/auth.css",
    "src/assets/css/pages": "assets/css/pages",
    // In production the Vite-bundled JS lives in dist/; copy it into _site.
    // The source JS tree is still copied for page-specific scripts (pages/*.js,
    // lib/*.js) and as a dev-mode fallback when no Vite manifest exists.
    "src/assets/js": "assets/js",
    dist: "assets",
    "compose.yaml": "downloads/compose.yaml",
    "src/css": "css",
    "src/js": "js",
    "src/data": "data",
    "src/scripts": "scripts",
    scripts: "scripts",
  });

  // ---- Vite asset filters --------------------------------------------------

  /**
   * {{ 'src/assets/js/app.js' | viteAsset | url }}
   * Resolves a source path to its hashed filename (production) or the
   * unbundled source path (development).
   */
  eleventyConfig.addNunjucksFilter("viteAsset", (srcPath) =>
    resolveViteAsset(srcPath),
  );

  /**
   * Return modulepreload link tags for all shared chunks of an entry.
   * Usage:  {{ 'src/assets/js/app.js' | vitePreloads | safe }}
   */
  eleventyConfig.addNunjucksFilter("vitePreloads", function (srcPath) {
    // Accept a single path or comma-separated list for deduplication.
    const paths = srcPath.includes(",")
      ? srcPath.split(",").map((s) => s.trim())
      : [srcPath];
    const seen = new Set();
    const allChunks = [];
    for (const p of paths) {
      for (const c of collectViteChunks(p)) {
        if (!seen.has(c)) {
          seen.add(c);
          allChunks.push(c);
        }
      }
    }
    if (!allChunks.length) return "";
    const urlFilter = this.env.getFilter("url");
    return allChunks
      .map(
        (c) => `<link rel="modulepreload" href="${urlFilter.call(this, c)}">`,
      )
      .join("\n    ");
  });

  // Ensure download assets (YAML manifests, scripts, dashboards, etc.) are copied verbatim.
  eleventyConfig.addPassthroughCopy({ "src/resources": "downloads" });

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
        JSON.stringify(data, null, 2),
      );
    } catch (err) {
      console.warn("Failed to emit assistant.json:", err);
    }
  });

  eleventyConfig.addWatchTarget("src/assets/css");
  eleventyConfig.addWatchTarget("src/assets/js");

  eleventyConfig.addShortcode("img", (src, alt = "", attrs = {}) => {
    const extraAttrs = attrs && typeof attrs === "object" ? attrs : {};

    const attributes = {
      loading: extraAttrs.loading ?? "lazy",
      decoding: extraAttrs.decoding ?? "async",
      src,
      alt,
      ...extraAttrs,
    };

    // Preserve explicitly provided empty alt text
    if (Object.prototype.hasOwnProperty.call(extraAttrs, "alt")) {
      attributes.alt = extraAttrs.alt;
    }

    const renderedAttributes = Object.entries(attributes)
      .filter(
        ([, value]) => value !== undefined && value !== null && value !== false,
      )
      .map(([key, value]) => {
        if (value === true) {
          return key;
        }
        return `${key}="${escapeAttributeValue(value)}"`;
      })
      .join(" ");

    return `<img ${renderedAttributes}>`;
  });

  eleventyConfig.addNunjucksFilter("startsWith", (value, prefix) => {
    if (typeof value !== "string") return false;
    return value.startsWith(prefix);
  });

  const publishedUrlCandidates = (href) => {
    if (!href) {
      return [];
    }

    const trimmed = href.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return [];
    }

    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith("http://") ||
      lower.startsWith("https://") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      lower.startsWith("javascript:")
    ) {
      return [];
    }

    const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const candidates = [normalized];

    if (pathPrefix) {
      const prefixed = `${pathPrefix.replace(/\/$/, "")}${normalized}`;
      candidates.push(prefixed);
    }

    return candidates;
  };

  eleventyConfig.addGlobalData("eleventyComputed", {
    permalink: (data) => {
      if (data.draft) {
        return false;
      }

      return data.permalink;
    },
    eleventyExcludeFromCollections: (data) => {
      if (data.draft) {
        return true;
      }

      if (typeof data.eleventyExcludeFromCollections !== "undefined") {
        return data.eleventyExcludeFromCollections;
      }

      return false;
    },
  });

  eleventyConfig.addNunjucksFilter("pageExists", (collection, href) => {
    if (!collection || !href) {
      return false;
    }

    const candidates = publishedUrlCandidates(href);

    if (!candidates.length) {
      // Assume external / hash links are valid; only guard internal paths.
      return true;
    }

    const items = normalizeToArray(collection);
    return items.some((item) => candidates.includes(item.url));
  });

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
}
