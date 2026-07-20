# Campaign scheduling

The orchestrator owns campaign schedules and durable execution. Campaigns have timezone-aware schedules, limits, score thresholds, profile strategy, query filters, and mandatory review/approval policy. A run searches, normalizes, deduplicates, scores, persists, prepares qualified jobs, and waits for the UI. OpenClaw may manage campaigns but is not the scheduler. `Africa/Cairo` is an example/default at the API edge, not a global domain constant.
