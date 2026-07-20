# Implementation audit

## Baseline (2026-07-20)

`npm install`, `npm run build`, `npm run typecheck`, and all 38 original tests passed before the refactor. The repository already used npm workspaces for the OpenClaw plugin, Composio host, and Composio toolkit. It had a loopback orchestrator, `node:sqlite` storage, a Playwright Wuzzuf adapter using an existing Chrome CDP context, review-first filling, persisted approval requests and idempotency, an extension approval UI, emergency stop, and individual OpenClaw tools.

## Current architecture and reusable components

- `apps/orchestrator` is the system of record and policy boundary.
- `packages/site-adapters` owns Chrome CDP and Wuzzuf page behavior.
- `packages/profile-engine` owns resume-derived facts and grounded answers.
- `apps/openclaw-wuzzuf` and `packages/composio-wuzzuf` are thin HTTP clients.
- `apps/extension` pairs directly with the loopback orchestrator and owns human approval decisions.
- Existing Wuzzuf parser fixtures, mock site, idempotent submission flow, and security-check detection are retained.

## Duplicated contracts and missing boundaries

The initial implementation duplicated Zod, TypeBox, and TypeScript contracts; embedded migrations in `Store`; used legacy workflow names; lacked a durable queue and immutable profile snapshots; had only a coarse health endpoint; and lacked central redaction, a doctor command, explicit migration artifacts, and scoped-client schema. The Composio schemas remain adapter-native representations, guarded by contract tests against canonical tool names until schema generation is introduced.

## Migration plan

1. Establish canonical runtime contracts, security helpers, explicit migrations, durable queue, immutable profile snapshots, and workflow rules.
2. Route state transitions and approval consumption through transactional repositories while preserving the current browser vertical slice.
3. Move Wuzzuf browser behavior behind a central session manager and normalized form fingerprints.
4. Finish adapter schema generation and move inline browser claims into the standalone worker process.
5. Expand fixture/e2e coverage and remove legacy application-state compatibility only after stored records migrate.

## Known baseline limitations

Browser jobs are durably recorded and leased but still claimed in-process by the orchestrator; the standalone production worker split remains incomplete. The orchestrator now runs a persistent timezone-aware campaign scheduler. Historical application rows use legacy state names, schema equivalence is tested at the tool-name boundary rather than fully generated from one schema, and live Wuzzuf behavior necessarily requires user-controlled Chrome and manual completion of login/security checks.
