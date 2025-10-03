module.exports = [
  {
    key: 'intro',
    title: 'Interactive Introduction to CDC',
    description: 'An interactive dashboard covering core concepts, methods, architectures, and the tooling ecosystem.',
    href: '/intro/',
    ctaLabel: 'Dive In!',
    isRecommended: true,
    badge: { label: 'Start Here', variant: 'recommended' },
    tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
  },
  {
    key: 'event-envelope',
    title: 'Event Envelope & Delivery Guarantees',
    description: 'Keys vs payload, before/after images, tombstones; ALO vs EOS scope and per-key ordering.',
    state: 'disabled',
    tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
  },
  {
    key: 'materialization',
    title: 'Materialization 101 (Upsert/Delete)',
    description: 'Practical MERGE patterns for upserts & deletes; compaction vs history tables; late-arrivals 101.',
    state: 'disabled',
    tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
  },
  {
    key: 'snapshotting',
    title: 'Snapshotting: The First Sync',
    description: 'Learn how CDC pipelines perform the initial, consistent snapshot of a database before streaming live changes.',
    href: '/snapshotting/',
    tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
  },
  {
    key: 'exactly-once',
    title: 'Exactly-Once Semantics',
    description: 'Visual walkthrough of ALO vs EOS + transactional outbox.',
    href: '/exactly-once/',
    tags: [ { label: 'Advanced Pattern', variant: 'tag-pattern' } ]
  },
  {
    key: 'multi-tenancy',
    title: 'Multi-Tenancy',
    description: 'Isolation patterns, topic math, and rough egress estimates.',
    href: '/multi-tenancy/',
    tags: [ { label: 'Advanced Pattern', variant: 'tag-pattern' } ]
  },
  {
    key: 'partitioning',
    title: 'Partitioning',
    description: 'Partition keys, skew, late-arrivals, and audit loops.',
    href: '/partitioning/',
    tags: [ { label: 'Advanced Pattern', variant: 'tag-pattern' } ]
  },
  {
    key: 'schema-evolution',
    title: 'Schema Evolution',
    description: 'Handle schema changes gracefully with forward/backward compatibility and schema registries.',
    href: '/schema-evolution/',
    tags: [ { label: 'Advanced Pattern', variant: 'tag-pattern' } ]
  },
  {
    key: 'ops-offsets',
    title: 'Ops: Offsets & Replays',
    description: 'Offset stores, safe rewind, idempotency, and resync drills when things go sideways.',
    state: 'disabled',
    tags: [ { label: 'Ops', variant: 'tag-ops' } ]
  },
  {
    key: 'observability',
    title: 'Observability Basics',
    description: 'Golden signals (lag, throughput, error rate), alerting, and minimal dashboards to keep.',
    state: 'disabled',
    tags: [ { label: 'Ops', variant: 'tag-ops' } ]
  },
  {
    key: 'use-cases',
    title: 'Real-World Use Cases',
    description: 'Explore practical applications of CDC, from real-time analytics to cache invalidation.',
    href: '/use-cases/',
    tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
  },
  {
    key: 'strategy',
    title: 'The Strategic Value of CDC',
    description: 'Understand the business case and philosophical shift behind adopting an event-driven data culture.',
    href: '/strategy/',
    tags: [ { label: 'Strategy', variant: 'tag-strategy' } ]
  },
  {
    key: 'tooling',
    title: 'The CDC Ecosystem',
    description: 'A curated overview of the most popular open-source and commercial tools in the landscape (Debezium, Fivetran, etc).',
    href: '/tooling/',
    tags: [ { label: 'Tooling', variant: 'tag-tooling' } ]
  },
  {
    key: 'connector-builder',
    title: 'Connector Config Builder',
    description: 'Generate Debezium configs for Postgres, MySQL, or Oracle in minutes.',
    href: '/connector-builder/',
    ctaLabel: 'Launch the Builder',
    tags: [ { label: 'Tooling', variant: 'tag-tooling' } ]
  },
  {
    key: 'dlq-triage',
    title: 'DLQ Triage Assistant',
    description: 'Guided commands and playbooks for decoding and re-driving Kafka DLQ events.',
    href: '/dlq-triage/',
    ctaLabel: 'Try the Assistant',
    tags: [ { label: 'Extras', variant: 'tag-extras' } ]
  },
  {
    key: 'debezium-decoder',
    title: 'Debezium Event Decoder',
    description: 'Paste Kafka events to get before/after diffs and MERGE-ready SQL templates.',
    href: '/debezium-decoder/',
    ctaLabel: 'Decode an Event',
    tags: [ { label: 'Extras', variant: 'tag-extras' } ]
  },
  {
    key: 'lab-kafka-debezium',
    title: 'Hands-On Lab: Kafka + Debezium',
    description: 'Stand up Kafka, Connect, and Postgres locally with guided copy-paste commands.',
    href: '/lab-kafka-debezium/',
    ctaLabel: 'Start the Lab',
    tags: [ { label: 'Lab', variant: 'tag-labs' } ]
  },
  {
    key: 'quickstarts',
    title: 'Quickstarts',
    description: 'Pick your source database and follow a 10–20 minute setup with checks and commands.',
    href: '/quickstarts/',
    ctaLabel: 'View Quickstarts',
    tags: [ { label: 'Lab', variant: 'tag-labs' } ]
  },
  {
    key: 'tests',
    title: 'Acceptance Tests',
    description: 'Run shell scripts that confirm your lab stack is up, the connector is healthy, and events keep flowing after restarts.',
    href: '/tests/',
    ctaLabel: 'Verify Your Stack',
    tags: [ { label: 'Lab', variant: 'tag-labs' } ]
  },
  {
    key: 'errata',
    title: 'Nuances & Errata',
    description: 'Corrections, caveats, and sharp edges across CDC: effectively-once vs exactly-once, snapshots & replays, tombstones/compaction, schema evolution, and ops guardrails.',
    href: '/errata/',
    ctaLabel: 'See nuances',
    tags: [ { label: 'Extras', variant: 'tag-extras' } ]
  }
];
