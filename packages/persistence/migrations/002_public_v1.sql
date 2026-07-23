CREATE TABLE IF NOT EXISTS queue_progress_events (
  id TEXT PRIMARY KEY,
  queue_job_id TEXT NOT NULL REFERENCES queue_jobs(id),
  progress INTEGER NOT NULL,
  message TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS queue_progress_job_idx ON queue_progress_events(queue_job_id, created_at);

CREATE TABLE IF NOT EXISTS queue_results (
  queue_job_id TEXT PRIMARY KEY REFERENCES queue_jobs(id),
  status TEXT NOT NULL,
  result TEXT,
  error_code TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queue_cancellations (
  queue_job_id TEXT PRIMARY KEY REFERENCES queue_jobs(id),
  requested_at TEXT NOT NULL,
  requested_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connector_settings (
  connector_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_sources (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  artifact_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS resume_sources_profile_hash_idx ON resume_sources(profile_id, sha256);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  media_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  metadata TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tailored_resumes (
  id TEXT PRIMARY KEY,
  source_resume_id TEXT NOT NULL REFERENCES resume_sources(id),
  profile_snapshot_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_resume_id, profile_snapshot_id, job_id)
);

CREATE TABLE IF NOT EXISTS approved_answer_memory (
  id TEXT PRIMARY KEY,
  question_fingerprint TEXT NOT NULL,
  profile_snapshot_id TEXT NOT NULL,
  approved INTEGER NOT NULL,
  sensitive INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS answer_memory_lookup_idx ON approved_answer_memory(question_fingerprint, profile_snapshot_id, approved);
