/**
 * Guard: wherever the site says what a delete's (or any change's) before image
 * holds, it carries the source qualifier (P17-12, technical-editor review).
 *
 * The qualifier wording is the one on /deletes-stay-deleted/: PostgreSQL with
 * the default replica identity carries only the key columns unless the table
 * has REPLICA IDENTITY FULL; MySQL needs binlog_row_image=FULL for the full
 * row. The pages here previously stated the full row without a condition.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseAssistantYaml } from "../../lib/assistant-yaml.mjs";
import errata from "../../src/_data/errata.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const flat = (s) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const quiz = require(path.join(ROOT, "src/event-envelope/index.11tydata.cjs"));
const quizText = JSON.stringify(quiz);
const at = quizText.indexOf("The 'before' and 'after' fields");
const beforeQuestion =
  at < 0 ? undefined : quizText.slice(at, quizText.indexOf('"', at));
const assistant = parseAssistantYaml(read("src/data/assistant.yml"));
const envelopeAnswer = assistant.intents.find(
  (i) => i.id === "event_envelope",
).answer;

const hasQualifier = (s) => {
  expect(s).toMatch(/REPLICA IDENTITY FULL/);
  expect(s).toMatch(/binlog_row_image=FULL/);
};

describe("before image qualifier, everywhere it is stated", () => {
  it("event-envelope quiz explanation", () => {
    expect(beforeQuestion).toBeTruthy();
    hasQualifier(beforeQuestion);
    expect(beforeQuestion).toMatch(/only the key columns/);
    expect(beforeQuestion).not.toMatch(/complete row state/);
  });

  it("assistant answer for the event envelope", () => {
    hasQualifier(flat(envelopeAnswer));
    expect(flat(envelopeAnswer)).toMatch(/only the key columns/);
  });

  it("use-cases audit-log paragraph", () => {
    const t = flat(read("src/use-cases/index.njk"));
    expect(t).toMatch(
      /"before" and "after" state of the data \(how much of the row "before" holds depends on the source/,
    );
    hasQualifier(t);
  });

  it("security page no longer says the log holds the before image indefinitely", () => {
    const t = flat(read("src/security/index.njk"));
    expect(t).not.toMatch(/holds the before-image indefinitely/);
    expect(t).toMatch(
      /the log holds whatever the before image contains, which is the full row only with REPLICA IDENTITY FULL \(PostgreSQL\) or binlog_row_image=FULL \(MySQL\)/,
    );
  });

  it("errata entry lists all four pages and the qualifier, link-free", () => {
    const e = errata.find(
      (x) => x.id === "delete-event-before-image-2026-10-11",
    );
    expect(e.urls).toEqual([
      "/deletes-stay-deleted/",
      "/event-envelope/",
      "/use-cases/",
      "/security/",
    ]);
    hasQualifier(flat(e.body));
    expect(e.body).not.toMatch(/href=/);
  });

  it.each([
    ["src/event-envelope/index.11tydata.cjs"],
    ["src/use-cases/index.11tydata.cjs"],
    ["src/security/index.11tydata.cjs"],
  ])("%s is re-dated to the day of the correction", (rel) => {
    expect(require(path.join(ROOT, rel)).dateModified).toBe("2026-10-11");
  });
});
