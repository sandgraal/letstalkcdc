#!/usr/bin/env node
// scripts/deployment-verify.mjs
// Post-deployment verification for GitHub Pages
// Tests both root and subdirectory deployments

import https from "https";
import http from "http";

const CONFIG = {
  // Test both deployment scenarios
  deployments: [
    {
      name: "GitHub Pages (Project)",
      baseUrl: process.env.SITE_HOST || "https://letstalkcdc.github.io",
      pathPrefix: process.env.ELEVENTY_PATH_PREFIX || "/letstalkcdc",
      timeout: 10000,
    },
    {
      name: "GitHub Pages (Root)",
      baseUrl: "https://sandgraal.github.io",
      pathPrefix: "",
      timeout: 10000,
    },
  ],

  // Critical pages to verify
  criticalPaths: [
    "/",
    "/intro/",
    "/overview/",
    "/quickstarts/",
    "/search-index.json",
    "/sitemap.xml",
    "/robots.txt",
  ],

  // Expected response times (ms)
  performance: {
    maxResponseTime: 3000,
    targetResponseTime: 1000,
  },
};

class DeploymentVerifier {
  constructor(deployment) {
    this.deployment = deployment;
    this.results = { passed: 0, failed: 0, warnings: 0, tests: [] };
  }

  async fetch(path) {
    const url = `${this.deployment.baseUrl}${this.deployment.pathPrefix}${path}`;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const protocol = url.startsWith("https") ? https : http;
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout after ${this.deployment.timeout}ms`));
      }, this.deployment.timeout);

      protocol
        .get(url, (res) => {
          clearTimeout(timeout);

          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            const duration = Date.now() - startTime;
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data,
              duration,
              url,
            });
          });
        })
        .on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });
  }

  async testPath(path, expectedStatus = 200) {
    const testName = `${path} (${expectedStatus})`;

    try {
      const response = await this.fetch(path);

      // Check status code
      if (response.statusCode !== expectedStatus) {
        this.recordFailure(
          testName,
          `Expected ${expectedStatus}, got ${response.statusCode}`,
        );
        return false;
      }

      // Check response time
      if (response.duration > CONFIG.performance.maxResponseTime) {
        this.recordWarning(testName, `Slow response: ${response.duration}ms`);
      } else if (response.duration > CONFIG.performance.targetResponseTime) {
        this.recordWarning(
          testName,
          `Response time: ${response.duration}ms (target: ${CONFIG.performance.targetResponseTime}ms)`,
        );
      }

      // Check content type for HTML pages
      if (path.endsWith("/") || path.endsWith(".html")) {
        const contentType = response.headers["content-type"] || "";
        if (!contentType.includes("text/html")) {
          this.recordWarning(
            testName,
            `Unexpected content-type: ${contentType}`,
          );
        }
      }

      // Check for basic HTML structure
      if (path.endsWith("/") && expectedStatus === 200) {
        if (!response.body.includes("<!DOCTYPE html>")) {
          this.recordFailure(testName, "Missing DOCTYPE");
          return false;
        }
        if (!response.body.includes("<title>")) {
          this.recordFailure(testName, "Missing <title>");
          return false;
        }
      }

      // Check JSON validity
      if (path.endsWith(".json")) {
        try {
          JSON.parse(response.body);
        } catch (err) {
          this.recordFailure(testName, `Invalid JSON: ${err.message}`);
          return false;
        }
      }

      // Check XML validity (basic)
      if (path.endsWith(".xml")) {
        if (!response.body.includes("<?xml")) {
          this.recordFailure(testName, "Missing XML declaration");
          return false;
        }
      }

      this.recordSuccess(testName, `${response.duration}ms`);
      return true;
    } catch (err) {
      this.recordFailure(testName, err.message);
      return false;
    }
  }

  async testPathPrefixHandling() {
    const testName = "Path prefix handling";

    try {
      // Test that internal links use correct prefix
      const response = await this.fetch("/");

      if (this.deployment.pathPrefix) {
        // Should contain prefixed links
        const hasCorrectLinks =
          response.body.includes(`href="${this.deployment.pathPrefix}/`) ||
          response.body.includes(`href="${this.deployment.pathPrefix}#`);

        const hasWrongLinks =
          response.body.includes('href="/intro/"') &&
          !response.body.includes(
            `href="${this.deployment.pathPrefix}/intro/"`,
          );

        if (hasWrongLinks) {
          this.recordFailure(testName, "Found un-prefixed internal links");
          return false;
        }

        if (!hasCorrectLinks) {
          this.recordWarning(
            testName,
            "Could not verify prefixed links (may be using url filter correctly)",
          );
        }
      }

      this.recordSuccess(testName);
      return true;
    } catch (err) {
      this.recordFailure(testName, err.message);
      return false;
    }
  }

  async testSecurityHeaders() {
    const testName = "Security headers";

    try {
      const response = await this.fetch("/");
      const headers = response.headers;

      const securityHeaders = {
        "x-content-type-options": "nosniff",
        "x-frame-options": ["DENY", "SAMEORIGIN"],
      };

      let hasIssues = false;

      for (const [header, expected] of Object.entries(securityHeaders)) {
        const value = headers[header];
        if (!value) {
          this.recordWarning(testName, `Missing header: ${header}`);
          hasIssues = true;
        } else if (Array.isArray(expected)) {
          if (!expected.includes(value.toUpperCase())) {
            this.recordWarning(
              testName,
              `${header}: expected one of [${expected.join(
                ", ",
              )}], got ${value}`,
            );
            hasIssues = true;
          }
        } else if (value !== expected) {
          this.recordWarning(
            testName,
            `${header}: expected ${expected}, got ${value}`,
          );
          hasIssues = true;
        }
      }

      if (!hasIssues) {
        this.recordSuccess(testName);
      }

      return true;
    } catch (err) {
      this.recordWarning(testName, err.message);
      return false;
    }
  }

  recordSuccess(testName, details = "") {
    this.results.passed++;
    this.results.tests.push({
      name: testName,
      status: "passed",
      details,
    });
  }

  recordFailure(testName, reason) {
    this.results.failed++;
    this.results.tests.push({
      name: testName,
      status: "failed",
      reason,
    });
  }

  recordWarning(testName, message) {
    this.results.warnings++;
    this.results.tests.push({
      name: testName,
      status: "warning",
      message,
    });
  }

  async runTests() {
    console.log(`\n🔍 Verifying: ${this.deployment.name}`);
    console.log(
      `   URL: ${this.deployment.baseUrl}${this.deployment.pathPrefix}`,
    );
    console.log("─".repeat(60));

    // Test critical paths
    for (const path of CONFIG.criticalPaths) {
      await this.testPath(path);
    }

    // Test path prefix handling
    await this.testPathPrefixHandling();

    // Test security headers (warnings only)
    await this.testSecurityHeaders();

    return this.results;
  }

  printResults() {
    console.log("\n" + "═".repeat(60));

    this.results.tests.forEach((test) => {
      let icon, color;
      if (test.status === "passed") {
        icon = "✓";
        color = "\x1b[32m"; // Green
      } else if (test.status === "warning") {
        icon = "⚠";
        color = "\x1b[33m"; // Yellow
      } else {
        icon = "✗";
        color = "\x1b[31m"; // Red
      }

      const reset = "\x1b[0m";
      const message = test.details || test.message || test.reason || "";

      console.log(
        `${color}${icon}${reset} ${test.name}${message ? ` - ${message}` : ""}`,
      );
    });

    console.log("\n" + "─".repeat(60));
    console.log(`✓ Passed: ${this.results.passed}`);
    if (this.results.warnings > 0) {
      console.log(`⚠ Warnings: ${this.results.warnings}`);
    }
    if (this.results.failed > 0) {
      console.log(`✗ Failed: ${this.results.failed}`);
    }
    console.log("═".repeat(60));
  }
}

async function main() {
  console.log("\n📡 GitHub Pages Deployment Verification");
  console.log("Testing both root and subdirectory deployments...\n");

  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  for (const deployment of CONFIG.deployments) {
    const verifier = new DeploymentVerifier(deployment);
    const results = await verifier.runTests();
    verifier.printResults();

    totalPassed += results.passed;
    totalFailed += results.failed;
    totalWarnings += results.warnings;
  }

  console.log("\n" + "═".repeat(60));
  console.log("📊 Overall Summary");
  console.log("─".repeat(60));
  console.log(`✓ Total Passed: ${totalPassed}`);
  if (totalWarnings > 0) {
    console.log(`⚠ Total Warnings: ${totalWarnings}`);
  }
  if (totalFailed > 0) {
    console.log(`✗ Total Failed: ${totalFailed}`);
  }
  console.log("═".repeat(60) + "\n");

  if (totalFailed > 0) {
    console.error("❌ Deployment verification failed!");
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log("⚠️  Deployment verification passed with warnings");
    process.exit(0);
  } else {
    console.log("✅ Deployment verification passed!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err);
  process.exit(1);
});
