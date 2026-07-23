CREATE TABLE IF NOT EXISTS canonical_profile_snapshots (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  resume_source_id TEXT NOT NULL REFERENCES resume_sources(id),
  facts_hash TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(resume_source_id, facts_hash)
);

