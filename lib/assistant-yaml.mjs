/**
 * Parser for src/data/assistant.yml (the assistant knowledge base).
 *
 * Deliberately not a general YAML parser: it understands exactly the shape
 * the knowledge base uses (inline or multi-line `triggers` / `modules`
 * arrays, a folded `answer: >` block, and a `links:` list of
 * label / url / anchor / preview). Triggers are read as JSON after quote
 * normalisation, so they must not contain apostrophes.
 *
 * Lives here, not in eleventy.config.mjs, so the unit tests exercise the same
 * code the build uses.
 */
export function parseAssistantYaml(content) {
  const lines = content.split(/\r?\n/);
  const intents = [];
  let current = null;
  let collectingAnswer = false;
  let answerLines = [];
  let collectingLinks = false;
  let currentLink = null;

  const finalizeAnswer = () => {
    if (!current) return;
    current.answer = answerLines.join(" ").replace(/\s+/g, " ").trim();
    answerLines = [];
  };

  const pushLink = () => {
    if (currentLink && current && current.links) {
      current.links.push(currentLink);
    }
    currentLink = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (collectingAnswer) {
      if (trimmed === "links:") {
        finalizeAnswer();
        collectingAnswer = false;
        collectingLinks = true;
        current.links = [];
        continue;
      }
      if (/^\s{4,}/.test(line) && trimmed !== "") {
        answerLines.push(trimmed);
        continue;
      }
      if (trimmed === "") {
        answerLines.push("");
        continue;
      }
      finalizeAnswer();
      collectingAnswer = false;
      i--;
      continue;
    }

    if (collectingLinks) {
      if (!trimmed) {
        continue;
      }
      if (trimmed.startsWith("- label:")) {
        pushLink();
        currentLink = { label: trimmed.slice("- label:".length).trim() };
        continue;
      }
      if (currentLink) {
        if (trimmed.startsWith("url:")) {
          currentLink.url = trimmed.slice("url:".length).trim();
          continue;
        }
        if (trimmed.startsWith("anchor:")) {
          currentLink.anchor = trimmed
            .slice("anchor:".length)
            .trim()
            .replace(/^["']|["']$/g, "");
          continue;
        }
        if (trimmed.startsWith("preview:")) {
          currentLink.preview = trimmed.slice("preview:".length).trim();
          continue;
        }
      }
      pushLink();
      collectingLinks = false;
      i--;
      continue;
    }

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("- id:")) {
      if (collectingLinks) {
        pushLink();
        collectingLinks = false;
      }
      if (current) {
        if (current.links && current.links.length === 0) {
          delete current.links;
        }
        intents.push(current);
      }
      current = { id: trimmed.slice("- id:".length).trim() };
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith("triggers:")) {
      const listStr = trimmed.slice("triggers:".length).trim();
      if (listStr && listStr.startsWith("[")) {
        current.triggers = JSON.parse(
          listStr.replace(/'/g, '"').replace(/,\s*]/g, "]"),
        );
      } else {
        // Multi-line array: collect subsequent lines until we find the closing ]
        let arrayStr = "";
        while (++i < lines.length) {
          arrayStr += lines[i].trim() + " ";
          if (lines[i].trim().endsWith("]")) break;
        }
        current.triggers = JSON.parse(
          arrayStr.trim().replace(/'/g, '"').replace(/,\s*]/g, "]"),
        );
      }
      continue;
    }

    if (trimmed.startsWith("modules:")) {
      const listStr = trimmed.slice("modules:".length).trim();
      if (listStr && listStr.startsWith("[")) {
        current.modules = JSON.parse(
          listStr.replace(/'/g, '"').replace(/,\s*]/g, "]"),
        );
      } else {
        // Multi-line array: collect subsequent lines until we find the closing ]
        let arrayStr = "";
        while (++i < lines.length) {
          arrayStr += lines[i].trim() + " ";
          if (lines[i].trim().endsWith("]")) break;
        }
        current.modules = JSON.parse(
          arrayStr.trim().replace(/'/g, '"').replace(/,\s*]/g, "]"),
        );
      }
      continue;
    }

    if (trimmed === "answer: >") {
      collectingAnswer = true;
      answerLines = [];
      continue;
    }

    if (trimmed === "links:") {
      collectingLinks = true;
      current.links = [];
      continue;
    }
  }

  if (collectingAnswer && current) {
    finalizeAnswer();
  }

  if (collectingLinks) {
    pushLink();
  }

  if (current) {
    if (current.links && current.links.length === 0) {
      delete current.links;
    }
    intents.push(current);
  }

  return { intents };
}
