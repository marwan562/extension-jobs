import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'output/release');
const cache = resolve(process.env.EXTENSION_JOBS_NPM_CACHE ?? '/tmp/extension-jobs-npm-cache');
mkdirSync(output, { recursive: true });
mkdirSync(cache, { recursive: true });

run('npm', ['run', 'build']);
const packages = ['apps/cli', 'apps/openclaw-jobs', 'packages/composio-jobs'];
const artifacts: string[] = [];
for (const packagePath of packages) {
  const result = run('npm', ['pack', resolve(root, packagePath), '--pack-destination', output, '--cache', cache], true);
  const filename = result.trim().split('\n').at(-1);
  if (!filename) throw new Error(`npm pack did not report an artifact for ${packagePath}`);
  artifacts.push(resolve(output, filename));
}

const extensionZip = resolve(output, 'extension-jobs-chrome-1.0.0.zip');
if (existsSync(extensionZip)) unlinkSync(extensionZip);
run('zip', ['-q', '-r', extensionZip, 'manifest.json', 'sidepanel.html', 'options.html', 'styles.css', 'dist'], false, resolve(root, 'apps/extension'));
artifacts.push(extensionZip);

const dashboardZip = resolve(output, 'extension-jobs-dashboard-1.0.0.zip');
if (existsSync(dashboardZip)) unlinkSync(dashboardZip);
run('zip', ['-q', '-r', dashboardZip, 'dist'], false, resolve(root, 'apps/dashboard'));
artifacts.push(dashboardZip);

const checksums = artifacts
  .sort((a, b) => basename(a).localeCompare(basename(b)))
  .map((file) => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${basename(file)}`)
  .join('\n') + '\n';
writeFileSync(resolve(output, 'SHA256SUMS'), checksums);
writeFileSync(resolve(output, 'release-manifest.json'), `${JSON.stringify({
  version: '1.0.0-rc.1',
  generatedAt: new Date().toISOString(),
  artifacts: artifacts.map((file) => basename(file)),
  verification: 'sha256sum -c SHA256SUMS'
}, null, 2)}\n`);
process.stdout.write(`Release artifacts written to ${output}\n${checksums}`);

function run(binary: string, args: string[], capture = false, cwd = root): string {
  const result = spawnSync(binary, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`${binary} ${args.join(' ')} failed\n${result.stderr ?? ''}`);
  return result.stdout ?? '';
}
