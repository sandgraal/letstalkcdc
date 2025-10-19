module.exports = {
  seriesKey: 'ops-offsets',
  heroConfig: {
    title: 'Ops Playbook: Offsets & Replays',
    description:
      '<p>Keep change streams healthy by protecting offset stores, practicing safe rewinds, and rehearsing replay drills.</p>',
    align: 'center',
    actions: [
      { href: '#checklist', label: 'View Ops Checklist', variant: 'primary' },
      { href: '#automation', label: 'Automate Replays', variant: 'ghost' }
    ]
  }
};
