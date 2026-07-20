PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_tokens (id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), token_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, expires_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profile_versions (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, version INTEGER NOT NULL, facts_hash TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(profile_id, version));
CREATE TABLE IF NOT EXISTS profile_facts (id TEXT NOT NULL, profile_version_id TEXT NOT NULL REFERENCES profile_versions(id), data TEXT NOT NULL, PRIMARY KEY(id, profile_version_id));
CREATE TABLE IF NOT EXISTS profile_snapshots (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_version_id TEXT NOT NULL REFERENCES profile_versions(id), resume_file_id TEXT, resume_hash TEXT NOT NULL, facts_hash TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job_snapshots (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job_scores (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, profile_snapshot_id TEXT NOT NULL, score REAL NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS application_answers (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, profile_snapshot_id TEXT NOT NULL, supporting_fact_ids TEXT NOT NULL, confidence REAL NOT NULL, confirmation_required INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS application_events (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, previous_state TEXT NOT NULL, next_state TEXT NOT NULL, correlation_id TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS application_artifacts (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submission_approvals (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, binding_hash TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, revoked_at TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_submission_approval ON submission_approvals(application_id) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS submission_attempts (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, approval_id TEXT NOT NULL REFERENCES submission_approvals(id), idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_completed_submission ON submission_attempts(application_id) WHERE status='completed';
CREATE TABLE IF NOT EXISTS idempotency_keys (operation TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL, response TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(operation, key));
CREATE TABLE IF NOT EXISTS browser_sessions (id TEXT PRIMARY KEY, connection_id TEXT, status TEXT NOT NULL, heartbeat_at TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS site_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, site TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, site));
CREATE TABLE IF NOT EXISTS queue_jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL, run_after TEXT NOT NULL, locked_by TEXT, locked_at TEXT, correlation_id TEXT NOT NULL, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS queue_claim_idx ON queue_jobs(status, run_after, locked_at);
CREATE TABLE IF NOT EXISTS campaign_runs (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, status TEXT NOT NULL, correlation_id TEXT NOT NULL, started_at TEXT, completed_at TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaign_job_results (campaign_run_id TEXT NOT NULL REFERENCES campaign_runs(id), job_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(campaign_run_id, job_id));
