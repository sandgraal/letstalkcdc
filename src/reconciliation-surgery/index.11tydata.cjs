module.exports = {
  datePublished: "2026-02-06",
  dateModified: "2026-02-06",
  seriesKey: "reconciliation-surgery",
  heroConfig: {
    title: "Reconciliation & Offset Surgery",
    description:
      "<p>Master the advanced techniques every CDC operator needs: repair out-of-sync sinks with SQL diffs, verify data integrity with checksums, and safely reset offsets using the Kafka Connect REST API.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      {
        href: "#when-reconciliation",
        label: "When to Reconcile",
        variant: "primary",
      },
      {
        href: "#offset-surgery",
        label: "Offset Surgery Guide",
        variant: "secondary",
      },
    ],
  },
  quizConfig: {
    id: "reconciliation-surgery-quiz",
    title: "Reconciliation & Offset Surgery Knowledge Check",
    description:
      "Test your understanding of data reconciliation and safe offset management.",
    questions: [
      {
        question: "What is data reconciliation in the context of CDC?",
        options: [
          "The process of deleting old data",
          "Comparing source and sink to detect and fix discrepancies (missing, incorrect, or stale records)",
          "A type of database index",
          "Reconciliation is only needed in batch ETL",
        ],
        correct: "2",
        explanation:
          "Reconciliation is the process of comparing the source database with downstream sinks to identify and fix data discrepancies—missing records, incorrect values, or out-of-order updates. It's a safety net that catches issues missed by the CDC pipeline due to failures, bugs, or operational errors.",
      },
      {
        question:
          "Why might you need to perform 'offset surgery' in a CDC pipeline?",
        options: [
          "Offset surgery is never needed",
          "To manually reset consumer offsets after data loss, corruption, or when skipping problematic events",
          "To improve query performance",
          "Offset surgery is only for deleting topics",
        ],
        correct: "2",
        explanation:
          "Offset surgery involves manually resetting consumer offsets to recover from failures (e.g., sink lost data, need to replay), skip poisonous messages that cause crashes, or reprocess a specific time range. It's a powerful but risky operation that requires careful planning and validation to avoid data corruption.",
      },
      {
        question: "What is a SQL diff pattern in CDC reconciliation?",
        options: [
          "A method to compare query results between source and sink to identify missing or mismatched rows",
          "A way to compress SQL queries",
          "A type of database migration tool",
          "SQL diffs are not used in CDC",
        ],
        correct: "1",
        explanation:
          "A SQL diff pattern compares datasets between source and sink using queries (e.g., EXCEPT, MINUS, or hash-based comparisons). This identifies rows that exist in one system but not the other, or rows with mismatched values. It's commonly used in audit loops to detect and repair CDC-related data drift.",
      },
      {
        question: "What is checksum verification, and why is it useful in CDC?",
        options: [
          "Checksums are used to encrypt data",
          "Checksums (hash values) allow quick comparison of large datasets to detect differences without transferring all data",
          "Checksums slow down CDC pipelines",
          "Checksums are only for file systems, not databases",
        ],
        correct: "2",
        explanation:
          "Checksum verification involves computing hash values (MD5, SHA, etc.) on rows or datasets in both source and sink. Matching checksums indicate identical data; mismatches reveal discrepancies. This is much faster than full data comparison, enabling efficient reconciliation of large tables without transferring entire datasets.",
      },
      {
        question:
          "How does the Kafka Connect REST API help with offset management?",
        options: [
          "It provides endpoints to view, update, or reset connector offsets programmatically",
          "It only shows broker metrics",
          "The REST API doesn't support offset operations",
          "Offsets can only be managed through config files",
        ],
        correct: "1",
        explanation:
          "The Kafka Connect REST API provides endpoints to inspect connector status, view current offsets, and even modify offsets (in newer versions). This enables automated or manual offset surgery—resetting a connector to replay from a specific LSN/SCN or skipping problematic log positions—without restarting the entire cluster.",
      },
    ],
  },
};
