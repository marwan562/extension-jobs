# Changelog

## 1.0.0-rc.1 - 2026-07-22

- Added canonical generic job, connector, form, resume, artifact, workflow, queue, and error contracts.
- Added versioned fail-closed connector policy, source/destination separation, safe current-page import, and universal form mapping.
- Added durable worker leases, heartbeats, progress, cancellation, results, and non-retryable final-submission jobs.
- Added private resume vault, PDF/DOCX/Markdown/text/JSON/YAML import, fact provenance, grounded tailoring, ATS-safe HTML/PDF rendering, validation, hashes, and reproducibility tests.
- Added generic ATS form adapters, publishable OpenClaw and Composio packages, bundled skill, hardened Manifest V3 extension, and `extension-jobs` CLI.
- Preserved Wuzzuf APIs/tools as compatibility aliases.

Known migration gaps and production constraints are listed in [known limitations](docs/known-limitations.md).
