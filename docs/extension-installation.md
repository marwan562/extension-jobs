# Extension installation

1. Run `npm install` and `npm run build`.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select `apps/extension`.
4. Start Google Chrome with `open -na "Google Chrome" --args --remote-debugging-port=9222`.
5. Copy the generated extension ID. Start the orchestrator with exactly that value: `CHROME_CDP_ENDPOINT=http://127.0.0.1:9222 EXTENSION_ID=<id> PAIRING_CODE=<random> OPENCLAW_JOB_TOOL_TOKEN=<separate-random> JOB_SOURCE_MODE=wuzzuf npm start`.
6. Open the side panel, enter the pairing code, and verify **Connected**.
7. Import a resume, review its extracted facts, and explicitly enable **Approved resume**.
8. Open the Wuzzuf tab, choose **Open Wuzzuf login**, and sign in manually in the new tab inside the connected Chrome window. Repeated clicks reuse the managed login tab. The extension never receives cookies, profile data, or credentials.

The Wuzzuf tab shows authentication, source search results, score/preparation, review state, filled/skipped fields, validation errors, dry-run state, cancel, emergency stop, and human approval. To submit, first turn off the default dry-run setting, prepare and fill again, resolve every blocker, then confirm **Generate approval**. The one-use token expires within two minutes. A second confirmation is required before submission.

Troubleshooting:

- `WUZZUF_LOGIN_REQUIRED`: reopen the login browser and authenticate.
- `WUZZUF_CHALLENGE_REQUIRED`: complete the displayed challenge manually.
- `WUZZUF_SEARCH_TIMEOUT`: the Wuzzuf search remained on its loading screen; finish any check in the visible official Chrome window, then retry.
- `WUZZUF_UNSUPPORTED_LAYOUT`: inspect the local diagnostic screenshot directory and update fixtures/selectors before retrying.
- `WUZZUF_DRY_RUN_BLOCKED`: disable dry-run before preparation and fill; changing it only at submit time is intentionally insufficient.
- `WUZZUF_APPLICATION_SESSION_NOT_FOUND`: the orchestrator restarted or the run was cancelled; prepare a fresh review.
- Pairing failures: confirm the orchestrator uses the exact extension ID and that the short-lived session has not expired.

Do not add wildcard CORS or send bridge tokens to page content scripts. Browser profiles, SQLite data, screenshots, resumes, `.env`, and logs are git-ignored.
