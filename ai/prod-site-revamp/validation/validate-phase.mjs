#!/usr/bin/env node

/**
 * Validation Script for Prod-Site-Revamp
 * 
 * Runs automated checks to verify phase completion.
 * Usage: node ai/prod-site-revamp/validation/validate-phase.mjs <phase>
 * 
 * Example: node ai/prod-site-revamp/validation/validate-phase.mjs 1.1
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const PHASE = process.argv[2];

if (!PHASE) {
  console.error('❌ Error: Phase number required');
  console.error('Usage: node validate-phase.mjs <phase>');
  console.error('Example: node validate-phase.mjs 1.1');
  process.exit(1);
}

console.log(`\n🔍 Validating Phase ${PHASE}...\n`);

let failures = 0;

// Helper functions
function check(name, condition, errorMsg) {
  if (condition) {
    console.log(`✅ ${name}`);
    return true;
  } else {
    console.log(`❌ ${name}: ${errorMsg}`);
    failures++;
    return false;
  }
}

function exec(command, silent = true) {
  try {
    const output = execSync(command, { 
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit'
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function fileExists(path) {
  return existsSync(path);
}

function countFiles(dir, extension) {
  if (!existsSync(dir)) return 0;
  
  let count = 0;
  const walk = (directory) => {
    const files = readdirSync(directory);
    for (const file of files) {
      const filepath = join(directory, file);
      const stat = statSync(filepath);
      if (stat.isDirectory()) {
        walk(filepath);
      } else if (file.endsWith(extension)) {
        count++;
      }
    }
  };
  walk(dir);
  return count;
}

// Phase-specific validations
switch (PHASE) {
  case '1.1':
    validatePhase1_1();
    break;
  case '1.2':
    validatePhase1_2();
    break;
  case '1.3':
    validatePhase1_3();
    break;
  default:
    console.error(`❌ Unknown phase: ${PHASE}`);
    console.error('Valid phases: 1.1, 1.2, 1.3');
    process.exit(1);
}

function validatePhase1_1() {
  console.log('Phase 1.1: Eleventy 3.0 Migration\n');
  
  // Check package.json has "type": "module"
  check(
    'package.json has "type": "module"',
    (() => {
      const pkg = JSON.parse(execSync('cat package.json', { encoding: 'utf-8' }));
      return pkg.type === 'module';
    })(),
    'Add "type": "module" to package.json'
  );
  
  // Check Eleventy version
  check(
    'Eleventy version is 3.x',
    (() => {
      const result = exec('npm list @11ty/eleventy --depth=0');
      return result.success && result.output.includes('@11ty/eleventy@3');
    })(),
    'Upgrade @11ty/eleventy to ^3.0.0'
  );
  
  // Check .mjs files exist
  check(
    'eleventy.config.mjs exists',
    fileExists('eleventy.config.mjs'),
    'Convert eleventy.config.cjs to .mjs'
  );
  
  check(
    'lib/path-prefix.mjs exists',
    fileExists('lib/path-prefix.mjs'),
    'Convert lib/path-prefix.cjs to .mjs'
  );
  
  check(
    'src/_data/site.mjs exists',
    fileExists('src/_data/site.mjs'),
    'Convert src/_data/site.cjs to .mjs'
  );
  
  check(
    'src/_data/series.mjs exists',
    fileExists('src/_data/series.mjs'),
    'Convert src/_data/series.cjs to .mjs'
  );
  
  // Check old .cjs files are removed
  check(
    'eleventy.config.cjs removed',
    !fileExists('eleventy.config.cjs'),
    'Delete old eleventy.config.cjs'
  );
  
  // Check build succeeds
  console.log('\n🔨 Running build...');
  const buildResult = exec('npm run build', false);
  check(
    'npm run build succeeds',
    buildResult.success,
    'Build failed - check for ESM syntax errors'
  );
  
  // Check _site directory has HTML files
  const htmlCount = countFiles('_site', '.html');
  check(
    'Generated 40+ HTML pages',
    htmlCount >= 40,
    `Only ${htmlCount} pages generated (expected 40+)`
  );
  
  // Check path prefix functionality
  console.log('\n🔀 Testing path prefix...');
  exec('ELEVENTY_PATH_PREFIX=/ npm run build', true);
  const rootBuild = exec('grep -c \'href="/\' _site/index.html', true);
  check(
    'Path prefix works for root (/)',
    rootBuild.success && parseInt(rootBuild.output) > 0,
    'Root path prefix not working'
  );
  
  exec('ELEVENTY_PATH_PREFIX=/letstalkcdc/ npm run build', true);
  const subdirBuild = exec('grep -c \'href="/letstalkcdc/\' _site/index.html', true);
  check(
    'Path prefix works for subdirectory (/letstalkcdc/)',
    subdirBuild.success && parseInt(subdirBuild.output) > 0,
    'Subdirectory path prefix not working'
  );
}

function validatePhase1_2() {
  console.log('Phase 1.2: JavaScript Modularization\n');
  
  // Check modules directory exists
  check(
    'src/assets/js/modules/ directory exists',
    fileExists('src/assets/js/modules'),
    'Create src/assets/js/modules/ directory'
  );
  
  // Check each module exists
  const modules = [
    'theme.js',
    'navigation.js',
    'search.js',
    'scorecard.js',
    'code-blocks.js',
    'toast.js',
    'quick-nav.js'
  ];
  
  modules.forEach(module => {
    check(
      `Module ${module} exists`,
      fileExists(`src/assets/js/modules/${module}`),
      `Create src/assets/js/modules/${module}`
    );
  });
  
  // Check app.js is an orchestrator (should be much smaller)
  if (fileExists('src/assets/js/app.js')) {
    const appLines = execSync('wc -l src/assets/js/app.js', { encoding: 'utf-8' });
    const lineCount = parseInt(appLines.split(' ')[0]);
    check(
      'app.js is now an orchestrator (<200 lines)',
      lineCount < 200,
      `app.js is still ${lineCount} lines (expected <200)`
    );
  }
  
  // Check build succeeds
  console.log('\n🔨 Running build...');
  const buildResult = exec('npm run build', false);
  check(
    'npm run build succeeds',
    buildResult.success,
    'Build failed after modularization'
  );
  
  // Check dev server starts
  console.log('\n🚀 Testing dev server (will timeout after 5s)...');
  const devResult = exec('timeout 5s npm run dev || true', true);
  check(
    'npm run dev starts',
    devResult.output.includes('Server') || devResult.output.includes('8080'),
    'Dev server failed to start'
  );
}

function validatePhase1_3() {
  console.log('Phase 1.3: Build Pipeline Modernization\n');
  
  // Check Vite is installed
  const viteResult = exec('npm list vite --depth=0', true);
  check(
    'Vite is installed',
    viteResult.success,
    'Install vite as dev dependency'
  );
  
  // Check vite.config.mjs exists
  check(
    'vite.config.mjs exists',
    fileExists('vite.config.mjs'),
    'Create vite.config.mjs'
  );
  
  // Check build succeeds
  console.log('\n🔨 Running build...');
  const buildResult = exec('npm run build', false);
  check(
    'npm run build succeeds',
    buildResult.success,
    'Build failed with Vite'
  );
  
  // Check for hashed assets
  const hashedFiles = exec('find _site/assets/js -name "*.*.js" 2>/dev/null | wc -l', true);
  check(
    'Assets have content hashes',
    hashedFiles.success && parseInt(hashedFiles.output) > 0,
    'No hashed assets found in _site/assets/js'
  );
  
  // Check bundle size
  console.log('\n📦 Checking bundle size...');
  const bundleSize = exec('du -k _site/assets/js/*.js 2>/dev/null | sort -n | tail -1', true);
  if (bundleSize.success) {
    const sizeKB = parseInt(bundleSize.output.split('\t')[0]);
    check(
      'Bundle size <100KB (uncompressed)',
      sizeKB < 100,
      `Bundle is ${sizeKB}KB (target: <100KB)`
    );
  }
  
  // Check build time
  console.log('\n⏱️  Measuring build time...');
  const start = Date.now();
  exec('npm run build', true);
  const duration = (Date.now() - start) / 1000;
  check(
    'Build time <3 seconds',
    duration < 3,
    `Build took ${duration.toFixed(2)}s (target: <3s)`
  );
}

// Final report
console.log('\n' + '='.repeat(50));
if (failures === 0) {
  console.log('✅ All checks passed!');
  console.log(`Phase ${PHASE} validation successful.`);
  process.exit(0);
} else {
  console.log(`❌ ${failures} check(s) failed`);
  console.log(`Phase ${PHASE} validation incomplete.`);
  process.exit(1);
}
