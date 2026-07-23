# Tool contracts

`packages/shared-contracts` is the canonical vocabulary for normalized jobs, sources, destinations, connector capabilities, site policies, profiles, resume sources, tailoring changes, artifacts, forms, fingerprints, workflows, queue jobs, scopes, result envelopes, generic tool names, and Wuzzuf compatibility aliases.

Success responses contain `ok: true`, `data`, and `correlationId`. Failures contain `ok: false` and a sanitized error containing `code`, `message`, `retryable`, `correlationId`, and optional `userActionRequired`, `recommendedNextTool`, and bounded `details`.

Stable public errors are:

`AUTHENTICATION_REQUIRED`, `BROWSER_NOT_CONNECTED`, `CONNECTOR_DISABLED`, `AUTOMATION_NOT_PERMITTED`, `SECURITY_CHALLENGE_DETECTED`, `JOB_NOT_FOUND`, `PROFILE_INCOMPLETE`, `RESUME_NOT_SELECTED`, `RESUME_NOT_APPROVED`, `RESUME_TAILORING_REVIEW_REQUIRED`, `RESUME_FACT_VALIDATION_FAILED`, `APPLICATION_INPUT_REQUIRED`, `APPLICATION_CHANGED_AFTER_REVIEW`, `FORM_CHANGED`, `APPROVAL_REQUIRED`, `APPROVAL_EXPIRED`, `APPROVAL_INVALID`, `APPROVAL_ALREADY_USED`, `APPROVAL_INVALIDATED`, `DUPLICATE_APPLICATION`, `DUPLICATE_SUBMISSION_PREVENTED`, `SUBMISSION_IN_PROGRESS`, `SUBMISSION_VERIFICATION_REQUIRED`, `CAMPAIGN_PAUSED`, `DAILY_LIMIT_REACHED`, `EMERGENCY_STOP_ACTIVE`, `RATE_LIMITED`, `OPERATION_CANCELLED`, `WORKFLOW_STATE_CONFLICT`, and `INTERNAL_ERROR`.

The migration release also accepts these deprecated codes from legacy routes: `AUTH_REQUIRED`, `SECURITY_CHECK_REQUIRED`, `APPLICATION_NOT_SUPPORTED`, `BROWSER_UNAVAILABLE`, `ORCHESTRATOR_UNAVAILABLE`, and `VALIDATION_ERROR`.

Tools and page messages never accept selectors, arbitrary JavaScript, browser commands, CDP commands, shell commands, arbitrary local paths, or unbounded HTML. Agent clients never receive cookies, authorization headers, resume bytes, approval secrets, Chrome profile references, or local paths.
