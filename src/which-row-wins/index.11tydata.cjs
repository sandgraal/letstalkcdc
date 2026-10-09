module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "which-row-wins",
  heroConfig: {
    title: "Which Row Wins in Your Target",
    description:
      "<p>Delivery is at-least-once, so the target decides which version of a row survives. Map the source log position and the delete marker onto the ordering and delete controls of six common targets.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      {
        href: "#at-a-glance",
        label: "See the six targets",
        variant: "primary",
      },
      { href: "#monday", label: "What to do Monday", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "which-row-wins-quiz",
    title: "Which Row Wins Knowledge Check",
    description:
      "Test whether you can tell a safe ordering key from a tempting one.",
    questions: [
      {
        question:
          "BigQuery CDC ingestion receives two UPSERTs for one key and no _CHANGE_SEQUENCE_NUMBER. Which one wins?",
        options: [
          "The one with the higher source LSN",
          "The one most recently ingested by BigQuery",
          "The one with the larger ts_ms",
          "BigQuery rejects the second write",
        ],
        correct: "2",
        explanation:
          "Without a user-supplied ordering key, BigQuery orders records with the same primary key by the system time at which each was ingested. A replayed older change therefore overwrites a newer row. Supplying the source log position as _CHANGE_SEQUENCE_NUMBER makes the larger position win, and only a tie falls back to ingestion time.",
      },
      {
        question:
          "Why should the ordering column be the source log position rather than a timestamp?",
        options: [
          "Timestamps cannot be stored in a sink",
          "Several changes to one key can share a timestamp and clocks disagree, while the log position says which change committed later",
          "Log positions are always smaller numbers",
          "Targets only accept integer ordering columns",
        ],
        correct: "2",
        explanation:
          "A millisecond timestamp can tie for one key, can be skewed between hosts, and on a replay may describe when the connector processed the event. The log position increases in commit order for a key within one source log lineage, so a replay carries the position it had the first time.",
      },
      {
        question:
          "A pipeline physically deletes a row on a delete event. Later a replayed, older update for that key arrives. What can happen?",
        options: [
          "Nothing, the target remembers the delete",
          "The update finds no row, is treated as new and brings the row back",
          "The target raises an error and stops",
          "The update is silently dropped by Kafka",
        ],
        correct: "2",
        explanation:
          "A physical delete removes the version along with the row, so nothing is left to compare against. Keep a delete marker (a deleted flag plus the delete's position), or rely on a target feature that keeps the delete long enough, and know how long that is.",
      },
      {
        question:
          "Debezium offers an opt-in exactly-once mode for Kafka Connect source connectors. What does it let you claim?",
        options: [
          "Exactly-once from the database to every downstream target",
          "Exactly-once delivery into Kafka for that hop only, so the sink still needs idempotent writes",
          "Nothing, it is not documented",
          "That ordering by timestamp is now safe",
        ],
        correct: "2",
        explanation:
          "The mode covers the source-connector hop into Kafka, needs Kafka Connect 3.3.0 or later in distributed mode, and Debezium itself notes open questions about the underlying transaction implementation. A warehouse or lakehouse is a separate system, so correctness there still comes from an idempotent sink.",
      },
    ],
  },
};
