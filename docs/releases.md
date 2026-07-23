# Releases and migration

The root monorepo stays private to npm. Only `@extension-jobs/cli`, `@extension-jobs/openclaw-jobs`, and `@extension-jobs/composio-jobs` are intended public artifacts. `npm run release:package` builds them, creates the Chrome extension ZIP, and writes `SHA256SUMS` plus a release manifest under `output/release`.

For v1 migration, existing SQLite data is upgraded with numbered idempotent migrations. Wuzzuf routes, states, queue names, and tool names remain compatibility aliases. Configure distinct OpenClaw, Composio, worker, pairing, and extension credentials. Start in dry-run and re-review every approval after a form or resume change.
