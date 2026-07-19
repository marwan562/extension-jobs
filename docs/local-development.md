# Local development

1. Copy `.env.example` values into your shell or secret manager; do not create a committed secrets file.
2. Run `npm install`, `npm test`, and `npm run build`.
3. Start the mock site with `node --experimental-strip-types apps/playwright-worker/src/main.ts`.
4. Start the orchestrator with an exact origin and random pairing code. For extension use, set `EXTENSION_ID`; for API tests only, `DEV_ORIGIN=http://127.0.0.1:9999` is accepted.
5. Load the extension and pair using the code printed by the orchestrator or supplied through `PAIRING_CODE`.

Use `JOB_SOURCE_MODE=fixture` for deterministic local work. To reuse LinkedIn through Composio, first use the authenticated CLI to identify the supported read action, inspect its schema, then set `JOB_SOURCE_MODE=composio`, `COMPOSIO_LINKEDIN_SEARCH_TOOL`, and schema-compatible JSON in `COMPOSIO_LINKEDIN_SEARCH_ARGS`. Never guess a write action or retry an uncertain write.

Tests use Node's test runner, temporary SQLite databases, and local fixtures. They do not access real job accounts.
