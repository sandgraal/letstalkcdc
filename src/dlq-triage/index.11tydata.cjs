module.exports = {
  seriesKey: 'dlq-triage',
  heroConfig: {
    title: 'DLQ Triage Assistant',
    description: '<p>Point this at your DLQ topic and connector name. Generate safe commands to inspect headers, unwrap payloads, and map errors to fixes.</p>',
    align: 'left',
    actions: [
      { href: '/overview/#series-dlq-triage', label: 'Back to Overview' },
      { href: '#dlq-inputs', label: 'Start Debugging', variant: 'ghost' }
    ]
  }
};
