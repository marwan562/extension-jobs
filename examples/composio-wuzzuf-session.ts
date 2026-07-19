import { Composio } from '@composio/core';
import { createWuzzufToolkit } from '../packages/composio-wuzzuf/src/index.ts';

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) throw new Error('COMPOSIO_API_KEY is required');

const composio = new Composio({ apiKey });
const session = await composio.sessions.create(process.env.COMPOSIO_USER_ID ?? 'local-user', {
  toolkits: ['linkedin'],
  experimental: { customToolkits: [createWuzzufToolkit()] }
});

process.stdout.write(`${JSON.stringify({ sessionId: session.id, customToolkits: session.customToolkits(), tools: (await session.tools()).map((tool: { name?: string; slug?: string }) => tool.name ?? tool.slug) }, null, 2)}\n`);
