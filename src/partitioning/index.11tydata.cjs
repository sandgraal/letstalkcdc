module.exports = {
  seriesKey: "partitioning",
  heroConfig: {
    title: "Partitioning & Reconciliation",
    description:
      "<p>Design Kafka topics that preserve per-entity ordering, tame skew, and make late arrivals safe with watermarks and versioning.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      { href: "#ordering", label: "Respect Ordering" },
      { href: "#key-choice", label: "Pick Partition Keys", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "partitioning-quiz",
    title: "Partitioning Knowledge Check",
    description:
      "Test your understanding of partition key selection and ordering guarantees.",
    questions: [
      {
        question: "Why is choosing the right partition key critical in CDC?",
        options: [
          "It determines which broker stores the data",
          "It ensures all events for the same entity are routed to the same partition, preserving order",
          "It controls the compression algorithm",
          "Partition keys are optional and don't affect functionality",
        ],
        correct: "2",
        explanation:
          "The partition key determines which partition an event is written to. Since Kafka only guarantees ordering within a partition, using the entity's primary key (e.g., order_id, user_id) as the partition key ensures all changes for that entity are ordered correctly, preventing race conditions in downstream consumers.",
      },
      {
        question: "What is partition skew, and why is it a problem?",
        options: [
          "When all partitions have exactly the same data",
          "When some partitions receive disproportionately more data than others, causing hotspots",
          "When partitions are stored on different disks",
          "Skew is not a real problem in production systems",
        ],
        correct: "2",
        explanation:
          "Partition skew occurs when data is unevenly distributed across partitions, often due to poor key selection (e.g., using a tenant ID when one tenant dominates traffic). This creates hotspots—overloading some partitions/brokers while others sit idle—leading to reduced throughput, increased latency, and consumer lag.",
      },
      {
        question: "What is a 'late-arriving' event in CDC?",
        options: [
          "An event that arrives after the topic is deleted",
          "An event that arrives out of chronological order due to delays or retries",
          "An event that is always corrupted",
          "Events can never arrive late in CDC",
        ],
        correct: "2",
        explanation:
          "Late-arriving events occur when network delays, retries, multi-partition reads, or replays cause an older event to arrive after a newer one. Without proper handling (timestamps, watermarks, or versioning), consumers might apply changes out of order, corrupting state (e.g., overwriting new data with old).",
      },
      {
        question:
          "How can you mitigate partition skew caused by a single hot key?",
        options: [
          "Delete the partition with the hot key",
          "Use a composite key with additional entropy (e.g., append a sub-ID) or implement key salting",
          "Reduce the number of partitions",
          "Partition skew cannot be mitigated",
        ],
        correct: "2",
        explanation:
          "If a single entity generates massive traffic (e.g., a celebrity user_id), you can use a composite key that adds entropy (user_id + session_id) or implement key salting (appending a hash suffix). This spreads load across partitions while maintaining ordering within the composite key or requiring consumers to reassemble order.",
      },
      {
        question: "What is an audit loop in the context of CDC partitioning?",
        options: [
          "A process that manually reviews all events",
          "A background job that periodically reconciles source and sink to detect missing or out-of-order events",
          "A performance optimization technique",
          "Audit loops are only used in batch systems",
        ],
        correct: "2",
        explanation:
          "An audit loop (or reconciliation job) compares the source database with the downstream sink to detect discrepancies—missing events, late arrivals, or out-of-order updates. This provides a safety net, catching issues that might slip through the streaming pipeline due to partitioning challenges or failures.",
      },
    ],
  },
};
