import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tracked = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' });
if (tracked.status !== 0) throw new Error('Unable to enumerate repository files');
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{32,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{32,}/,
  /(?:COMPOSIO_API_KEY|OPENCLAW_JOB_TOOL_TOKEN|COMPOSIO_(?:WUZZUF|JOBS)_TOOL_TOKEN|WORKER_TOOL_TOKEN|PAIRING_CODE)\s*=\s*[A-Za-z0-9_-]{24,}/
];
const findings: string[] = [];
for (const file of tracked.stdout.split('\0').filter(Boolean)) {
  if (/\.(?:png|jpg|jpeg|gif|pdf|sqlite|wal|shm)$/.test(file) || file === 'package-lock.json' || file.endsWith('.env.example')) continue;
  let text = ''; try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (patterns.some((pattern) => pattern.test(text))) findings.push(file);
}
if (findings.length) { process.stderr.write(`Potential secrets in tracked files:\n${findings.join('\n')}\n`); process.exitCode = 1; }
else process.stdout.write('Secret scan passed.\n');
