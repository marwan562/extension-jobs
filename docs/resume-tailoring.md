# Resume tailoring

`packages/resume-tailor` produces a deterministic plan from a normalized job and verified profile facts. It may select, order, and rephrase supported facts, but it cannot invent employers, dates, skills, metrics, education, titles, or credentials.

The output includes matched and missing requirements, every supporting fact ID, validation findings, and a visible structured diff. Validation fails if output contains an unsupported claim or an unverified/rejected fact.

```mermaid
flowchart LR
  Source["Validated resume source"] --> Facts["Provenance-rich facts"]
  Facts --> Review["Human fact verification"]
  Review --> Snapshot["Immutable profile snapshot"]
  Job["Normalized job requirements"] --> Plan["Grounded tailoring plan"]
  Snapshot --> Plan
  Plan --> Validate["Unsupported-claim validator"]
  Validate --> Diff["Visible diff and review"]
  Diff --> Render["Canonical JSON / HTML / PDF"]
```
