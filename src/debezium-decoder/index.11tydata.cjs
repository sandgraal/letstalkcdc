module.exports = {
  seriesKey: 'debezium-decoder',
  heroConfig: {
    title: 'Debezium Event Decoder',
    description: '<p>Paste Kafka records to inspect op/source metadata, compare before vs after payloads, and generate ready-to-tweak MERGE templates. Runs entirely in your browser.</p>',
    align: 'left',
    actions: [
      { href: '#decoder-input', label: 'Paste Events' },
      { href: '#decoder-results', label: 'Review Output', variant: 'ghost' }
    ]
  }
};
