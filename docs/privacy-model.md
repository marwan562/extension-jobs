# Privacy model

Private data crosses only explicit local trust boundaries: browser page → minimal allowlisted extension payload → authenticated loopback daemon → private SQLite/artifact vault → worker. Agent integrations receive normalized records and safe errors, never cookies, browser profiles, raw resume bytes, bearer tokens, approval hashes, or secret answers.

Application destinations receive only reviewed fields during a user-directed fill/submission. There is no hosted service or telemetry. File permissions and loopback isolation reduce exposure but do not replace full-disk encryption, OS account security, backups hygiene, or browser security.
