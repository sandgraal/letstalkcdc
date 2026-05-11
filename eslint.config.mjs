import js from "@eslint/js";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";

/**
 * ESLint flat configuration for Let's Talk CDC.
 *
 * Uses ESLint v9+ flat config format with:
 * - Recommended rules as baseline
 * - Prettier integration (disables formatting rules)
 * - Separate configs for Node.js (build) and browser (client) code
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 */
export default [
  // ── Global ignores ──────────────────────────────────────────────
  {
    ignores: [
      "_site/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      ".lighthouseci/**",
      "handoff/**",
      "sandbox/**",
    ],
  },

  // ── Base recommended rules ──────────────────────────────────────
  js.configs.recommended,

  // ── Node.js files (build scripts, configs, data, agents) ───────
  {
    files: [
      "*.mjs",
      "*.cjs",
      "*.js",
      "lib/**/*.mjs",
      "scripts/**/*.{js,mjs}",
      "src/_data/**/*.mjs",
      "src/**/*.cjs",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-useless-assignment": "warn",
    },
  },

  // ── CommonJS Node.js files ─────────────────────────────────────
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-useless-assignment": "warn",
    },
  },

  // ── Browser JavaScript (client-side modules) ───────────────────
  {
    files: [
      "src/assets/js/**/*.js",
      "src/js/**/*.js",
      "src/scripts/**/*.js",
      "scripts/progress.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        CDC_MODULES: "readonly",
        CDC_JOURNEY_SLUG: "readonly",
        showToast: "writable",
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "debug", "log"] }],
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "multi-line"],
    },
  },

  // ── Test files ─────────────────────────────────────────────────
  {
    files: ["tests/**/*.{js,mjs}", "tests/**/*.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        // Vitest globals
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // ── Prettier compat (must be last) ─────────────────────────────
  prettierConfig,
];
