# OpenClaw integration

Build and link using commands supported by the installed OpenClaw 2026.7 CLI:

```bash
npm run plugin:build
openclaw plugins install --link ./apps/openclaw-jobs
openclaw plugins enable job-automation
openclaw plugins inspect job-automation --runtime --json
```

The plugin exposes focused `wuzzuf_*` tools plus profile, campaign, status, and emergency-stop tools. It is a thin authenticated client of the orchestrator and works without Composio. The destructive submit tool is not preloaded. Runtime plugin configuration supplies `bridgeUrl`, `toolToken`, and `timeoutMs`.

The default OpenClaw enrollment intentionally excludes `applications:submit`. Final submission should normally be initiated by the paired extension after approval; granting submit scope requires an explicit `OPENCLAW_JOB_TOOL_SCOPES` configuration and still cannot bypass the one-use approval token.
