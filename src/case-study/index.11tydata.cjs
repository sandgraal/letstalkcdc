module.exports = {
  seriesKey: 'case-study',
  heroConfig: {
    title: 'Real-World Case Study: E-Commerce CDC Pipeline',
    description: '<p>Follow a realistic CDC implementation journey: from slow batch ETL to real-time analytics. Learn how decision points, trade-offs, and practical challenges shape production deployments.</p>',
    align: 'center',
    skillLevel: 'Intermediate',
    actions: [
      { href: '#context', label: 'The Business Problem' },
      { href: '#architecture', label: 'Solution Architecture', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "case-study-quiz",
    title: "Case Study Knowledge Check",
    description: "Test your understanding of real-world CDC implementation patterns and lessons learned.",
    questions: [
      {
        question: "What is a common trigger for organizations to migrate from batch ETL to CDC?",
        options: [
          "CDC is always the first choice for new companies",
          "Business pressure for real-time insights, competitive disadvantage from stale data, or operational pain from batch job failures",
          "Batch ETL always works perfectly and never needs replacement",
          "CDC is only for startups"
        ],
        correct: "2",
        explanation: "Organizations typically adopt CDC when: (1) business units demand real-time dashboards and can't wait for nightly ETL, (2) competitors are gaining advantage with fresher data, (3) batch jobs are failing frequently, missing SLAs, or overwhelming source databases, or (4) scaling batch processes becomes economically unfeasible."
      },
      {
        question: "In a typical CDC implementation, what is a key decision point when choosing between push and pull patterns?",
        options: [
          "Push and pull patterns are identical",
          "Push (database triggers) is simpler but adds source load; pull (log-based CDC) is more complex but less intrusive",
          "Only push patterns are viable in production",
          "This decision doesn't affect the implementation"
        ],
        correct: "2",
        explanation: "Push patterns (triggers, application-level outbox) are easier to implement but add load and complexity to the source database. Pull patterns (log-based CDC like Debezium) are more complex to set up but have minimal source impact and capture all changes transparently. The choice depends on source database capabilities, performance constraints, and operational expertise."
      },
      {
        question: "What lesson is commonly learned during the initial snapshot phase of a CDC rollout?",
        options: [
          "Snapshots are always instant and never cause issues",
          "Snapshots can take hours or days, require careful log retention settings, and benefit from chunking large tables",
          "Snapshots are not necessary in CDC",
          "All data should be deleted before starting a snapshot"
        ],
        correct: "2",
        explanation: "The initial snapshot is often underestimated. Large tables can take days to snapshot, during which transaction logs must be retained. Teams learn to: (1) set adequate log retention before starting, (2) chunk/paginate large tables to reduce memory pressure, (3) snapshot during low-traffic windows, and (4) test the snapshot-to-stream handoff thoroughly."
      },
      {
        question: "What is a typical challenge when integrating CDC into existing data warehouse architectures?",
        options: [
          "Data warehouses always accept CDC events without modification",
          "Warehouses designed for batch loads may need schema changes, MERGE support, or new ETL logic to handle incremental CDC streams",
          "CDC cannot integrate with data warehouses",
          "No challenges exist when integrating CDC"
        ],
        correct: "2",
        explanation: "Data warehouses optimized for batch loads (append-only, full refreshes) may need refactoring: adding MERGE/UPSERT support, changing to SCD Type 2 for history tracking, handling late-arriving events, or building reconciliation jobs. Transformations that assumed complete snapshots must adapt to incremental changes, requiring pipeline redesign."
      },
      {
        question: "What operational lesson is often learned after deploying CDC to production?",
        options: [
          "CDC systems never need monitoring",
          "Monitoring lag, error rates, and offset health is critical; operational runbooks and replay procedures must be established",
          "CDC systems run themselves without human intervention",
          "Operational concerns are not important"
        ],
        correct: "2",
        explanation: "Post-deployment, teams learn that CDC is not 'set and forget.' Critical operational practices include: monitoring consumer lag and error rates, setting up alerting, documenting offset reset procedures, practicing replay drills, maintaining log retention policies, and establishing runbooks for common failures. Operational maturity is as important as the initial implementation."
      }
    ]
  }
};
