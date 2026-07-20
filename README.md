# OpenClaw Job Automation

Local-first, review-first job discovery and application automation for OpenClaw, Composio, and Chrome. Wuzzuf is implemented once: both agent integrations call the authenticated loopback orchestrator, which owns policy, persistence, scoring, auditing, and a Playwright adapter connected to the user's existing Google Chrome profile over CDP.

```text
OpenClaw job_automation ─┐
                        ├─> 127.0.0.1 orchestrator -> WuzzufToolService -> WuzzufAdapter -> existing Chrome over CDP -> Wuzzuf
Composio wuzzuf toolkit ┘
```

## Quick start

Requires Node.js 24+ and Google Chrome. Start Chrome with remote debugging before the orchestrator:

```sh
npm install
npm run typecheck
npm test
npm run build
open -na "Google Chrome" --args --remote-debugging-port=9222
EXTENSION_ID=<chrome-extension-id> PAIRING_CODE=<random-secret> OPENCLAW_JOB_TOOL_TOKEN=<random-secret> JOB_SOURCE_MODE=wuzzuf npm start
```

Set `CHROME_CDP_ENDPOINT=http://127.0.0.1:9222` (the default). Open the extension's Wuzzuf view and choose **Open Wuzzuf login**. A new managed tab appears in that Chrome window and shares its cookies and profile. The project never requests or returns Wuzzuf passwords, cookies, or profile data. `WUZZUF_DATA_DIR` is unused in production CDP mode.

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
