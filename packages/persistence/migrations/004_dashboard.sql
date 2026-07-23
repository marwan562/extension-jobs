CREATE TABLE IF NOT EXISTS saved_job_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_dispositions (
  job_id TEXT PRIMARY KEY,
  disposition TEXT NOT NULL CHECK (disposition IN ('shortlisted', 'rejected')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_tags (
  job_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (job_id, tag)
);

CREATE TABLE IF NOT EXISTS job_notes (
  job_id TEXT PRIMARY KEY,
  note TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_action_items (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'continued', 'cancelled')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS manual_action_status_idx
  ON manual_action_items(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_preferences (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dashboard_notifications_created_idx
  ON dashboard_notifications(created_at DESC);
