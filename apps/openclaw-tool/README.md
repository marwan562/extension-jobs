# OpenClaw Job Automation Tool

The existing `job_automation` tool now exposes typed Wuzzuf actions while keeping all browser and policy logic in the local orchestrator.

```sh
export OPENCLAW_JOB_TOOL_TOKEN=<same-random-token-used-by-the-orchestrator>
openclaw plugins install --link ./apps/openclaw-tool
openclaw plugins enable job-automation
openclaw plugins validate --entry ./apps/openclaw-tool/index.js
```

Restart the OpenClaw gateway. The token must be injected through the gateway environment; the plugin does not read `.env`, files, cookies, or browser state.

Examples:

- “Use `job_automation` to search Wuzzuf for remote Node.js jobs in Egypt.”
- “Score that Wuzzuf job against my active profile.”
- “Prepare applications for jobs scoring at least 80%, keep dry-run enabled, and show me each review.”
- “Fill the reviewed application with approved high-confidence answers and stop before submission.”
- “Show application status” or “Cancel the application.”

Wuzzuf actions are `WUZZUF_SEARCH_JOBS`, `WUZZUF_GET_JOB_DETAILS`, `WUZZUF_SCORE_JOB`, `WUZZUF_PREPARE_APPLICATION`, `WUZZUF_FILL_APPLICATION`, `WUZZUF_GET_APPLICATION_REVIEW`, `WUZZUF_SUBMIT_APPLICATION`, `WUZZUF_GET_APPLICATION_STATUS`, and `WUZZUF_CANCEL_APPLICATION`, plus login status/open-login controls.

OpenClaw cannot mint approval tokens. A person must review the application and generate the short-lived one-use token in the Chrome extension. Only then may the token be supplied to `WUZZUF_SUBMIT_APPLICATION`. The orchestrator independently rejects dry-run, emergency-stop, invalid/expired/reused/mismatched-token, validation, and duplicate-submission attempts.

Structured failures include a stable `code`, human-readable `message`, and `retryable` flag. `WUZZUF_LOGIN_REQUIRED` means use the extension's **Open Wuzzuf login** action. `WUZZUF_CHALLENGE_REQUIRED` means complete the challenge manually; automation will not bypass it.
