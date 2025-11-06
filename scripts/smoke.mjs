#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve('.');
const outputDirName = process.env.BUILD_OUTPUT_DIR ?? '_site';
const outputDir = join(root, outputDirName);

const read = (relativePath) => readFileSync(join(outputDir, relativePath), 'utf8');

const ensureOutputDir = () => {
  if (existsSync(outputDir)) {
    return;
  }

  console.log(`${outputDirName} directory missing; running "npm run build" to generate site…`);
  const { status } = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (status !== 0) {
    console.error('Unable to build the site; aborting smoke test.');
    process.exit(status ?? 1);
  }

  if (!existsSync(outputDir)) {
    console.error(`Build completed but ${outputDirName} directory is still missing; aborting smoke test.`);
    process.exit(1);
  }
};

const failures = [];

ensureOutputDir();

const walkHtml = (() => {
  const walk = (dir) => {
    const acc = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        acc.push(...walk(join(dir, entry.name)));
      } else if (entry.name.endsWith('.html')) {
        acc.push(join(dir, entry.name));
      }
    }
    return acc;
  };
  return walk(outputDir);
})();

try {
  const intro = read('intro/index.html');
  if (!intro.includes('id="methodsChart"')) {
    failures.push('Intro page is missing the radar chart canvas (#methodsChart).');
  }
  if (!intro.includes('/assets/js/pages/intro.js')) {
    failures.push('Intro page is not loading the intro module script.');
  }
} catch (error) {
  failures.push(`Failed to read intro/index.html: ${error.message}`);
}

try {
  const tenancy = read('multi-tenancy/index.html');
  if (!tenancy.includes('id="costChart"')) {
    failures.push('Multi-tenancy page is missing the cost chart canvas (#costChart).');
  }
  if (!tenancy.includes('/assets/js/pages/multi-tenancy.js')) {
    failures.push('Multi-tenancy page is not loading the multi-tenancy module script.');
  }
} catch (error) {
  failures.push(`Failed to read multi-tenancy/index.html: ${error.message}`);
}

const offendingFonts = walkHtml.filter((file) => {
  const html = readFileSync(file, 'utf8');
  return html.includes('fonts.googleapis');
});
if (offendingFonts.length > 0) {
  failures.push(`Built HTML still references fonts.googleapis.com (${offendingFonts.length} file(s)).`);
}

// Verify social preview image exists
const socialImagePath = join(outputDir, 'images', 'cdc-cover.jpg');
if (!existsSync(socialImagePath)) {
  failures.push('Social preview image (images/cdc-cover.jpg) is missing from the build output.');
}

// Verify homepage has correct social preview meta tags
try {
  const homepage = read('index.html');
  if (!homepage.includes('og:image') || !homepage.includes('/images/cdc-cover.jpg')) {
    failures.push('Homepage is missing correct Open Graph image meta tag.');
  }
  if (!homepage.includes('twitter:image') || !homepage.includes('/images/cdc-cover.jpg')) {
    failures.push('Homepage is missing correct Twitter card image meta tag.');
  }
  if (!homepage.includes('twitter:card" content="summary_large_image')) {
    failures.push('Homepage is missing Twitter card type (summary_large_image).');
  }
  if (!homepage.includes('id="askBtn"')) {
    failures.push('Homepage is missing the assistant trigger button (#askBtn).');
  }
  if (!homepage.includes('/js/assistant.js')) {
    failures.push('Homepage is not loading the assistant module script.');
  }
} catch (error) {
  failures.push(`Failed to read index.html: ${error.message}`);
}

// Verify assistant knowledge base output exists and is well-formed
const assistantDataPath = join(outputDir, 'data', 'assistant.json');
if (!existsSync(assistantDataPath)) {
  failures.push('Assistant knowledge base JSON (data/assistant.json) is missing from the build output.');
} else {
  try {
    const assistantData = JSON.parse(readFileSync(assistantDataPath, 'utf8'));
    if (!assistantData || !Array.isArray(assistantData.intents) || assistantData.intents.length === 0) {
      failures.push('Assistant knowledge base JSON does not include any intents.');
    }
  } catch (error) {
    failures.push(`Assistant knowledge base JSON is not valid: ${error.message}`);
  }
}

const htaccessPath = join(root, '.htaccess');
if (existsSync(htaccessPath)) {
  try {
    const htaccess = readFileSync(htaccessPath, 'utf8');
    if (!/Content-Security-Policy/.test(htaccess)) {
      failures.push('CSP header missing from .htaccess.');
    }
    if (/unsafe-inline/.test(htaccess)) {
      failures.push('CSP still includes unsafe-inline; expected hashed allowances instead.');
    }
  } catch (error) {
    failures.push(`Failed to read .htaccess: ${error.message}`);
  }
}

if (failures.length) {
  console.error('Smoke test failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Smoke test passed: critical canvases present, CSP hardened, no external fonts.');
