# Known limitations

- Production Wuzzuf compatibility operations, generic browser-backed discovery, and resume rendering cross the authenticated standalone-worker boundary. Generic ATS application handlers for Greenhouse, Lever, Ashby, Workable, SmartRecruiters, and Workday remain fail-closed until their production connector is explicitly enabled and maintained; their semantic inspect/fill/validate/approval contracts are fixture-tested.
- The Wuzzuf compatibility facade remains a separate API surface over the shared daemon, queue, policies, profile facts, approvals, and persistence. A later stable release can retire those aliases after downstream clients migrate to the generic application routes.
- Indeed and LinkedIn offer safe current-page import and destination routing; Bayt, Glassdoor, and ZipRecruiter advertise truthful assisted/manual or configured discovery capabilities rather than unattended application support.
- Wuzzuf and other job sites can change markup or steps. Unknown layouts and changed fingerprints fail closed. Arbitrary multi-step progression is not inferred.
- CAPTCHA, anti-bot, MFA, and security challenges are never bypassed. Complete them manually in the user-controlled Chrome profile and re-inspect afterward.
- Production browser automation supports Chromium CDP. Chrome may require a dedicated remote-debugging profile, and Playwright CDP has lower fidelity than its native protocol.
- Browser page handles are process-local. After a worker restart the tab may remain, but an interrupted fill/submit flow requires review and a new active session. Uncertain submissions are never retried.
- Live production submission is deliberately untested. Automated submission coverage uses local fixtures; first use should remain dry-run and review-gated.
- Composio custom toolkits run in the TypeScript host rather than MCP. The SDK is experimental; sessions may become stale, and uncertain writes are returned without retry.
- Native Messaging and OS credential-store integration remain future hardening. The current transport is authenticated loopback with exact-origin CORS, distinct scoped credentials, short sessions, rate/body limits, URL allowlists, and timeouts.
- The local install summary reported seven moderate and one high npm advisory before the final implementation pass. Clean offline installs of the three public tarballs reported zero vulnerabilities, but the root advisory graph was not independently refreshed from the registry because the network audit request was unavailable. Do not treat that as a cleared online audit.
- Linux/macOS/Windows CI is configured, but this uncommitted workspace cannot prove a remote matrix run. Stable-v1 release promotion should require that hosted matrix and the online high-severity audit gate to pass.
