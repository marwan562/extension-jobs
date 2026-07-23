# Implementation audit

## Inspected baseline

- Audit date: 2026-07-22 (Africa/Cairo)
- Branch: `main`
- HEAD: `95538ae6c0cdd3b9c2524f08283cdfd2eb64879b`
- Commit: `test: make stale lock regression deterministic`
- Worktree before implementation: clean and synchronized with `origin/main`
- Runtime: Node.js 24.18.0, npm workspaces, TypeScript 5.9, native `node:sqlite`

The repository is an existing product implementation, not a scaffold. It contains a loopback orchestrator, Chrome extension, OpenClaw plugin, persistent Composio host/toolkit, Playwright CDP adapter, SQLite store and migration, campaign scheduler, durable queue, profile engine, approval and idempotency controls, fixtures, and unit/contract/integration/E2E tests.

## Baseline command results

| Command | Result | Notes |
| --- | --- | --- |
| `npm ci` | PASS | 362 packages installed; npm reported five dependency install scripts requiring allow-list review. |
| `npm run doctor` | PASS with warnings | Node, packages, private `.env`, private data directory, database, OpenClaw, plugin manifest, and OpenClaw credential passed. Orchestrator, Composio host, and Chrome CDP were not running; Composio credentials were not configured. |
| `npm run lint` | PASS | TypeScript lint/type checks passed. |
| `npm run typecheck` | PASS | Root, extension, Composio, OpenClaw, and host passed. |
| `npm run test:unit` | PASS | 18/18. |
| `npm run test:contract` | PASS | 6/6. |
| `npm run test:integration` | PASS | Initial sandbox run failed only because loopback listeners were denied; rerun with local listener permission passed 16/16. |
| `npm run test:e2e` | PASS | Initial sandbox run failed only because loopback listeners were denied; rerun with local listener permission passed 8/8. |
| `npm run build` | PASS | All existing workspaces built. |
| `npm run plugin:validate` | PASS with warnings | OpenClaw reported the plugin valid; its unrelated global state database was read-only in the sandbox. |

There were no product assertion failures in the baseline. The listener failures are environment restrictions and are not treated as repository defects.

## Existing architecture and controls to preserve

- `apps/orchestrator` is the current system of record, HTTP policy boundary, scheduler, and compatibility API.
- `apps/playwright-worker` supplies fixtures and a development adapter, but production browser jobs are still claimed and executed inline by the orchestrator.
- `packages/site-adapters` owns Wuzzuf parsing, selectors, managed tabs, challenge detection, URL validation, and CDP lifecycle.
- `packages/profile-engine` imports resume text, stores verified facts, creates immutable snapshots, classifies sensitive answers, and grounds deterministic answers.
- `apps/openclaw-wuzzuf` and `packages/composio-wuzzuf` are narrow authenticated clients of the same daemon.
- `apps/extension` owns pairing and trusted approval decisions; content scripts do not receive daemon bearer tokens.
- SQLite uses WAL, explicit migration SQL, durable queue rows and leases, immutable profile snapshots, hashed scoped client tokens, hashed one-use approvals, submission reservations, locks, idempotency records, and audit events.
- Final submission is review-gated, duplicate-protected, and never automatically retried after an uncertain click.
- Wuzzuf challenges stop automation and preserve the managed tab for manual action.

## Gaps against the public v1 target

1. Public APIs and package names are Wuzzuf-specific; generic tools and compatibility aliases are needed.
2. Canonical contracts cover only a subset of jobs, connectors, profiles, artifacts, forms, workflows, and errors.
3. Discovery source and application destination are not represented as independent registries.
4. Capability policy is implicit and Wuzzuf-centric rather than a versioned fail-closed registry.
5. The durable queue exists, but browser operations still run inline in the daemon.
6. Resume import persists source bytes in SQLite but lacks a private artifact vault, signature validation, rich provenance model, tailoring review, deterministic renderer, and PDF verification.
7. The form engine is adapter-local rather than a canonical ontology shared across destination adapters.
8. Indeed and LinkedIn include limited source implementations; Bayt, Glassdoor, ZipRecruiter, and ATS destinations need truthful capability declarations and adapters.
9. The extension still uses broad static site permissions and a Wuzzuf-specific review surface.
10. There is no public `extension-jobs` CLI, generic publishable OpenClaw/Composio package, complete release bundle, or cross-platform package test.

## Dependency assessment

Current dependency direction is mostly sound: shared contracts/domain packages feed services, and clients call the orchestrator. Two violations remain: duplicated legacy domain/state contracts and browser execution inside `WuzzufToolService`. The migration will keep compatibility routes while adding canonical contracts, generic services, a destination router, worker-owned execution, and thin generic clients.

## Migration policy

- Preserve `/v1/wuzzuf/tools/*`, `wuzzuf_*` tools, stored legacy states, and package shims for at least one migration release.
- Add new tables through numbered migrations; do not rewrite or discard existing local data.
- Fail closed for unknown connectors, layouts, destinations, states, and capabilities.
- Keep submission disabled by default, approval UI-only, and uncertain submission non-retryable.
- Keep the root package private and publish only explicitly intended clients.
