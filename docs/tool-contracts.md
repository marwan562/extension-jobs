# Tool contracts

`packages/shared-contracts` is the canonical source for Wuzzuf action names, runtime tool names, queue types, workflow states, scopes, result envelopes, and stable errors. Orchestrator requests are validated at the boundary; OpenClaw uses focused TypeBox inputs and Composio uses focused Zod inputs. Contract tests fail when registered names drift.

Success responses contain `ok: true`, `data`, and `correlationId`. Failures contain `ok: false` and a sanitized error with one of:

`AUTH_REQUIRED`, `SECURITY_CHECK_REQUIRED`, `JOB_NOT_FOUND`, `APPLICATION_NOT_SUPPORTED`, `APPROVAL_REQUIRED`, `APPROVAL_EXPIRED`, `APPROVAL_ALREADY_USED`, `APPROVAL_INVALIDATED`, `FORM_CHANGED`, `RATE_LIMITED`, `DAILY_LIMIT_REACHED`, `EMERGENCY_STOP_ACTIVE`, `BROWSER_UNAVAILABLE`, `ORCHESTRATOR_UNAVAILABLE`, `WORKFLOW_STATE_CONFLICT`, `DUPLICATE_SUBMISSION_PREVENTED`, `VALIDATION_ERROR`, or `INTERNAL_ERROR`.

Agents never receive selectors, arbitrary URLs, browser commands, raw HTML, cookies, authorization headers, raw resume text, local paths, Chrome profile references, or CDP commands.
