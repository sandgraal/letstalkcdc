module.exports = {
  seriesKey: 'materialization',
  heroConfig: {
    title: 'Materialization 101',
    description:
      '<p>Master the merge logic that turns change events into durable, queryable tables across warehouses, lakes, and caches.</p>',
    align: 'center',
    skillLevel: 'Intermediate',
    actions: [
      { href: '#patterns', label: 'Compare Patterns', variant: 'primary' },
      { href: '#quality', label: 'Ship Quality Gates', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "materialization-quiz",
    title: "Materialization Knowledge Check",
    description: "Test your understanding of upsert patterns and materialization strategies.",
    questions: [
      {
        question: "What is the purpose of a MERGE statement in CDC materialization?",
        options: [
          "To combine multiple tables into one",
          "To apply inserts, updates, and deletes in a single atomic operation",
          "To compress data for storage",
          "To validate event schemas"
        ],
        correct: "2",
        explanation: "The MERGE statement (or UPSERT) allows you to apply CDC events atomically: if a row with the key exists, update it; if not, insert it. Many platforms also support DELETE operations within MERGE. This single operation ensures consistency and simplifies sink logic."
      },
      {
        question: "What is the difference between a 'current state' table and a 'history' table in CDC materialization?",
        options: [
          "Current state shows only the latest row version; history preserves all versions over time",
          "History tables are always slower to query",
          "Current state tables don't use primary keys",
          "There is no meaningful difference"
        ],
        correct: "1",
        explanation: "A current state (or snapshot) table holds only the most recent version of each row, updated via upserts and deletes. A history table appends every change as a new row, often with timestamps or sequence numbers, enabling time-travel queries and full audit trails."
      },
      {
        question: "Why is idempotency important when materializing CDC events?",
        options: [
          "It makes queries faster",
          "It ensures replaying or reprocessing the same event produces the same result",
          "It reduces network bandwidth",
          "It's only needed for batch processing"
        ],
        correct: "2",
        explanation: "With at-least-once delivery, events can be processed multiple times due to retries or replays. Idempotent operations (like MERGE or INSERT ... ON CONFLICT) ensure that reprocessing the same event doesn't corrupt data or cause duplicates, maintaining data integrity."
      },
      {
        question: "What is log compaction in Kafka, and how does it relate to CDC materialization?",
        options: [
          "It removes all old events after a time threshold",
          "It retains only the latest value for each key, effectively creating a changelog table",
          "It compresses events to save storage",
          "It sorts events by timestamp"
        ],
        correct: "2",
        explanation: "Log compaction in Kafka retains only the most recent message for each key, discarding older versions. This creates a changelog table that mirrors the current state of the source. Consumers can rebuild the full current state by replaying the compacted log, making it ideal for CDC materialization."
      },
      {
        question: "What challenge does handling 'late-arriving' events present in CDC materialization?",
        options: [
          "Late events always arrive corrupted",
          "Events may arrive out of order, requiring logic to reconcile older changes against newer state",
          "Late events can't be processed at all",
          "Late events only affect batch systems, not streaming"
        ],
        correct: "2",
        explanation: "Late-arriving events occur when network delays, retries, or multi-partition ordering cause older events to arrive after newer ones. Materialization logic must handle this by checking timestamps or sequence numbers, potentially discarding stale updates or triggering reconciliation to maintain correctness."
      }
    ]
  }
};
