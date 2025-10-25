const rawPrefix = window.__PATH_PREFIX__ ?? '';
const normalized = typeof rawPrefix === 'string' && rawPrefix.length > 0 ? rawPrefix : '';

const withBasePath = (path) => {
  if (!path) return normalized;
  if (normalized && path.startsWith('/')) {
    return `${normalized}${path}`;
  }
  if (normalized && !path.startsWith('/')) {
    return `${normalized}/${path}`;
  }
  return path;
};

export { normalized as pathPrefix, withBasePath };
