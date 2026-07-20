# OpenClaw Job Automation

Local-first, review-first job discovery and application automation for OpenClaw, Composio, and Chrome. Wuzzuf is implemented once: both agent integrations call the authenticated loopback orchestrator, which owns policy, persistence, scoring, auditing, and a Playwright adapter connected to the user's existing Google Chrome profile over CDP.

```text
OpenClaw individual tools ─┐
                          ├─> 127.0.0.1 orchestrator -> WuzzufToolService -> WuzzufAdapter -> existing Chrome over CDP -> Wuzzuf
Composio custom toolkit ──┘
```

## Quick start

Requires Node.js 24+ and Google Chrome. Start Chrome with remote debugging before the orchestrator:

```sh
npm install
npm run doctor
npm run typecheck
npm test
npm run build
open -na "Google Chrome" --args --remote-debugging-port=9222
EXTENSION_ID=<chrome-extension-id> PAIRING_CODE=<random-secret> OPENCLAW_JOB_TOOL_TOKEN=<random-secret> JOB_SOURCE_MODE=wuzzuf npm start
```

Set `CHROME_CDP_ENDPOINT=http://127.0.0.1:9222` (the default). Open the extension's Wuzzuf view and choose **Open Wuzzuf login**. A new managed tab appears in that Chrome window and shares its cookies and profile. The project never requests or returns Wuzzuf passwords, cookies, or profile data. `WUZZUF_DATA_DIR` is unused in production CDP mode.

## Wuzzuf actions

The common orchestrator API implements connection management, search, full job details, profile scoring, application preparation, safe fill, review, human approval requests, idempotent submission, status, and cancellation. An agent can request approval but cannot grant it: only a paired extension session can approve the exact reviewed job, resume, answers, profile snapshot, and form fingerprint. The one-use token is returned only to that extension decision flow, kept in extension memory, and only its hash is persisted.

The Composio SDK exposes session-scoped custom-tool slugs such as `LOCAL_WUZZUF_SEARCH_JOBS`. OpenClaw exposes individual tools such as `wuzzuf_search_jobs`, `wuzzuf_request_submission_approval`, `campaign_run`, and `job_automation_emergency_stop`; compatibility aliases for the earlier focused helper names remain temporarily. See [local development](docs/local-development.md), [architecture](docs/architecture.md), [extension installation](docs/extension-installation.md), and [known limitations](docs/known-limitations.md).

## Safety

- Dry-run defaults to true and preparation never submits.
- Sensitive, unknown, ambiguous, and low-confidence answers are skipped.
- Resume bytes are stored only in local SQLite and uploaded only after explicit resume approval.
- Services bind to `127.0.0.1`; CORS accepts one exact extension origin; sessions are short-lived.
- URLs and redirects are restricted to Wuzzuf or the explicitly configured loopback fixture origin.
- Cookies, browser profiles, approval internals, resumes, and backend secrets are never returned to agent integrations or content scripts.
- Production Wuzzuf accounts are never used by automated tests.
