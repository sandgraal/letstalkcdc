module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "sql-server-mysql-cdc",
  heroConfig: {
    title: "SQL Server & MySQL CDC: Positions, Retention and What Breaks",
    description:
      "<p>The Postgres slot runbook, for the other two engines. Where the log position lives in MySQL and SQL Server, how long it stays readable, what happens when it is purged, and what the sink must do with the duplicates a restart brings.</p>",
    align: "center",
    skillLevel: "Intermediate",
    actions: [
      { href: "#positions", label: "See the positions", variant: "primary" },
      {
        href: "#mysql-runbook",
        label: "MySQL runbook",
        variant: "ghost",
      },
      {
        href: "#sqlserver-runbook",
        label: "SQL Server runbook",
        variant: "ghost",
      },
    ],
  },
  quizConfig: {
    id: "sqlserver-mysql-quiz",
    title: "SQL Server and MySQL Knowledge Check",
    description:
      "Four questions on who holds the position, how long it stays readable, and what the sink guard compares.",
    questions: [
      {
        question:
          "A Debezium MySQL connector has been stopped for 40 days and binlog_expire_logs_seconds is at its default. What do you expect on restart?",
        options: [
          "It resumes: the server keeps the binlog files a disconnected consumer still needs",
          "It cannot resume from its stored position, because the default is 30 days and purged files are not held for a disconnected consumer; it fails, and the way back is a re-snapshot",
          "It skips ahead to the newest binlog position and carries on without error",
          "It resumes, because binlog_row_image=FULL pins the files",
        ],
        correct: "2",
        explanation:
          "MySQL does not hold binlog files for a consumer that is not connected. The default expiration is 2592000 seconds (30 days), and purged files cannot be read again. Debezium's snapshot reference says the connector then fails with an error saying a new snapshot is required, unless snapshot.mode is when_needed. Skipping ahead silently would lose changes, which is why you should not reposition the connector past the gap.",
      },
      {
        question:
          "On SQL Server, which tuple lets a sink tell two changes from one transaction apart and order them?",
        options: [
          "commit_lsn alone",
          "ts_ms, then the Kafka offset",
          "(commit_lsn, change_lsn, event_serial_no)",
          "The capture instance name",
        ],
        correct: "3",
        explanation:
          "commit_lsn is shared by every change in a transaction, so on its own it ties. change_lsn separates the changes, and event_serial_no separates events that share a position (for example the two events of a primary-key update). A timestamp and a Kafka offset are not source log positions.",
      },
      {
        question:
          "The SQL Server CDC cleanup job is at its defaults and your connector has been down for four days. What is the risk?",
        options: [
          "None: the cleanup job waits for the connector",
          "The capture job stops, so the transaction log fills",
          "The connector's stored commit LSN can now be below the low end of the capture instance's validity interval, so the changes in between are gone and a re-snapshot is needed",
          "The capture instance is dropped and must be recreated",
        ],
        correct: "3",
        explanation:
          "The cleanup job knows nothing about your connector. By default it keeps change rows for 4320 minutes (3 days), measured from the latest captured commit time, and it removes the older rows. A position older than the low endpoint is outside the validity interval. Raise retention with sys.sp_cdc_change_job before an outage, not after.",
      },
      {
        question:
          "After a restart, the same MySQL change reaches the sink twice. What makes that harmless?",
        options: [
          "MySQL guarantees each row event is sent once",
          "A sink keyed by primary key that applies a change only when its (binlog file number, position, row index) is newer than the stored one, within one source lineage",
          "Ordering the sink by the event timestamp",
          "A GTID, because GTIDs make delivery exactly-once",
        ],
        correct: "2",
        explanation:
          "Offsets are committed periodically, so a restart re-sends changes. Delivery is at-least-once and the sink has to be idempotent: key by primary key and compare log positions as a typed tuple, never a timestamp. A GTID names a transaction on one server; it does not order the rows inside it, and it does not make delivery exactly-once.",
      },
    ],
  },
};
