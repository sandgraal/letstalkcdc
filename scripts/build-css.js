#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const postcss = resolve('node_modules/.bin/postcss');
const minifier = resolve('node_modules/.bin/node'); // we'll run node + minify script
const minifyScript = resolve('scripts/minify-css.js');

const srcDir = resolve('src/assets/css/pages');
const outputDirName = process.env.BUILD_OUTPUT_DIR ?? '_site';
const outDir = resolve(outputDirName, 'assets', 'css', 'pages');

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((name) => name.endsWith('.css'));

for (const file of files) {
  const input = join(srcDir, file);
  const output = join(outDir, file);
  console.log(`Building page CSS: ${file}`);
  execSync(`${postcss} ${input} -o ${output}`, { stdio: 'inherit' });
  execSync(`node ${minifyScript} ${output} ${output}`, { stdio: 'inherit' });
}
