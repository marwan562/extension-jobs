# Known limitations

- Wuzzuf can change markup or application steps. Unknown layouts fail closed with `WUZZUF_UNSUPPORTED_LAYOUT` and a local diagnostic screenshot; selectors/fixtures must then be reviewed.
- Multi-step forms are detected and fixture-covered, but the adapter does not automatically advance arbitrary step sequences. Prepare again after a supported adapter update.
- CAPTCHA, anti-bot, MFA, and security challenges are never bypassed. The managed tab remains open so they can be completed manually in the connected Chrome profile; retry only after it reaches a normal Wuzzuf page.
- Production Wuzzuf automation supports Chromium CDP through Google Chrome only. Playwright's CDP connection has lower fidelity than its native protocol, and Chrome/Playwright version mismatches can surface as unsupported browser operations.
- Chrome may reject remote debugging with its normal default profile. Use the documented dedicated profile and sign into Wuzzuf once there when required.
- Playwright exposes no safe CDP disconnect that is guaranteed to preserve the browser process. Shutdown intentionally avoids `browser.close()` and relies on process exit to release the transport, so a stale connection can require restarting the orchestrator.
- The first existing Chrome browser context is used. If Chrome exposes no context, automation fails with `CHROME_CDP_NO_CONTEXT`; no incognito context is created as a fallback.
- A running application browser page is process-local. After an orchestrator restart, the Chrome tab may remain visible and durable review/status remains available, but fill/submit requires preparing a new active session.
- Resume parsing is deterministic and limited to PDF/text/Markdown contact, links, and a skills line. Resume approval is explicit. Uploaded bytes remain in the local SQLite database.
- Only verified high-confidence non-sensitive values fill automatically. Salary, sponsorship, work authorization, legal, demographic, disability, clearance, relocation, and file questions remain blocked for human review.
- Composio custom toolkits run in the TypeScript process and are not supported through Composio MCP sessions. The SDK is experimental and its prefix/config API may change.
- The Composio host must remain running because custom Wuzzuf execution is in-process. Its persisted session ID can become stale; startup recreates it, but an execution failure is returned without automatic retry to avoid duplicating writes.
- Wuzzuf connection state is a local logical record for one configured user. Disconnecting does not log out of Wuzzuf, delete Chrome data, or close personal Chrome; it only releases application-managed automation state when no application is active.
- Live Wuzzuf submission is deliberately untested. Automated coverage uses the loopback mock site; production use should begin in dry-run.
- Native Messaging and OS credential-store integration remain future hardening; current transport is loopback with exact-origin CORS, pairing, short sessions, rate limits, and timeouts.
