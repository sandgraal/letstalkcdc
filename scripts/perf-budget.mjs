#!/usr/bin/env node
import { statSync, readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const root = resolve(".");
const outputDirName = process.env.BUILD_OUTPUT_DIR ?? "_site";
const outputDir = join(root, outputDirName);

const bytes = (kb) => kb * 1024;

const budgets = [
  {
    label: "Main CSS bundle",
    path: ["assets", "css", "styles.css"],
    max: bytes(200),
  },
  { label: "App JS", path: ["assets", "js", "app.js"], max: bytes(80) },
];

const pageBudgets = [
  { label: "Home", path: ["index.html"], max: bytes(250) },
  {
    label: "Multi-Tenancy",
    path: ["multi-tenancy", "index.html"],
    max: bytes(275),
  },
  { label: "Intro", path: ["intro", "index.html"], max: bytes(300) },
  {
    label: "Exactly-Once",
    path: ["exactly-once", "index.html"],
    max: bytes(280),
  },
];

const jsDir = join(outputDir, "assets", "js", "pages");
const pageScripts = readdirSync(jsDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => ({
    label: `Page script: ${name}`,
    path: ["assets", "js", "pages", name],
    max: bytes(120),
  }));

const check = ({ label, path, max }) => {
  const filePath = join(outputDir, ...path);
  const size = statSync(filePath).size;
  return { label, filePath, size, max, ok: size <= max };
};

// Analytics (GoatCounter, P15-10) is off unless GOATCOUNTER_CODE was set for
// the build. When it is on, the only thing added to a page is one tiny inline
// loader that injects an async third-party script, so budget its size and
// insist there is exactly one. (Lighthouse cannot measure the third-party
// file offline; keeping the loader async and tiny is what protects /intro/.)
const analyticsChecks = () => {
  const introPath = join(outputDir, "intro", "index.html");
  if (!existsSync(introPath)) return [];
  const html = readFileSync(introPath, "utf8");
  const loaders =
    html.match(
      /<script>(?:(?!<\/script>)[\s\S])*gc\.zgo\.at(?:(?!<\/script>)[\s\S])*<\/script>/g,
    ) ?? [];
  if (loaders.length === 0) return [];
  return [
    {
      label: "Analytics loader (inline, Intro)",
      filePath: introPath,
      size: Buffer.byteLength(loaders[0]),
      max: 1024,
      ok: loaders.length === 1 && Buffer.byteLength(loaders[0]) <= 1024,
    },
  ];
};

const results = [
  ...budgets.map(check),
  ...pageBudgets.map(check),
  ...pageScripts.map(check),
  ...analyticsChecks(),
];

const failures = results.filter((item) => !item.ok);

results.forEach(({ label, size, max, ok }) => {
  const status = ok ? "PASS" : "FAIL";
  const delta = size - max;
  const human = `${(size / 1024).toFixed(1)}KB / ${(max / 1024).toFixed(1)}KB`;
  console.log(
    `${status.padEnd(4)} ${label}: ${human}${!ok ? ` (+${(delta / 1024).toFixed(1)}KB)` : ""}`,
  );
});

if (failures.length) {
  console.error(
    "\nPerformance budget check failed. Consider code splitting or asset optimisation for the files above.",
  );
  process.exit(1);
}
