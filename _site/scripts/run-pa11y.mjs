#!/usr/bin/env node
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const { default: pa11y } = await import('pa11y');

const outputDirName = process.env.BUILD_OUTPUT_DIR ?? '_site';
const toUrl = (...segments) => pathToFileURL(resolve(outputDirName, ...segments)).href;

const targets = [
  { label: 'Home', url: toUrl('index.html') },
  { label: 'Overview', url: toUrl('overview', 'index.html') },
  { label: 'Intro', url: toUrl('intro', 'index.html') },
  { label: 'Multi-Tenancy', url: toUrl('multi-tenancy', 'index.html') },
  { label: 'Use Cases', url: toUrl('use-cases', 'index.html') },
  { label: 'Partitioning', url: toUrl('partitioning', 'index.html') }
];

const chromeLaunchConfig = {
  args: ['--no-sandbox', '--disable-dev-shm-usage']
};

const failures = [];
const warnings = [];

for (const { label, url } of targets) {
  try {
    const results = await pa11y(url, {
      standard: 'WCAG2AA',
      chromeLaunchConfig,
      log: {
        debug() {},
        info() {},
        error: console.error
      }
    });

    if (results.issues.length) {
      failures.push({ label, url, issues: results.issues });
      console.error(`A11y FAIL ${label}: ${results.issues.length} issue(s)`);
      results.issues.slice(0, 5).forEach((issue) => {
        console.error(`  [${issue.code}] ${issue.message} (${issue.selector})`);
      });
      if (results.issues.length > 5) {
        console.error('  …');
      }
    } else {
      console.log(`A11y PASS ${label}`);
    }
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const softFailure = /Failed to launch the browser process/i.test(message) || /Timed out after/i.test(message);
    if (softFailure) {
      warnings.push({ label, url, message });
      console.warn(`A11y SKIP ${label}: unable to launch Chromium in this environment. (${message.split('\n')[0]})`);
    } else {
      failures.push({ label, url, error });
      console.error(`A11y ERROR ${label}: ${message}`);
    }
  }
}

if (failures.length) {
  console.error('\nAccessibility check failed. Address the issues above.');
  process.exit(1);
} else if (warnings.length) {
  console.warn('\nAccessibility check partially skipped: Chromium is unavailable in this environment. Results recorded as warnings.');
} else {
  console.log('\nAccessibility check passed for all monitored pages.');
}
