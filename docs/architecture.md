# Architecture overview

The system is an npm workspace-shaped modular TypeScript codebase without package publishing boundaries yet.

```text
content script -> MV3 service worker -> authenticated loopback bridge -> orchestrator
                                                       |-> OpenClaw provider
                                                       |-> Composio CLI source
                                                       |-> SQLite repositories
                                                       `-> Playwright site adapter
```

- `apps/extension` contains the side panel, settings, least-privilege content script, and credential-owning service worker. The content script receives only approved field values.
- `apps/orchestrator` owns pairing, chat streaming, campaigns, locking, durable transitions, audit events, emergency stop, job sources, and persistence.
- `apps/playwright-worker` contains a semantic development adapter and local mock site. It intentionally has no `submit` method.
- `apps/openclaw-tool` is the narrow OpenClaw plugin surface. It uses a separate backend-only token and exposes typed profile, answer, campaign, status, and stop actions.
- `packages/shared` owns schemas, validation, schedule parsing, normalization, deduplication, scoring, and the state graph.
- `packages/profile-engine` owns fact provenance, deterministic retrieval, sensitive classification, and answer metadata.
- `packages/site-adapters` defines the adapter/source contracts and Composio CLI boundary.
- `packages/provider-sdk` defines streaming provider contracts and the OpenAI-compatible/OpenClaw implementation.

SQLite uses WAL mode and repository methods, keeping storage calls out of domain logic. A PostgreSQL implementation can replace `Store` without changing the extension or adapters. Every run obtains a correlation ID; application timelines use immutable audit events. A unique submission key and state graph are the defense against duplicate submission.

The localhost transport is an explicit milestone interface. Native Messaging should implement the same typed request/stream semantics for production.
