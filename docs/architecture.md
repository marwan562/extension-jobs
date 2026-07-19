# Architecture

```text
OpenClaw
  -> job_automation TypeBox tool
  -> authenticated loopback API
  -> WuzzufToolService
  -> WuzzufAdapter
  -> Playwright persistent context
  -> Wuzzuf

Composio session
  -> local wuzzuf custom toolkit
  -> short-lived paired bearer session
  -> same loopback API / service / adapter
```

`WuzzufToolService` is the trust boundary. It resolves and persists normalized jobs, calls the existing profile engine and `scoreJob`, selects only an approved resume, classifies answers, acquires application/submission locks, follows the shared state graph, enforces dry-run/emergency-stop/duplicate rules, hashes and consumes one-use approval tokens, and writes immutable audit events. It returns serializable records only.

`WuzzufAdapter` owns all browser behavior. Selectors are isolated in `wuzzuf-selectors.ts`; fixture-testable parsing and URL normalization live in `wuzzuf-parser.ts`. The adapter launches one configurable persistent profile, checks authentication, stops on CAPTCHA/challenge pages, blocks unsupported redirects, respects abort signals, captures diagnostic screenshots, and closes application pages on cancellation and all resources at shutdown.

SQLite uses WAL, unique job fingerprints, submission reservations, application records, approval-token hashes, resume BLOBs, locks, and append-only audit rows. Resume data and browser state remain local. The extension service worker owns its short-lived bearer token; the page content script never receives it. OpenClaw uses a separate environment-only backend token. Composio custom tools execute in-process and pair over loopback; no Wuzzuf credentials are sent to Composio.

The current Composio 0.13.1 API is session-scoped: `experimental_createTool` definitions are grouped by `experimental_createToolkit`, then attached with `composio.sessions.create(..., { experimental: { customToolkits } })`. Composio automatically prefixes toolkit tools as `LOCAL_WUZZUF_*`; search/schema/multi-execute meta tools work with these in-process definitions, while MCP sessions do not support them.
