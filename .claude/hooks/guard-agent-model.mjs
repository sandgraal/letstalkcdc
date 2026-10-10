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
//
// FAIL CLOSED: Claude Code treats any exit code other than 2 as non-blocking,
// so this file turns every crash into exit 2, and settings.json registers it
// as `node ... || exit 2` so that even a failure to load it (missing node, a
// syntax error) is a deny.
//
// Limits: this guards only the per-call `model` argument. It is a guardrail,
// not a lock. The enforcement that cannot be skipped locally is
// tests/unit/agent-roster.test.js in CI.

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

/** Exit 2 with a message. Never throws, never returns. */
function failClosed(message) {
  try {
    process.stderr.write(`${message}\n`);
  } finally {
    process.exit(2);
  }
}

async function main() {
  // Fail closed: any crash is a deny. Node exits 1 on an uncaught exception,
  // and Claude Code treats every exit code other than 2 as "allow".
  const crash = (e) =>
    failClosed(`guard-agent-model: internal error: ${e?.message ?? e}`);
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return failClosed("guard-agent-model: could not parse hook input");
    }
    if (input === null || typeof input !== "object") {
      return failClosed("guard-agent-model: hook input was not an object");
    }
    const result = checkAgentCall(input);
    if (!result.ok) failClosed(result.reason);
  } catch (e) {
    crash(e);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
