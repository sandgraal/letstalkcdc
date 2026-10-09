/**
 * Guard for P15-36: src/_data/toolVersions.mjs keeps two kinds of data apart.
 * `tools` is the latest stable release (with a date), `tested` is what the
 * repo's lab configs pin. A page may only say a lab uses a version that a
 * compose file really names, so `tested` is checked against those files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import toolVersions from "../../src/_data/toolVersions.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const { tools, tested, lastUpdated } = toolVersions;

/** All `image: repo:tag` lines in a file, as { repo, tag } pairs. */
function images(rel) {
  return [...read(rel).matchAll(/^\s*image:\s*([^\s:]+):([^\s]+)\s*$/gm)].map(
    (m) => ({ repo: m[1], tag: m[2] }),
  );
}
const tagsOf = (rel, repo) =>
  images(rel)
    .filter((i) => i.repo === repo)
    .map((i) => i.tag);

describe("toolVersions: latest releases", () => {
  it("has a freshness date that is a real date, not in the future", () => {
    expect(lastUpdated).toMatch(ISO_DATE);
    const t = Date.parse(`${lastUpdated}T00:00:00Z`);
    expect(Number.isNaN(t)).toBe(false);
    expect(t).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000);
  });

  it("gives every tool a status, a release-notes URL and a version", () => {
    for (const [name, tool] of Object.entries(tools)) {
      expect(["stable", "saas", "deprecated"], name).toContain(tool.status);
      expect(tool.releaseNotesUrl, name).toMatch(/^https:\/\//);
      expect(tool.version, name).toBeTruthy();
    }
  });

  it("uses well-formed version strings for versioned tools", () => {
    // Dotted numbers with an optional .Final suffix (Debezium), or a
    // vendor marketing name such as GoldenGate's "26ai".
    const wellFormed = /^(\d+(\.\d+){1,3}(\.Final)?|\d+ai)$/;
    for (const [name, tool] of Object.entries(tools)) {
      if (tool.status === "saas") continue;
      expect(tool.version, name).toMatch(wellFormed);
    }
  });

  it("dates every stable release, and marks an unknown date as unverified", () => {
    for (const [name, tool] of Object.entries(tools)) {
      if (tool.status === "saas") {
        expect(tool.version, name).toBe("N/A");
        continue;
      }
      if (tool.releaseDate === "unverified") continue;
      expect(tool.releaseDate, name).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(tool.releaseDate)), name).toBe(false);
      // A release cannot post-date the day the data was checked.
      expect(tool.releaseDate <= lastUpdated, name).toBe(true);
    }
  });

  it("keeps Kafka and Kafka Connect on the same release", () => {
    expect(tools.kafkaConnect.version).toBe(tools.kafka.version);
  });
});

describe("toolVersions: what the labs pin", () => {
  const LAB_PAGE = "src/lab-kafka-debezium/index.njk";
  const ROOT_COMPOSE = "compose.yaml";
  const OBSERVABILITY = "src/resources/docker-compose-observability.yml";

  it("matches the Confluent Platform tag in every lab compose file", () => {
    for (const file of [LAB_PAGE, ROOT_COMPOSE, OBSERVABILITY]) {
      const tags = tagsOf(file, "confluentinc/cp-kafka");
      expect(tags.length, file).toBeGreaterThan(0);
      for (const tag of tags) expect(tag, file).toBe(tested.confluentPlatform);
    }
  });

  it("gives an Apache Kafka version consistent with that Confluent Platform", () => {
    // CP 7.7.x ships Kafka 3.7.x (docs.confluent.io, versions-interoperability).
    const [cpMajor, cpMinor] = tested.confluentPlatform.split(".");
    expect(cpMajor).toBe("7");
    expect(tested.apacheKafka).toBe(`3.${cpMinor}`);
  });

  it("matches the debezium/connect tag in every lab compose file", () => {
    for (const file of [LAB_PAGE, ROOT_COMPOSE, OBSERVABILITY]) {
      const tags = tagsOf(file, "debezium/connect");
      expect(tags.length, file).toBeGreaterThan(0);
      for (const tag of tags) expect(tag, file).toBe(tested.debeziumConnect);
    }
  });

  it("matches the debezium/postgres major version on the lab page", () => {
    const tags = tagsOf(LAB_PAGE, "debezium/postgres");
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toBe(tested.postgresMajor);
  });

  it("builds the lab page note from the pins, worded as pins not a test result", () => {
    // No CI job starts the labs, so the note must not say "Tested with".
    const note = read(LAB_PAGE).match(/<div class="note">([\s\S]*?)<\/div>/)[1];
    expect(note).toContain("{{ toolVersions.tested.confluentPlatform }}");
    expect(note).toContain("{{ toolVersions.tested.debeziumConnect }}");
    expect(note).not.toMatch(/Tested with/i);
  });
});
