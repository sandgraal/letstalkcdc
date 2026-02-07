# Prod-Site-Revamp AI Agent Workspace

This directory contains all the resources AI agents need to execute the Let's Talk CDC site revamp project as defined in `docs/PRD-SITE-REVAMP.md`.

## 📁 Directory Structure

```
ai/prod-site-revamp/
├── phase-1/              # Phase 1: Foundation Upgrades
│   ├── 1.1-eleventy-migration/
│   ├── 1.2-js-modularization/
│   └── 1.3-build-pipeline/
├── phase-2/              # Phase 2: Feature Enhancements
├── phase-3/              # Phase 3: Testing & Quality
├── prompts/              # Agent prompt templates
├── progress/             # Progress tracking files
├── validation/           # Validation scripts
└── README.md            # This file
```

## 🎯 Purpose

This workspace provides:

1. **Context files** — Phase-specific requirements and constraints for agents
2. **Prompt templates** — Pre-written prompts optimized for each task
3. **Progress tracking** — Shared state between agents and human reviewers
4. **Validation scripts** — Automated checks to verify agent work
5. **Rollback procedures** — Safety mechanisms if something goes wrong

## 🤖 Agent Workflow

### Step 1: Read Phase Context

Each phase directory contains:

- `CONTEXT.md` — What this phase accomplishes
- `REQUIREMENTS.md` — Specific deliverables
- `FILES.md` — Which files to read/modify
- `SUCCESS_CRITERIA.md` — How to verify completion

### Step 2: Use Prompt Template

Prompts in `prompts/` folder are optimized for:

- Clear task definition
- Minimal context loading
- Explicit success criteria
- Rollback instructions

### Step 3: Execute Work

Follow the requirements in the phase directory. Always:

- ✅ Read all files in `FILES.md` before making changes
- ✅ Make minimal, surgical changes
- ✅ Test after every change
- ✅ Update progress tracker
- ✅ Log any blockers

### Step 4: Validate

Run validation scripts in `validation/` to ensure:

- Build succeeds (`npm run build`)
- Tests pass (when applicable)
- No console errors
- Performance metrics maintained
- Accessibility checks pass

### Step 5: Update Progress

Update `progress/PROGRESS.md` with:

- What was completed
- What was skipped (with reason)
- Any issues encountered
- Next recommended task

## 📋 Phase Overview

### Phase 1: Foundation Upgrades (Critical Priority)

**Goal**: Modernize the build system and code structure without changing functionality.

| Phase | Task                         | Agent Skills                                  | Est. Time |
| ----- | ---------------------------- | --------------------------------------------- | --------- |
| 1.1   | Eleventy 3.0 Migration       | `esm-migration`, `eleventy`                   | 5 days    |
| 1.2   | JavaScript Modularization    | `code-refactoring`, `testing`                 | 7 days    |
| 1.3   | Build Pipeline Modernization | `module-bundling`, `performance-optimization` | 5 days    |

**Critical Path**: 1.1 → 1.2 → 1.3 (sequential, blocking)

### Phase 2: Feature Enhancements (Medium Priority)

**Goal**: Add new features that improve user experience.

- Enhanced Search (fuzzy search, filters)
- Interactive Components (live code editors)
- Improved Assistant (better intent matching)

**Dependency**: Requires Phase 1 completion. Tasks can be done in parallel.

### Phase 3: Testing & Quality (High Priority)

**Goal**: Ensure reliability and maintainability.

- Unit Testing (Vitest)
- E2E Testing (Playwright)
- CI/CD Pipeline Enhancement (Lighthouse CI)

**Dependency**: Can start after Phase 1. Runs in parallel with Phase 2.

## 🛡️ Safety Mechanisms

### Feature Flags

New implementations can be feature-flagged:

```javascript
const USE_MODULAR_APP = localStorage.getItem("use_modular_app") !== "false";
```

### Git Tags

Before each phase:

```bash
git tag pre-phase1-migration
git push origin pre-phase1-migration
```

### Rollback Command

If something breaks:

```bash
git revert HEAD~1  # Undo last commit
npm run build      # Verify build works
npm run smoke      # Run all checks
```

## 📊 Progress Tracking

Current status: **Not Started**

See `progress/PROGRESS.md` for detailed tracking.

### Completion Criteria

**Phase 1 Complete** when:

- ✅ Eleventy 3.0 builds successfully
- ✅ All 40+ pages render correctly
- ✅ JavaScript modules load without errors
- ✅ Bundle size <100KB gzipped
- ✅ Build time <3 seconds
- ✅ All smoke tests pass

**Phase 2 Complete** when:

- ✅ Search has fuzzy matching
- ✅ Interactive components work
- ✅ Assistant accuracy improved
- ✅ All features tested manually

**Phase 3 Complete** when:

- ✅ Unit test coverage ≥80%
- ✅ E2E tests cover critical paths
- ✅ Lighthouse CI enforces scores
- ✅ All tests pass in CI

## 🔧 Developer Commands

```bash
# Build the site
npm run build

# Run development server
npm run dev

# Run all quality checks
npm run smoke

# Run specific checks
npm run smoke:core   # HTML structure and links
npm run smoke:a11y   # Accessibility tests
npm run smoke:perf   # Performance budgets

# Clean build artifacts
npm run clean
```

## 📚 Related Documentation

- [PRD-SITE-REVAMP.md](../../docs/PRD-SITE-REVAMP.md) — Complete requirements
- [AGENTS.md](../AGENTS.md) — Agent system documentation
- [CONTEXT.md](../CONTEXT.md) — Brand voice and conventions
- [PROMPTING_GUIDE.md](../PROMPTING_GUIDE.md) — How to write effective prompts
- [.chatgpt-context.yml](../../.chatgpt-context.yml) — Agent configuration

## 🚨 Important Notes

### For AI Agents

1. **Never delete working code** unless explicitly required
2. **Always test after changes** — broken builds block everyone
3. **Update progress tracker** after each significant change
4. **Tag AI-generated content** with `ai-generated: true` in frontmatter
5. **Ask for help** if blocked — update progress with BLOCKED status

### For Human Reviewers

1. **Review PRs carefully** — agents may miss edge cases
2. **Run smoke tests locally** before merging
3. **Check bundle sizes** after Phase 1.3
4. **Verify accessibility** after Phase 2
5. **Monitor CI** for flaky tests in Phase 3

## 📞 Contact

- **Product Owner**: @sandgraal
- **Tech Lead**: @sandgraal
- **Issues**: Use GitHub Issues with `prod-site-revamp` label

---

_Last Updated: 2026-02-05_
_Version: 1.0.0_
