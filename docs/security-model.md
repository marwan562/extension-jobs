# Security model

The orchestrator binds to loopback and is the authorization and policy boundary. The extension uses a short-lived paired session; OpenClaw and the Composio host use separate secrets. Token hashes and scopes have a persistent schema. The default OpenClaw credential must not receive `applications:submit`; a client with that scope still needs an exact, short-lived, one-use human approval.

Wuzzuf credentials, passwords, cookies, and security-challenge tokens are never stored or returned. Browser login remains under user control. Cloudflare, CAPTCHA, and other access checks cause `SECURITY_CHECK_REQUIRED`; automation stops and never attempts bypass. Central sanitizers redact secrets, local paths, browser internals, resume text, and private diagnostics before audit or tool output.
