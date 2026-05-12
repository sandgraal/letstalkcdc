# Documentation Index

Welcome to the Let's Talk CDC documentation. This directory contains the
current guides for setup, development, deployment, and contributing.

For AI agents: start at **[../CLAUDE.md](../CLAUDE.md)** at the repo root.
It is the canonical quick-reference and is kept in sync with the build
pipeline; this index links the deeper docs.

---

## 🚀 Setup & Configuration

- **[SETUP.md](SETUP.md)** — Complete development environment setup
  (Appwrite, tracing, env vars, troubleshooting)
- **[HOSTING.md](HOSTING.md)** — GitHub Pages deploy + CI runbook
- **[TRACING.md](TRACING.md)** — OpenTelemetry implementation

---

## 🤝 Contributing

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Human-contributor workflow
  (branching, PR expectations, local checks)
- **[adding-modules.md](adding-modules.md)** — Adding new educational
  content modules
- **[adding-quizzes.md](adding-quizzes.md)** — Adding interactive quiz
  components
- **[video-embeds.md](video-embeds.md)** — Embedding video content
- **[javascript-architecture.md](javascript-architecture.md)** — JS module
  layout and Vite split

---

## 🧪 Development

- **[SANDBOX.md](SANDBOX.md)** — Docker-Compose CDC sandbox
  (Postgres, MySQL, Kafka, Debezium) for hands-on practice
- **[INTEGRATION.md](INTEGRATION.md)** — Integration notes

---

## 📣 Community

- **[COMMUNITY.md](COMMUNITY.md)** — Engagement playbook
- **[DISCUSSIONS_SEED.md](DISCUSSIONS_SEED.md)** — Seeding GitHub
  Discussions

---

## 📚 Reference & Historical

- **[PRD-SITE-REVAMP.md](PRD-SITE-REVAMP.md)** — Historical PRD for the
  2.0.0 site revamp (shipped 2026-02-06). Preserved as architectural
  context; **not a live spec**.
- **[archive/](archive/)** — Older status docs, decision records, and
  pre-revamp guides. Read for context only.

---

## 🔗 Repo-Root Files

- **[../README.md](../README.md)** — Project overview and quick start
- **[../CLAUDE.md](../CLAUDE.md)** — AI-agent quick reference
- **[../CHANGELOG.md](../CHANGELOG.md)** — Release notes and unreleased
  changes
- **[../SECURITY.md](../SECURITY.md)** — Security policy

---

## 📖 Documentation Conventions

- Kebab-case filenames (`adding-modules.md`, not `Adding_Modules.md`).
- Markdown only; ATX headings; fenced code blocks with language tags.
- Link with relative paths; keep this index honest — if you delete or
  move a doc, update this file in the same PR.

---

## 🆘 Need Help?

- Setup question → **[SETUP.md](SETUP.md)**
- Want to contribute content → **[adding-modules.md](adding-modules.md)**
- Bug → open an issue at
  <https://github.com/sandgraal/letstalkcdc/issues>
- Security concern → **[../SECURITY.md](../SECURITY.md)**
