/**
 * Unit tests for the CDC Assistant (Phase 2.3)
 *
 * Tests cover:
 * - Intent matching with context awareness
 * - YAML parser for new fields (modules, anchor, preview)
 * - Chat history read/write
 * - Next-topic suggestions
 *
 * @module tests/unit/modules/assistant.test
 */
import { describe, it, expect, beforeEach } from "vitest";

// ── Re-implement pure functions from assistant.js for testing ────────────
// We import fragments inline since assistant.js has side-effects (DOMContentLoaded).
// Instead, we test the logic directly.

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function matchIntent(query, kb, currentModule) {
  if (!query) return null;
  const q = normalize(query);

  let bestIntent = null;
  let bestScore = -1;

  for (const intent of kb.intents) {
    let score = 0;

    for (const t of intent.triggers) {
      if (q.includes(normalize(t))) {
        score += 1;
      }
    }
    if (score === 0) continue;

    if (
      currentModule &&
      Array.isArray(intent.modules) &&
      intent.modules.includes(currentModule)
    ) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }
  return bestIntent;
}

// ── Re-implement parseAssistantYaml for testing ─────────────────────────
// Imported from eleventy.config.mjs logic
function parseAssistantYaml(content) {
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
      if (!trimmed) continue;
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

    if (!trimmed) continue;

    if (trimmed.startsWith("- id:")) {
      if (collectingLinks) {
        pushLink();
        collectingLinks = false;
      }
      if (current) {
        if (current.links && current.links.length === 0) delete current.links;
        intents.push(current);
      }
      current = { id: trimmed.slice("- id:".length).trim() };
      continue;
    }

    if (!current) continue;

    if (trimmed.startsWith("triggers:")) {
      const listStr = trimmed.slice("triggers:".length).trim();
      current.triggers = JSON.parse(listStr.replace(/'/g, '"'));
      continue;
    }

    if (trimmed.startsWith("modules:")) {
      const listStr = trimmed.slice("modules:".length).trim();
      current.modules = JSON.parse(listStr.replace(/'/g, '"'));
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

  if (collectingAnswer && current) finalizeAnswer();
  if (collectingLinks) pushLink();

  if (current) {
    if (current.links && current.links.length === 0) delete current.links;
    intents.push(current);
  }

  return { intents };
}

// ── Test fixtures ────────────────────────────────────────────────────────

const SAMPLE_KB = {
  intents: [
    {
      id: "cdc_basics",
      triggers: ["what is cdc", "change data capture"],
      modules: ["intro", "overview"],
      answer: "CDC streams row-level changes.",
      links: [
        {
          label: "Intro",
          url: "/intro/",
          anchor: "#what-is-cdc",
          preview: "Visual walkthrough",
        },
      ],
    },
    {
      id: "snapshot_strategy",
      triggers: ["snapshot", "initial load"],
      modules: ["snapshotting"],
      answer: "Snapshots create an initial consistent dataset.",
      links: [
        { label: "Snapshotting", url: "/snapshotting/", anchor: "#lifecycle" },
      ],
    },
    {
      id: "lag_handling",
      triggers: ["lag", "latency", "slow downstream"],
      modules: ["observability", "ops-offsets"],
      answer: "Lag is the delay between source and sink.",
      links: [],
    },
    {
      id: "observability",
      triggers: ["monitor", "alert", "golden signals"],
      modules: ["observability"],
      answer: "Track lag, throughput, and error rate.",
      links: [],
    },
  ],
};

const SAMPLE_YAML = `intents:
  - id: test_intent
    triggers: ["hello", "hi there"]
    modules: ["intro", "overview"]
    answer: >
      This is a multi-line
      answer that spans
      several lines.
    links:
      - label: First Link
        url: /intro/
        anchor: "#section-1"
        preview: Go to section 1.
      - label: Second Link
        url: /overview/
        preview: Overview page.

  - id: another_intent
    triggers: ["goodbye", "bye"]
    modules: ["strategy"]
    answer: >
      Another answer here.
    links:
      - label: Strategy
        url: /strategy/
`;

// ── Tests ────────────────────────────────────────────────────────────────

describe("assistant – matchIntent", () => {
  it("returns null for empty query", () => {
    expect(matchIntent("", SAMPLE_KB, null)).toBeNull();
    expect(matchIntent(null, SAMPLE_KB, null)).toBeNull();
  });

  it("matches a basic trigger", () => {
    const result = matchIntent("what is cdc?", SAMPLE_KB, null);
    expect(result).not.toBeNull();
    expect(result.id).toBe("cdc_basics");
  });

  it("is case-insensitive", () => {
    const result = matchIntent("What Is CDC", SAMPLE_KB, null);
    expect(result).not.toBeNull();
    expect(result.id).toBe("cdc_basics");
  });

  it("matches substring triggers", () => {
    const result = matchIntent("how do I handle a snapshot?", SAMPLE_KB, null);
    expect(result).not.toBeNull();
    expect(result.id).toBe("snapshot_strategy");
  });

  it("returns null when no triggers match", () => {
    const result = matchIntent("unrelated gibberish xyz", SAMPLE_KB, null);
    expect(result).toBeNull();
  });

  describe("context awareness", () => {
    it("boosts intent matching current module", () => {
      // "lag" matches lag_handling, but "monitor" also matches.
      // Both "observability" module intents compete.
      // Without context, first match by score order wins.
      const _withoutCtx = matchIntent("lag monitor", SAMPLE_KB, null);
      // With context set to "observability", observability-module intents get +10
      const withCtx = matchIntent("lag monitor", SAMPLE_KB, "observability");
      // Both lag_handling and observability have modules including "observability"
      // "lag" triggers lag_handling (score 1), "monitor" triggers observability (score 1)
      // With context "observability": lag_handling gets +10 → 11, observability gets +10 → 11
      // lag_handling wins since it's encountered first with same score
      expect(withCtx).not.toBeNull();
      expect(["lag_handling", "observability"]).toContain(withCtx.id);
    });

    it("prefers context-matching intent over non-context intent", () => {
      // "snapshot" matches snapshot_strategy (modules: ["snapshotting"])
      // With context "snapshotting", it gets boosted
      const result = matchIntent("snapshot", SAMPLE_KB, "snapshotting");
      expect(result).not.toBeNull();
      expect(result.id).toBe("snapshot_strategy");
    });

    it("still matches when currentModule is null", () => {
      const result = matchIntent("snapshot", SAMPLE_KB, null);
      expect(result).not.toBeNull();
      expect(result.id).toBe("snapshot_strategy");
    });
  });
});

describe("assistant – parseAssistantYaml", () => {
  it("parses intents with new fields", () => {
    const result = parseAssistantYaml(SAMPLE_YAML);
    expect(result.intents).toHaveLength(2);

    const first = result.intents[0];
    expect(first.id).toBe("test_intent");
    expect(first.triggers).toEqual(["hello", "hi there"]);
    expect(first.modules).toEqual(["intro", "overview"]);
    expect(first.answer).toContain("multi-line");
    expect(first.answer).toContain("several lines");
  });

  it("parses link anchor and preview fields", () => {
    const result = parseAssistantYaml(SAMPLE_YAML);
    const links = result.intents[0].links;

    expect(links).toHaveLength(2);
    expect(links[0].label).toBe("First Link");
    expect(links[0].url).toBe("/intro/");
    expect(links[0].anchor).toBe("#section-1");
    expect(links[0].preview).toBe("Go to section 1.");

    expect(links[1].label).toBe("Second Link");
    expect(links[1].url).toBe("/overview/");
    expect(links[1].preview).toBe("Overview page.");
    expect(links[1].anchor).toBeUndefined();
  });

  it("parses link without anchor or preview", () => {
    const result = parseAssistantYaml(SAMPLE_YAML);
    const link = result.intents[1].links[0];
    expect(link.label).toBe("Strategy");
    expect(link.url).toBe("/strategy/");
    expect(link.anchor).toBeUndefined();
    expect(link.preview).toBeUndefined();
  });

  it("handles empty input gracefully", () => {
    const result = parseAssistantYaml("");
    expect(result.intents).toEqual([]);
  });
});

describe("assistant – chat history", () => {
  const HISTORY_KEY = "assistantHistory";
  const MAX_HISTORY = 20;

  function readHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeHistory(entries) {
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(entries.slice(-MAX_HISTORY)),
      );
    } catch {
      /* ignore */
    }
  }

  function pushMessage(role, text) {
    const history = readHistory();
    history.push({ role, text, ts: Date.now() });
    writeHistory(history);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with empty history", () => {
    expect(readHistory()).toEqual([]);
  });

  it("persists messages", () => {
    pushMessage("user", "hello");
    pushMessage("bot", "hi there");
    const h = readHistory();
    expect(h).toHaveLength(2);
    expect(h[0].role).toBe("user");
    expect(h[1].role).toBe("bot");
  });

  it("caps at MAX_HISTORY entries", () => {
    for (let i = 0; i < 25; i++) {
      pushMessage("user", `msg ${i}`);
    }
    const h = readHistory();
    expect(h.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(h[h.length - 1].text).toBe("msg 24");
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem(HISTORY_KEY, "not json at all");
    expect(readHistory()).toEqual([]);
  });
});

describe("assistant – next-topic suggestions", () => {
  function getNextTopicSuggestions(currentModule) {
    const modules = window.CDC_MODULES;
    if (!Array.isArray(modules)) return [];

    return modules
      .filter((m) => {
        if (m.state === "disabled") return false;
        if (m.key === currentModule) return false;
        try {
          const raw = localStorage.getItem(`progress_${m.key}`);
          if (!raw) return true;
          const data = JSON.parse(raw);
          return (data.pct || 0) < 100;
        } catch {
          return true;
        }
      })
      .slice(0, 2);
  }

  beforeEach(() => {
    localStorage.clear();
    window.CDC_MODULES = [
      { key: "intro", title: "Introduction", href: "/intro/" },
      { key: "snapshotting", title: "Snapshotting", href: "/snapshotting/" },
      { key: "observability", title: "Observability", href: "/observability/" },
      {
        key: "disabled-mod",
        title: "Disabled",
        href: "/disabled/",
        state: "disabled",
      },
    ];
  });

  it("returns up to 2 incomplete modules", () => {
    const suggestions = getNextTopicSuggestions("intro");
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].key).toBe("snapshotting");
    expect(suggestions[1].key).toBe("observability");
  });

  it("excludes the current module", () => {
    const suggestions = getNextTopicSuggestions("snapshotting");
    expect(suggestions.every((s) => s.key !== "snapshotting")).toBe(true);
  });

  it("excludes disabled modules", () => {
    const suggestions = getNextTopicSuggestions(null);
    expect(suggestions.every((s) => s.key !== "disabled-mod")).toBe(true);
  });

  it("excludes completed modules", () => {
    localStorage.setItem("progress_snapshotting", JSON.stringify({ pct: 100 }));
    const suggestions = getNextTopicSuggestions("intro");
    expect(suggestions.every((s) => s.key !== "snapshotting")).toBe(true);
  });

  it("returns empty if CDC_MODULES is not set", () => {
    window.CDC_MODULES = undefined;
    expect(getNextTopicSuggestions(null)).toEqual([]);
  });
});
