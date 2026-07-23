# Extension Jobs

Extension Jobs is a local-first, review-first toolkit for job discovery, grounded resume tailoring, and assisted applications. A loopback orchestrator owns policy, persistence, approvals, audit history, and queues; browser and rendering work is isolated behind worker contracts. OpenClaw, Composio, the Chrome extension, and the CLI are thin clients of the same local system.

Wuzzuf remains supported through compatibility APIs. Generic contracts also cover Indeed, LinkedIn, Bayt, Glassdoor, ZipRecruiter, major ATS destinations, employer-site handoff, email handoff, and safe current-page import. Each connector advertises truthful capabilities and unknown hosts or layouts fail closed.

## Quick start

Requires Node.js 24+ and Google Chrome.

```sh
npm ci
npm run extension-jobs -- init
npm run doctor
npm run typecheck
npm test
npm run build
npm run extension-jobs -- start
```

Load `apps/extension` as an unpacked Manifest V3 extension, pair it with the one-time code in your private `.env`, and enable only the connector origins you use. Production browser automation connects to an explicitly configured Chrome CDP endpoint and uses the user's existing authenticated browser profile; the project never asks an agent for site passwords or cookies.

## Packages

- `@extension-jobs/cli`: local setup, diagnostics, lifecycle, resume vault, connector, plugin, and extension commands.
- `@extension-jobs/openclaw-jobs`: generic focused OpenClaw tools plus the bundled `extension-jobs` skill.
- `@extension-jobs/composio-jobs`: thin local Composio toolkit using its own least-privilege credential.
- `packages/shared-contracts`, `connector-sdk`, `site-policy-registry`, `destination-resolver`, `universal-form-engine`: public v1 domain boundaries.
- `resume-importers`, `resume-tailor`, `resume-renderer`, `artifact-store`: fact-grounded resume pipeline.

## Safety invariants

- Preparation is dry-run by default. Unknown capabilities, hosts, layouts, fields, redirects, and states are rejected.
- Only verified facts can be filled or included in tailored resumes. Sensitive and ambiguous answers require review.
- Agents can request submission approval but cannot grant it. Approval is bound to the exact reviewed inputs and one form fingerprint.
- Final submission is duplicate-protected, has one attempt, and is never automatically retried after an uncertain result.
- CAPTCHA, MFA, anti-bot, and security challenges stop automation and require manual action.
- Services bind to `127.0.0.1`; extension origins, sessions, scopes, body sizes, rates, URLs, redirects, and timeouts are constrained.
- Resume bytes and generated artifacts remain in a private local vault. No telemetry or hosted backend is included.

Start with [architecture](docs/architecture.md), [local development](docs/local-development.md), [CLI](docs/cli.md), [connector SDK](docs/connector-sdk.md), [security](SECURITY.md), [privacy](PRIVACY.md), and [known limitations](docs/known-limitations.md). Public artifacts are built with `npm run release:package` and verified against `output/release/SHA256SUMS`.

## Project status

`1.0.0-rc.1` is a release candidate. Production browser-backed discovery, Wuzzuf compatibility operations, and resume rendering run through the authenticated standalone worker. Generic contracts, resume/ATS layers, daemon-authoritative CLI state, and the trusted extension review/administration surfaces are implemented and tested. Stable promotion still requires an observed green hosted OS matrix and a refreshed online dependency audit; see the acceptance report and known limitations.

Licensed under the [MIT License](LICENSE).
