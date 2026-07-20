# OpenClaw Wuzzuf plugin

Built TypeScript plugin exposing one discoverable tool per Wuzzuf operation plus separate general job tools. Configure `bridgeUrl`, `toolToken`, and optionally `timeoutMs` under `plugins.entries.job-automation.config`. Agents may request submission approval, but only the paired browser extension can grant it.
