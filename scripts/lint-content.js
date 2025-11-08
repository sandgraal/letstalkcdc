import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const roots = ['src']; // adjust if needed
const files = [];

const pattern = /\.(md|njk|html)$/i;

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (pattern.test(entry.name)) {
      files.push(path);
    }
  }
};

for (const root of roots) {
  const rootPath = join(process.cwd(), root);
  if (existsSync(rootPath)) {
    walk(rootPath);
  }
}

let ok = true;
const bad = [
  { re: /localhost:29092/, msg: 'Use localhost:9092 on host, not 29092' },
  { re: /docker exec -it\s+broker\b/, msg: 'Use container name "kafka", not "broker"' }
];

for (const file of files) {
  const txt = readFileSync(file, 'utf8');
  for (const rule of bad) {
    if (rule.re.test(txt)) {
      console.error(`Lint error in ${file}: ${rule.msg}`);
      ok = false;
    }
  }
}

process.exit(ok ? 0 : 1);
