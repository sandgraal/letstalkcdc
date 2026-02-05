# Documentation Index

Welcome to the Let's Talk CDC documentation. This directory contains comprehensive guides for setup, development, deployment, and contributing to the platform.

---

## 📋 Strategic Documents

- **[Site Revamp PRD](PRD-SITE-REVAMP.md)** — Comprehensive product requirements document for modernizing the platform
  - Eleventy 3.0 migration plan
  - JavaScript modularization strategy
  - Testing and quality assurance roadmap
  - Agent configuration and implementation timeline

---

## 🚀 Setup & Configuration

### Getting Started
- **[Setup Guide](SETUP.md)** — Complete development environment setup guide
  - Quick start instructions
  - Environment configuration
  - Optional features (Appwrite, tracing, auth)
  - Troubleshooting common issues

- **[Hosting Guide](HOSTING.md)** — Deployment and hosting platform options
  - GitHub Pages setup
  - Netlify deployment
  - Vercel configuration
  - Custom domain setup

### Advanced Configuration
- **[Appwrite Quickstart](APPWRITE_QUICKSTART.md)** — 15-minute guide to set up Appwrite backend
- **[Tracing Guide](TRACING.md)** — Complete OpenTelemetry implementation guide
- **[Tracing Quickstart](TRACING-QUICKSTART.md)** — Quick setup for tracing and observability
- **[Tracing Architecture](tracing-architecture.md)** — Technical architecture of the tracing system
- **[Tracing Bundling](TRACING-BUNDLING.md)** — Bundling strategies for tracing instrumentation

---

## 🤝 Contributing

### Content Creation
- **[Adding Modules](adding-modules.md)** — Guide for creating new educational content modules
  - Module structure and conventions
  - Frontmatter requirements
  - Series integration
  - Testing your module

- **[Adding Quizzes](adding-quizzes.md)** — Creating interactive quiz components
  - Quiz data format
  - Answer validation
  - Progress tracking
  - Best practices

### Video & Media
- **[Video Embeds](video-embeds.md)** — Guidelines for embedding video content
  - Supported platforms
  - Accessibility considerations
  - Responsive embedding

### AI Assistant
- **[Assistant Feedback Setup](assistant-feedback-setup.md)** — Configure the AI assistant feedback collection
  - Appwrite collection setup
  - Intent matching configuration
  - Feedback analytics

### Authentication
- **[Auth Setup](auth-setup.md)** — User authentication and authorization configuration
  - Appwrite auth integration
  - Session management
  - Progress syncing

---

## 🧪 Development & Testing

- **[Sandbox Guide](SANDBOX.md)** — Docker Compose CDC sandbox for hands-on practice
  - Pre-configured Postgres, MySQL, Kafka, Debezium
  - Sample data and connectors
  - Troubleshooting

---

## 📚 Reference & Historical

### Project Status
- **[Phase 2 Complete](PHASE-2-COMPLETE.md)** — Summary of Phase 2 implementation
- **[Implementation Summary](IMPLEMENTATION-SUMMARY.md)** — Overview of completed work
- **[Deployment Success](DEPLOYMENT-SUCCESS.md)** — Deployment milestone documentation
- **[Consolidation Summary](CONSOLIDATION_SUMMARY.md)** — Repository consolidation notes

### Community & Engagement
- **[Community Guide](COMMUNITY.md)** — Building and engaging the CDC learning community
- **[Discussions Seed](DISCUSSIONS_SEED.md)** — Ideas for community discussions and engagement

### Archived Documents
- **[Archive](archive/)** — Historical documents and decisions
  - Deprecated guides
  - Previous status updates
  - Legacy configuration files

---

## 🔗 External Links

- **[Main README](../README.md)** — Project overview and quick start
- **[Contributing Guide](../AI-CONTRIBUTING.md)** — Guidelines for AI agents and contributors
- **[Security Policy](../SECURITY.md)** — Security practices and reporting
- **[Changelog](../CHANGELOG.md)** — Version history and release notes

---

## 📖 Documentation Conventions

### Frontmatter
All documentation files should include frontmatter when applicable:
```yaml
---
title: "Document Title"
description: "Brief description for SEO"
tags: ["tag1", "tag2"]
---
```

### File Naming
- Use kebab-case: `adding-modules.md`, not `Adding_Modules.md`
- Be descriptive: `tracing-quickstart.md`, not `tracing.md`
- Use standard suffixes: `-guide.md`, `-setup.md`, `-quickstart.md`

### Markdown Style
- Use ATX-style headers (`#`, `##`, `###`)
- Use fenced code blocks with language identifiers
- Include a table of contents for long documents (>500 lines)
- Link to other docs using relative paths

---

## 🆘 Need Help?

- **Questions about setup?** → See [SETUP.md](SETUP.md)
- **Want to contribute content?** → See [adding-modules.md](adding-modules.md)
- **Planning a revamp?** → See [PRD-SITE-REVAMP.md](PRD-SITE-REVAMP.md)
- **Found a bug?** → Open an issue on [GitHub](https://github.com/sandgraal/letstalkcdc/issues)
- **Security concern?** → See [SECURITY.md](../SECURITY.md)

---

_Last updated: 2026-02-05_
