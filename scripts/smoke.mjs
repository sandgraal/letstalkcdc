#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve('.');
const distDir = join(root, 'dist');

const read = (relativePath) => readFileSync(join(distDir, relativePath), 'utf8');

const ensureDist = () => {
  if (existsSync(distDir)) {
    return;
  }

  console.log('dist directory missing; running "npm run build" to generate site…');
  const { status } = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (status !== 0) {
    console.error('Unable to build the site; aborting smoke test.');
    process.exit(status ?? 1);
  }
};

const failures = [];

ensureDist();

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
  return walk(distDir);
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
