// ai/scripts/sync-readme.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const START = '<!-- AI-STATUS:START -->';
const END = '<!-- AI-STATUS:END -->';

function section(markup) {
  return `${START}\n${markup}\n${END}`;
}

function main() {
  let readme = '';
  try { readme = readFileSync('README.md', 'utf8'); } catch { /* no readme yet */ }

  const now = new Date().toISOString();
  const badge = `Last AI agents run: ${now}`;
  const block = section(badge);

  if (!readme) {
    writeFileSync('README.md', `# Project\n\n${block}\n`);
    console.log('[readme-sync] Created README with status section.');
    return;
  }

  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);
  if (startIdx !== -1 && endIdx !== -1) {
    const before = readme.slice(0, startIdx);
    const after = readme.slice(endIdx + END.length);
    readme = before + block + after;
  } else {
    readme = readme + `\n\n${block}\n`;
  }
  writeFileSync('README.md', readme);
  console.log('[readme-sync] Updated README AI status section.');
}

main();
