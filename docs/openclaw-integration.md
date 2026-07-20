# OpenClaw integration

Build and link using commands supported by the installed OpenClaw 2026.7 CLI:

```bash
npm run plugin:build
openclaw plugins install --link ./apps/openclaw-wuzzuf
openclaw plugins enable job-automation
openclaw plugins inspect job-automation --runtime --json
```

The plugin exposes focused `wuzzuf_*` tools plus profile, campaign, status, and emergency-stop tools. It is a thin authenticated client of the orchestrator and works without Composio. The destructive submit tool is not preloaded. Runtime plugin configuration supplies `bridgeUrl`, `toolToken`, and `timeoutMs`.
