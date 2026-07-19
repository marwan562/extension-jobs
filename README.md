# OpenClaw Job Automation

Local-first, review-first job discovery and application automation for OpenClaw, Composio, and Chrome. Wuzzuf is implemented once: both agent integrations call the authenticated loopback orchestrator, which owns policy, persistence, scoring, auditing, and the persistent Playwright adapter.

```text
OpenClaw job_automation ─┐
                        ├─> 127.0.0.1 orchestrator -> WuzzufToolService -> WuzzufAdapter -> persistent browser -> Wuzzuf
Composio wuzzuf toolkit ┘
```

## Quick start

Requires Node.js 24+ and a Playwright Chromium installation.

```sh
npm install
npx playwright install chromium
npm run typecheck
npm test
npm run build
EXTENSION_ID=<chrome-extension-id> PAIRING_CODE=<random-secret> OPENCLAW_JOB_TOOL_TOKEN=<random-secret> JOB_SOURCE_MODE=wuzzuf npm start
```

Open the extension's Wuzzuf view and choose **Open Wuzzuf login**. Sign in manually in the dedicated browser. The project never requests or stores a plaintext Wuzzuf password; Playwright profile state stays under `WUZZUF_DATA_DIR` (default `.data/wuzzuf-browser`) and is git-ignored.

## Wuzzuf actions

The common orchestrator API implements search, full job details, profile scoring, application preparation, safe fill, review, explicit-token submission, status, and cancellation. Login status/open-login and approval-token creation are local control actions. Submission is centrally rejected when dry-run is active, emergency stop is engaged, validation fails, the token is expired/reused/mismatched, or a submission already exists.

The Composio SDK exposes current custom-tool slugs as `LOCAL_WUZZUF_SEARCH_JOBS`, and so on. OpenClaw uses the requested `WUZZUF_*` action names inside its existing `job_automation` tool. See [local development](docs/local-development.md), [architecture](docs/architecture.md), [extension installation](docs/extension-installation.md), and [known limitations](docs/known-limitations.md).

## Safety

- Dry-run defaults to true and preparation never submits.
- Sensitive, unknown, ambiguous, and low-confidence answers are skipped.
- Resume bytes are stored only in local SQLite and uploaded only after explicit resume approval.
- Services bind to `127.0.0.1`; CORS accepts one exact extension origin; sessions are short-lived.
- URLs and redirects are restricted to Wuzzuf or the explicitly configured loopback fixture origin.
- Cookies, browser profiles, approval-token hashes, resumes, and backend secrets are never returned to agent integrations or content scripts.
- Production Wuzzuf accounts are never used by automated tests.
