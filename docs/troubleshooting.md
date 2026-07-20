# Troubleshooting

- **Not paired:** confirm the orchestrator is running on `127.0.0.1:18790`, `EXTENSION_ID` exactly matches Chrome, and use a fresh pairing code.
- **`CHROME_CDP_UNAVAILABLE`:** start Chrome with `open -na "Google Chrome" --args --remote-debugging-port=9222`, confirm `CHROME_CDP_ENDPOINT=http://127.0.0.1:9222`, then restart the orchestrator. If Chrome rejects the default profile, use `--user-data-dir="$HOME/.extension-jobs-chrome"` and log into Wuzzuf once there.
- **`CHROME_CDP_DISCONNECTED`:** Chrome exited or its debugging transport closed during a task. Restart Chrome with remote debugging, restart the orchestrator, and retry.
- **`CHROME_CDP_NO_CONTEXT`:** open a normal window in the remotely debugged Chrome instance. The application will not create an incognito context.
- **`WUZZUF_TAB_CLOSED`:** the managed login or application tab was closed. Open login or prepare the application again.
- **Manual verification required:** complete the visible Cloudflare/security check yourself in the existing Chrome tab. The project does not solve or bypass it; retry only after the tab shows a normal Wuzzuf page.
- **Chat unavailable:** test the configured OpenClaw endpoint from the backend host; do not copy its key into extension settings. Without `OPENCLAW_API_URL`, the deterministic development provider is used.
- **No LinkedIn jobs:** the safe default is fixtures. Confirm the Composio CLI is signed in, discover the supported LinkedIn search action, inspect its schema, and configure its slug. Network/toolkit failures are not silently replaced by scraping.
- **Fields skipped:** sensitive, unknown, unapproved, or unmatched semantic labels are intentionally skipped. Review the answer and adapter fixture.
- **Campaign already running:** a lock remains while the process owns the run. Crash recovery/lease expiry is a known milestone-two task.
- **Emergency stop engaged:** running provider calls receive cancellation and new work is rejected. Explicitly reset it in the side panel after resolving the cause.
