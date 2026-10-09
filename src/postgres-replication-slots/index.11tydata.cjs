module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "postgres-replication-slots",
  heroConfig: {
    title: "Postgres Replication Slots & WAL Growth",
    description:
      "<p>A runbook for the page you get when a Postgres disk fills and a CDC connector is on the other end of a replication slot: what to check, what each fix costs, and what the pipeline owes you afterwards.</p>",
    align: "center",
    skillLevel: "Intermediate",
    actions: [
      { href: "#triage", label: "Check your slots", variant: "primary" },
      {
        href: "#decision",
        label: "Jump to the decision table",
        variant: "ghost",
      },
    ],
  },
  quizConfig: {
    id: "replication-slots-quiz",
    title: "Replication Slots Knowledge Check",
    description:
      "Four questions on what a slot holds, what caps it, and what recovery owes the sink.",
    questions: [
      {
        question:
          "A connector has been stopped for two days. What does the primary do with the WAL written meanwhile?",
        options: [
          "Recycles it at the next checkpoint, because nothing is reading it",
          "Keeps only the WAL for the captured tables",
          "Keeps it from the slot's restart_lsn onward, even with no connection, until the slot advances, is dropped, or is invalidated by a limit",
          "Archives it and removes it once wal_keep_size is reached",
        ],
        correct: "3",
        explanation:
          "A slot persists across crashes and knows nothing about its consumer. The server keeps every WAL file from restart_lsn onward until the slot moves forward, is dropped, or is invalidated by max_slot_wal_keep_size. A publication filters what is sent, not how much WAL is kept, and wal_keep_size is a separate setting for physical standbys.",
      },
      {
        question:
          "Which setting caps how much WAL replication slots are allowed to retain?",
        options: [
          "max_slot_wal_keep_size (default -1, which means unlimited)",
          "wal_keep_size",
          "max_wal_size",
          "heartbeat.interval.ms",
        ],
        correct: "1",
        explanation:
          "max_slot_wal_keep_size is the cap for slots. wal_keep_size is a minimum kept for standbys, max_wal_size is a soft limit that drives checkpoints, and heartbeat.interval.ms is a Debezium setting that helps the connector confirm positions, not a Postgres limit.",
      },
      {
        question:
          "A slot shows wal_status = 'lost'. What is the safe recovery?",
        options: [
          "Restart the connector; it resumes from its stored offset",
          "Drop the slot, let the connector recreate it, and keep the stored offset",
          "Raise max_slot_wal_keep_size and wait for the slot to recover",
          "Stop the connector, drop the slot, discard the old offset, re-snapshot into an idempotent sink, then reconcile",
        ],
        correct: "4",
        explanation:
          "A lost slot cannot be used again, and the WAL it needed is gone. A new slot only sees changes from its own creation point, so keeping the old offset can skip changes silently. Re-snapshot into a sink that is keyed by primary key and ordered by log position, then reconcile, because a snapshot cannot tell you which rows were deleted while the slot was lost.",
      },
      {
        question:
          "After a restart, the same change reaches the sink twice. What makes that harmless?",
        options: [
          "Postgres guarantees each change is sent once",
          "A sink keyed by primary key that applies a change only when its log position is newer than the stored one",
          "Ordering the sink by the event timestamp",
          "A heartbeat that fires before the restart",
        ],
        correct: "2",
        explanation:
          "The slot confirms what the connector received, not what the sink applied, and a slot's position can move back after a crash. Delivery is at-least-once, so the sink has to be idempotent: key by primary key, order by log position, never by a timestamp.",
      },
    ],
  },
};
