import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ALLOWED_MODELS,
  checkAgentCall,
} from "../../.claude/hooks/guard-agent-model.mjs";

/**
 * Holds the conductor roster (docs/CONDUCTOR.md) to its model policy.
 *
 * The in-session hook and the `availableModels` setting are guardrails a
 * personal ~/.claude/settings.json can widen. This test is the part that
 * cannot be bypassed locally: CI fails if any subagent is pinned to a model
 * other than Sonnet 5.5 or Haiku 5.5, or if the roster and the conductor's
 * spawn allowlist drift apart.
 */

const root = path.resolve(__dirname, "../..");
const agentsDir = path.join(root, ".claude/agents");
const PINNED = ["claude-sonnet-5-5", "claude-haiku-5-5"];

const readFrontmatter = (file) => {
  const text = fs.readFileSync(path.join(agentsDir, file), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${file}: no frontmatter`);
  const fm = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
};

const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
const agents = Object.fromEntries(
  files.map((f) => [f.replace(/\.md$/, ""), readFrontmatter(f)]),
);
const settings = JSON.parse(
  fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"),
);

describe("subagent roster", () => {
  it("has a conductor and the expected roles", () => {
    expect(Object.keys(agents).sort()).toEqual(
      [
        "conductor",
        "css-refactor",
        "implementer",
        "reviewer",
        "scout",
        "scribe",
        "verifier",
      ].sort(),
    );
  });

  it.each(Object.entries(agents))(
    "%s pins an explicit allowed model ID",
    (name, fm) => {
      expect(fm.name).toBe(name);
      expect(PINNED).toContain(fm.model);
    },
  );

  it("routes search, verification and mechanical edits to Haiku", () => {
    for (const name of ["scout", "verifier", "scribe"]) {
      expect(agents[name].model).toBe("claude-haiku-5-5");
    }
  });

  it("routes engineering and review to Sonnet", () => {
    for (const name of [
      "conductor",
      "implementer",
      "reviewer",
      "css-refactor",
    ]) {
      expect(agents[name].model).toBe("claude-sonnet-5-5");
    }
  });

  it("keeps read-only roles read-only", () => {
    for (const name of ["scout", "verifier", "reviewer"]) {
      const tools = agents[name].tools.split(",").map((t) => t.trim());
      expect(tools).not.toContain("Edit");
      expect(tools).not.toContain("Write");
    }
  });

  it("denies the conductor edit tools and limits who it can spawn", () => {
    const tools = agents.conductor.tools;
    expect(tools).not.toMatch(/\b(Edit|Write)\b/);
    const spawnable = tools
      .match(/Agent\(([^)]*)\)/)[1]
      .split(",")
      .map((s) => s.trim());
    const roles = Object.keys(agents).filter((n) => n !== "conductor");
    expect(spawnable.sort()).toEqual(roles.sort());
  });
});

describe("model policy in settings.json", () => {
  it("allows exactly Sonnet 5.5 and Haiku 5.5", () => {
    expect(settings.availableModels.sort()).toEqual([...PINNED].sort());
    expect(settings.model).toBe("claude-sonnet-5-5");
  });

  it("starts the main session as the conductor", () => {
    expect(settings.agent).toBe("conductor");
  });

  it("cannot alias up: every alias resolves to an allowed model", () => {
    for (const alias of ["SONNET", "HAIKU", "OPUS", "FABLE"]) {
      expect(PINNED).toContain(
        settings.env[`ANTHROPIC_DEFAULT_${alias}_MODEL`],
      );
    }
  });

  it("sets no subagent-model env override", () => {
    // Each role pins its own model. An env-level override (or its FORCE
    // variant) could flatten the Haiku roles up to Sonnet, so none is set.
    expect(settings.env.CLAUDE_CODE_SUBAGENT_MODEL).toBeUndefined();
    expect(settings.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE).toBeUndefined();
  });

  it("wires the guard hook to the Agent tool", () => {
    const entry = settings.hooks.PreToolUse.find((h) => h.matcher === "Agent");
    expect(entry.hooks[0].command).toContain("guard-agent-model.mjs");
  });
});

describe("guard-agent-model hook", () => {
  const call = (model) => ({ tool_input: { model } });

  it("allows the two permitted models, as alias or ID", () => {
    for (const m of ALLOWED_MODELS)
      expect(checkAgentCall(call(m)).ok).toBe(true);
  });

  it("allows a call that omits the model", () => {
    expect(checkAgentCall({ tool_input: {} }).ok).toBe(true);
    expect(checkAgentCall(call(undefined)).ok).toBe(true);
  });

  it.each([
    "opus",
    "fable",
    "claude-opus-5-5",
    "claude-fable-5-1",
    "best",
    "opusplan",
  ])("denies %s", (m) => {
    const result = checkAgentCall(call(m));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(m);
  });
});
