module.exports = {
  seriesKey: 'snapshotting',
  heroConfig: {
    title: 'The First Hurdle: Snapshotting',
    description:
      '<p>Initial loads are where most CDC rollouts stumble. Follow this guided playbook to capture a consistent snapshot, hold the boundary, and merge the stream without gaps.</p>',
    align: 'center',
    skillLevel: 'Intermediate',
    actions: [
      { href: '#playbook', label: 'Start the Playbook', variant: 'primary' },
      { href: '#perdb', label: 'Skip to DB Recipes', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "snapshotting-quiz",
    title: "Snapshotting Knowledge Check",
    description: "Test your understanding of CDC snapshotting concepts and best practices.",
    questions: [
      {
        question: "What is the primary challenge when performing an initial snapshot in CDC?",
        options: [
          "Snapshots are always too slow",
          "Coordinating the snapshot with the log position to avoid gaps or duplicates",
          "Databases don't support snapshots",
          "Snapshots require shutting down the database"
        ],
        correct: "2",
        explanation: "The key challenge is coordinating the snapshot with the transaction log position (LSN/SCN) to ensure a clean handoff. The snapshot must capture the state at a specific point, and streaming must begin from exactly that point to avoid gaps or duplicate records."
      },
      {
        question: "What is a 'high-watermark' in the context of CDC snapshotting?",
        options: [
          "The maximum size of the snapshot file",
          "A log position (LSN/SCN) marking the boundary between snapshot and stream",
          "The highest number of rows in a table",
          "The peak memory usage during snapshotting"
        ],
        correct: "2",
        explanation: "The high-watermark is a specific log position (LSN for PostgreSQL, SCN for Oracle, etc.) that marks the boundary. All changes up to this point are included in the snapshot, and streaming begins from this position forward. This ensures no data is lost or duplicated during the handoff."
      },
      {
        question: "Why is it important to set log retention before starting a snapshot?",
        options: [
          "To make the snapshot faster",
          "To ensure logs aren't purged while the snapshot is running",
          "Logs are automatically disabled during snapshots",
          "Log retention doesn't affect snapshots"
        ],
        correct: "2",
        explanation: "If the snapshot takes hours or days, the database might purge old transaction logs before the snapshot completes. Setting adequate log retention ensures that when streaming starts from the high-watermark, all necessary log entries are still available."
      },
      {
        question: "What is the recommended approach for snapshotting very large tables?",
        options: [
          "Always snapshot the entire table at once",
          "Skip large tables entirely",
          "Use chunking/pagination to split the snapshot into smaller batches",
          "Wait until the table becomes smaller"
        ],
        correct: "3",
        explanation: "For large tables, chunking (reading in batches based on primary key ranges) reduces memory pressure, allows progress to be saved incrementally, and respects production database workloads. This approach also enables parallelization and retry of failed chunks."
      },
      {
        question: "What happens after the snapshot completes in a well-designed CDC pipeline?",
        options: [
          "The pipeline stops and waits for manual intervention",
          "The connector begins streaming changes from the high-watermark position",
          "All data is re-snapshotted to verify accuracy",
          "The database logs are deleted"
        ],
        correct: "2",
        explanation: "After the snapshot completes, the CDC connector seamlessly transitions to streaming mode, reading changes from the transaction log starting at the high-watermark position. This creates a continuous flow of data without gaps, combining the snapshot with real-time changes."
      }
    ]
  }
};
