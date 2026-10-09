#!/usr/bin/env node
// PreToolUse hook for the Agent tool: refuse any per-call `model` override
// that is not Sonnet 5.5 or Haiku 5.5.
//
// This repo's conductor protocol (docs/CONDUCTOR.md) allows exactly two
// models. A call that omits `model` is fine — the subagent then uses its
// own pinned frontmatter model, which tests/unit/agent-roster.test.js
// holds to the same allowlist.
//
// Exit 0 = allow, exit 2 = deny (stderr is shown to the model).

import { fileURLToPath } from "node:url";

export const ALLOWED_MODELS = [
  "sonnet",
  "haiku",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
];

/** @returns {{ ok: true } | { ok: false, reason: string }} */
export function checkAgentCall(input) {
  const model = input?.tool_input?.model;
  if (model === undefined || model === null || model === "") {
    return { ok: true };
  }
  if (ALLOWED_MODELS.includes(model)) return { ok: true };
  return {
    ok: false,
    reason:
      `Blocked: subagent model "${model}" is not allowed in this repo. ` +
      `Use "haiku" (search, verification, mechanical edits) or "sonnet" ` +
      `(implementation, review), or omit \`model\` to use the subagent's ` +
      `pinned model. See docs/CONDUCTOR.md.`,
  };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Fail closed: an unparseable payload is not something to wave through.
    process.stderr.write("guard-agent-model: could not parse hook input\n");
    process.exit(2);
  }
  const result = checkAgentCall(input);
  if (!result.ok) {
    process.stderr.write(`${result.reason}\n`);
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
