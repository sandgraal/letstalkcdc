// ai/scripts/log-agent-run.mjs
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';

function main() {
  const ts = new Date().toISOString();
  const name = process.env.AGENT_NAME || 'unknown';
  const status = process.env.STATUS || 'ok';
  const durationMs = Number(process.env.DURATION_MS || 0);

  if (!existsSync('ai/logs')) {
    mkdirSync('ai/logs', { recursive: true });
  }

  const line = JSON.stringify({ ts, name, status, duration_ms: durationMs }) + '\n';
  appendFileSync(`ai/logs/${name}.jsonl`, line, 'utf8');
  console.log('[log] appended', line.trim());
}

main();
