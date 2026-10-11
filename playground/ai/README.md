# AI Template Kit

This directory contains metadata and helper scripts for conversational AI tooling around the playground.

## Contents
- `.chatgpt-context.yml` – project context used by interactive agents. The copy that used to sit at the repository root has been retired, so this one is now the only one; `scripts/bootstrap.mjs` falls back to it.
- `site-config.json` – structured metadata about commands, docs, and CI workflows.
- `scripts/bootstrap.mjs` – sanity-checks configuration and snapshots a summary under `_state/`.
- `scripts/log-agent-run.mjs` – logs local agent runs into `logs/`.

Agent instructions for the repository live in the root `CLAUDE.md` (`AGENTS.md` is a symlink to it) and in `.claude/rules/`.

## GitHub Actions
There are no workflows for this kit. The "AI Agents", "AI Changelog Sync" and "AI README Sync" workflows this README used to describe do not exist under `.github/workflows/`.

## Local usage
```bash
node ai/scripts/bootstrap.mjs
AI_AGENT_NAME=all node ai/scripts/log-agent-run.mjs
```

The logs and state files are ignored by Git (aside from `.gitkeep` placeholders), so you can experiment locally without committing generated artifacts.
