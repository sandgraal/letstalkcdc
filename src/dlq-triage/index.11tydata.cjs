module.exports = {
  heroConfig: {
    title: 'DLQ Triage Assistant',
    description: '<p>Point this at your DLQ topic and connector name. Generate safe commands to inspect headers, unwrap payloads, and map errors to fixes.</p>',
    align: 'left',
    actions: [
      { href: '/everything-else/', label: 'Back to Extras' },
      { href: '#dlq-inputs', label: 'Start Debugging', variant: 'ghost' }
    ]
  }
};
