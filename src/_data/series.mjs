export default [
  {
    key: "intro",
    title: "Interactive Introduction to CDC",
    description:
      "An interactive dashboard covering core concepts, methods, architectures, and the tooling ecosystem.",
    href: "intro/",
    ctaLabel: "Dive In!",
    isRecommended: true,
    badge: { label: "Start Here", variant: "recommended" },
    tags: [{ label: "Core Concept", variant: "tag-concept" }],
    skillLevel: "Beginner",
  },
  {
    key: "event-envelope",
    title: "Event Envelope & Delivery Guarantees",
    description:
      "Keys vs payload, before/after images, tombstones; ALO vs EOS scope and per-key ordering.",
    href: "event-envelope/",
    tags: [{ label: "Core Concept", variant: "tag-concept" }],
    skillLevel: "Beginner",
  },
  {
    key: "materialization",
    title: "Materialization 101 (Upsert/Delete)",
    description:
      "Practical MERGE patterns for upserts & deletes; compaction vs history tables; late-arrivals 101.",
    href: "materialization/",
    tags: [{ label: "Core Concept", variant: "tag-concept" }],
    skillLevel: "Intermediate",
  },
  {
    key: "snapshotting",
    title: "Snapshotting: The First Sync",
    description:
      "Learn how CDC pipelines perform the initial, consistent snapshot of a database before streaming live changes.",
    href: "snapshotting/",
    tags: [{ label: "Core Concept", variant: "tag-concept" }],
    skillLevel: "Intermediate",
  },
  {
    key: "exactly-once",
    title: "Exactly-Once Semantics",
    description: "Visual walkthrough of ALO vs EOS + transactional outbox.",
    href: "exactly-once/",
    tags: [{ label: "Advanced Pattern", variant: "tag-pattern" }],
    skillLevel: "Advanced",
  },
  {
    key: "multi-tenancy",
    title: "Multi-Tenancy",
    description: "Isolation patterns, topic math, and rough egress estimates.",
    href: "multi-tenancy/",
    tags: [{ label: "Advanced Pattern", variant: "tag-pattern" }],
    skillLevel: "Advanced",
  },
  {
    key: "partitioning",
    title: "Partitioning",
    description: "Partition keys, skew, late-arrivals, and audit loops.",
    href: "partitioning/",
    tags: [{ label: "Advanced Pattern", variant: "tag-pattern" }],
    skillLevel: "Advanced",
  },
  {
    key: "schema-evolution",
    title: "Schema Evolution",
    description:
      "Handle schema changes gracefully with forward/backward compatibility and schema registries.",
    href: "schema-evolution/",
    tags: [{ label: "Advanced Pattern", variant: "tag-pattern" }],
    skillLevel: "Advanced",
  },
  {
    key: "ops-offsets",
    title: "Ops: Offsets & Replays",
    description:
      "Offset stores, safe rewind, idempotency, and resync drills when things go sideways.",
    href: "ops-offsets/",
    tags: [{ label: "Ops", variant: "tag-ops" }],
    skillLevel: "Intermediate",
  },
  {
    key: "observability",
    title: "Observability Basics",
    description:
      "Golden signals (lag, throughput, error rate), alerting, and minimal dashboards to keep.",
    href: "observability/",
    tags: [{ label: "Ops", variant: "tag-ops" }],
    skillLevel: "Intermediate",
  },
  {
    key: "non-relational",
    title: "CDC Beyond Relational Databases",
    description:
      "MongoDB change streams, DynamoDB Streams, and Cassandra CDC — and where each one breaks the WAL/binlog mental model.",
    href: "non-relational/",
    tags: [
      { label: "Core Concept", variant: "tag-concept" },
      { label: "Strategy", variant: "tag-strategy" },
    ],
    skillLevel: "Intermediate",
  },
  {
    key: "security",
    title: "Security, PII & Access Control",
    description:
      "Mask columns before they reach the broker, size the privileges CDC actually needs, and plan for a log that outlives the row.",
    href: "security/",
    tags: [
      { label: "Ops", variant: "tag-ops" },
      { label: "Strategy", variant: "tag-strategy" },
    ],
    skillLevel: "Intermediate",
  },
  {
    key: "reconciliation-surgery",
    title: "Reconciliation & Offset Surgery",
    description:
      "Repair out-of-sync sinks and safely reset offsets. SQL diff patterns, checksum verification, and Kafka Connect REST API offset operations.",
    href: "reconciliation-surgery/",
    tags: [
      { label: "Advanced Pattern", variant: "tag-pattern" },
      { label: "Ops", variant: "tag-ops" },
    ],
    skillLevel: "Advanced",
  },
  {
    key: "use-cases",
    title: "Real-World Use Cases",
    description:
      "Explore practical applications of CDC, from real-time analytics to cache invalidation.",
    href: "use-cases/",
    tags: [{ label: "Core Concept", variant: "tag-concept" }],
    skillLevel: "Beginner",
  },
  {
    key: "strategy",
    title: "The Strategic Value of CDC",
    description:
      "Understand the business case and philosophical shift behind adopting an event-driven data culture.",
    href: "strategy/",
    tags: [{ label: "Strategy", variant: "tag-strategy" }],
    skillLevel: "Beginner",
  },
  {
    key: "tooling",
    title: "The CDC Ecosystem",
    description:
      "A curated overview of the most popular open-source and commercial tools in the landscape (Debezium, Fivetran, etc).",
    href: "tooling/",
    tags: [{ label: "Tooling", variant: "tag-tooling" }],
    skillLevel: "Beginner",
  },
  {
    key: "case-study",
    title: "Real-World Case Study",
    description:
      "Follow a mid-sized e-commerce company's journey from batch ETL to real-time CDC, including architecture decisions, implementation challenges, and business outcomes.",
    href: "case-study/",
    ctaLabel: "Read the Case Study",
    isRecommended: true,
    badge: { label: "Featured", variant: "recommended" },
    tags: [{ label: "Strategy", variant: "tag-strategy" }],
    skillLevel: "Intermediate",
  },
  {
    key: "lab-kafka-debezium",
    title: "Hands-On Lab: Kafka + Debezium + Sinks",
    description:
      "Stand up Kafka, Connect, Postgres source & sink with guided copy-paste commands. Includes upsert patterns and schema evolution.",
    href: "lab-kafka-debezium/",
    ctaLabel: "Start the Lab",
    tags: [{ label: "Lab", variant: "tag-labs" }],
    skillLevel: "Intermediate",
  },
  {
    key: "quickstarts",
    title: "Quickstarts",
    description:
      "Pick your source database and follow a 10–20 minute setup with checks and commands.",
    href: "quickstarts/",
    ctaLabel: "View Quickstarts",
    tags: [{ label: "Lab", variant: "tag-labs" }],
    skillLevel: "Beginner",
  },
  {
    key: "tests",
    title: "Acceptance Tests",
    description:
      "Run shell scripts that confirm your lab stack is up, the connector is healthy, and events keep flowing after restarts.",
    href: "tests/",
    ctaLabel: "Verify Your Stack",
    tags: [{ label: "Lab", variant: "tag-labs" }],
    skillLevel: "Intermediate",
  },
  {
    key: "failure-drills",
    title: "Failure Scenario Drills",
    description:
      "Hands-on drills to build troubleshooting fluency: backpressure, DLQ handling, schema drift, and offset replays.",
    href: "troubleshooting/failure-drills/",
    ctaLabel: "Start Drills",
    tags: [{ label: "Lab", variant: "tag-labs" }],
    skillLevel: "Advanced",
  },
  {
    key: "cloud-labs",
    title: "Cloud CDC Labs",
    description:
      "End-to-end CDC implementations with cloud-native platforms: AWS DMS, Snowflake, and Matillion.",
    href: "cloud-labs/",
    ctaLabel: "Explore Cloud Labs",
    tags: [{ label: "Lab", variant: "tag-labs" }],
    skillLevel: "Intermediate",
  },
  {
    key: "connector-builder",
    title: "Connector Config Builder",
    description:
      "Generate Debezium configs for Postgres, MySQL, or Oracle in minutes.",
    href: "connector-builder/",
    ctaLabel: "Launch the Builder",
    tags: [{ label: "Tooling", variant: "tag-tooling" }],
    skillLevel: "Intermediate",
  },
  {
    key: "dlq-triage",
    title: "DLQ Triage Assistant",
    description:
      "Guided commands and playbooks for decoding and re-driving Kafka DLQ events.",
    href: "dlq-triage/",
    ctaLabel: "Try the Assistant",
    tags: [{ label: "Extras", variant: "tag-extras" }],
    skillLevel: "Advanced",
  },
  {
    key: "debezium-decoder",
    title: "Debezium Event Decoder",
    description:
      "Paste Kafka events to get before/after diffs and MERGE-ready SQL templates.",
    href: "debezium-decoder/",
    ctaLabel: "Decode an Event",
    tags: [{ label: "Extras", variant: "tag-extras" }],
    skillLevel: "Intermediate",
  },
  {
    key: "errata",
    title: "Nuances & Errata",
    description:
      "Corrections, caveats, and sharp edges across CDC: effectively-once vs exactly-once, snapshots & replays, tombstones/compaction, schema evolution, and ops guardrails.",
    href: "errata/",
    ctaLabel: "See nuances",
    tags: [{ label: "Extras", variant: "tag-extras" }],
    skillLevel: "Advanced",
  },
];
