const path = require('path');

const toFileUrl = (...segments) => {
  const filePath = path.resolve(process.cwd(), 'dist', ...segments);
  return `file://${filePath}`;
};

module.exports = {
  defaults: {
    standard: 'WCAG2AA',
    wait: 1000,
    timeout: 30000,
    chromeLaunchConfig: {
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    }
  },
  urls: [
    toFileUrl('index.html'),
    toFileUrl('overview', 'index.html'),
    toFileUrl('intro', 'index.html'),
    toFileUrl('multi-tenancy', 'index.html'),
    toFileUrl('use-cases', 'index.html'),
    toFileUrl('quickstarts', 'index.html'),
    toFileUrl('partitioning', 'index.html'),
    toFileUrl('exactly-once', 'index.html')
  ]
};
