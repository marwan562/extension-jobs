# Persistence

Local SQLite runs in WAL mode with foreign keys enabled. `packages/persistence/migrations` contains ordered migrations. The schema covers clients/tokens, immutable profile versions and snapshots, job snapshots/scores, applications/answers/events/artifacts, approvals/attempts/idempotency, browser connections, queue jobs, campaign runs/results, and audit events.

The durable queue uses `BEGIN IMMEDIATE` for atomic claim, worker leases for crash recovery, capped exponential backoff for classified retryable work, and a hard `maxAttempts=1` rule for submission jobs. Application transitions, approval consumption, and submission reservation must remain transactional boundaries.
