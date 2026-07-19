# Threat model

## Assets and trust boundaries

Assets include candidate PII, CVs, provider credentials, OpenClaw access, approved files, and submission authority. Website text and job descriptions are untrusted. The browser page, content script, extension service worker, loopback bridge, workers, providers, and external integrations are separate trust zones.

## Primary threats and controls

- A hostile page attempts prompt injection or credential theft: page content is treated as data, never system instruction; content scripts never receive tokens or provider keys and expose only a fixed `fill-approved` action.
- Another local site calls the bridge: exact `Origin` validation, strict CORS, loopback binding, one-time pairing, hashed in-memory short-lived sessions, no credentials in URLs, and 64 KiB request limits.
- Sensitive answers are fabricated: answers carry confidence and supporting fact IDs; sensitive/unknown answers always require approval; generated prose cannot become a verified fact.
- Duplicate or resumed submission: deterministic states and a unique durable submission key must be reserved before any future submit call. Milestone one has no submit capability.
- Arbitrary browser behavior: adapters use labels and accessible names; no generated JavaScript/selectors; CAPTCHA, MFA, auth, bot protection, and access control produce handoff states.
- Secret/PII leakage: structured logs should pass allowlisted details only; API keys stay in backend environment/OS secret storage; artifact retention is configurable before production traces are enabled.
- Runaway automation: per-run/day limits, locking, timeouts, cancellation signals, dry-run, quiet hours, and global emergency stop.

Residual risk: a privileged local process can inspect another local process. Native Messaging plus OS credential storage is required before calling the bridge design production-ready.
