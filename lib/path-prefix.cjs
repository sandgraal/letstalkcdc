const normalizePathPrefix = (prefix) => {
  if (!prefix || prefix === "/") {
    return "/";
  }

  const trimmed = prefix.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
};

const deriveRepositoryPathPrefix = () => {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    return "/";
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return "/";
  }

  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return "/";
  }

  return `/${name}/`;
};

const getPathPrefix = () => {
  if (typeof process.env.ELEVENTY_PATH_PREFIX === "string" && process.env.ELEVENTY_PATH_PREFIX.length > 0) {
    return normalizePathPrefix(process.env.ELEVENTY_PATH_PREFIX);
  }

  return normalizePathPrefix(deriveRepositoryPathPrefix());
};

const getPathPrefixForHost = (prefix) => {
  if (!prefix || prefix === "/") {
    return "";
  }

  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
};

module.exports = {
  deriveRepositoryPathPrefix,
  getPathPrefix,
  getPathPrefixForHost,
  normalizePathPrefix,
};
