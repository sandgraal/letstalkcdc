/**
 * Knowledge-base tests for the CDC Assistant (P15-11).
 *
 * These run real visitor phrasings through the shipped matcher
 * (src/js/assistant-matcher.js) against the shipped knowledge base
 * (src/data/assistant.yml, parsed by lib/assistant-yaml.mjs) and assert which
 * intent answers. The first production vote was a thumbs-down on
 * "help me learn cdc", which matched nothing.
 *
 * @module tests/unit/modules/assistant-knowledge-base.test
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchIntent } from "../../../src/js/assistant-matcher.js";
import { parseAssistantYaml } from "../../../lib/assistant-yaml.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const yamlPath = path.resolve(here, "../../../src/data/assistant.yml");
const kb = parseAssistantYaml(fs.readFileSync(yamlPath, "utf8"));

const idOf = (query, module = null) =>
  matchIntent(query, kb, module)?.id ?? null;
const byId = (id) => kb.intents.find((i) => i.id === id);

describe("assistant knowledge base – beginner questions", () => {
  const BEGINNER = [
    "help me learn cdc",
    "Help me learn CDC",
    "how do I learn cdc?",
    "I want to learn change data capture",
    "learn change data capture",
    "where do I start?",
    "where should I start",
    "what should I read first?",
    "what do I read first",
    "I am a beginner",
    "beginner guide",
    "I'm new to CDC",
    "new to change data capture",
    "how do I get started with cdc",
    "I am new to this",
    "is there a roadmap?",
    "learning path",
    "what is the best order to read the modules",
    "what order should I read the pages in",
    "is there a curriculum",
  ];

  it.each(BEGINNER)("%j answers with the start-here intent", (query) => {
    expect(idOf(query)).toBe("start_here");
  });

  it.each(["intro", "overview", "snapshotting", "exactly-once"])(
    "still answers with start-here when asked from the %s page",
    (module) => {
      expect(idOf("help me learn cdc", module)).toBe("start_here");
      expect(idOf("where do I start", module)).toBe("start_here");
    },
  );

  it("answers every beginner phrasing on the intro, overview and strategy pages", () => {
    // These are the pages cdc_basics is boosted on. start_here has no module
    // boost of its own, so a phrasing that spells out "change data capture"
    // is allowed to fall to cdc_basics there (as it always did on main);
    // everything else must still reach start_here.
    for (const module of ["intro", "overview", "strategy"]) {
      for (const query of BEGINNER) {
        const expected = /change data capture/i.test(query)
          ? ["start_here", "cdc_basics"]
          : ["start_here"];
        expect(expected, `${query} @ ${module}`).toContain(idOf(query, module));
      }
    }
  });

  it("points at the intro, its learning path and the overview", () => {
    const urls = byId("start_here").links.map((l) => l.url + (l.anchor || ""));
    expect(urls).toContain("/intro/");
    expect(urls).toContain("/intro/#series-roadmap");
    expect(urls).toContain("/overview/");
  });

  it("does not hijack a specific question that merely mentions starting", () => {
    expect(idOf("how do I start a snapshot")).toBe("snapshot_strategy");
    expect(idOf("getting started with debezium")).toBe("connector_setup");
    expect(idOf("quickstart for postgres")).toBe("connector_setup");
  });

  it("leaves bare 'getting started' with the quickstarts, as before", () => {
    // Deliberate trade-off: connector_setup has owned this trigger since
    // before start_here existed, and ties go to the earlier intent.
    expect(idOf("getting started")).toBe("connector_setup");
  });
});

describe("assistant knowledge base – beginner prefixes never steal a topic", () => {
  // One natural question per original intent. Whatever beginner-style prefix
  // is put in front, the topic intent must still answer (this is what the new,
  // broad start_here triggers used to break).
  const TOPICS = [
    ["what does cdc do", "cdc_basics"],
    ["why is there lag in my pipeline", "lag_handling"],
    ["bootstrap a new table", "snapshot_strategy"],
    ["rewind the connector", "offset_management"],
    ["how are schema changes handled", "schema_changes"],
    ["how do I avoid duplicates", "exactly_once"],
    ["multi-tenant cdc isolation", "multi_tenancy"],
    ["how do I choose a partition key", "partitioning"],
    ["set up a postgres connector", "connector_setup"],
    ["cache invalidation with cdc", "use_cases"],
    ["the pipeline is not working", "troubleshooting"],
    ["how do I upsert into the target table", "materialization"],
    ["which alerts should I set", "observability"],
  ];
  const PREFIXES = [
    "where do I start with ",
    "beginner guide to ",
    "roadmap for ",
    "from scratch: ",
    "I am new to cdc, how do I handle ",
  ];
  const CASES = TOPICS.flatMap(([q, id]) => PREFIXES.map((p) => [p + q, id]));

  it.each(CASES)("%j -> %s", (query, expected) => {
    expect(idOf(query)).toBe(expected);
  });

  it.each([
    ["where do I start with debugging", "troubleshooting"],
    ["explain from scratch how to set up debezium", "connector_setup"],
    ["roadmap for exactly once", "exactly_once"],
    ["beginner guide to schema evolution", "schema_changes"],
    ["mysql binlog is not enabled, connector error", "connector_setup"],
    ["monitor kinesis lag", "lag_handling"],
    ["how do I snapshot with pii columns", "snapshot_strategy"],
  ])("%j -> %s (reviewer's cases)", (query, expected) => {
    expect(idOf(query)).toBe(expected);
  });
});

describe("assistant knowledge base – module boosts never let a new intent steal a topic", () => {
  // Winners below are main's (pre-P15-11). start_here and cdc_methods used to
  // carry a +10 boost on intro/overview/strategy and intro, and one generic
  // trigger then beat single-trigger topical intents there.
  const PAGES = ["intro", "overview", "strategy"];
  const TOPICAL = [
    ["beginner guide to snapshots", "snapshot_strategy"],
    ["from scratch snapshot", "snapshot_strategy"],
    ["explain offsets for beginners", "offset_management"],
    ["beginner tutorial on offsets", "offset_management"],
    ["set up debezium from scratch", "connector_setup"],
    ["kafka connect for beginners", "connector_setup"],
    ["beginner connector failed", "connector_setup"],
    ["new to this and my connector failed", "connector_setup"],
    ["build a materialized view from scratch", "materialization"],
    ["i am new to cdc, how do i handle duplicates", "exactly_once"],
    ["newbie question about lag", "lag_handling"],
  ];
  const CASES = PAGES.flatMap((page) =>
    TOPICAL.map(([q, id]) => [q, page, id]),
  );

  it.each(CASES)("%j on %s -> %s", (query, page, expected) => {
    expect(idOf(query, page)).toBe(expected);
  });

  it.each([
    ["transaction log growing troubleshooting", "troubleshooting"],
    ["binlog retention lag", "lag_handling"],
    ["redo log oracle setup", "connector_setup"],
    ["binlog position offsets", "offset_management"],
  ])("%j on intro -> %s", (query, expected) => {
    expect(idOf(query, "intro")).toBe(expected);
  });

  it.each(["materialization", "exactly-once", "partitioning", "intro"])(
    "'binlog position offsets' is about offsets on %s, not idempotent sinks",
    (page) => {
      expect(idOf("binlog position offsets", page)).toBe("offset_management");
    },
  );

  it("no new intent carries a module boost", () => {
    const original = new Set([
      "cdc_basics",
      "lag_handling",
      "snapshot_strategy",
      "offset_management",
      "schema_changes",
      "exactly_once",
      "multi_tenancy",
      "partitioning",
      "connector_setup",
      "use_cases",
      "troubleshooting",
      "materialization",
      "observability",
    ]);
    for (const intent of kb.intents.filter((i) => !original.has(i.id))) {
      expect(intent.modules, intent.id).toEqual([]);
    }
  });
});

describe("assistant knowledge base – delivery-guarantee phrasings", () => {
  it.each([
    "at-least-once delivery",
    "what is idempotency in cdc",
    "dedupe events",
    "why do i get the same event twice",
    "what guarantees does cdc give",
    "effectively once",
  ])("%j reaches the exactly-once answer", (query) => {
    expect(idOf(query)).toBe("exactly_once");
  });
});

describe("docs/SETUP.md – the knowledge-base example", () => {
  const setup = fs.readFileSync(
    path.resolve(here, "../../../docs/SETUP.md"),
    "utf8",
  );
  const section = setup.slice(
    setup.indexOf("#### Extending the Knowledge Base"),
  );
  const example = /```yaml\n([\s\S]*?)```/.exec(section)?.[1];

  it("has a yaml example", () => {
    expect(example).toBeTruthy();
  });

  it("parses with the build's parser into a usable intent", () => {
    const { intents } = parseAssistantYaml(example);
    expect(intents).toHaveLength(1);
    const [intent] = intents;
    expect(intent.id).toBe("your_intent_id");
    expect(intent.triggers).toEqual([
      "your trigger phrase",
      "alternative phrase",
    ]);
    expect(intent.modules).toEqual(["page-key"]);
    expect(intent.answer).toBe("Your answer text here.");
    expect(intent.links).toEqual([
      {
        label: "Related Doc",
        url: "/path/to/doc/",
        anchor: "#heading-id",
        preview: "One-line hover text.",
      },
    ]);
  });

  it("warns about trailing comments, which really do break the parser", () => {
    expect(setup).toContain("No trailing comments after a value");
    expect(() =>
      parseAssistantYaml('- id: x\n  modules: ["a"] # note\n'),
    ).toThrow();
  });
});

describe("assistant knowledge base – core concept basics", () => {
  const CASES = [
    // [query, expected intent]
    ["what is change data capture?", "cdc_basics"],
    ["what is cdc", "cdc_basics"],
    ["how does cdc work?", "cdc_basics"],
    ["cdc basics", "cdc_basics"],
    ["introduction to cdc", "cdc_basics"],
    ["log-based vs trigger-based cdc", "cdc_methods"],
    ["what are the types of cdc", "cdc_methods"],
    ["is polling a form of cdc", "cdc_methods"],
    ["what does a change event look like", "event_envelope"],
    ["what is a tombstone", "event_envelope"],
    ["what are before and after images", "event_envelope"],
    ["what is the transactional outbox pattern", "outbox"],
    ["does outbox give exactly-once?", "outbox"],
    ["what is the dual write problem", "outbox"],
    ["how do I make an idempotent sink", "idempotent_sink"],
    ["should I order by ts_ms", "idempotent_sink"],
    ["events arrive out of order", "idempotent_sink"],
    ["how do I handle pii in cdc", "security_pii"],
    ["how do I mask a column", "security_pii"],
    ["gdpr right to erasure", "security_pii"],
    ["what privileges does the cdc user need", "security_pii"],
    ["cdc for mongodb", "non_relational"],
    ["what are dynamodb streams", "non_relational"],
    ["does cassandra support cdc", "non_relational"],
    ["can I use pulsar instead of kafka", "transports"],
    ["cdc with kinesis", "transports"],
    ["google pub/sub ordering", "transports"],
    ["which cdc tool should I use", "tool_choice"],
    ["debezium vs fivetran", "tool_choice"],
    ["what is observability for cdc", "observability"],
    ["is there a cdc glossary", "glossary"],
  ];

  it.each(CASES)("%j -> %s", (query, expected) => {
    expect(idOf(query)).toBe(expected);
  });
});

describe("assistant knowledge base – existing intents keep their phrasings", () => {
  const CASES = [
    ["How do I handle a snapshot?", "snapshot_strategy"],
    ["what is an initial load", "snapshot_strategy"],
    ["my replication lag keeps growing", "lag_handling"],
    ["how do I reset an offset", "offset_management"],
    ["how do I handle an alter table", "schema_changes"],
    ["exactly once delivery guarantee", "exactly_once"],
    ["how do I pick a partition key", "partitioning"],
    ["how do I install debezium", "connector_setup"],
    ["my pipeline is not working", "troubleshooting"],
    ["how do I upsert into the target table", "materialization"],
    ["which dashboard should I build", "observability"],
    ["multi-tenant isolation", "multi_tenancy"],
  ];

  it.each(CASES)("%j -> %s", (query, expected) => {
    expect(idOf(query)).toBe(expected);
  });

  it("the question the e2e suite asks still reaches cdc_basics", () => {
    expect(idOf("What is change data capture?")).toBe("cdc_basics");
  });

  it("returns null for gibberish rather than guessing", () => {
    expect(idOf("zxqv wibble")).toBeNull();
  });
});

describe("assistant knowledge base – module context", () => {
  it("boosts an intent whose modules include the current page", () => {
    // "partition" and "ordering" both hit partitioning (2); "snapshot" hits
    // snapshot_strategy (1). The +10 context boost flips the winner.
    const query = "partition ordering during a snapshot";
    expect(idOf(query)).toBe("partitioning");
    expect(idOf(query, "snapshotting")).toBe("snapshot_strategy");
    expect(idOf(query, "partitioning")).toBe("partitioning");
  });

  it("ignores a module that no intent lists", () => {
    expect(idOf("help me learn cdc", "no-such-module")).toBe("start_here");
  });

  it("never matches on context alone", () => {
    expect(idOf("tell me about retention", "non-relational")).toBeNull();
    expect(idOf("mongodb retention", "non-relational")).toBe("non_relational");
  });
});

describe("assistant knowledge base – shape", () => {
  it("has unique ids", () => {
    const ids = kb.intents.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(kb.intents.map((i) => [i.id, i]))(
    "%s is well formed",
    (_id, intent) => {
      expect(intent.triggers.length).toBeGreaterThan(0);
      for (const t of intent.triggers) {
        // Triggers are read as JSON with ' rewritten to ", so an apostrophe
        // would corrupt the whole list.
        expect(t).not.toContain("'");
        expect(t).toBe(t.trim().toLowerCase());
      }
      expect(Array.isArray(intent.modules)).toBe(true);
      expect(intent.answer.length).toBeGreaterThan(40);
      // Answers are rendered as HTML without escaping.
      expect(intent.answer).not.toMatch(/[<>&]/);
      expect(intent.links.length).toBeGreaterThan(0);
      for (const link of intent.links) {
        expect(link.label).toBeTruthy();
        // Site-absolute with a trailing slash; the browser adds the base path.
        expect(link.url).toMatch(/^\/[a-z0-9\-/]*\/$/);
        if (link.anchor) expect(link.anchor).toMatch(/^#[A-Za-z0-9_-]+$/);
      }
    },
  );
});

describe("assistant knowledge base – the site's delivery thesis", () => {
  it("idempotent_sink says at-least-once, primary key, log position, not ts_ms", () => {
    const a = byId("idempotent_sink").answer.toLowerCase();
    expect(a).toContain("at-least-once");
    expect(a).toContain("primary key");
    expect(a).toContain("log position");
    expect(a).toContain("ts_ms");
    expect(a).toMatch(/not (achievable|possible)/);
  });

  it("outbox does not promise exactly-once delivery", () => {
    const a = byId("outbox").answer.toLowerCase();
    expect(a).toContain("at-least-once");
    expect(a).toContain("does not make delivery exactly-once");
  });
});
