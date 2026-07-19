# ADR 0001: Persistent scheduling belongs in the orchestrator

Status: accepted.

Manifest V3 service workers are event-driven and may be suspended; their lifecycle is unsuitable for durable locks, long-running retries, timezone-aware missed-run recovery, and transactional state changes. The local orchestrator already owns OpenClaw routing, queues, profile retrieval, model selection, notifications, and durable SQLite state.

Therefore campaign schedules are stored and executed by the orchestrator/OpenClaw layer. The extension displays previews and sends typed control requests only. This provides one authority for concurrency, idempotency, emergency cancellation, and audit history, and permits the browser to be closed without losing scheduled work.
