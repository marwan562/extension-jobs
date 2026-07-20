import { spawn } from 'node:child_process';

const children = ['dev:orchestrator', 'dev:worker'].map((script) => spawn('npm', ['run', script], { stdio: 'inherit', env: process.env }));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => children.forEach((child) => child.kill(signal)));
await Promise.all(children.map((child) => new Promise<void>((resolve, reject) => child.once('exit', (code) => code === 0 || code === null ? resolve() : reject(new Error(`Development process exited with ${code}`))))));
