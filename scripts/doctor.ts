import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

type Level = 'PASS' | 'WARN' | 'FAIL';
let failures = 0;
const report = (level: Level, name: string, detail: string, remediation = '') => { if (level === 'FAIL') failures += 1; process.stdout.write(`${level.padEnd(4)} ${name}: ${detail}${level !== 'PASS' && remediation ? `\n     ${remediation}` : ''}\n`); };
const command = (binary: string, args: string[]) => spawnSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const reachable = async (url: string) => { try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); return response.ok; } catch { return false; } };

const major = Number(process.versions.node.split('.')[0]); report(major >= 24 ? 'PASS' : 'FAIL', 'Node', process.version, 'Install Node.js 24 or newer.');
report(existsSync('node_modules') ? 'PASS' : 'FAIL', 'Packages', existsSync('node_modules') ? 'installed' : 'missing', 'Run: npm install');
report(existsSync('.env') ? 'PASS' : 'WARN', 'Environment', existsSync('.env') ? '.env present (values redacted)' : '.env missing', 'Copy .env.example to .env and fill local secret values.');
const dataDir = resolve(process.env.DATA_DIR ?? 'data'); report(existsSync(dataDir) ? 'PASS' : 'WARN', 'Data directory', existsSync(dataDir) ? 'available' : 'will be created', `Create: mkdir -p ${dataDir}`);
const database = resolve(dataDir, 'jobs.sqlite');
if (existsSync(database)) { try { const db = new DatabaseSync(database, { readOnly: true }); const migration = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get(); db.close(); report(migration ? 'PASS' : 'WARN', 'Database', migration ? 'available; migrations initialized' : 'available; migration runs at orchestrator startup', 'Run: npm run dev:orchestrator'); } catch { report('FAIL', 'Database', 'cannot be opened', 'Check data directory permissions.'); } } else report('WARN', 'Database', 'not created yet', 'Run: npm run dev:orchestrator');
report(await reachable('http://127.0.0.1:18790/health/live') ? 'PASS' : 'WARN', 'Orchestrator', 'port 18790 ' + (await reachable('http://127.0.0.1:18790/health/live') ? 'ready' : 'not running'), 'Run: npm run dev:orchestrator');
report(await reachable('http://127.0.0.1:18791/health') ? 'PASS' : 'WARN', 'Composio host', await reachable('http://127.0.0.1:18791/health') ? 'reachable' : 'not running', 'Configure COMPOSIO_API_KEY and run: npm run dev:composio');
const chrome = await reachable(process.env.CHROME_CDP_ENDPOINT ?? 'http://127.0.0.1:9222/json/version'); report(chrome ? 'PASS' : 'WARN', 'Chrome CDP', chrome ? 'reachable on loopback' : 'not reachable', 'Start user-controlled Chrome with remote debugging on the configured loopback port.');
const openclaw = command('openclaw', ['--version']); report(openclaw.status === 0 ? 'PASS' : 'WARN', 'OpenClaw', openclaw.status === 0 ? openclaw.stdout.trim().split('\n').at(-1) ?? 'installed' : 'not available', 'Install OpenClaw, then run: npm run openclaw:install');
report(existsSync('apps/openclaw-wuzzuf/openclaw.plugin.json') ? 'PASS' : 'FAIL', 'OpenClaw plugin', 'manifest present', 'Run: npm run plugin:build');
report(process.env.COMPOSIO_API_KEY ? 'PASS' : 'WARN', 'Composio API', process.env.COMPOSIO_API_KEY ? 'configured (value redacted)' : 'not configured', 'Set COMPOSIO_API_KEY in .env; never expose it to the extension.');
report(process.env.OPENCLAW_JOB_TOOL_TOKEN ? 'PASS' : 'WARN', 'Tool credential', process.env.OPENCLAW_JOB_TOOL_TOKEN ? 'configured (value redacted)' : 'not configured', 'Generate a unique 32+ character OPENCLAW_JOB_TOOL_TOKEN without submission scope.');
process.exitCode = failures ? 1 : 0;
