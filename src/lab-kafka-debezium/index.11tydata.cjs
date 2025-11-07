module.exports = {
  seriesKey: 'lab-kafka-debezium',
  heroConfig: {
    title: 'Hands-On Lab: Kafka + Debezium + Postgres (with Sinks)',
    description: '<p>Spin up a fully working CDC stack with Docker Compose, configure Debezium source and JDBC sink connectors, and watch real-time changes flow end to end—from source database through Kafka to destination. No prior streaming ops experience required.</p>',
    align: 'center',
    skillLevel: 'Intermediate',
    actions: [
      { href: '#prereqs', label: 'Check Prerequisites' },
      { href: '#setup', label: 'Start Building', variant: 'ghost' }
    ]
  }
};
