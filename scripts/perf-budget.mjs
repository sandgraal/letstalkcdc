#!/usr/bin/env node
import { statSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const root = resolve('.');
const distDir = join(root, 'dist');

const bytes = (kb) => kb * 1024;

const budgets = [
  { label: 'Main CSS bundle', path: ['assets', 'css', 'styles.min.css'], max: bytes(200) },
  { label: 'App JS', path: ['assets', 'js', 'app.js'], max: bytes(80) }
];

const pageBudgets = [
  { label: 'Home', path: ['index.html'], max: bytes(250) },
  { label: 'Multi-Tenancy', path: ['multi-tenancy', 'index.html'], max: bytes(275) },
  { label: 'Intro', path: ['intro', 'index.html'], max: bytes(300) },
  { label: 'Exactly-Once', path: ['exactly-once', 'index.html'], max: bytes(280) }
];

const jsDir = join(distDir, 'assets', 'js', 'pages');
const pageScripts = readdirSync(jsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ label: `Page script: ${name}`, path: ['assets', 'js', 'pages', name], max: bytes(120) }));

const check = ({ label, path, max }) => {
  const filePath = join(distDir, ...path);
  const size = statSync(filePath).size;
  return { label, filePath, size, max, ok: size <= max };
};

const results = [
  ...budgets.map(check),
  ...pageBudgets.map(check),
  ...pageScripts.map(check)
];

const failures = results.filter((item) => !item.ok);

results.forEach(({ label, size, max, ok }) => {
  const status = ok ? 'PASS' : 'FAIL';
  const delta = size - max;
  const human = `${(size / 1024).toFixed(1)}KB / ${(max / 1024).toFixed(1)}KB`;
  console.log(`${status.padEnd(4)} ${label}: ${human}${!ok ? ` (+${(delta / 1024).toFixed(1)}KB)` : ''}`);
});

if (failures.length) {
  console.error('\nPerformance budget check failed. Consider code splitting or asset optimisation for the files above.');
  process.exit(1);
}
