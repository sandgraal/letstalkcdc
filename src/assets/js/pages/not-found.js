const redirectMap = {
  '/quickstart-postgres': '/quickstarts/quickstart-postgres/',
  '/quickstart-mysql': '/quickstarts/quickstart-mysql/',
  '/quickstart-oracle': '/quickstarts/quickstart-oracle/',
  '/oracle': '/oracle-notes/',
  '/quickstarts': '/everything-else/'
};

const path = (location.pathname || '').toLowerCase();
if (redirectMap[path]) {
  location.replace(redirectMap[path]);
}
