# Local development

## Environment

Configure secrets in the shell or an uncommitted `.env`:

```sh
EXTENSION_ID=<exact-32-character-extension-id>
PAIRING_CODE=<random-pairing-secret>
OPENCLAW_JOB_TOOL_TOKEN=<separate-random-backend-secret>
WUZZUF_USER_ID=local-user
JOB_SOURCE_MODE=wuzzuf
DATA_DIR=./data
CHROME_CDP_ENDPOINT=http://127.0.0.1:9222
WUZZUF_SCREENSHOT_DIR=./.data/wuzzuf-diagnostics
WUZZUF_NAVIGATION_TIMEOUT_MS=60000
```

`WUZZUF_BASE_URL` is only for the local mock integration tests. Do not point automated tests at a production account.

`WUZZUF_DATA_DIR`, `WUZZUF_HEADLESS`, `WUZZUF_BROWSER_CHANNEL`, and `WUZZUF_EXECUTABLE_PATH` are deprecated and unused by the production CDP flow. Isolated Chromium launch remains test-only.

## Start Chrome for CDP

Close any conflicting Chrome instance if necessary, then start Chrome manually. On macOS:

```sh
open -na "Google Chrome" --args \
  --remote-debugging-port=9222
```

Recent Chrome versions can reject remote debugging against the normal default profile. In that case, use a dedicated Chrome profile and log into Wuzzuf once in that profile:

```sh
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.extension-jobs-chrome"
```

Linux:

```sh
google-chrome \
  --remote-debugging-port=9222
```

Windows PowerShell:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222
```

Keep the endpoint on loopback. A CDP endpoint grants control over the associated browser profile and must not be exposed to a network.

## Run and verify

```sh
npm install
npx playwright install chromium
npm run typecheck
npm test
npm run build
node --experimental-strip-types apps/playwright-worker/src/main.ts
CHROME_CDP_ENDPOINT=http://127.0.0.1:9222 EXTENSION_ID=<id> PAIRING_CODE=<code> OPENCLAW_JOB_TOOL_TOKEN=<token> JOB_SOURCE_MODE=wuzzuf npm start
```

`npx playwright install chromium` is needed only by isolated automated tests/mock tooling, not the production Wuzzuf flow. First use requires a manual login: open the extension Wuzzuf tab, choose **Open Wuzzuf login**, complete Wuzzuf authentication in the new tab inside the connected Chrome window, then check status. Repeated clicks reuse the application-managed login tab. A login expiry returns structured `WUZZUF_LOGIN_REQUIRED`; CAPTCHA/challenge pages return `WUZZUF_CHALLENGE_REQUIRED` or `manual_verification_required`, remain open, and require user intervention before retrying.

## OpenClaw plugin

Build, validate, link, and configure the individual-tool plugin:

```sh
npm run --workspace @extension-jobs/openclaw-wuzzuf build
npm run --workspace @extension-jobs/openclaw-wuzzuf plugin:build
npm run --workspace @extension-jobs/openclaw-wuzzuf plugin:validate
openclaw plugins install --link ./apps/openclaw-wuzzuf
openclaw plugins enable job-automation
openclaw config set plugins.entries.job-automation.config.bridgeUrl "http://127.0.0.1:18790"
openclaw config set plugins.entries.job-automation.config.toolToken "$OPENCLAW_JOB_TOOL_TOKEN"
openclaw gateway restart
openclaw plugins inspect job-automation --runtime --json
```

The manifest contract and runtime registration are tested for exact agreement. Configuration is read at execution time through the typed plugin config. Environment variables are not captured when the module is imported.

## Persistent Composio custom-tool host

Configure the host in `.env`, then start it in a second terminal after the orchestrator:

```sh
COMPOSIO_API_KEY=<key>
COMPOSIO_USER_ID=local-user
COMPOSIO_HOST_TOKEN=<random-secret-at-least-32-characters>
COMPOSIO_TOOLKITS=wuzzuf,linkedin
WUZZUF_ORCHESTRATOR_URL=http://127.0.0.1:18790
COMPOSIO_WUZZUF_TOOL_TOKEN=<different-random-secret-at-least-32-characters>
npm run dev:composio
```

The host defaults to Wuzzuf plus LinkedIn, stores only the reusable session ID at `.data/composio-session.json`, and exposes health at `http://127.0.0.1:18791/health`. Its other routes require `Authorization: Bearer $COMPOSIO_HOST_TOKEN`. The extension never receives the Composio API key. The process receives `LOCAL_WUZZUF_*` tools plus LinkedIn; custom Wuzzuf tools remain local and in-process.

Submission approval is a two-party flow: an agent calls `WUZZUF_REQUEST_SUBMISSION_APPROVAL`, the extension shows the exact job/resume/answers and records the human decision using its paired session, and the one-use token is returned only to that extension flow. Only its hash is persisted. Editing the reviewed application invalidates approval.

For the existing CLI-backed LinkedIn source, confirm the current read-tool schema with `composio execute <slug> --get-schema`, then set `COMPOSIO_LINKEDIN_SEARCH_TOOL` and `COMPOSIO_LINKEDIN_SEARCH_ARGS`. Never guess or replay an uncertain write.
