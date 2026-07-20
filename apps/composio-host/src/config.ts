import { resolve } from 'node:path';

export interface HostConfig { apiKey: string; userId: string; hostToken: string; host: '127.0.0.1'; port: number; sessionFile: string; orchestratorUrl: string; wuzzufToolToken: string; toolkits: string[] }

export function loadConfig(): HostConfig {
  const apiKey = required('COMPOSIO_API_KEY'); const hostToken = required('COMPOSIO_HOST_TOKEN', 32); const wuzzufToolToken = required('COMPOSIO_WUZZUF_TOOL_TOKEN', 32);
  const port = Number(process.env.COMPOSIO_HOST_PORT ?? 18791); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('COMPOSIO_HOST_PORT must be an integer between 1024 and 65535.');
  const toolkits = (process.env.COMPOSIO_TOOLKITS ?? 'wuzzuf,linkedin').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean); const unsupported = toolkits.filter((value) => !['wuzzuf', 'linkedin'].includes(value)); if (unsupported.length) throw new Error(`Unsupported COMPOSIO_TOOLKITS: ${unsupported.join(', ')}`);
  const orchestratorUrl = process.env.WUZZUF_ORCHESTRATOR_URL ?? 'http://127.0.0.1:18790'; const url = new URL(orchestratorUrl); if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('WUZZUF_ORCHESTRATOR_URL must be an HTTP loopback URL.');
  return { apiKey, hostToken, wuzzufToolToken, host: '127.0.0.1', port, userId: process.env.COMPOSIO_USER_ID ?? 'local-user', sessionFile: resolve(process.env.COMPOSIO_SESSION_FILE ?? '.data/composio-session.json'), orchestratorUrl: url.origin, toolkits };
}

function required(name: string, minLength = 1): string { const value = process.env[name]?.trim(); if (!value || value.length < minLength) throw new Error(`${name} must be configured${minLength > 1 ? ` with at least ${minLength} characters` : ''}.`); return value; }
