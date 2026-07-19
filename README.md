# OpenClaw Job Automation

Local-first, review-first job discovery and application preparation. The focused extension provides OpenClaw chat, PDF/text resume knowledge, professional profile-grounded application answers, semantic form inspection, and per-task local model controls. OpenClaw remains the orchestration brain through the bundled typed tool plugin.

## Quick start

Requires Node.js 24+.

```sh
npm install
npm test
npm run build
DEV_ORIGIN=http://127.0.0.1:9999 PAIRING_CODE="choose-a-random-code" npm start
node --experimental-strip-types apps/playwright-worker/src/main.ts
```

For the Chrome extension, follow [the installation guide](docs/extension-installation.md) and replace `DEV_ORIGIN` with the extension ID. Production accounts are never used by the automated tests.

## Safety defaults

- `prepare_and_review` and dry-run are the defaults.
- No adapter in milestone one implements submission.
- Sensitive, unknown, or low-confidence answers require approval.
- The bridge binds only to `127.0.0.1`, validates one exact origin, limits bodies, and uses short-lived bearer sessions.
- Provider and OpenClaw secrets remain in the local backend.

See [architecture](docs/architecture.md), [local development](docs/local-development.md), and [known limitations](docs/known-limitations.md).

## OpenClaw tool

The local plugin in `apps/openclaw-tool` gives OpenClaw typed profile, answer, campaign, status, and emergency-stop actions. Set the same random `OPENCLAW_JOB_TOOL_TOKEN` for the gateway and orchestrator, then follow its README. The tool cannot execute arbitrary JavaScript/selectors or submit unsupported forms.
