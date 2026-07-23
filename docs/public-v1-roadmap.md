# Public v1 implementation roadmap

This checklist tracks executable work. A checked item must have implementation and verification, not documentation alone.

## Phase 1 - Audit and contracts

- [x] Inspect branch, HEAD, repository tree, workspaces, TypeScript configuration, migration, services, workers, extension, integrations, adapters, security, fixtures, and tests.
- [x] Run and record the untouched baseline.
- [x] Expand canonical contracts and stable error envelopes.
- [x] Add package dependency and trust-boundary documentation.

## Phase 2 - Generic service layer

- [x] Add generic job application service while preserving Wuzzuf compatibility.
- [x] Separate job-source and application-destination interfaces.
- [x] Add versioned fail-closed connector capability and site-policy registry.
- [x] Add destination resolver, current-page JSON-LD import, and truthful connector modes.

## Phase 3 - Standalone worker

- [x] Move production browser-backed discovery, Wuzzuf operations, and renderer execution out of daemon request handlers.
- [x] Add worker authentication, atomic leases, heartbeat, crash recovery, cancellation, progress, and safe shutdown.
- [x] Prove final submission has one attempt and no automatic retry.

## Phase 4 - Resume system

- [x] Add signature/size/symlink-safe private source registration.
- [x] Add provenance-rich canonical profiles and immutable snapshots.
- [x] Add grounded tailoring plans, factual validation, visible diffs, and approvals.
- [x] Add deterministic ATS-safe HTML/PDF renderer, artifacts, hashes, extraction, and reproducibility tests.

## Phase 5 - Universal forms and destinations

- [x] Add canonical field ontology and approved answer memory.
- [x] Add Greenhouse, Lever, Ashby, Workable, SmartRecruiters, and Workday destination detection and fail-closed form contracts.
- [x] Add step fingerprints, deterministic standard fields, sensitive review, fixture tests, and destination routing.

## Phase 6 - OpenClaw and bundled skill

- [x] Publishable `@extension-jobs/openclaw-jobs` package with generic focused tools.
- [x] Keep and test deprecated `wuzzuf_*` aliases.
- [x] Bundle and validate `skills/extension-jobs/SKILL.md`.
- [x] Add clean pack/install/runtime/uninstall checks.

## Phase 7 - Composio and extension

- [x] Publishable `@extension-jobs/composio-jobs` thin toolkit.
- [x] Enforce distinct least-privilege credential and no uncertain-write retry.
- [x] Remove `<all_urls>` and global injection; use `activeTab`, `scripting`, loopback, and optional connector origins.
- [x] Add generic current-page, scoring, fact review, tailoring diff/PDF preview, approval, capability, campaign, queue, history, export/delete, and emergency-stop UI flows.

## Phase 8 - Public release

- [x] Add cross-platform CLI and onboarding.
- [x] Add public governance, privacy, security, support, migration, release, and connector-development files.
- [x] Add cross-platform CI, package tests, extension ZIP, checksums, dependency-audit gate, and secret scan.
- [x] Run the complete local acceptance suite and publish a pass/fail checklist with known limitations.
