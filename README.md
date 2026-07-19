# OpenClaw Job Automation

Local-first, review-first job discovery and application preparation. The first milestone pairs a Manifest V3 side panel with an authenticated loopback orchestrator, imports a text CV into provenance-tagged facts, creates timezone-aware campaigns, discovers/normalizes/deduplicates/scores fixture jobs (or a configured Composio LinkedIn action), prepares approval-gated answers, and fills a local mock application without submission.

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
