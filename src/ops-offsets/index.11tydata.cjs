module.exports = {
  seriesKey: 'ops-offsets',
  heroConfig: {
    title: 'Ops Playbook: Offsets & Replays',
    description:
      '<p>Keep change streams healthy by protecting offset stores, practicing safe rewinds, and rehearsing replay drills.</p>',
    align: 'center',
    skillLevel: 'Intermediate',
    actions: [
      { href: '#checklist', label: 'View Ops Checklist', variant: 'primary' },
      { href: '#automation', label: 'Automate Replays', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "ops-offsets-quiz",
    title: "Offsets & Replays Knowledge Check",
    description: "Test your understanding of offset management and safe replay procedures.",
    questions: [
      {
        question: "What is a consumer offset in Kafka-based CDC?",
        options: [
          "The size of the message in bytes",
          "A pointer indicating the last message a consumer successfully processed",
          "The number of partitions in a topic",
          "The time a message was produced"
        ],
        correct: "2",
        explanation: "A consumer offset is a numerical pointer to the last message position a consumer successfully processed in a partition. By storing offsets, Kafka knows where each consumer is in the log, enabling resume after failures, preventing duplicate processing (in most cases), and supporting replays from specific points."
      },
      {
        question: "Why is it dangerous to reset offsets to an arbitrary position without proper safeguards?",
        options: [
          "It's always safe to reset offsets",
          "Resetting offsets can cause reprocessing of old data, leading to duplicates, or skipping data, causing gaps",
          "Offsets cannot be reset once set",
          "Offset resets have no effect on consumers"
        ],
        correct: "2",
        explanation: "Resetting offsets to an earlier position causes reprocessing (potentially creating duplicates if consumers aren't idempotent). Resetting forward skips data, creating gaps. Without careful planning—knowing the log retention, sink state, and idempotency design—offset surgery can corrupt downstream systems."
      },
      {
        question: "What is the purpose of log retention in Kafka?",
        options: [
          "To automatically delete all messages after one day",
          "To determine how long messages are kept before being eligible for deletion",
          "To store consumer offsets permanently",
          "Log retention doesn't affect CDC pipelines"
        ],
        correct: "2",
        explanation: "Log retention defines how long Kafka retains messages before they're deleted (time-based) or compacted (size/key-based). This determines the maximum replay window: if retention is 7 days, you can only replay events from the past 7 days. Proper retention settings are critical for disaster recovery and replay scenarios."
      },
      {
        question: "When should you consider replaying CDC events?",
        options: [
          "Replays are never necessary",
          "When recovering from data corruption, sink failures, or testing schema changes in a downstream system",
          "Every day as a routine operation",
          "Only when the database is offline"
        ],
        correct: "2",
        explanation: "Replays are used to recover from failures (e.g., sink crashed and lost data), fix bugs (reprocess with corrected logic), test changes (validate a new schema or transformation), or rebuild a new downstream system from historical changes. Replays must be coordinated carefully to avoid inconsistencies."
      },
      {
        question: "What is idempotency, and why is it critical for safe replays?",
        options: [
          "Idempotency means messages are always processed in order",
          "Idempotency means reprocessing the same message multiple times produces the same result",
          "Idempotency prevents all message duplication",
          "Idempotency is not important for CDC"
        ],
        correct: "2",
        explanation: "Idempotent operations produce the same outcome when applied multiple times. In CDC, if a replay causes duplicate processing (which is common), idempotent sinks (using UPSERT, natural keys, or deduplication logic) ensure replays don't corrupt data. Without idempotency, replays can create duplicate rows or incorrect state."
      }
    ]
  }
};
