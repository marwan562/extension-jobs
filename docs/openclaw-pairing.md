# OpenClaw pairing

The extension pairs with the local orchestrator, not directly with OpenClaw. The orchestrator connects to OpenClaw's existing OpenAI-compatible endpoint using `OPENCLAW_API_URL`, `OPENCLAW_MODEL`, and a backend-only secret when required.

Pairing sends a one-time code in a POST body over loopback. The bridge compares a hash in constant time and returns a random session token with a default 15-minute lifetime. The service worker stores it in `chrome.storage.session`; it is never passed to a tab or content script. Restart the orchestrator or rotate `PAIRING_CODE` to invalidate sessions.

Native Messaging is the target production transport; the provider and domain layers do not depend on HTTP.

The OpenClaw tool plugin uses a different secret, `OPENCLAW_JOB_TOOL_TOKEN`, supplied to the orchestrator and as `plugins.entries.job-automation.config.toolToken`. It does not reuse the extension pairing session and cannot approve submission requests. Build and install the local plugin from `apps/openclaw-wuzzuf`, then restart the gateway after validation.
