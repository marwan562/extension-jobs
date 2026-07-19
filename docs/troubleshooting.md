# Troubleshooting

- **Not paired:** confirm the orchestrator is running on `127.0.0.1:18790`, `EXTENSION_ID` exactly matches Chrome, and use a fresh pairing code.
- **Chat unavailable:** test the configured OpenClaw endpoint from the backend host; do not copy its key into extension settings. Without `OPENCLAW_API_URL`, the deterministic development provider is used.
- **No LinkedIn jobs:** the safe default is fixtures. Confirm the Composio CLI is signed in, discover the supported LinkedIn search action, inspect its schema, and configure its slug. Network/toolkit failures are not silently replaced by scraping.
- **Fields skipped:** sensitive, unknown, unapproved, or unmatched semantic labels are intentionally skipped. Review the answer and adapter fixture.
- **Campaign already running:** a lock remains while the process owns the run. Crash recovery/lease expiry is a known milestone-two task.
- **Emergency stop engaged:** running provider calls receive cancellation and new work is rejected. Explicitly reset it in the side panel after resolving the cause.
