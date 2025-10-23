import { pathPrefix, withBasePath } from '../utils/path-prefix.js';

const redirectMap = new Map([
  ['/quickstart-postgres', '/quickstarts/quickstart-postgres/'],
  ['/quickstart-mysql', '/quickstarts/quickstart-mysql/'],
  ['/quickstart-oracle', '/quickstarts/quickstart-oracle/'],
  ['/oracle', '/oracle-notes/'],
  ['/quickstarts', '/quickstarts/']
]);

const stripTrailingSlash = (value) => {
  if (!value || value === '/') return value || '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const rawPath = (location.pathname || '').toLowerCase();
const normalizedPath = (() => {
  const withoutTrailing = stripTrailingSlash(rawPath);
  if (!pathPrefix) return withoutTrailing || '/';
  return withoutTrailing.startsWith(pathPrefix.toLowerCase())
    ? stripTrailingSlash(withoutTrailing.slice(pathPrefix.length)) || '/'
    : withoutTrailing || '/';
})();

const target = redirectMap.get(normalizedPath);
if (target) {
  location.replace(withBasePath(target));
}
