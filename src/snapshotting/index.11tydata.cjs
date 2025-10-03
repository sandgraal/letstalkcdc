module.exports = {
  seriesKey: 'snapshotting',
  heroConfig: {
    title: 'The First Hurdle: Snapshotting',
    description:
      '<p>Initial loads are where most CDC rollouts stumble. Follow this guided playbook to capture a consistent snapshot, hold the boundary, and merge the stream without gaps.</p>',
    align: 'center',
    actions: [
      { href: '#playbook', label: 'Start the Playbook', variant: 'primary' },
      { href: '#perdb', label: 'Skip to DB Recipes', variant: 'ghost' }
    ]
  }
};
