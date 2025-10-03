module.exports = {
  heroConfig: {
    title: 'Series Overview',
    description: `
      <p>Change Data Capture marks a fundamental evolution in data integration, moving away from the latent, resource-intensive world of batch processing and into the dynamic paradigm of real-time streaming. By capturing individual data changes as they occur, CDC provides a mechanism to keep disparate systems synchronized with minimal impact and sub-second latency. This technology is a strategic enabler, unlocking real-time analytics and forming the backbone of resilient, modern data architectures.</p>
      <p>Start with the fundamentals. Understand what Change Data Capture is and why it’s a cornerstone of modern data architecture through real-world use cases.</p>
    `,
    align: 'center'
  },
  seriesCards: [
    {
      title: 'Interactive Introduction to CDC',
      description: 'An interactive dashboard covering core concepts, methods, architectures, and the tooling ecosystem.',
      href: '/intro/',
      ctaLabel: 'Dive In!',
      isRecommended: true,
      badge: { label: 'Start Here', variant: 'recommended' },
      tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
    },
    {
      title: 'Event Envelope &amp; Delivery Guarantees',
      description: 'Keys vs payload, before/after images, tombstones; ALO vs EOS scope and per-key ordering.',
      state: 'disabled',
      tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
    },
    {
      title: 'Materialization 101 (Upsert/Delete)',
      description: 'Practical MERGE patterns for upserts &amp; deletes; compaction vs history tables; late-arrivals 101.',
      state: 'disabled',
      tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
    },
    {
      title: 'Snapshotting: The First Sync',
      description: 'Learn how CDC pipelines perform the initial, consistent snapshot of a database before streaming live changes.',
      href: '/snapshotting/',
      tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
    },
    {
      title: 'Exactly‑Once Semantics',
      description: 'Visual walkthrough of ALO vs EOS + transactional outbox.',
      href: '/exactly-once/',
      tags: [ { label: 'Advanced Pattern', variant: 'tag-pattern' } ]
    },
    {
      title: 'Multi‑Tenancy',
      description: 'Isolation patterns, topic math, and rough egress estimates.',
      href: '/multi-tenancy/',
      tags: [ { label: 'Advanced Pattern', variant: 'tag-pattern' } ]
    },
    {
      title: 'Partitioning',
      description: 'Partition keys, skew, late‑arrivals, and audit loops.',
      href: '/partitioning/',
      tags: [ { label: 'Advanced Pattern', variant: 'tag-pattern' } ]
    },
    {
      title: 'Schema Evolution',
      description: 'Handle schema changes gracefully with forward/backward compatibility and schema registries.',
      href: '/schema-evolution/',
      tags: [ { label: 'Advanced Pattern', variant: 'tag-pattern' } ]
    },
    {
      title: 'Ops: Offsets &amp; Replays',
      description: 'Offset stores, safe rewind, idempotency, and resync drills when things go sideways.',
      state: 'disabled',
      tags: [ { label: 'Ops', variant: 'tag-ops' } ]
    },
    {
      title: 'Observability Basics',
      description: 'Golden signals (lag, throughput, error rate), alerting, and minimal dashboards to keep.',
      state: 'disabled',
      tags: [ { label: 'Ops', variant: 'tag-ops' } ]
    },
    {
      title: 'Real-World Use Cases',
      description: 'Explore practical applications of CDC, from real-time analytics to cache invalidation.',
      href: '/use-cases/',
      tags: [ { label: 'Core Concept', variant: 'tag-concept' } ]
    },
    {
      title: 'The Strategic Value of CDC',
      description: 'Understand the business case and philosophical shift behind adopting an event-driven data culture.',
      href: '/strategy/',
      tags: [ { label: 'Strategy', variant: 'tag-strategy' } ]
    },
    {
      title: 'The CDC Ecosystem',
      description: 'A curated overview of the most popular open-source and commercial tools in the landscape (Debezium, Fivetran, etc).',
      href: '/tooling/',
      tags: [ { label: 'Tooling', variant: 'tag-tooling' } ]
    },
    {
      title: 'Connector Config Builder',
      description: 'Generate Debezium configs for Postgres, MySQL, or Oracle in minutes.',
      href: '/connector-builder/',
      ctaLabel: 'Launch the Builder',
      tags: [ { label: 'Tooling', variant: 'tag-tooling' } ]
    },
    {
      title: 'DLQ Triage Assistant',
      description: 'Guided commands and playbooks for decoding and re-driving Kafka DLQ events.',
      href: '/dlq-triage/',
      ctaLabel: 'Try the Assistant',
      tags: [ { label: 'Extras', variant: 'tag-extras' } ]
    },
    {
      title: 'Debezium Event Decoder',
      description: 'Paste Kafka events to get before/after diffs and MERGE-ready SQL templates.',
      href: '/debezium-decoder/',
      ctaLabel: 'Decode an Event',
      tags: [ { label: 'Extras', variant: 'tag-extras' } ]
    },
    {
      title: 'Hands-On Lab: Kafka + Debezium',
      description: 'Stand up Kafka, Connect, and Postgres locally with guided copy-paste commands.',
      href: '/lab-kafka-debezium/',
      ctaLabel: 'Start the Lab',
      tags: [ { label: 'Lab', variant: 'tag-labs' } ]
    },
    {
      title: 'Quickstarts',
      description: 'Pick your source database and follow a 10–20 minute setup with checks and commands.',
      href: '/quickstarts/',
      ctaLabel: 'View Quickstarts',
      tags: [ { label: 'Lab', variant: 'tag-labs' } ]
    }
  ]
};
