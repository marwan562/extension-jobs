# Known limitations

- Wuzzuf can change markup or application steps. Unknown layouts fail closed with `WUZZUF_UNSUPPORTED_LAYOUT` and a local diagnostic screenshot; selectors/fixtures must then be reviewed.
- Multi-step forms are detected and fixture-covered, but the adapter does not automatically advance arbitrary step sequences. Prepare again after a supported adapter update.
- CAPTCHA, anti-bot, MFA, and security challenges are never bypassed. Complete them manually in the persistent login browser.
- A running application browser page is process-local. After an orchestrator restart, durable review/status remains available but fill/submit requires preparing a new active session.
- Resume parsing is deterministic and limited to PDF/text/Markdown contact, links, and a skills line. Resume approval is explicit. Uploaded bytes remain in the local SQLite database.
- Only verified high-confidence non-sensitive values fill automatically. Salary, sponsorship, work authorization, legal, demographic, disability, clearance, relocation, and file questions remain blocked for human review.
- Composio custom toolkits run in the TypeScript process and are not supported through Composio MCP sessions. The SDK is experimental and its prefix/config API may change.
- Live Wuzzuf submission is deliberately untested. Automated coverage uses the loopback mock site; production use should begin in dry-run.
- Native Messaging and OS credential-store integration remain future hardening; current transport is loopback with exact-origin CORS, pairing, short sessions, rate limits, and timeouts.
