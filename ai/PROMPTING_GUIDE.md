# PROMPTING_GUIDE.md

Aim: fast, deterministic outputs. Provide context, inputs, constraints, and deliverables.

## Pattern
```
Task: <what to build or change>
Context: <repo URLs, file paths, brand voice, target audience>
Inputs: <data files, images, requirements>
Constraints: <style, SEO, accessibility, privacy>
Deliverables: <files, paths, PR plan>
Review gates: <checks before merge>
```

## Examples
- Content:
  ```
  Task: Draft a product page for "Smoked Mango Salsa"
  Context: project uses Eleventy; products at src/_data/products.js
  Inputs: ingredient list + price + image path
  Constraints: bilingual headings, 130-160 meta description, WCAG AA
  Deliverables: src/products/smoked-mango-salsa.md with frontmatter
  Review gates: run npm run build and link check
  ```

- CI debug:
  ```
  Task: Diagnose Pages deploy failure
  Context: GitHub Actions pages.yml; Node 20; Eleventy 2.x
  Inputs: workflow logs excerpt
  Constraints: do not change package-lock.json
  Deliverables: proposed diff + explanation
  ```
