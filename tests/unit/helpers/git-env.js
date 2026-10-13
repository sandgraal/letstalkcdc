/**
 * An environment for tests that run real `git commit` or `git merge`.
 *
 * A CI runner has no git identity and no global config; a developer machine
 * usually has both, or lets git guess a name from the account. Tests that
 * inherited that would pass locally and fail on the runner (lesson L-002).
 * This environment is the runner's: no global or system config, never guess an
 * identity, and the test's own identity given explicitly.
 */
export const TEST_IDENTITY = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

export function hermeticGitEnv(extra = {}, base = process.env) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_CONFIG_")) delete env[key];
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "user.useConfigOnly",
    GIT_CONFIG_VALUE_0: "true",
    ...TEST_IDENTITY,
    ...extra,
  };
}
