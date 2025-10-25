#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { minify } from 'csso';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/minify-css.js <input.css> <output.css>');
  process.exit(1);
}

try {
  const source = fs.readFileSync(inputPath, 'utf8');
  const result = minify(source);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result.css, 'utf8');
} catch (error) {
  console.error(`Failed to minify CSS: ${error.message}`);
  process.exit(1);
}
