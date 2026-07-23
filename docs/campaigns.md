# Campaign workflow

Campaigns are persisted and scheduled by the local orchestrator. A run acquires a durable lock, gets one correlation ID, searches enabled sources, normalizes and deduplicates jobs, scores with factor explanations, and prepares review items above the configured threshold. `research_only` stops after scoring; `prepare_and_review` is the safe default. Campaigns never approve on behalf of a human.

```mermaid
flowchart TD
  Schedule["Cron + IANA timezone"] --> Lock["Acquire durable campaign lock"]
  Lock --> Discover["Discover from enabled sources"]
  Discover --> Normalize["Normalize and deduplicate"]
  Normalize --> Score["Score with explanations"]
  Score --> Gate{"Above threshold?"}
  Gate -->|No| Record["Record run result"]
  Gate -->|Yes| Prepare["Prepare dry-run review"]
  Prepare --> Human["Human approval per application"]
  Human --> Queue["One-attempt submission queue"]
  Queue --> Record
  Stop["Emergency stop"] --> Lock
  Stop --> Queue
```

Missed-run policy, quiet hours, maximum runtime, cancellation, and emergency stop are enforced locally. See [campaign scheduling](campaigns-and-scheduling.md).
