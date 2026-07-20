# Application lifecycle

```mermaid
stateDiagram-v2
  [*] --> DISCOVERED
  DISCOVERED --> SCORED
  SCORED --> PREPARING
  PREPARING --> AWAITING_REVIEW
  AWAITING_REVIEW --> APPROVED_FOR_FILL
  APPROVED_FOR_FILL --> FILLING
  FILLING --> FILLED
  FILLED --> AWAITING_SUBMISSION_APPROVAL
  AWAITING_SUBMISSION_APPROVAL --> SUBMITTING
  SUBMITTING --> SUBMITTED
  PREPARING --> AUTH_REQUIRED
  PREPARING --> SECURITY_CHECK_REQUIRED
  FILLING --> FORM_CHANGED
```

Invalid commands return `WORKFLOW_STATE_CONFLICT`. Every successful canonical transition records its previous/next state, actor, timestamp, correlation ID, sanitized detail, and optional error. Legacy state names remain readable during migration. Submission approval binds the application, job fingerprint, profile snapshot, resume, answers, and form version. Submission reserves an idempotency key before the single browser click and is never automatically retried.
