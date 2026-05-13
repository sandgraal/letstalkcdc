/**
 * Unit tests for lib/path-prefix.mjs.
 *
 * The module derives the GitHub-Pages path prefix two ways:
 *   1. From an explicit `ELEVENTY_PATH_PREFIX` env var.
 *   2. From `GITHUB_REPOSITORY` (the format `owner/name` GitHub injects
 *      into Actions runners).
 *
 * Cases 1/3 (env var explicit + missing env vars) were already exercised
 * end-to-end by the production deploy. This file adds explicit unit
 * coverage for case 2, including the `owner.github.io` root-deploy
 * branch which had no test.
 *
 * @module tests/unit/lib/path-prefix.test
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_PATH_PREFIX,
  deriveRepositoryPathPrefix,
  getPathPrefix,
  getPathPrefixForHost,
  normalizePathPrefix,
} from "../../../lib/path-prefix.mjs";

describe("lib/path-prefix.mjs", () => {
  // Capture the original values of just the env vars these tests
  // mutate. We avoid reassigning `process.env` itself — Node treats it
  // as a special object and other code (including the rest of the
  // vitest run) may hold references to it.
  const ENV_KEYS = ["ELEVENTY_PATH_PREFIX", "GITHUB_REPOSITORY"];
  const originalValues = Object.fromEntries(
    ENV_KEYS.map((k) => [k, process.env[k]]),
  );

  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalValues[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originalValues[k];
      }
    }
  });

  describe("normalizePathPrefix", () => {
    it("returns '/' for falsy or '/' input", () => {
      expect(normalizePathPrefix(undefined)).toBe("/");
      expect(normalizePathPrefix("")).toBe("/");
      expect(normalizePathPrefix("/")).toBe("/");
    });

    it("wraps a bare segment in slashes", () => {
      expect(normalizePathPrefix("letstalkcdc")).toBe("/letstalkcdc/");
    });

    it("strips leading and trailing slashes before re-wrapping", () => {
      expect(normalizePathPrefix("/letstalkcdc")).toBe("/letstalkcdc/");
      expect(normalizePathPrefix("letstalkcdc/")).toBe("/letstalkcdc/");
      expect(normalizePathPrefix("///letstalkcdc///")).toBe("/letstalkcdc/");
    });
  });

  describe("deriveRepositoryPathPrefix", () => {
    it("returns the default prefix when GITHUB_REPOSITORY is unset", () => {
      expect(deriveRepositoryPathPrefix()).toBe(DEFAULT_PATH_PREFIX);
    });

    it("returns '/' when the repo is the owner's user site (owner.github.io)", () => {
      process.env.GITHUB_REPOSITORY = "sandgraal/sandgraal.github.io";
      expect(deriveRepositoryPathPrefix()).toBe("/");
    });

    it("is case-insensitive about the owner.github.io match", () => {
      process.env.GITHUB_REPOSITORY = "SandGraal/SandGraal.github.io";
      expect(deriveRepositoryPathPrefix()).toBe("/");
    });

    it("returns '/<repo>/' for project-pages repos", () => {
      process.env.GITHUB_REPOSITORY = "sandgraal/letstalkcdc";
      expect(deriveRepositoryPathPrefix()).toBe("/letstalkcdc/");
    });

    it("falls back to the default when the repo string is malformed", () => {
      process.env.GITHUB_REPOSITORY = "nobody";
      expect(deriveRepositoryPathPrefix()).toBe(DEFAULT_PATH_PREFIX);
    });
  });

  describe("getPathPrefix", () => {
    it("prefers an explicit ELEVENTY_PATH_PREFIX over auto-derivation", () => {
      process.env.ELEVENTY_PATH_PREFIX = "/override";
      process.env.GITHUB_REPOSITORY = "sandgraal/letstalkcdc";
      expect(getPathPrefix()).toBe("/override/");
    });

    it("normalizes the explicit prefix (handles bare segment, missing slashes)", () => {
      process.env.ELEVENTY_PATH_PREFIX = "custom";
      expect(getPathPrefix()).toBe("/custom/");
    });

    it("falls back to the repo-derived prefix when no env override is set", () => {
      process.env.GITHUB_REPOSITORY = "sandgraal/letstalkcdc";
      expect(getPathPrefix()).toBe("/letstalkcdc/");
    });

    it("returns '/' for the owner.github.io root-deploy branch", () => {
      process.env.GITHUB_REPOSITORY = "sandgraal/sandgraal.github.io";
      expect(getPathPrefix()).toBe("/");
    });
  });

  describe("getPathPrefixForHost", () => {
    it("returns an empty string for the root prefix", () => {
      expect(getPathPrefixForHost("/")).toBe("");
      expect(getPathPrefixForHost("")).toBe("");
      expect(getPathPrefixForHost(undefined)).toBe("");
    });

    it("strips the trailing slash so it can be concatenated with a host", () => {
      expect(getPathPrefixForHost("/letstalkcdc/")).toBe("/letstalkcdc");
    });
  });
});
