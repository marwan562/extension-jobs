# @extension-jobs/composio-jobs

Session-scoped local `JOBS` toolkit for Composio. It calls the same authenticated loopback daemon as OpenClaw and contains no browser selectors, Playwright, scoring, tailoring, approval validation, workflow state, duplicate protection, or persistence.

The toolkit cannot approve applications or receive approval tokens. It does not expose submission by default and never retries an uncertain write.
