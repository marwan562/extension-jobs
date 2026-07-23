# Approval flow

The extension shows the job, employer, URL, selected resume, final answers, sensitive/skipped fields, warnings, and submission policy. A human decision approves that exact revision for a short period. Only a token hash is stored; approvals are one-use and invalidated by answer, profile, resume, form, cancellation, expiry, or emergency-stop changes. A repeated submit returns the persisted result or `DUPLICATE_SUBMISSION_PREVENTED` without another click.

```mermaid
sequenceDiagram
  participant A as Agent
  participant O as Orchestrator
  participant E as Extension
  participant H as Human
  participant W as Worker
  A->>O: Request review (cannot approve)
  O->>E: Exact job/resume/answers/fingerprint
  E->>H: Visible review
  H->>E: Approve or reject
  E->>O: Paired decision
  O->>O: Store one-use token hash
  O->>W: One-attempt submission job
  W->>O: Confirmed or uncertain result
```
