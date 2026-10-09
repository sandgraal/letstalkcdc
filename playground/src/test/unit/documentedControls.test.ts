import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharedScenarios from "../../features/shared-scenarios";
import { getScenarioGuidance } from "../../features/scenarioGuidance";

const root = resolve(__dirname, "../../..");

// Controls that earlier copy promised but the Event Log toolbar never had.
const PHANTOM_CONTROLS = /dedupe on pk|drop[- ]snapshot|dedupe toggles|dedupe controls/i;

function filesIn(dir: string, extension: string): string[] {
  return readdirSync(resolve(root, dir))
    .filter(name => name.endsWith(extension))
    .map(name => `${dir}/${name}`);
}

describe("documented controls exist", () => {
  const files = [
    "README.md",
    "assets/shared-scenarios.js",
    "src/features/scenarioGuidance.ts",
    ...filesIn("docs", ".md"),
    ...filesIn("assets/generated", ".js"),
    ...filesIn("harness/fixtures", ".json"),
  ];

  it("scans a non-trivial set of files", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files)("%s does not advertise 'Dedupe on PK' or 'Drop snapshot rows' controls", file => {
    const text = readFileSync(resolve(root, file), "utf8");
    expect(text).not.toMatch(PHANTOM_CONTROLS);
  });

  it("has no UI control with those labels", () => {
    const ui = [...filesIn("web", ".tsx"), ...filesIn("src/ui/components", ".tsx")]
      .map(file => readFileSync(resolve(root, file), "utf8"))
      .join("\n");
    expect(ui).not.toMatch(/dedupe on pk|drop snapshot rows/i);
  });
});

describe("snapshot-replay scenario is honest about what it models", () => {
  const scenario = sharedScenarios.find(entry => entry.id === "snapshot-replay");

  it("keeps its id and says it is a source write, not redelivery", () => {
    expect(scenario).toBeTruthy();
    expect(scenario?.name).toBe("Re-insert after Update");
    expect(scenario?.description).toMatch(/does not model redelivery/i);
    expect(scenario?.highlight).toMatch(/later source write/i);
  });

  it("re-inserts LED-100 after an update, as an ordinary later write", () => {
    const ops = (scenario?.ops ?? []).filter(op => op.pk?.id === "LED-100");
    expect(ops.map(op => op.op)).toEqual(["update", "insert", "update"]);
    expect(ops[1].t).toBeGreaterThan(ops[0].t);
  });

  it("has guidance under the renamed scenario and none under the old name", () => {
    expect(getScenarioGuidance("Re-insert after Update")).toBeTruthy();
    expect(getScenarioGuidance("Snapshot Replay")).toBeNull();
  });
});

describe("snapshot-to-stream scenario does not promise a snapshot phase", () => {
  const scenario = sharedScenarios.find(entry => entry.id === "snapshot-to-stream");

  it("keeps its id and says there is no snapshot phase or handoff", () => {
    expect(scenario?.name).toBe("Account Changes");
    expect(scenario?.description).toMatch(/no snapshot phase and no handoff/i);
    expect(scenario?.tags).not.toContain("snapshot");
  });

  it("has honest guidance under the new name and none under the old one", () => {
    const guidance = getScenarioGuidance("Account Changes");
    expect(guidance?.summary).toMatch(/no snapshot phase/i);
    expect(JSON.stringify(guidance)).not.toMatch(/backlog|duplicate delivery|hand(s)? control/i);
    expect(getScenarioGuidance("Snapshot ➜ Stream Handoff")).toBeNull();
  });

  it("outbox guidance does not claim retries or replays the simulator never performs", () => {
    const text = JSON.stringify(getScenarioGuidance("Outbox Relay"));
    expect(text).not.toMatch(/even if retries occur|prove outbox emits/i);
  });
});

describe("brand text", () => {
  it("uses the site's form, with a typographic apostrophe, in the pill and footer", () => {
    const html = readFileSync(resolve(root, "index.html"), "utf8");
    expect(html).toContain('<span class="brand-pill">Let’s Talk CDC</span>');
    expect(html).not.toMatch(/Lets Talk CDC|Let's Talk CDC/);
  });
});

describe("orphans stay removed", () => {
  it("has no unused scenarios.json or Eleventy passthrough in the playground", () => {
    expect(existsSync(resolve(root, "src/data/scenarios.json"))).toBe(false);
    expect(existsSync(resolve(root, ".eleventy.js"))).toBe(false);
  });
});
