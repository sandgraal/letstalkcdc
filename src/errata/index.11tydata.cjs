module.exports = {
  seriesKey: 'errata',
  heroConfig: {
    title: 'CDC Nuances & Errata',
    description: '<p>Bookmark the gotchas: delivery guarantees, snapshots, and backfills all hide sharp edges. Use this checklist before declaring “exactly once.”</p>',
    align: 'left',
    actions: [
      { href: '#exactly-once', label: 'Delivery Caveats' },
      { href: '#snapshots', label: 'Snapshot + Replay Notes', variant: 'ghost' }
    ]
  },
  resourceLinks: [
    {
      href: '/downloads/compose.yaml',
      label: 'compose.yaml',
      description: 'Docker stack for Kafka, Connect, and Postgres used throughout the labs.',
      download: true
    },
    {
      href: '/downloads/postgres-inventory.json',
      label: 'postgres sample connector',
      description: 'Prebuilt Debezium connector config targeting the inventory database.',
      download: true
    },
    {
      href: '/downloads/register_connector.sh',
      label: 'register connector script',
      description: 'Helper script that PUTs the sample connector config to Kafka Connect.',
      download: true
    }
  ]
};
