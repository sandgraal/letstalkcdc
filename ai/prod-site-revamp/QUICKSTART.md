# Quick Start Guide for AI Agents

## 🚀 Getting Started

### Before You Begin

1. **Read the PRD**: `docs/PRD-SITE-REVAMP.md` contains all requirements
2. **Check current phase**: `ai/prod-site-revamp/progress/PROGRESS.md`
3. **Read phase context**: `ai/prod-site-revamp/phase-X/X.X-task/CONTEXT.md`

### Phase Execution Flow

```
1. Read CONTEXT.md     → Understand the goal
2. Read FILES.md       → Know what to read/modify
3. Read REQUIREMENTS.md → Know success criteria
4. Use prompt template → Get started quickly
5. Do the work         → Make changes
6. Run validation      → Check your work
7. Update progress     → Document completion
```

## 📁 Directory Navigation

```
ai/prod-site-revamp/
├── README.md                    # Start here
├── progress/PROGRESS.md         # Current status
├── prompts/                     # Copy-paste prompts
│   ├── phase-1.1-eleventy-migration.md
│   ├── phase-1.2-js-modularization.md
│   └── phase-1.3-build-pipeline.md
├── phase-1/
│   ├── 1.1-eleventy-migration/
│   │   ├── CONTEXT.md          # What and why
│   │   ├── FILES.md            # What to read/change
│   │   └── REQUIREMENTS.md     # Success criteria
│   ├── 1.2-js-modularization/
│   └── 1.3-build-pipeline/
└── validation/
    └── validate-phase.mjs       # Automated checks
```

## 🎯 Phase Sequence

**Must be done in order**:

1. **Phase 1.1**: Eleventy 3.0 Migration (5 days)
2. **Phase 1.2**: JavaScript Modularization (7 days)
3. **Phase 1.3**: Build Pipeline Modernization (5 days)

Then parallel:

- **Phase 2**: Feature Enhancements (can start after Phase 1)
- **Phase 3**: Testing & Quality (can start after Phase 1)

## 🔨 Common Commands

### Build & Test

```bash
npm run build          # Build the site
npm run dev            # Start dev server
npm run clean          # Clean build artifacts
npm run smoke          # Run all checks
npm run smoke:core     # HTML and link validation
npm run smoke:a11y     # Accessibility tests
```

### Validation

```bash
# Validate phase completion
node ai/prod-site-revamp/validation/validate-phase.mjs 1.1
node ai/prod-site-revamp/validation/validate-phase.mjs 1.2
node ai/prod-site-revamp/validation/validate-phase.mjs 1.3
```

### Useful Checks

```bash
# Count HTML pages
find _site -name "*.html" | wc -l

# Check for .cjs files
find . -name "*.cjs" -not -path "*/node_modules/*"

# Check bundle size
du -h _site/assets/js/*.js

# Test path prefix
ELEVENTY_PATH_PREFIX=/ npm run build
ELEVENTY_PATH_PREFIX=/letstalkcdc/ npm run build
```

## 📝 Using Prompt Templates

Each phase has a pre-written prompt in `prompts/`:

1. Open the prompt file (e.g., `prompts/phase-1.1-eleventy-migration.md`)
2. Copy the entire content
3. Paste as your instruction
4. Follow the step-by-step plan in the prompt

**Example**:

```bash
cat ai/prod-site-revamp/prompts/phase-1.1-eleventy-migration.md
# Copy output and paste as instruction
```

## ✅ Checklist for Each Phase

- [ ] Read CONTEXT.md
- [ ] Read FILES.md
- [ ] Read REQUIREMENTS.md
- [ ] Create git tag (e.g., `pre-phase1.1-migration`)
- [ ] Make changes
- [ ] Test build (`npm run build`)
- [ ] Run validation script
- [ ] Manual testing
- [ ] Update `progress/PROGRESS.md`
- [ ] Create completion tag (e.g., `phase-1.1-complete`)
- [ ] Commit and push

## 🚨 When Things Go Wrong

### Build Fails

1. Read error message carefully
2. Check if you made a typo
3. Verify all imports have `.mjs` extensions (Phase 1.1)
4. Check if modules export correctly (Phase 1.2)
5. If stuck >2 hours, update progress as BLOCKED

### Tests Fail

1. Run `npm run clean && npm run build`
2. Check browser console for errors
3. Test on a fresh page load
4. Verify localStorage is not corrupted (clear if needed)

### Rollback Needed

```bash
# Restore specific files
git checkout HEAD -- <file>

# Restore all changes
git reset --hard HEAD

# Or use git tag
git checkout pre-phase1.1-migration
```

## 💡 Pro Tips

### For Phase 1.1 (ESM Migration)

- Always include `.mjs` extension in imports
- Remember `export default` not `module.exports`
- Test path prefix thoroughly

### For Phase 1.2 (Modularization)

- Extract one module at a time
- Test after each module
- Keep initialization order in mind

### For Phase 1.3 (Vite)

- Start with minimal config
- Test bundle size frequently
- Ensure HMR works in dev mode

## 📞 Getting Help

If blocked:

1. Update `progress/PROGRESS.md` with BLOCKED status
2. Document the issue clearly
3. Include error messages
4. Describe what you tried
5. Tag for human review

## 🎓 Learning Resources

- [Eleventy 3.0 Docs](https://www.11ty.dev/docs/v3/)
- [Node.js ESM Guide](https://nodejs.org/api/esm.html)
- [Vite Documentation](https://vitejs.dev/)
- [MDN JavaScript Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

## 🔗 Related Files

- **PRD**: `docs/PRD-SITE-REVAMP.md`
- **Copilot Instructions**: `.github/copilot-instructions.md`
- **Agent System**: `ai/AGENTS.md`
- **Context**: `ai/CONTEXT.md`
- **Site Config**: `.chatgpt-context.yml`

---

**Remember**: Make small, incremental changes. Test frequently. Update progress often. Ask for help when blocked.

_Happy coding! 🚀_
