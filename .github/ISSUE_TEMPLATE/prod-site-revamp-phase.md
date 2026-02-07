---
name: Prod-Site-Revamp Phase
about: Track progress on a specific phase of the prod-site-revamp project
title: "[Prod-Site-Revamp] Phase X.X: Phase Name"
labels: ["prod-site-revamp", "enhancement"]
assignees: ""
---

## Phase Information

**Phase**: X.X  
**Phase Name**: [e.g., Eleventy 3.0 Migration]  
**Priority**: 🔴 Critical / 🟡 High / 🟢 Medium  
**Estimated Duration**: X days  
**Dependencies**: [List any blocking phases]

## Context

Brief description of what this phase accomplishes.

## Resources

- **Context**: `ai/prod-site-revamp/phase-X/X.X-task/CONTEXT.md`
- **Requirements**: `ai/prod-site-revamp/phase-X/X.X-task/REQUIREMENTS.md`
- **Files**: `ai/prod-site-revamp/phase-X/X.X-task/FILES.md`
- **Prompt**: `ai/prod-site-revamp/prompts/phase-X.X-task.md`
- **PRD**: `docs/PRD-SITE-REVAMP.md`

## Checklist

Copy the checklist from the phase's REQUIREMENTS.md file:

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Success Criteria

- [ ] All tests pass
- [ ] Documentation updated
- [ ] Progress tracker updated
- [ ] Git tag created

## Testing

### Automated Tests

```bash
npm run build
npm run smoke
node ai/prod-site-revamp/validation/validate-phase.mjs X.X
```

### Manual Tests

- [ ] Test item 1
- [ ] Test item 2

## Notes

Add any additional notes, blockers, or observations here.

---

**Before closing this issue:**

- [ ] All checklist items complete
- [ ] All success criteria met
- [ ] Validation script passes
- [ ] Progress tracker updated
- [ ] Git tag created (e.g., `phase-1.1-complete`)
