# Architecture

```text
OpenClaw
  -> individual TypeBox tools
  -> authenticated loopback API
  -> durable SQLite queue / WuzzufToolService
  -> WuzzufAdapter
  -> ChromeCdpManager (`chromium.connectOverCDP`)
  -> first existing Chrome browser context
  -> Wuzzuf

Composio session
  -> local wuzzuf custom toolkit
  -> short-lived paired bearer session
  -> same loopback API / service / adapter
```

`WuzzufToolService` is the trust boundary. It resolves and persists normalized jobs, calls the existing profile engine and `scoreJob`, selects only an approved resume, classifies answers, acquires application/submission locks, follows the shared state graph, enforces dry-run/emergency-stop/duplicate rules, binds approval requests to the exact job/resume/answers review, applies idempotency, and writes immutable audit events. It returns serializable records only.

`WuzzufAdapter` owns managed Wuzzuf tabs. `ChromeCdpManager` attaches to the manually started Chrome endpoint, selects `browser.contexts()[0]`, and creates pages with `context.newPage()`; it never creates an incognito context or launches a production browser. Selectors are isolated in `wuzzuf-selectors.ts`; fixture-testable parsing and URL normalization live in `wuzzuf-parser.ts`. The adapter checks authentication, stops on CAPTCHA/challenge pages, keeps the managed tab open for manual verification, blocks unsupported redirects, respects abort signals, captures diagnostic screenshots, and closes managed application pages on cancellation.

Playwright does not expose a safe explicit disconnect method for this CDP browser. Normal shutdown therefore does not call `browser.close()`, which could terminate the user's Chrome process; it drops manager references and lets process exit close only the transport. Unrelated user tabs are never adopted, closed, or reused. A login tab created by this application is reused to debounce repeated login requests.

SQLite uses explicit migrations, WAL, foreign keys, immutable profile versions/snapshots, unique job fingerprints, durable leased queue jobs, transactional submission attempts, hashed one-use approvals, application records/events, operation idempotency records, Wuzzuf connection state, resume BLOBs, locks, and append-only audit rows. Resume data and the connected Chrome profile remain local. The extension service worker owns its short-lived bearer token; the page content script never receives it. Only that paired extension session can decide an approval request and receive the one-use token in memory. OpenClaw uses a separate configured backend token which cannot grant approval. Composio custom tools execute in-process and pair over loopback; no Wuzzuf credentials are sent to Composio.

The current Composio 0.13.1 API is session-scoped: `experimental_createTool` definitions are grouped by `experimental_createToolkit`, then attached with `composio.sessions.create(..., { experimental: { customToolkits } })`. `apps/composio-host` keeps that in-process execution environment alive, persists only the session ID, reattaches custom tools when reusing a session, and exposes an authenticated loopback diagnostics/execution API. It recreates stale sessions only during lifecycle initialization and never retries an uncertain execution. Composio automatically prefixes toolkit tools as `LOCAL_WUZZUF_*`; these local tools are not globally catalogued native OAuth connectors.
