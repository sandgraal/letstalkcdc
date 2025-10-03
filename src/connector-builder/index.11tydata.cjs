module.exports = {
  heroConfig: {
    title: 'Connector Config Builder',
    description: '<p>Generate Debezium connector configs for Postgres, MySQL, or Oracle. Pick your version, set filters and DLQ options, then copy or curl straight to Kafka Connect.</p>',
    align: 'left',
    actions: [
      { href: '#builder-inputs', label: 'Choose a Source' },
      { href: '#builder-preview', label: 'Preview & Copy', variant: 'ghost' }
    ]
  }
};
