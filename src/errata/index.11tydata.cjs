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
  }
};
