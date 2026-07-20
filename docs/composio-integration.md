# Composio integration

The Wuzzuf toolkit is a local custom toolkit backed by the local orchestrator; it is not a native Wuzzuf OAuth integration. `apps/composio-host` keeps the local custom toolkit session alive and may add native Composio toolkits independently. The Composio API key stays in the host environment and is never sent to the extension. Wuzzuf browser credentials never pass through Composio.

```bash
COMPOSIO_API_KEY=... COMPOSIO_HOST_TOKEN=... COMPOSIO_WUZZUF_TOOL_TOKEN=... npm run dev:composio
```
