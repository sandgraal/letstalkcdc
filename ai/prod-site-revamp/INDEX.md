# Prod-Site-Revamp: Complete File Index

This document provides a comprehensive index of all files created for the prod-site-revamp project.

## 📁 Directory Structure

```
ai/prod-site-revamp/
├── README.md                                    # Main overview and workflow
├── QUICKSTART.md                                # Quick reference for agents
├── phase-1/
│   ├── 1.1-eleventy-migration/
│   │   ├── CONTEXT.md                          # Phase 1.1 context and goals
│   │   ├── FILES.md                            # Files to read and modify
│   │   └── REQUIREMENTS.md                     # Success criteria
│   ├── 1.2-js-modularization/
│   │   └── CONTEXT.md                          # Phase 1.2 context and goals
│   └── 1.3-build-pipeline/
├── phase-2/                                     # (To be populated)
├── phase-3/                                     # (To be populated)
├── prompts/
│   └── phase-1.1-eleventy-migration.md         # Agent prompt template
├── progress/
│   └── PROGRESS.md                             # Progress tracking
└── validation/
    └── validate-phase.mjs                      # Automated validation script
```

## 📄 File Descriptions

### Root Level

#### README.md
- **Purpose**: Main entry point for the workspace
- **Contains**: Directory structure, agent workflow, phase overview, safety mechanisms
- **For**: AI agents and human reviewers
- **Key sections**: Agent workflow, phase overview, completion criteria

#### QUICKSTART.md
- **Purpose**: Quick reference guide
- **Contains**: Common commands, checklists, tips
- **For**: AI agents needing fast guidance
- **Key sections**: Commands, prompt usage, troubleshooting

### Phase 1: Foundation Upgrades

#### phase-1/1.1-eleventy-migration/CONTEXT.md
- **Purpose**: Explains Eleventy 3.0 migration
- **Contains**: What is Eleventy 3.0, why migrate, current vs target state
- **Key sections**: ESM patterns, file conversions, success criteria

#### phase-1/1.1-eleventy-migration/FILES.md
- **Purpose**: Lists all files to interact with
- **Contains**: Files to read, files to modify, files to check
- **Key sections**: Conversion checklist, search commands

#### phase-1/1.1-eleventy-migration/REQUIREMENTS.md
- **Purpose**: Defines phase requirements and success metrics
- **Contains**: Functional requirements, non-functional requirements, testing
- **Key sections**: Success metrics, testing checklist, definition of done

#### phase-1/1.2-js-modularization/CONTEXT.md
- **Purpose**: Explains JavaScript modularization strategy
- **Contains**: Module breakdown (7 modules), design patterns, target structure
- **Key sections**: Module boundaries, dependencies, testing checklist

### Prompts

#### prompts/phase-1.1-eleventy-migration.md
- **Purpose**: Complete agent prompt for Phase 1.1
- **Contains**: Step-by-step execution plan, ESM patterns, success checklist
- **Usage**: Copy entire content and use as agent instruction
- **Key sections**: Execution plan, common pitfalls, rollback plan

### Progress Tracking

#### progress/PROGRESS.md
- **Purpose**: Central progress tracker
- **Contains**: Overall progress, phase-by-phase checklist, blockers
- **Updated by**: AI agents and human developers
- **Key sections**: Progress bars, checklists, change log

### Validation

#### validation/validate-phase.mjs
- **Purpose**: Automated validation script
- **Contains**: Phase-specific validation logic
- **Usage**: `node validate-phase.mjs 1.1`
- **Validates**: File existence, build success, functionality

## 🗂️ Configuration Files

### .chatgpt-context.yml (Updated)
- **Purpose**: Agent configuration
- **Changes**: Added prod-site-revamp project tracking
- **Contains**: Active projects, phase status

### .github/ISSUE_TEMPLATE/prod-site-revamp-phase.md
- **Purpose**: GitHub issue template for tracking phases
- **Usage**: Create issues for each phase
- **Contains**: Checklist, resources, success criteria

## 📋 Checklists

### For AI Agents Starting a Phase

1. ✅ Read `ai/prod-site-revamp/README.md`
2. ✅ Read `ai/prod-site-revamp/QUICKSTART.md`
3. ✅ Check `ai/prod-site-revamp/progress/PROGRESS.md`
4. ✅ Read phase-specific `CONTEXT.md`
5. ✅ Read phase-specific `FILES.md`
6. ✅ Read phase-specific `REQUIREMENTS.md`
7. ✅ Copy prompt from `prompts/` directory
8. ✅ Execute work
9. ✅ Run validation script
10. ✅ Update progress tracker

### For Human Reviewers

1. ✅ Check `progress/PROGRESS.md` for current status
2. ✅ Review phase-specific files in `phase-X/` directory
3. ✅ Run validation script: `node validation/validate-phase.mjs X.X`
4. ✅ Run manual tests from REQUIREMENTS.md
5. ✅ Review PR changes
6. ✅ Approve or request changes

## 🎯 Next Steps

### Immediate (Already Complete)
- ✅ Create directory structure
- ✅ Create README and QUICKSTART
- ✅ Create Phase 1.1 context files
- ✅ Create Phase 1.2 CONTEXT.md
- ✅ Create validation script
- ✅ Create prompt template for Phase 1.1
- ✅ Update .chatgpt-context.yml
- ✅ Create GitHub issue template

### To Complete Later

#### Phase 1 (Remaining)
- [ ] Create Phase 1.2 FILES.md and REQUIREMENTS.md
- [ ] Create Phase 1.2 prompt template
- [ ] Create Phase 1.3 context files
- [ ] Create Phase 1.3 prompt template

#### Phase 2
- [ ] Create Phase 2.1 context files (Enhanced Search)
- [ ] Create Phase 2.2 context files (Interactive Components)
- [ ] Create Phase 2.3 context files (Improved Assistant)
- [ ] Create Phase 2 prompt templates

#### Phase 3
- [ ] Create Phase 3.1 context files (Unit Testing)
- [ ] Create Phase 3.2 context files (E2E Testing)
- [ ] Create Phase 3.3 context files (CI/CD Pipeline)
- [ ] Create Phase 3 prompt templates

## 📚 External References

These files should be read by agents:

- `docs/PRD-SITE-REVAMP.md` — Complete requirements document
- `.github/copilot-instructions.md` — Project conventions
- `ai/AGENTS.md` — Agent system documentation
- `ai/CONTEXT.md` — Brand voice and conventions
- `ai/PROMPTING_GUIDE.md` — How to write prompts

## 🔄 Maintenance

This index should be updated when:
- New phase directories are created
- New context files are added
- Prompt templates are created
- Validation scripts are updated
- Progress tracker structure changes

---

_Version: 1.0.0_  
_Last Updated: 2026-02-05_  
_Maintained by: AI Agents and Human Developers_
