module.exports = {
  seriesKey: 'event-envelope',
  heroConfig: {
    title: 'Design the Event Envelope',
    description:
      '<p>Learn how CDC tools package change events, why before/after images matter, and how delivery guarantees shape your downstream processing.</p>',
    align: 'center',
    skillLevel: 'Beginner',
    actions: [
      { href: '#anatomy', label: 'See Event Anatomy', variant: 'primary' },
      { href: '#schema', label: 'Lock Schema Contract', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "event-envelope-quiz",
    title: "Event Envelope Knowledge Check",
    description: "Test your understanding of CDC event structure and delivery guarantees.",
    questions: [
      {
        question: "What is the purpose of the 'before' and 'after' fields in a CDC event envelope?",
        options: [
          "They store the timestamp before and after processing",
          "They capture the row state before the change and the new state after the change",
          "They indicate the order of events in the stream",
          "They are used only for delete operations"
        ],
        correct: "2",
        explanation: "The 'before' and 'after' fields capture the complete row state before and after the change. This allows consumers to see exactly what changed, implement custom diffing logic, or reconstruct the full state without querying the source database."
      },
      {
        question: "What does 'at-least-once' (ALO) delivery guarantee mean in CDC?",
        options: [
          "Each event is delivered exactly one time, never more",
          "Events may be delivered multiple times, so consumers must handle duplicates",
          "Events are delivered in random order",
          "Only the most recent event is delivered"
        ],
        correct: "2",
        explanation: "At-least-once delivery means events may be redelivered due to retries, failures, or replays. Consumers must implement idempotency (using unique keys or timestamps) to handle duplicate processing gracefully."
      },
      {
        question: "What is a tombstone event in CDC?",
        options: [
          "An event that signals the end of a transaction",
          "A special event with a null value used to indicate a deleted record for compacted topics",
          "An error event when CDC fails to capture a change",
          "The first event in a snapshot"
        ],
        correct: "2",
        explanation: "A tombstone is a special event where the value is null but the key remains. In Kafka compacted topics, tombstones signal that a record should be removed from the compacted view, allowing proper handling of deletes while maintaining log compaction semantics."
      },
      {
        question: "Why is per-key ordering important in CDC streams?",
        options: [
          "It ensures events for the same entity are processed in the correct sequence",
          "It makes the stream faster",
          "It reduces storage requirements",
          "It eliminates the need for timestamps"
        ],
        correct: "1",
        explanation: "Per-key ordering guarantees that all events for the same entity (identified by the key) are processed in order. This prevents race conditions where an update might be processed before an insert, or a delete before an update, which would corrupt the downstream state."
      },
      {
        question: "What information does the 'source' metadata in a CDC event typically include?",
        options: [
          "The consumer's IP address and client ID",
          "Database name, table name, and log position (LSN/SCN)",
          "The CDC tool's version number",
          "The size of the event in bytes"
        ],
        correct: "2",
        explanation: "The source metadata includes critical information about the origin of the change: which database, which table, and the log position (LSN for PostgreSQL, SCN for Oracle, etc.). This enables tracking, debugging, and offset management for replays or reconciliation."
      }
    ]
  }
};
