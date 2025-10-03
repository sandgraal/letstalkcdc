#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const postcssBin = resolve('node_modules/.bin/postcss');
const minifyScript = resolve('scripts/minify-css.js');

const srcDir = resolve('src/assets/css/pages');
const outDir = resolve('dist/assets/css/pages');

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((name) => name.endsWith('.css'));

for (const file of files) {
  const input = join(srcDir, file);
  const output = join(outDir, file);
  console.log(`Building page CSS: ${file}`);
  execSync(`${postcssBin} ${input} -o ${output}`, { stdio: 'inherit' });
  execSync(`node ${minifyScript} ${output} ${output}`, { stdio: 'inherit' });
}
