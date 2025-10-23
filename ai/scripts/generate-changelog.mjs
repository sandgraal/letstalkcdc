// ai/scripts/generate-changelog.mjs
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function run(cmd) { return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }

function main() {
  let changes = '';
  try {
    // Conventional commits summary since last tag; fallback to last 100 commits
    const hasTags = run('git tag --list').trim().length > 0;
    const range = hasTags ? '$(git describe --tags --abbrev=0)..HEAD' : 'HEAD~100..HEAD';
    changes = run(`bash -lc "git log ${range} --pretty=format:'- %s (%h)'"`);
  } catch {
    changes = '- Initial changelog';
  }

  const header = `## ${new Date().toISOString().slice(0,10)}\n`;
  const content = header + (changes || '- No notable changes') + '\n\n';

  const path = 'CHANGELOG.md';
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileSync(path, content + existing);
  console.log('[changelog] Updated CHANGELOG.md');
}

main();
