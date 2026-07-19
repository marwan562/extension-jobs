# Campaign and scheduling behavior

Natural-language schedules are converted immediately to a five-field cron plus an IANA timezone. Milestone one accepts daily and weekday friendly schedules. The stored object also carries missed-run policy and maximum runtime; future scheduler execution must enforce quiet hours and next-run preview.

Runs acquire a durable campaign lock, receive a correlation ID, discover and normalize jobs, deduplicate by source identity/fingerprint, score with factor explanations, select above threshold, and prepare answer previews. `research_only` stops after scoring, `prepare_and_review` is the default, and `auto_submit` must be campaign-specific and remains unavailable until a reviewed adapter supports it.

Persistent scheduling belongs in the local orchestrator. See [ADR 0001](adr/0001-orchestrator-scheduling.md).
