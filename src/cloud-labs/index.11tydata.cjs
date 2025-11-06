const { getPathPrefix } = require('../../lib/path-prefix.cjs');

const pathPrefix = getPathPrefix().replace(/\/$/, ''); // Remove trailing slash

module.exports = {
  heroConfig: {
    title: 'Cloud CDC Labs',
    description: '<p>Hands-on labs for implementing CDC with cloud-native and commercial platforms like AWS DMS, Snowflake, and Matillion.</p>',
    align: 'center',
    actions: [
      { href: '/', label: 'Back to Home', variant: 'ghost' }
    ]
  },
  head_extra: `<link rel="stylesheet" href="${pathPrefix}/assets/css/pages/cloud-labs.css">`
};
