module.exports = {
  seriesKey: 'observability',
  heroConfig: {
    title: 'Observability Basics',
    description:
      '<p>Instrument your CDC platform with lag, throughput, error, and saturation signals so incidents are caught before consumers notice.</p>',
    align: 'center',
    actions: [
      { href: '#dashboards', label: 'Build Dashboards', variant: 'primary' },
      { href: '#slo', label: 'Define SLOs', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "observability-quiz",
    title: "Observability Knowledge Check",
    description: "Test your understanding of CDC monitoring, alerting, and operational metrics.",
    questions: [
      {
        question: "What are the 'golden signals' of observability for a CDC pipeline?",
        options: [
          "CPU, memory, disk, and network",
          "Lag, throughput, error rate, and saturation",
          "Number of tables, rows, columns, and indexes",
          "There is no standard set of golden signals"
        ],
        correct: "2",
        explanation: "The golden signals for CDC are: Lag (how far behind consumers are), Throughput (events per second), Error Rate (failures, retries), and Saturation (resource utilization). These metrics provide a holistic view of pipeline health and help detect issues before they impact downstream systems."
      },
      {
        question: "Why is consumer lag a critical metric in CDC?",
        options: [
          "Lag indicates how far behind real-time the consumer is, affecting data freshness",
          "Lag only matters for batch systems",
          "Lower lag always means better performance",
          "Lag is not related to CDC health"
        ],
        correct: "1",
        explanation: "Consumer lag measures the delay between when an event is produced and when it's consumed. High lag indicates consumers can't keep up with production rate, leading to stale data in downstream systems. Monitoring lag helps detect performance issues, resource constraints, or failures early."
      },
      {
        question: "What should you alert on to catch CDC pipeline failures quickly?",
        options: [
          "Alert on every single metric change",
          "Alert on sustained high lag, elevated error rates, connector status changes, and source/sink unavailability",
          "Never use alerts, just check dashboards daily",
          "Alerts are only for network issues"
        ],
        correct: "2",
        explanation: "Effective alerting focuses on actionable signals: lag exceeding SLO thresholds, error rate spikes, connector state transitions (running → failed), database or sink unavailability. Avoid alert fatigue by setting meaningful thresholds and grouping related alerts to catch real issues without overwhelming operators."
      },
      {
        question: "What is an SLO (Service Level Objective) in CDC?",
        options: [
          "A detailed implementation plan",
          "A target level of reliability or performance (e.g., 'p99 lag < 5 seconds')",
          "The cost of running the pipeline",
          "SLOs are not applicable to CDC"
        ],
        correct: "2",
        explanation: "An SLO is a measurable target for service quality, such as 'p99 consumer lag must be < 5 seconds' or '99.9% of events processed without errors.' SLOs guide monitoring, alerting, and capacity planning. They help teams balance reliability investments against business needs and communicate expectations to stakeholders."
      },
      {
        question: "Why should you monitor database replication lag (source-side) separately from CDC consumer lag?",
        options: [
          "They measure the same thing",
          "Source replication lag affects when changes appear in the transaction log; CDC consumer lag measures processing delay after that",
          "Only consumer lag matters",
          "Database lag is not a real metric"
        ],
        correct: "2",
        explanation: "Source replication lag (e.g., read replica lag) affects when changes become visible in the transaction log that CDC reads. CDC consumer lag measures the delay in processing those changes. Both contribute to end-to-end latency. Monitoring both helps isolate whether delays originate at the source database or in the CDC pipeline itself."
      }
    ]
  }
};
