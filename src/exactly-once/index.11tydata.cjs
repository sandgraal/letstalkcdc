module.exports = {
  datePublished: "2026-02-06",
  dateModified: "2026-10-09",
  seriesKey: "exactly-once",
  schemaType: "TechArticle",
  schemaAbout: [
    "Change Data Capture",
    "Exactly-Once Semantics",
    "Idempotency",
    "Transactional Outbox",
    "Data Engineering",
  ],
  heroConfig: {
    title: "Exactly-Once Processing, For Real",
    description:
      "<p>Cut through marketing myths. See which hops of a CDC pipeline can be exactly-once, which cannot, and how to build sinks that behave idempotently under failure.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      { href: "#at-least-once", label: "See the Failure Mode" },
      { href: "#demo", label: "Run the Interactive Demo", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "exactly-once-quiz",
    title: "Exactly-Once Semantics Knowledge Check",
    description:
      "Test your understanding of EOS delivery guarantees and the transactional outbox pattern.",
    questions: [
      {
        question:
          "What does 'exactly-once semantics' (EOS) truly guarantee in distributed systems?",
        options: [
          "Every message is physically delivered only once across the entire system",
          "The observable effect is as-if each message was processed exactly once, even if retries occur",
          "Messages are never duplicated or lost under any circumstances",
          "EOS is only a marketing term and no real system offers it on any hop",
        ],
        correct: "2",
        explanation:
          "True EOS means the observable effect is as-if each message was processed exactly once, even if the underlying system has retries or duplicates. This is typically achieved through idempotent operations, transactions, or unique identifiers that prevent duplicate effects, not by preventing duplicate delivery.",
      },
      {
        question:
          "What is the primary purpose of the Transactional Outbox pattern?",
        options: [
          "To improve database query performance",
          "To ensure events are published atomically with database changes in the same transaction",
          "To compress event payloads",
          "To route events to multiple topics",
        ],
        correct: "2",
        explanation:
          "The Transactional Outbox pattern solves the dual-write problem by writing business data and events to an outbox table within the same database transaction. A separate process then reads and publishes from the outbox, ensuring that if the transaction commits, the event will eventually be published—guaranteeing atomicity.",
      },
      {
        question:
          "Why is achieving true end-to-end exactly-once semantics challenging in CDC pipelines?",
        options: [
          "CDC tools don't support EOS",
          "It requires coordination across multiple independent systems (database, message broker, sink)",
          "Databases can't provide transactional guarantees",
          "EOS is trivial and always works out-of-the-box",
        ],
        correct: "2",
        explanation:
          "End-to-end EOS requires all components in the chain—source database, CDC capture, message broker, and sink—to participate in coordinated transactions or idempotent protocols. Since these are independent systems with different guarantees, the hops can be exactly-once only individually (for example Kafka to Kafka, or an opt-in Kafka Connect source), not as one guarantee from the source database to the destination.",
      },
      {
        question:
          "How does Kafka Streams achieve exactly-once semantics within Kafka?",
        options: [
          "By preventing all message duplication",
          "Using transactional producers and idempotent writes, coordinated with consumer offsets",
          "By always using a single partition",
          "Through manual deduplication in application code",
        ],
        correct: "2",
        explanation:
          "Kafka Streams achieves EOS by using transactional producers that atomically commit processed records and consumer offsets together. Combined with idempotent producers (that eliminate duplicate sends), this ensures each input message affects state exactly once, even across failures and retries.",
      },
      {
        question:
          "What do you rely on for a hop that can't be exactly-once delivery, such as writing into an external sink?",
        options: [
          "Give up and accept data corruption",
          "Implement idempotent operations so duplicate processing is safe",
          "Use only batch processing",
          "Disable all retries",
        ],
        correct: "2",
        explanation:
          "When true EOS isn't feasible, designing idempotent operations is the practical solution. Using natural keys, MERGE/UPSERT operations, or 'insert if not exists' logic ensures that reprocessing the same event multiple times produces the same final state, making at-least-once delivery safe and effective.",
      },
    ],
  },
};
